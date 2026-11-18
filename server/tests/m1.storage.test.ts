import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ISLAND_STATES,
  TROKO_MOODS,
} from '../../shared/types.ts';
import type { PeekCard } from '../../shared/types.ts';
import {
  validateAppLaunchInput,
  validateCreateHabitInput,
  validateCreateTaskInput,
  validateIslandStatusPayload,
  validateSettingsPatch,
} from '../../shared/validators.ts';
import { createApp } from '../src/app.ts';
import { createDatabase } from '../src/db/database.ts';
import { DEFAULT_SETTINGS, EXPECTED_TABLES } from '../src/db/schema.ts';
import { EventBus } from '../src/eventBus.ts';
import { SettingsService } from '../src/services/settingsService.ts';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'troko-m1-test-'));
  tempDirs.push(dir);
  return dir;
}

function getLocalYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('M1 SQLite Storage & Settings', () => {
  it('creates all 15 tables with WAL mode, foreign_keys, and user_version = 1 on file DB', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'troko.db');
    const trokoDb = createDatabase(dbPath);
    try {
      assert.deepEqual(trokoDb.listTables(), [...EXPECTED_TABLES]);
      assert.equal(trokoDb.listTables().length, 15);
      assert.equal(trokoDb.getJournalMode().toLowerCase(), 'wal');
      assert.equal(trokoDb.getForeignKeysEnabled(), true);
      assert.equal(trokoDb.getUserVersion(), 1);
    } finally {
      trokoDb.close();
    }
  });

  it('supports idempotent reopen on file DB and clean :memory: initialization', () => {
    const memDb = createDatabase(':memory:');
    try {
      assert.deepEqual(memDb.listTables(), [...EXPECTED_TABLES]);
      assert.equal(memDb.getJournalMode().toLowerCase(), 'memory');
    } finally {
      memDb.close();
    }

    const dir = makeTempDir();
    const dbPath = path.join(dir, 'reopen.db');
    const db1 = createDatabase(dbPath);
    db1.db
      .prepare('INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 0, ?)')
      .run('t1', 'Revisar contrato', '2026-01-01T10:00:00.000Z');
    db1.close();

    const db2 = createDatabase(dbPath);
    try {
      assert.deepEqual(db2.listTables(), [...EXPECTED_TABLES]);
      const row = db2.db.prepare('SELECT title FROM tasks WHERE id = ?').get('t1') as
        | Record<string, unknown>
        | undefined;
      assert.equal(row?.['title'], 'Revisar contrato');
    } finally {
      db2.close();
    }
  });

  it('seeds DEFAULT_SETTINGS and persists partial patches across reopen', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'settings.db');
    const db1 = createDatabase(dbPath);
    const bus1 = new EventBus();
    const svc1 = new SettingsService(db1, bus1);

    assert.deepEqual(svc1.getSettings(), DEFAULT_SETTINGS);

    const updated = svc1.patchSettings({
      voiceEnabled: false,
      focusMinutes: 40,
      wakeWord: 'Oye Troko',
      permissions: {
        ...DEFAULT_SETTINGS.permissions,
        microphone: 'granted',
      },
    });
    assert.equal(updated.voiceEnabled, false);
    assert.equal(updated.focusMinutes, 40);
    assert.equal(updated.wakeWord, 'Oye Troko');
    assert.equal(updated.permissions.microphone, 'granted');
    assert.equal(updated.permissions.desktopFolder, 'prompt');

    bus1.close();
    db1.close();

    const db2 = createDatabase(dbPath);
    try {
      const persisted = db2.getSettingsObject();
      assert.equal(persisted.voiceEnabled, false);
      assert.equal(persisted.focusMinutes, 40);
      assert.equal(persisted.wakeWord, 'Oye Troko');
      assert.equal(persisted.permissions.microphone, 'granted');
      assert.equal(persisted.breakMinutes, DEFAULT_SETTINGS.breakMinutes);
    } finally {
      db2.close();
    }
  });

  it('exportMemory() returns all tables and wipeMemory() clears domain tables and resets settings', () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, 'wipe.db');
    const trokoDb = createDatabase(dbPath);
    const bus = new EventBus();
    const svc = new SettingsService(trokoDb, bus);

    try {
      svc.patchSettings({ voiceEnabled: false, focusMinutes: 50 });
      const now = '2026-01-01T12:00:00.000Z';

      trokoDb.db
        .prepare('INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 0, ?)')
        .run('task-1', 'Tarea de prueba', now);
      trokoDb.db
        .prepare(
          'INSERT INTO habits (id, name, scene_id, unit_label, daily_goal, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run('hab-1', 'Agua', 'water', 'vasos', 8, now);
      trokoDb.db
        .prepare(
          'INSERT INTO habit_logs (id, habit_id, date_ymd, delta, logged_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run('hl-1', 'hab-1', '2026-01-01', 1, now);
      trokoDb.db
        .prepare('INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)')
        .run('conv-1', 'Principal', now);
      trokoDb.db
        .prepare(
          'INSERT INTO messages (id, conversation_id, role, content, input_mode, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run('msg-1', 'conv-1', 'user', 'Hola Troko', 'text', now);
      trokoDb.db
        .prepare(
          'INSERT INTO email_drafts (id, to_name, to_email, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          'draft-1',
          'Ana',
          'ana@example.com',
          'Re: Proyecto',
          'Hola Ana',
          'pending_confirmation',
          now
        );

      const exported = svc.exportMemory();
      assert.equal(exported.settings.voiceEnabled, false);
      assert.equal(exported.settings.focusMinutes, 50);
      assert.equal(exported.tasks.length, 1);
      assert.equal(exported.habits.length, 1);
      assert.equal(exported.habitLogs.length, 1);
      assert.equal(exported.conversations.length, 1);
      assert.equal(exported.messages.length, 1);
      assert.equal(exported.emailDrafts.length, 1);

      const resetSettings = svc.wipeMemory();
      assert.deepEqual(resetSettings, DEFAULT_SETTINGS);

      const afterWipe = svc.exportMemory();
      assert.equal(afterWipe.tasks.length, 0);
      assert.equal(afterWipe.habits.length, 0);
      assert.equal(afterWipe.habitLogs.length, 0);
      assert.equal(afterWipe.conversations.length, 0);
      assert.equal(afterWipe.messages.length, 0);
      assert.equal(afterWipe.emailDrafts.length, 0);
      assert.deepEqual(afterWipe.settings, DEFAULT_SETTINGS);
    } finally {
      bus.close();
      trokoDb.close();
    }
  });
});

