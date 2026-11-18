import type {
  FocusPhase,
  FocusSession,
  FocusStatus,
  HealthStatus,
  Reminder,
  ReminderRecurrence,
  ReminderStatus,
  SummarySnapshot,
} from '../../../shared/types.ts';
import {
  validateIslandStatusPayload,
  validateSettingsPatch,
} from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

function getLocalYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function mapFocusRow(r: Record<string, unknown>): FocusSession {
  return {
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
  };
}

export function registerCoreRoutes(router: Router, ctx: ServerContext): void {
  router.get('/api/health', (_req, res) => {
    const payload: HealthStatus = {
      ok: true,
      version: ctx.version,
      uptimeSec: Math.floor((Date.now() - ctx.startedAtMs) / 1000),
    };
    sendJson(res, 200, payload);
  });

  router.get('/api/events', (req, res) => {
    ctx.eventBus.attachSseResponse(req.raw, res);
  });

  router.get('/api/island/state', (_req, res) => {
    sendJson(res, 200, ctx.eventBus.getIslandState());
  });

  router.post('/api/island/state', async (req, res) => {
    const body = await req.readJson<unknown>();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Island state body must be a JSON object');
    }
    const obj = body as Record<string, unknown>;
    if (Object.keys(obj).length === 0) {
      throw new HttpError(400, 'Island state body cannot be empty');
    }
    const current = ctx.eventBus.getIslandState();
    const nextState = obj['state'] !== undefined ? obj['state'] : current.state;
    const stateChanged = obj['state'] !== undefined && obj['state'] !== current.state;
    const defaultStatusByState: Record<string, string> = {
      idle: 'Reposo',
      listen: 'Escuchando',
      think: 'Pensando',
      speak: 'Hablando',
      alert: 'Alerta',
      attentive: 'Atento',
      notification: 'Notificación',
      sleep: 'Dormido',
      focus: 'Enfoque',
      success: 'Listo',
      remind: 'Recordatorio',
    };
    const candidate: Record<string, unknown> = {
      state: nextState,
      mood: obj['mood'] !== undefined ? obj['mood'] : current.mood,
      statusText:
        obj['statusText'] !== undefined
          ? obj['statusText']
          : stateChanged && typeof nextState === 'string' && defaultStatusByState[nextState]
          ? defaultStatusByState[nextState]
          : current.statusText,
      peekCard:
        obj['peekCard'] !== undefined
          ? obj['peekCard']
          : stateChanged && nextState === 'idle'
          ? null
          : (current.peekCard ?? null),
    };
    for (const optKey of ['badgeWord', 'focusRemainingSec', 'remindMessage', 'transcript'] as const) {
      if (optKey in obj) {
        if (obj[optKey] !== null && obj[optKey] !== undefined) {
          candidate[optKey] = obj[optKey];
        }
      } else if (!stateChanged && current[optKey] !== undefined) {
        candidate[optKey] = current[optKey];
      }
    }
    const validated = validateIslandStatusPayload(candidate);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const island = ctx.eventBus.setIslandState({
      ...validated.value,
      badgeWord: validated.value.badgeWord,
      focusRemainingSec: validated.value.focusRemainingSec,
      remindMessage: validated.value.remindMessage,
      transcript: validated.value.transcript,
    });
    sendJson(res, 200, { ok: true, island });
  });

  router.get('/api/summary', async (_req, res) => {
    const db = ctx.db.db;
    const todayYmd = getLocalYmd();

    const habitsTotalRow = db.prepare('SELECT COUNT(*) AS cnt FROM habits').get() as
      | Record<string, unknown>
      | undefined;
    const habitsTotalToday = Number(habitsTotalRow?.['cnt'] ?? 0);

    const habitsDoneRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT h.id, h.daily_goal, COALESCE(SUM(l.delta), 0) AS progress
           FROM habits h
           LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date_ymd = ?
           GROUP BY h.id
           HAVING progress >= h.daily_goal
         )`
      )
      .get(todayYmd) as Record<string, unknown> | undefined;
    const habitsCompletedToday = Number(habitsDoneRow?.['cnt'] ?? 0);

    const pendingRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM tasks WHERE completed = 0')
      .get() as Record<string, unknown> | undefined;
    const pendingTasksCount = Number(pendingRow?.['cnt'] ?? 0);

    const nextRemRow = db
      .prepare(
        "SELECT * FROM reminders WHERE status = 'scheduled' ORDER BY trigger_at ASC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;
    const nextReminder = nextRemRow ? mapReminderRow(nextRemRow) : null;

    const activeFocusRow = db
      .prepare(
        "SELECT * FROM focus_sessions WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1"
      )
      .get() as Record<string, unknown> | undefined;
    const activeFocus = activeFocusRow ? mapFocusRow(activeFocusRow) : null;

    const unreadRow = db
      .prepare('SELECT COUNT(*) AS cnt FROM email_messages WHERE unread = 1')
      .get() as Record<string, unknown> | undefined;
    const unreadEmailsCount = Number(unreadRow?.['cnt'] ?? 0);

    const looseDesktopFilesCount = await ctx.getLooseDesktopFilesCount();

    const summary: SummarySnapshot = {
      habitsCompletedToday,
      habitsTotalToday,
      pendingTasksCount,
      nextReminder,
      activeFocus,
      unreadEmailsCount,
      looseDesktopFilesCount,
    };
    sendJson(res, 200, summary);
  });

  router.get('/api/settings', (_req, res) => {
    sendJson(res, 200, ctx.settingsService.getSettings());
  });

  router.patch('/api/settings', async (req, res) => {
    const body = await req.readJson();
    const validated = validateSettingsPatch(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const updated = ctx.settingsService.patchSettings(validated.value);
    sendJson(res, 200, updated);
  });
}
