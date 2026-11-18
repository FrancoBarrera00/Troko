import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AppSettings,
  Conversation,
  ConversationMessage,
  DesktopTidyBatch,
  DesktopTidyBatchStatus,
  DesktopTidyMove,
  EmailDraft,
  EmailDraftStatus,
  EmailMessage,
  FocusPhase,
  FocusSession,
  FocusStatus,
  Habit,
  HabitLog,
  HabitSceneId,
  InputMode,
  IntegrationRecord,
  IntegrationType,
  MemoryExportPayload,
  MessageRole,
  ModelDownload,
  ModelDownloadStatus,
  Reminder,
  ReminderRecurrence,
  ReminderStatus,
  Task,
  Timer,
  TimerStatus,
} from '../../../shared/types.ts';
import { DEFAULT_SETTINGS, MIGRATION_001_INIT_SQL } from './schema.ts';

export interface TrokoDatabase {
  readonly db: DatabaseSync;
  readonly dbPath: string;
  getJournalMode(): string;
  getUserVersion(): number;
  getForeignKeysEnabled(): boolean;
  listTables(): string[];
  transaction<T>(fn: () => T): T;
  getSettingsObject(): AppSettings;
  exportMemory(): MemoryExportPayload;
  wipeMemory(): void;
  close(): void;
}

function seedDefaultSettings(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    stmt.run(key, JSON.stringify(value), now);
  }
}