describe('M1 Shared Validators', () => {
  it('validates all 11 island states, 12 moods, and all 4 PeekCard variants', () => {
    for (const state of ISLAND_STATES) {
      for (const mood of TROKO_MOODS) {
        const res = validateIslandStatusPayload({
          state,
          mood,
          statusText: `Estado ${state}`,
        });
        assert.equal(res.ok, true);
      }
    }

    const cards: PeekCard[] = [
      {
        kind: 'desktop_tidy',
        batchId: 'b1',
        totalFiles: 3,
        categories: { Documentos: 2, Imágenes: 1 },
        items: [{ fileName: 'nota.txt', category: 'Documentos' }],
      },
      {
        kind: 'email_draft',
        draftId: 'd1',
        toName: 'Ana',
        toEmail: 'ana@example.com',
        subject: 'Hola',
        body: 'Mensaje',
      },
      {
        kind: 'habit_remind',
        habitId: 'h1',
        habitName: 'Agua',
        progress: 2,
        goal: 8,
        unitLabel: 'vasos',
      },
      {
        kind: 'missed_reminders',
        reminders: [{ id: 'r1', title: 'Llamar', triggerAt: '2026-01-01T10:00:00.000Z' }],
      },
    ];

    for (const peekCard of cards) {
      const res = validateIslandStatusPayload({
        state: 'remind',
        mood: 'animo',
        statusText: 'Aviso',
        peekCard,
      });
      assert.equal(res.ok, true);
    }

    assert.equal(
      validateIslandStatusPayload({ state: 'invalid', mood: 'contento', statusText: 'x' }).ok,
      false
    );
    assert.equal(
      validateIslandStatusPayload({ state: 'idle', mood: 'nope', statusText: 'x' }).ok,
      false
    );
    assert.equal(
      validateIslandStatusPayload({
        state: 'idle',
        mood: 'contento',
        statusText: 'x',
        peekCard: { kind: 'unknown' },
      }).ok,
      false
    );
  });

  it('rejects invalid settings patches and unsafe domain inputs', () => {
    assert.equal(validateSettingsPatch({ focusMinutes: 0 }).ok, false);
    assert.equal(validateSettingsPatch({ focusMinutes: 999 }).ok, false);
    assert.equal(validateSettingsPatch({ sleepTimeoutSec: 2 }).ok, false);
    assert.equal(validateSettingsPatch({ unknownKey: true }).ok, false);
    assert.equal(validateSettingsPatch({ aiProvider: 'magic' }).ok, false);
    assert.equal(validateSettingsPatch({ sleepTimeoutSec: 0 }).ok, true);

    assert.equal(validateCreateTaskInput({ title: '   ' }).ok, false);
    assert.equal(
      validateCreateHabitInput({
        name: 'Leer',
        sceneId: 'book',
        unitLabel: 'páginas',
        dailyGoal: 10,
        reminderTime: '99:99',
      }).ok,
      false
    );
    assert.equal(validateAppLaunchInput({ appName: 'Notes; rm -rf /' }).ok, false);
    assert.equal(validateAppLaunchInput({ appName: 'Notas' }).ok, true);
  });
});

