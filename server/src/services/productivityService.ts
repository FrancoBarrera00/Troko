import crypto from 'node:crypto';
import type {
  FocusPhase,
  FocusSession,
  FocusStatus,
  Reminder,
  ReminderRecurrence,
  ReminderStatus,
  Task,
  Timer,
  TimerStatus,
} from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';
import type { SettingsService } from './settingsService.ts';

export interface WeeklyFocusDay {
  day: string;
  dateYmd: string;
  blocks: number;
  minutes: number;
}

export interface FocusStateSnapshot {
  ok: true;
  session: (FocusSession & {
    duration_sec: number;
    break_sec: number;
    remaining_sec: number;
    cycle_index: number;
  }) | null;
  id?: string;
  label?: string | null;
  durationSec?: number;
  duration_sec?: number;
  breakSec?: number;
  break_sec?: number;
  remainingSec?: number;
  remaining_sec?: number;
  phase?: FocusPhase;
  cycleIndex?: number;
  cycle_index?: number;
  status?: FocusStatus | 'idle';
  completedBlocksToday: number;
  totalMinutesToday: number;
  lastCompletedPhase: FocusPhase | null;
  readyForBreak: boolean;
  weeklyStats: WeeklyFocusDay[];
}

function getLocalYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SPANISH_WEEKDAYS_ORDER = ['S', 'D', 'L', 'M', 'X', 'J', 'V'] as const;

function mapTaskRow(r: Record<string, unknown>): Task {
  return {
    id: String(r['id']),
    title: String(r['title']),
    completed: Number(r['completed']) === 1,
    createdAt: String(r['created_at']),
    completedAt: r['completed_at'] != null ? String(r['completed_at']) : null,
  };
}

function mapReminderRow(r: Record<string, unknown>): Reminder {
  return {
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
  };
}

function mapTimerRow(r: Record<string, unknown>): Timer & {
  duration_sec: number;
  remaining_sec: number;
} {
  const durationSec = Number(r['duration_sec']);
  const remainingSec = Number(r['remaining_sec']);
  return {
    id: String(r['id']),
    label: String(r['label']),
    durationSec,
    duration_sec: durationSec,
    remainingSec,
    remaining_sec: remainingSec,
    status: String(r['status']) as TimerStatus,
    startedAt: r['started_at'] != null ? String(r['started_at']) : null,
    endsAt: r['ends_at'] != null ? String(r['ends_at']) : null,
    createdAt: String(r['created_at']),
  };
}

function mapFocusRow(r: Record<string, unknown>): FocusSession & {
  duration_sec: number;
  break_sec: number;
  remaining_sec: number;
  cycle_index: number;
} {
  const durationSec = Number(r['duration_sec']);
  const breakSec = Number(r['break_sec']);
  const remainingSec = Number(r['remaining_sec']);
  const cycleIndex = Number(r['cycle_index']);
  return {
    id: String(r['id']),
    label: r['label'] != null ? String(r['label']) : null,
    durationSec,
    duration_sec: durationSec,
    breakSec,
    break_sec: breakSec,
    remainingSec,
    remaining_sec: remainingSec,
    phase: String(r['phase']) as FocusPhase,
    cycleIndex,
    cycle_index: cycleIndex,
    status: String(r['status']) as FocusStatus,
    startedAt: String(r['started_at']),
    endedAt: r['ended_at'] != null ? String(r['ended_at']) : null,
    lastTickAt: r['last_tick_at'] != null ? String(r['last_tick_at']) : null,
  };
}

export class ProductivityService {
  private readonly trokoDb: TrokoDatabase;
  private readonly eventBus: EventBus;
  private readonly settingsService: SettingsService;
  private tickInterval: NodeJS.Timeout | null = null;
  private reminderInterval: NodeJS.Timeout | null = null;
  private readyForBreak = false;
  private focusHooks: {
    onFocusStarted?: (phase: FocusPhase) => void;
    onFocusCompleted?: (phase: FocusPhase) => void;
  } = {};