function safeParseJson(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function createDatabase(dbPath: string, version = '0.1.0'): TrokoDatabase {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  let closed = false;

  const transaction = <T>(fn: () => T): T => {
    raw.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        raw.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if transaction was already aborted
      }
      throw err;
    }
  };

  transaction(() => {
    const versionRow = raw.prepare('PRAGMA user_version').get() as
      | Record<string, unknown>
      | undefined;
    const currentVersion = Number(versionRow?.['user_version'] ?? 0);
    if (currentVersion < 1) {
      raw.exec(MIGRATION_001_INIT_SQL);
      raw.exec('PRAGMA user_version = 1;');
    }
    seedDefaultSettings(raw);
  });

  const getSettingsObject = (): AppSettings => {
    const defaults = structuredClone(DEFAULT_SETTINGS);
    const rows = raw.prepare('SELECT key, value_json FROM settings').all() as Array<
      Record<string, unknown>
    >;
    const record: Record<string, unknown> = { ...defaults };

    for (const row of rows) {
      const key = String(row['key'] ?? '');
      if (!(key in defaults)) continue;
      const parsed = safeParseJson(String(row['value_json'] ?? ''), undefined);
      if (parsed === undefined) continue;
      if (key === 'permissions' && typeof parsed === 'object' && parsed !== null) {
        record['permissions'] = {
          ...defaults.permissions,
          ...(parsed as Record<string, unknown>),
        };
      } else {
        record[key] = parsed;
      }
    }

    return record as unknown as AppSettings;
  };

  const exportMemory = (): MemoryExportPayload => {
    const tasks = (
      raw.prepare('SELECT * FROM tasks ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): Task => ({
        id: String(r['id']),
        title: String(r['title']),
        completed: Number(r['completed']) === 1,
        createdAt: String(r['created_at']),
        completedAt: r['completed_at'] != null ? String(r['completed_at']) : null,
      })
    );

    const reminders = (
      raw.prepare('SELECT * FROM reminders ORDER BY trigger_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): Reminder => ({
        id: String(r['id']),
        title: String(r['title']),
        triggerAt: String(r['trigger_at']),
        recurrence: (r['recurrence'] != null
          ? String(r['recurrence'])
          : null) as ReminderRecurrence,
        status: String(r['status']) as ReminderStatus,
        firedAt: r['fired_at'] != null ? String(r['fired_at']) : null,
        soundEnabled: Number(r['sound_enabled']) === 1,
        createdAt: String(r['created_at']),
      })
    );

    const timers = (
      raw.prepare('SELECT * FROM timers ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): Timer => ({
        id: String(r['id']),
        label: String(r['label']),
        durationSec: Number(r['duration_sec']),
        remainingSec: Number(r['remaining_sec']),
        status: String(r['status']) as TimerStatus,
        startedAt: r['started_at'] != null ? String(r['started_at']) : null,
        endsAt: r['ends_at'] != null ? String(r['ends_at']) : null,
        createdAt: String(r['created_at']),
      })
    );

    const habits = (
      raw.prepare('SELECT * FROM habits ORDER BY sort_order ASC, created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): Habit => ({
        id: String(r['id']),
        name: String(r['name']),
        sceneId: String(r['scene_id']) as HabitSceneId,
        unitLabel: String(r['unit_label']),
        dailyGoal: Number(r['daily_goal']),
        unitVolumeLabel:
          r['unit_volume_label'] != null ? String(r['unit_volume_label']) : null,
        reminderTime: r['reminder_time'] != null ? String(r['reminder_time']) : null,
        streakCurrent: Number(r['streak_current']),
        streakBest: Number(r['streak_best']),
        sortOrder: Number(r['sort_order']),
        createdAt: String(r['created_at']),
      })
    );

    const habitLogs = (
      raw.prepare('SELECT * FROM habit_logs ORDER BY logged_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): HabitLog => ({
        id: String(r['id']),
        habitId: String(r['habit_id']),
        dateYmd: String(r['date_ymd']),
        delta: Number(r['delta']),
        loggedAt: String(r['logged_at']),
      })
    );

    const focusSessions = (
      raw.prepare('SELECT * FROM focus_sessions ORDER BY started_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): FocusSession => ({
        id: String(r['id']),
        label: r['label'] != null ? String(r['label']) : null,
        durationSec: Number(r['duration_sec']),
        breakSec: Number(r['break_sec']),
        remainingSec: Number(r['remaining_sec']),
        phase: String(r['phase']) as FocusPhase,
        cycleIndex: Number(r['cycle_index']),
        status: String(r['status']) as FocusStatus,
        startedAt: String(r['started_at']),
        endedAt: r['ended_at'] != null ? String(r['ended_at']) : null,
        lastTickAt: r['last_tick_at'] != null ? String(r['last_tick_at']) : null,
      })
    );

    const conversations = (
      raw.prepare('SELECT * FROM conversations ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): Conversation => ({
        id: String(r['id']),
        title: String(r['title']),
        createdAt: String(r['created_at']),
      })
    );

    const messages = (
      raw.prepare('SELECT * FROM messages ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): ConversationMessage => ({
        id: String(r['id']),
        conversationId: String(r['conversation_id']),
        role: String(r['role']) as MessageRole,
        content: String(r['content']),
        inputMode: String(r['input_mode']) as InputMode,
        intentJson: r['intent_json'] != null ? String(r['intent_json']) : null,
        createdAt: String(r['created_at']),
      })
    );

    const desktopTidyBatches = (
      raw.prepare('SELECT * FROM desktop_tidy_batches ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): DesktopTidyBatch => ({
        id: String(r['id']),
        targetDir: String(r['target_dir']),
        status: String(r['status']) as DesktopTidyBatchStatus,
        fileCount: Number(r['file_count']),
        createdAt: String(r['created_at']),
        undoneAt: r['undone_at'] != null ? String(r['undone_at']) : null,
      })
    );

    const desktopTidyMoves = (
      raw.prepare('SELECT * FROM desktop_tidy_moves ORDER BY id ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): DesktopTidyMove => ({
        id: String(r['id']),
        batchId: String(r['batch_id']),
        fileName: String(r['file_name']),
        category: String(r['category']),
        sourcePath: String(r['source_path']),
        destPath: String(r['dest_path']),
      })
    );

    const emailMessages = (
      raw.prepare('SELECT * FROM email_messages ORDER BY received_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): EmailMessage => ({
        id: String(r['id']),
        fromName: String(r['from_name']),
        fromEmail: String(r['from_email']),
        subject: String(r['subject']),
        snippet: String(r['snippet']),
        body: String(r['body']),
        unread: Number(r['unread']) === 1,
        receivedAt: String(r['received_at']),
      })
    );

    const emailDrafts = (
      raw.prepare('SELECT * FROM email_drafts ORDER BY created_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): EmailDraft => ({
        id: String(r['id']),
        sourceMessageId: r['source_message_id'] != null ? String(r['source_message_id']) : null,
        toName: String(r['to_name']),
        toEmail: String(r['to_email']),
        subject: String(r['subject']),
        body: String(r['body']),
        status: String(r['status']) as EmailDraftStatus,
        createdAt: String(r['created_at']),
        sentAt: r['sent_at'] != null ? String(r['sent_at']) : null,
      })
    );

    const modelDownloads = (
      raw.prepare('SELECT * FROM model_downloads ORDER BY updated_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map(
      (r): ModelDownload => ({
        id: String(r['id']),
        modelName: String(r['model_name']),
        totalBytes: Number(r['total_bytes']),
        downloadedBytes: Number(r['downloaded_bytes']),
        status: String(r['status']) as ModelDownloadStatus,
        localPath: r['local_path'] != null ? String(r['local_path']) : null,
        updatedAt: String(r['updated_at']),
      })
    );

    const integrations = (
      raw.prepare('SELECT * FROM integrations ORDER BY updated_at ASC').all() as Array<
        Record<string, unknown>
      >
    ).map((r): IntegrationRecord => {
      const parsed = safeParseJson(String(r['config_json'] ?? '{}'), {});
      return {
        id: String(r['id']),
        type: String(r['type']) as IntegrationType,
        enabled: Number(r['enabled']) === 1,
        config:
          typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {},
        updatedAt: String(r['updated_at']),
      };
    });

    return {
      version,
      exportedAt: new Date().toISOString(),
      settings: getSettingsObject(),
      tasks,
      reminders,
      timers,
      habits,
      habitLogs,
      focusSessions,
      conversations,
      messages,
      desktopTidyBatches,
      desktopTidyMoves,
      emailMessages,
      emailDrafts,
      modelDownloads,
      integrations,
    };
  };

  const wipeMemory = (): void => {
    transaction(() => {
      raw.exec(`
        DELETE FROM habit_logs;
        DELETE FROM habits;
        DELETE FROM tasks;
        DELETE FROM reminders;
        DELETE FROM timers;
        DELETE FROM focus_sessions;
        DELETE FROM messages;
        DELETE FROM conversations;
        DELETE FROM desktop_tidy_moves;
        DELETE FROM desktop_tidy_batches;
        DELETE FROM email_drafts;
        DELETE FROM email_messages;
        DELETE FROM model_downloads;
        DELETE FROM integrations;
        DELETE FROM settings;
      `);
      seedDefaultSettings(raw);
    });
  };

  return {
    db: raw,
    dbPath,
    getJournalMode() {
      const row = raw.prepare('PRAGMA journal_mode').get() as Record<string, unknown> | undefined;
      return String(row?.['journal_mode'] ?? '');
    },
    getUserVersion() {
      const row = raw.prepare('PRAGMA user_version').get() as Record<string, unknown> | undefined;
      return Number(row?.['user_version'] ?? 0);
    },
    getForeignKeysEnabled() {
      const row = raw.prepare('PRAGMA foreign_keys').get() as Record<string, unknown> | undefined;
      return Number(row?.['foreign_keys'] ?? 0) === 1;
    },
    listTables() {
      const rows = raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
        )
        .all() as Array<Record<string, unknown>>;
      return rows.map((r) => String(r['name']));
    },
    transaction,
    getSettingsObject,
    exportMemory,
    wipeMemory,
    close() {
      if (closed) return;
      closed = true;
      raw.close();
    },
  };
}