describe('M1 HTTP + SSE Server', () => {
  it('serves /api/health, /api/settings, and 400/404 validation errors', async () => {
    const dir = makeTempDir();
    const app = createApp({
      dbPath: path.join(dir, 'http.db'),
      staticDir: null,
      heartbeatMs: 0,
    });
    const bound = await app.listen(0, '127.0.0.1');
    const base = `http://${bound.host}:${bound.port}`;

    try {
      const healthRes = await fetch(`${base}/api/health`);
      assert.equal(healthRes.status, 200);
      const health = (await healthRes.json()) as { ok: boolean; version: string; uptimeSec: number };
      assert.equal(health.ok, true);
      assert.equal(health.version, '0.1.0');
      assert.equal(typeof health.uptimeSec, 'number');

      const getSettingsRes = await fetch(`${base}/api/settings`);
      assert.equal(getSettingsRes.status, 200);
      const settings = (await getSettingsRes.json()) as typeof DEFAULT_SETTINGS;
      assert.equal(settings.voiceEnabled, true);

      const patchRes = await fetch(`${base}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceEnabled: false, sleepTimeoutSec: 60 }),
      });
      assert.equal(patchRes.status, 200);
      const patched = (await patchRes.json()) as typeof DEFAULT_SETTINGS;
      assert.equal(patched.voiceEnabled, false);
      assert.equal(patched.sleepTimeoutSec, 60);

      const badPatchRes = await fetch(`${base}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusMinutes: -5 }),
      });
      assert.equal(badPatchRes.status, 400);

      const malformedRes = await fetch(`${base}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      });
      assert.equal(malformedRes.status, 400);

      const notFoundRes = await fetch(`${base}/api/missing`);
      assert.equal(notFoundRes.status, 404);
    } finally {
      await app.close();
    }
  });

  it('computes GET /api/summary accurately from SQLite state', async () => {
    const dir = makeTempDir();
    const app = createApp({
      dbPath: path.join(dir, 'summary.db'),
      staticDir: null,
      heartbeatMs: 0,
    });
    const bound = await app.listen(0, '127.0.0.1');
    const base = `http://${bound.host}:${bound.port}`;

    try {
      const emptyRes = await fetch(`${base}/api/summary`);
      assert.equal(emptyRes.status, 200);
      const emptySummary = (await emptyRes.json()) as Record<string, unknown>;
      assert.deepEqual(emptySummary, {
        habitsCompletedToday: 0,
        habitsTotalToday: 0,
        pendingTasksCount: 0,
        nextReminder: null,
        activeFocus: null,
        unreadEmailsCount: 0,
        looseDesktopFilesCount: 0,
      });

      const todayYmd = getLocalYmd();
      const now = new Date().toISOString();
      const db = app.db.db;

      db.prepare(
        'INSERT INTO habits (id, name, scene_id, unit_label, daily_goal, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('h1', 'Agua', 'water', 'vasos', 4, now);
      db.prepare(
        'INSERT INTO habits (id, name, scene_id, unit_label, daily_goal, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('h2', 'Leer', 'book', 'páginas', 10, now);
      db.prepare(
        'INSERT INTO habit_logs (id, habit_id, date_ymd, delta, logged_at) VALUES (?, ?, ?, ?, ?)'
      ).run('hl1', 'h1', todayYmd, 4, now);
      db.prepare(
        'INSERT INTO habit_logs (id, habit_id, date_ymd, delta, logged_at) VALUES (?, ?, ?, ?, ?)'
      ).run('hl2', 'h2', todayYmd, 3, now);

      db.prepare('INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 0, ?)').run(
        't1',
        'Pendiente 1',
        now
      );
      db.prepare('INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 0, ?)').run(
        't2',
        'Pendiente 2',
        now
      );
      db.prepare('INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 1, ?)').run(
        't3',
        'Hecha',
        now
      );

      db.prepare(
        'INSERT INTO reminders (id, title, trigger_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('r2', 'Más tarde', '2026-12-01T18:00:00.000Z', 'scheduled', now);
      db.prepare(
        'INSERT INTO reminders (id, title, trigger_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('r1', 'Más pronto', '2026-12-01T09:00:00.000Z', 'scheduled', now);

      db.prepare(
        'INSERT INTO focus_sessions (id, label, duration_sec, break_sec, remaining_sec, phase, cycle_index, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('f1', 'Diseño', 1500, 300, 1200, 'focus', 1, 'active', now);

      db.prepare(
        'INSERT INTO email_messages (id, from_name, from_email, subject, snippet, body, unread, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('e1', 'Ana', 'ana@example.com', 'S1', 'snip', 'body', 1, now);
      db.prepare(
        'INSERT INTO email_messages (id, from_name, from_email, subject, snippet, body, unread, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('e2', 'Luis', 'luis@example.com', 'S2', 'snip', 'body', 1, now);
      db.prepare(
        'INSERT INTO email_messages (id, from_name, from_email, subject, snippet, body, unread, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('e3', 'Marta', 'marta@example.com', 'S3', 'snip', 'body', 0, now);

      const fullRes = await fetch(`${base}/api/summary`);
      assert.equal(fullRes.status, 200);
      const summary = (await fullRes.json()) as {
        habitsCompletedToday: number;
        habitsTotalToday: number;
        pendingTasksCount: number;
        nextReminder: { id: string; title: string } | null;
        activeFocus: { id: string; label: string | null } | null;
        unreadEmailsCount: number;
        looseDesktopFilesCount: number;
      };
      assert.equal(summary.habitsCompletedToday, 1);
      assert.equal(summary.habitsTotalToday, 2);
      assert.equal(summary.pendingTasksCount, 2);
      assert.equal(summary.nextReminder?.id, 'r1');
      assert.equal(summary.activeFocus?.id, 'f1');
      assert.equal(summary.unreadEmailsCount, 2);
      assert.equal(summary.looseDesktopFilesCount, 0);
    } finally {
      await app.close();
    }
  });

  it('streams SSE events on /api/events and cleans up subscribers on client disconnect', async () => {
    const dir = makeTempDir();
    const app = createApp({
      dbPath: path.join(dir, 'sse.db'),
      staticDir: null,
      heartbeatMs: 0,
    });
    const bound = await app.listen(0, '127.0.0.1');
    const base = `http://${bound.host}:${bound.port}`;

    const ac = new AbortController();
    const events: Array<{ type: string; payload: unknown }> = [];

    try {
      const sseRes = await fetch(`${base}/api/events`, { signal: ac.signal });
      assert.equal(sseRes.status, 200);
      assert.match(sseRes.headers.get('content-type') ?? '', /text\/event-stream/);
      assert.ok(sseRes.body);

      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readNextEvent = async (): Promise<{ type: string; payload: unknown }> => {
        while (true) {
          const idx = buffer.indexOf('\n\n');
          if (idx !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame
              .split('\n')
              .find((line) => line.startsWith('data: '));
            if (dataLine) {
              return JSON.parse(dataLine.slice(6)) as { type: string; payload: unknown };
            }
            continue;
          }
          const chunk = await reader.read();
          if (chunk.done) {
            throw new Error('SSE stream ended prematurely');
          }
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      };

      const initial = await readNextEvent();
      events.push(initial);
      assert.equal(initial.type, 'island.state');
      assert.equal(app.eventBus.subscriberCount, 1);

      const postIslandRes = await fetch(`${base}/api/island/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'listen',
          mood: 'escucha',
          statusText: 'Escuchando',
        }),
      });
      assert.equal(postIslandRes.status, 200);

      const stateEvt = await readNextEvent();
      events.push(stateEvt);
      assert.equal(stateEvt.type, 'island.state');

      const patchRes = await fetch(`${base}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceEnabled: false }),
      });
      assert.equal(patchRes.status, 200);

      const dataEvt = await readNextEvent();
      events.push(dataEvt);
      assert.equal(dataEvt.type, 'data.updated');

      ac.abort();
      await reader.cancel().catch(() => {});

      const getSubCount = (): number => app.eventBus.subscriberCount;
      for (let i = 0; i < 20; i += 1) {
        if (getSubCount() === 0) break;
        await new Promise((r) => setTimeout(r, 15));
      }
      assert.equal(getSubCount(), 0);
      assert.equal(events.length, 3);
    } finally {
      ac.abort();
      await app.close();
    }
  });
});