  constructor(
    trokoDb: TrokoDatabase,
    eventBus: EventBus,
    settingsService: SettingsService
  ) {
    this.trokoDb = trokoDb;
    this.eventBus = eventBus;
    this.settingsService = settingsService;
    this.recoverFocusStateOnStartup();
    this.startSchedulers();
  }

  setFocusHooks(hooks: {
    onFocusStarted?: (phase: FocusPhase) => void;
    onFocusCompleted?: (phase: FocusPhase) => void;
  }): void {
    this.focusHooks = hooks;
  }

  private recoverFocusStateOnStartup(): void {
    const activeRow = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (activeRow) {
      const session = mapFocusRow(activeRow);
      this.eventBus.setIslandState({
        state: 'focus',
        mood: 'contento',
        statusText: 'Enfoque',
        focusRemainingSec: session.remainingSec,
      });
    }
  }

  private startSchedulers(): void {
    this.tickInterval = setInterval(() => {
      try {
        this.tickTimersAndFocus();
      } catch {
        // Ignore transient DB errors after close
      }
    }, 1000);
    this.tickInterval.unref();

    this.reminderInterval = setInterval(() => {
      try {
        this.checkDueReminders();
      } catch {
        // Ignore transient DB errors after close
      }
    }, 300);
    this.reminderInterval.unref();
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
      this.reminderInterval = null;
    }
  }

  // === Tasks ===
  listTasks(): Task[] {
    const rows = this.trokoDb.db
      .prepare('SELECT * FROM tasks ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapTaskRow);
  }

  createTask(title: string): Task {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new HttpError(400, 'title is required');
    }
    const id = `task-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.trokoDb.db
      .prepare(
        'INSERT INTO tasks (id, title, completed, created_at, completed_at) VALUES (?, ?, 0, ?, NULL)'
      )
      .run(id, trimmed, now);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const task = mapTaskRow(row);
    this.eventBus.publish('data.updated', { scope: 'tasks', taskId: id });
    return task;
  }

  updateTask(
    id: string,
    patch: { title?: string; completed?: boolean }
  ): Task {
    const existing = this.trokoDb.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Task not found');
    }

    const current = mapTaskRow(existing);
    const nextTitle =
      typeof patch.title === 'string' && patch.title.trim().length > 0
        ? patch.title.trim()
        : current.title;
    const nextCompleted =
      typeof patch.completed === 'boolean' ? patch.completed : current.completed;
    const nextCompletedAt = nextCompleted
      ? current.completedAt ?? new Date().toISOString()
      : null;

    this.trokoDb.db
      .prepare(
        'UPDATE tasks SET title = ?, completed = ?, completed_at = ? WHERE id = ?'
      )
      .run(nextTitle, nextCompleted ? 1 : 0, nextCompletedAt, id);

    const updatedRow = this.trokoDb.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const task = mapTaskRow(updatedRow);
    this.eventBus.publish('data.updated', { scope: 'tasks', taskId: id });
    return task;
  }

  deleteTask(id: string): void {
    const res = this.trokoDb.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (res.changes === 0) {
      throw new HttpError(404, 'Task not found');
    }
    this.eventBus.publish('data.updated', { scope: 'tasks', taskId: id });
  }

  // === Reminders ===
  listReminders(): Reminder[] {
    const rows = this.trokoDb.db
      .prepare('SELECT * FROM reminders ORDER BY trigger_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapReminderRow);
  }

  createReminder(input: {
    title: string;
    triggerAt: string;
    recurrence: ReminderRecurrence;
    soundEnabled: boolean;
  }): Reminder {
    const id = `rem-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.trokoDb.db
      .prepare(
        `INSERT INTO reminders (id, title, trigger_at, recurrence, status, fired_at, sound_enabled, created_at)
         VALUES (?, ?, ?, ?, 'scheduled', NULL, ?, ?)`
      )
      .run(
        id,
        input.title,
        input.triggerAt,
        input.recurrence,
        input.soundEnabled ? 1 : 0,
        now
      );

    const row = this.trokoDb.db
      .prepare('SELECT * FROM reminders WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const reminder = mapReminderRow(row);
    this.eventBus.publish('data.updated', { scope: 'reminders', reminderId: id });
    return reminder;
  }

  private checkDueReminders(): void {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rows = this.trokoDb.db
      .prepare("SELECT * FROM reminders WHERE status = 'scheduled' ORDER BY trigger_at ASC")
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const r = mapReminderRow(row);
      const triggerMs = Date.parse(r.triggerAt);
      const createdMs = Date.parse(r.createdAt);
      if (!Number.isFinite(triggerMs)) continue;

      // Reminders created far in the past (> 15s before creation) are meant for wake catch-up
      if (Number.isFinite(createdMs) && triggerMs < createdMs - 15_000) {
        continue;
      }

      if (triggerMs <= nowMs) {
        this.trokoDb.db
          .prepare("UPDATE reminders SET status = 'fired', fired_at = ? WHERE id = ?")
          .run(nowIso, r.id);

        const fired: Reminder = {
          ...r,
          status: 'fired',
          firedAt: nowIso,
        };

        this.eventBus.setIslandState({
          state: 'remind',
          mood: 'animo',
          statusText: 'Recordatorio',
          remindMessage: r.title,
          peekCard: {
            kind: 'missed_reminders',
            reminders: [{ id: r.id, title: r.title, triggerAt: r.triggerAt }],
          },
        });
        this.eventBus.publish('reminder.due', fired);
        this.eventBus.publish('data.updated', { scope: 'reminders', reminderId: r.id });
      }
    }
  }

  dismissReminder(id: string): Reminder {
    const existing = this.trokoDb.db
      .prepare('SELECT * FROM reminders WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Reminder not found');
    }

    this.trokoDb.db
      .prepare("UPDATE reminders SET status = 'dismissed' WHERE id = ?")
      .run(id);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM reminders WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const reminder = mapReminderRow(row);

    const island = this.eventBus.getIslandState();
    if (island.state === 'remind') {
      this.eventBus.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
        peekCard: null,
      });
    }
    this.eventBus.publish('data.updated', { scope: 'reminders', reminderId: id });
    return reminder;
  }

  ackMissedReminder(id: string): Reminder {
    if (id === 'all') {
      this.trokoDb.db
        .prepare(
          "UPDATE reminders SET status = 'dismissed' WHERE status IN ('missed', 'scheduled', 'fired')"
        )
        .run();
      this.eventBus.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
        peekCard: null,
      });
      this.eventBus.publish('data.updated', { scope: 'reminders' });
      return {
        id: 'all',
        title: 'Todos los avisos',
        triggerAt: new Date().toISOString(),
        recurrence: null,
        status: 'dismissed',
        firedAt: new Date().toISOString(),
        soundEnabled: true,
        createdAt: new Date().toISOString(),
      };
    }

    const existing = this.trokoDb.db
      .prepare('SELECT * FROM reminders WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Reminder not found');
    }

    this.trokoDb.db
      .prepare("UPDATE reminders SET status = 'dismissed' WHERE id = ?")
      .run(id);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM reminders WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const reminder = mapReminderRow(row);

    this.eventBus.setIslandState({
      state: 'idle',
      mood: 'contento',
      statusText: 'Reposo',
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'reminders', reminderId: id });
    return reminder;
  }

  deleteReminder(id: string): void {
    const res = this.trokoDb.db
      .prepare('DELETE FROM reminders WHERE id = ?')
      .run(id);
    if (res.changes === 0) {
      throw new HttpError(404, 'Reminder not found');
    }
    this.eventBus.publish('data.updated', { scope: 'reminders', reminderId: id });
  }

  wakeCatchUp(): { missedReminders: Reminder[] } {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rows = this.trokoDb.db
      .prepare(
        "SELECT * FROM reminders WHERE status IN ('scheduled', 'missed') ORDER BY trigger_at ASC"
      )
      .all() as Array<Record<string, unknown>>;

    const missed: Reminder[] = [];
    for (const row of rows) {
      const r = mapReminderRow(row);
      const triggerMs = Date.parse(r.triggerAt);
      if (Number.isFinite(triggerMs) && triggerMs <= nowMs) {
        this.trokoDb.db
          .prepare("UPDATE reminders SET status = 'missed', fired_at = ? WHERE id = ?")
          .run(r.firedAt ?? nowIso, r.id);
        missed.push({
          ...r,
          status: 'missed',
          firedAt: r.firedAt ?? nowIso,
        });
      }
    }

    if (missed.length > 0) {
      this.eventBus.setIslandState({
        state: 'remind',
        mood: 'animo',
        statusText: 'Avisos pendientes',
        remindMessage: missed[0]!.title,
        peekCard: {
          kind: 'missed_reminders',
          reminders: missed.map((m) => ({
            id: m.id,
            title: m.title,
            triggerAt: m.triggerAt,
          })),
        },
      });
      this.eventBus.publish('data.updated', { scope: 'reminders' });
    }

    return { missedReminders: missed };
  }

  // === Timers ===
  listTimers(): Array<Timer & { duration_sec: number; remaining_sec: number }> {
    const rows = this.trokoDb.db
      .prepare('SELECT * FROM timers ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapTimerRow);
  }

  createTimer(input: { label: string; durationSec: number }): Timer & {
    duration_sec: number;
    remaining_sec: number;
  } {
    const id = `tmr-${crypto.randomUUID()}`;
    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const endsAt = new Date(nowMs + input.durationSec * 1000).toISOString();

    this.trokoDb.db
      .prepare(
        `INSERT INTO timers (id, label, duration_sec, remaining_sec, status, started_at, ends_at, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`
      )
      .run(
        id,
        input.label,
        input.durationSec,
        input.durationSec,
        startedAt,
        endsAt,
        startedAt
      );

    const row = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const timer = mapTimerRow(row);
    this.eventBus.publish('timer.tick', timer);
    this.eventBus.publish('data.updated', { scope: 'timers', timerId: id });
    return timer;
  }

  pauseTimer(id: string): Timer & { duration_sec: number; remaining_sec: number } {
    const existing = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Timer not found');
    }

    this.trokoDb.db
      .prepare("UPDATE timers SET status = 'paused', ends_at = NULL WHERE id = ?")
      .run(id);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const timer = mapTimerRow(row);
    this.eventBus.publish('timer.tick', timer);
    this.eventBus.publish('data.updated', { scope: 'timers', timerId: id });
    return timer;
  }

  resumeTimer(id: string): Timer & { duration_sec: number; remaining_sec: number } {
    const existing = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Timer not found');
    }
    const current = mapTimerRow(existing);
    const endsAt = new Date(Date.now() + current.remainingSec * 1000).toISOString();

    this.trokoDb.db
      .prepare("UPDATE timers SET status = 'running', ends_at = ? WHERE id = ?")
      .run(endsAt, id);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const timer = mapTimerRow(row);
    this.eventBus.publish('timer.tick', timer);
    this.eventBus.publish('data.updated', { scope: 'timers', timerId: id });
    return timer;
  }

  cancelTimer(id: string): Timer & { duration_sec: number; remaining_sec: number } {
    const existing = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new HttpError(404, 'Timer not found');
    }

    this.trokoDb.db
      .prepare("UPDATE timers SET status = 'cancelled', ends_at = NULL WHERE id = ?")
      .run(id);

    const row = this.trokoDb.db
      .prepare('SELECT * FROM timers WHERE id = ?')
      .get(id) as Record<string, unknown>;
    const timer = mapTimerRow(row);
    this.eventBus.publish('timer.tick', timer);
    this.eventBus.publish('data.updated', { scope: 'timers', timerId: id });
    return timer;
  }

  // === Focus (Pomodoro) ===
  getFocusState(): FocusStateSnapshot {
    const activeRow = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    const latestRow =
      activeRow ??
      (this.trokoDb.db
        .prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 1')
        .get() as Record<string, unknown> | undefined);

    const session = latestRow ? mapFocusRow(latestRow) : null;
    const todayYmd = getLocalYmd();

    const completedRows = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status = 'completed' AND phase = 'focus'"
      )
      .all() as Array<Record<string, unknown>>;

    let completedBlocksToday = 0;
    let totalSecondsToday = 0;
    const byDateBlocks = new Map<string, { blocks: number; minutes: number }>();

    for (const r of completedRows) {
      const started = String(r['started_at'] ?? '');
      const dYmd = started.slice(0, 10) || todayYmd;
      const durSec = Number(r['duration_sec'] ?? 1500);
      const mins = Math.max(1, Math.round(durSec / 60));

      if (dYmd === todayYmd) {
        completedBlocksToday += 1;
        totalSecondsToday += durSec;
      }

      const prev = byDateBlocks.get(dYmd) ?? { blocks: 0, minutes: 0 };
      prev.blocks += 1;
      prev.minutes += mins;
      byDateBlocks.set(dYmd, prev);
    }

    const weeklyStats: WeeklyFocusDay[] = SPANISH_WEEKDAYS_ORDER.map((day, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const ymd = getLocalYmd(d);
      const entry =
        idx === 6
          ? {
              blocks: completedBlocksToday,
              minutes: Math.round(totalSecondsToday / 60),
            }
          : (byDateBlocks.get(ymd) ?? { blocks: 0, minutes: 0 });
      return {
        day,
        dateYmd: ymd,
        blocks: entry.blocks,
        minutes: entry.minutes,
      };
    });

    const settings = this.settingsService.getSettings();
    const defaultDurationSec = settings.focusMinutes * 60;
    const defaultBreakSec = settings.breakMinutes * 60;

    return {
      ok: true,
      session,
      id: session?.id,
      label: session?.label ?? null,
      durationSec: session?.durationSec ?? defaultDurationSec,
      duration_sec: session?.durationSec ?? defaultDurationSec,
      breakSec: session?.breakSec ?? defaultBreakSec,
      break_sec: session?.breakSec ?? defaultBreakSec,
      remainingSec: session?.remainingSec ?? defaultDurationSec,
      remaining_sec: session?.remainingSec ?? defaultDurationSec,
      phase: session?.phase ?? 'focus',
      cycleIndex: session?.cycleIndex ?? 1,
      cycle_index: session?.cycleIndex ?? 1,
      status: session?.status ?? 'idle',
      completedBlocksToday,
      totalMinutesToday: Math.round(totalSecondsToday / 60),
      lastCompletedPhase:
        session && session.status === 'completed' ? session.phase : null,
      readyForBreak: this.readyForBreak,
      weeklyStats,
    };
  }

  startFocus(
    input: {
      label?: string;
      durationSec?: number;
      breakSec?: number;
      phase?: FocusPhase;
    } = {}
  ): FocusStateSnapshot {
    const settings = this.settingsService.getSettings();
    const durationSec =
      typeof input.durationSec === 'number' && input.durationSec > 0
        ? Math.floor(input.durationSec)
        : settings.focusMinutes * 60;
    const breakSec =
      typeof input.breakSec === 'number' && input.breakSec > 0
        ? Math.floor(input.breakSec)
        : settings.breakMinutes * 60;

    // Stop any currently active/paused session before starting a new one
    const now = new Date().toISOString();
    const prevLatest = this.trokoDb.db
      .prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 1')
      .get() as Record<string, unknown> | undefined;

    this.trokoDb.db
      .prepare(
        "UPDATE focus_sessions SET status = 'stopped', ended_at = ? WHERE status IN ('active', 'paused')"
      )
      .run(now);

    let nextCycleIndex = 1;
    if (prevLatest && String(prevLatest['status']) === 'completed') {
      const prevCycle = Number(prevLatest['cycle_index'] ?? 1);
      nextCycleIndex = (prevCycle % 4) + 1;
    }

    const phase: FocusPhase = input.phase ?? 'focus';
    const initialRemaining = phase === 'break' ? breakSec : durationSec;
    const label =
      typeof input.label === 'string' && input.label.trim().length > 0
        ? input.label.trim()
        : prevLatest && this.readyForBreak && prevLatest['label'] != null
        ? String(prevLatest['label'])
        : null;

    this.readyForBreak = false;

    const id = `foc-${crypto.randomUUID()}`;
    this.trokoDb.db
      .prepare(
        `INSERT INTO focus_sessions
         (id, label, duration_sec, break_sec, remaining_sec, phase, cycle_index, status, started_at, ended_at, last_tick_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?)`
      )
      .run(
        id,
        label,
        durationSec,
        breakSec,
        initialRemaining,
        phase,
        nextCycleIndex,
        now,
        now
      );

    this.eventBus.setIslandState({
      state: 'focus',
      mood: 'contento',
      statusText: 'Enfoque',
      focusRemainingSec: initialRemaining,
    });

    this.eventBus.publish('focus.tick', {
      id,
      remainingSec: initialRemaining,
      phase,
      label: label ?? undefined,
    });
    this.focusHooks.onFocusStarted?.(phase);
    this.eventBus.publish('data.updated', { scope: 'focus', focusId: id });
    return this.getFocusState();
  }

  pauseFocus(): FocusStateSnapshot {
    const active = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (!active) {
      throw new HttpError(400, 'No active focus session to pause');
    }

    const id = String(active['id']);
    this.trokoDb.db
      .prepare("UPDATE focus_sessions SET status = 'paused' WHERE id = ?")
      .run(id);

    this.eventBus.publish('data.updated', { scope: 'focus', focusId: id });
    return this.getFocusState();
  }

  resumeFocus(): FocusStateSnapshot {
    const paused = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status = 'paused' ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (!paused) {
      throw new HttpError(400, 'No paused focus session to resume');
    }

    const id = String(paused['id']);
    const remainingSec = Number(paused['remaining_sec']);
    const now = new Date().toISOString();

    this.trokoDb.db
      .prepare(
        "UPDATE focus_sessions SET status = 'active', last_tick_at = ? WHERE id = ?"
      )
      .run(now, id);

    this.eventBus.setIslandState({
      state: 'focus',
      mood: 'contento',
      statusText: 'Enfoque',
      focusRemainingSec: remainingSec,
    });
    this.eventBus.publish('data.updated', { scope: 'focus', focusId: id });
    return this.getFocusState();
  }

  extendFocus(minutes = 5): FocusStateSnapshot {
    const sessionRow = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (!sessionRow) {
      throw new HttpError(400, 'No focus session to extend');
    }

    const id = String(sessionRow['id']);
    const addSec = Math.max(1, Math.floor(minutes)) * 60;
    const nextRemaining = Number(sessionRow['remaining_sec']) + addSec;
    const nextDuration = Number(sessionRow['duration_sec']) + addSec;

    this.trokoDb.db
      .prepare(
        'UPDATE focus_sessions SET remaining_sec = ?, duration_sec = ? WHERE id = ?'
      )
      .run(nextRemaining, nextDuration, id);

    this.eventBus.setIslandState({
      state: 'focus',
      mood: 'contento',
      statusText: 'Enfoque',
      focusRemainingSec: nextRemaining,
    });
    this.eventBus.publish('focus.tick', {
      id,
      remainingSec: nextRemaining,
      phase: String(sessionRow['phase']),
      label:
        sessionRow['label'] != null ? String(sessionRow['label']) : undefined,
    });
    this.eventBus.publish('data.updated', { scope: 'focus', focusId: id });
    return this.getFocusState();
  }

  finishFocus(): FocusStateSnapshot {
    const sessionRow = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (!sessionRow) {
      throw new HttpError(400, 'No active focus session to finish');
    }

    const id = String(sessionRow['id']);
    const phase = String(sessionRow['phase'] ?? 'focus') as FocusPhase;
    const now = new Date().toISOString();
    this.trokoDb.db
      .prepare(
        "UPDATE focus_sessions SET status = 'completed', remaining_sec = 0, ended_at = ? WHERE id = ?"
      )
      .run(now, id);

    this.readyForBreak = true;

    this.eventBus.setIslandState({
      state: 'idle',
      mood: 'orgulloso',
      statusText: 'Reposo',
      peekCard: null,
    });
    this.focusHooks.onFocusCompleted?.(phase);
    this.eventBus.publish('data.updated', { scope: 'focus', focusId: id });
    return this.getFocusState();
  }

  stopFocus(): FocusStateSnapshot {
    const sessionRow = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    const now = new Date().toISOString();
    if (sessionRow) {
      const id = String(sessionRow['id']);
      this.trokoDb.db
        .prepare(
          "UPDATE focus_sessions SET status = 'stopped', ended_at = ? WHERE id = ?"
        )
        .run(now, id);
    }

    this.readyForBreak = false;
    this.eventBus.setIslandState({
      state: 'idle',
      mood: 'contento',
      statusText: 'Reposo',
      peekCard: null,
    });
    this.eventBus.publish('data.updated', { scope: 'focus' });
    return this.getFocusState();
  }

  private tickTimersAndFocus(): void {
    const nowIso = new Date().toISOString();

    // 1. Tick running timers
    const runningTimers = this.trokoDb.db
      .prepare("SELECT * FROM timers WHERE status = 'running'")
      .all() as Array<Record<string, unknown>>;

    for (const r of runningTimers) {
      const t = mapTimerRow(r);
      const nextRemaining = Math.max(0, t.remainingSec - 1);
      const nextStatus: TimerStatus = nextRemaining === 0 ? 'finished' : 'running';

      this.trokoDb.db
        .prepare('UPDATE timers SET remaining_sec = ?, status = ? WHERE id = ?')
        .run(nextRemaining, nextStatus, t.id);

      const updated: Timer & { duration_sec: number; remaining_sec: number } = {
        ...t,
        remainingSec: nextRemaining,
        remaining_sec: nextRemaining,
        status: nextStatus,
      };
      this.eventBus.publish('timer.tick', updated);
      if (nextStatus === 'finished') {
        this.eventBus.setIslandState({
          state: 'remind',
          mood: 'animo',
          statusText: 'Temporizador',
          remindMessage: t.label,
        });
        this.eventBus.publish('data.updated', { scope: 'timers', timerId: t.id });
      }
    }

    // 2. Tick active focus session
    const activeFocus = this.trokoDb.db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;

    if (activeFocus) {
      const f = mapFocusRow(activeFocus);
      const nextRemaining = Math.max(0, f.remainingSec - 1);
      if (nextRemaining === 0) {
        this.trokoDb.db
          .prepare(
            "UPDATE focus_sessions SET remaining_sec = 0, status = 'completed', ended_at = ?, last_tick_at = ? WHERE id = ?"
          )
          .run(nowIso, nowIso, f.id);
        this.readyForBreak = true;
        this.eventBus.setIslandState({
          state: 'success',
          mood: 'orgulloso',
          statusText: 'Listo',
          badgeWord: 'Enfoque listo',
        });
        this.focusHooks.onFocusCompleted?.(f.phase);
        this.eventBus.publish('data.updated', { scope: 'focus', focusId: f.id });
      } else {
        this.trokoDb.db
          .prepare(
            'UPDATE focus_sessions SET remaining_sec = ?, last_tick_at = ? WHERE id = ?'
          )
          .run(nextRemaining, nowIso, f.id);

        const curIsland = this.eventBus.getIslandState();
        if (curIsland.state === 'focus') {
          this.eventBus.setIslandState({
            state: 'focus',
            mood: curIsland.mood,
            statusText: 'Enfoque',
            focusRemainingSec: nextRemaining,
          });
        }
        this.eventBus.publish('focus.tick', {
          id: f.id,
          remainingSec: nextRemaining,
          phase: f.phase,
          label: f.label ?? undefined,
        });
      }
    }
  }
}
