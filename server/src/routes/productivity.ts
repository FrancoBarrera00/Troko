import {
  validateCreateReminderInput,
  validateCreateTaskInput,
  validateCreateTimerInput,
} from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerProductivityRoutes(router: Router, ctx: ServerContext): void {
  // Tasks
  router.get('/api/tasks', (_req, res) => {
    const tasks = ctx.productivityService.listTasks();
    sendJson(res, 200, { ok: true, tasks });
  });

  router.post('/api/tasks', async (req, res) => {
    const body = await req.readJson();
    const validated = validateCreateTaskInput(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const task = ctx.productivityService.createTask(validated.value.title);
    sendJson(res, 201, { ok: true, task, ...task });
  });

  router.patch('/api/tasks/:id', async (req, res) => {
    const id = req.params['id'] ?? '';
    const body = await req.readJson<Record<string, unknown>>();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Task patch must be an object');
    }
    const patch: { title?: string; completed?: boolean } = {};
    if ('title' in body) {
      if (typeof body['title'] !== 'string' || body['title'].trim().length === 0) {
        throw new HttpError(400, 'title must be a non-empty string');
      }
      patch.title = body['title'].trim();
    }
    if ('completed' in body) {
      if (typeof body['completed'] !== 'boolean') {
        throw new HttpError(400, 'completed must be a boolean');
      }
      patch.completed = body['completed'];
    }
    const task = ctx.productivityService.updateTask(id, patch);
    sendJson(res, 200, { ok: true, task, ...task });
  });

  router.delete('/api/tasks/:id', (req, res) => {
    const id = req.params['id'] ?? '';
    ctx.productivityService.deleteTask(id);
    sendJson(res, 200, { ok: true });
  });

  // Reminders
  router.get('/api/reminders', (_req, res) => {
    const reminders = ctx.productivityService.listReminders();
    sendJson(res, 200, { ok: true, reminders });
  });

  router.post('/api/reminders', async (req, res) => {
    const body = await req.readJson();
    const validated = validateCreateReminderInput(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const reminder = ctx.productivityService.createReminder(validated.value);
    sendJson(res, 201, { ok: true, reminder, ...reminder });
  });

  router.post('/api/reminders/wake-catchup', (_req, res) => {
    const result = ctx.productivityService.wakeCatchUp();
    sendJson(res, 200, {
      ok: true,
      missedReminders: result.missedReminders,
      reminders: result.missedReminders,
      firedCount: result.missedReminders.length,
    });
  });

  router.post('/api/reminders/:id/dismiss', (req, res) => {
    const id = req.params['id'] ?? '';
    const reminder = ctx.productivityService.dismissReminder(id);
    sendJson(res, 200, { ok: true, reminder, ...reminder });
  });

  router.post('/api/reminders/:id/ack-missed', (req, res) => {
    const id = req.params['id'] ?? '';
    const reminder = ctx.productivityService.ackMissedReminder(id);
    sendJson(res, 200, { ok: true, reminder, ...reminder });
  });

  router.delete('/api/reminders/:id', (req, res) => {
    const id = req.params['id'] ?? '';
    ctx.productivityService.deleteReminder(id);
    sendJson(res, 200, { ok: true });
  });

  // Timers
  router.get('/api/timers', (_req, res) => {
    const timers = ctx.productivityService.listTimers();
    sendJson(res, 200, { ok: true, timers });
  });

  router.post('/api/timers', async (req, res) => {
    const body = await req.readJson();
    const validated = validateCreateTimerInput(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const timer = ctx.productivityService.createTimer(validated.value);
    sendJson(res, 201, { ok: true, timer, ...timer });
  });

  router.post('/api/timers/:id/pause', (req, res) => {
    const id = req.params['id'] ?? '';
    const timer = ctx.productivityService.pauseTimer(id);
    sendJson(res, 200, { ok: true, timer, ...timer });
  });

  router.post('/api/timers/:id/resume', (req, res) => {
    const id = req.params['id'] ?? '';
    const timer = ctx.productivityService.resumeTimer(id);
    sendJson(res, 200, { ok: true, timer, ...timer });
  });

  router.post('/api/timers/:id/cancel', (req, res) => {
    const id = req.params['id'] ?? '';
    const timer = ctx.productivityService.cancelTimer(id);
    sendJson(res, 200, { ok: true, timer, ...timer });
  });

  // Focus / Pomodoro
  for (const path of ['/api/focus', '/api/focus/status', '/api/focus/stats']) {
    router.get(path, (_req, res) => {
      const state = ctx.productivityService.getFocusState();
      sendJson(res, 200, state);
    });
  }

  router.post('/api/focus/start', async (req, res) => {
    const body = await req.readJson<Record<string, unknown>>();
    const state = ctx.productivityService.startFocus({
      label: typeof body?.['label'] === 'string' ? body['label'] : undefined,
      durationSec:
        typeof body?.['durationSec'] === 'number'
          ? body['durationSec']
          : typeof body?.['durationMinutes'] === 'number'
          ? body['durationMinutes'] * 60
          : undefined,
      breakSec:
        typeof body?.['breakSec'] === 'number'
          ? body['breakSec']
          : typeof body?.['breakMinutes'] === 'number'
          ? body['breakMinutes'] * 60
          : undefined,
      phase:
        body?.['phase'] === 'break' ||
        body?.['phase'] === 'long_break' ||
        body?.['phase'] === 'focus'
          ? body['phase']
          : undefined,
    });
    sendJson(res, 200, state);
  });

  router.post('/api/focus/pause', (_req, res) => {
    const state = ctx.productivityService.pauseFocus();
    sendJson(res, 200, state);
  });

  router.post('/api/focus/resume', (_req, res) => {
    const state = ctx.productivityService.resumeFocus();
    sendJson(res, 200, state);
  });

  router.post('/api/focus/extend', async (req, res) => {
    const body = await req.readJson<Record<string, unknown>>();
    let minutes = 5;
    if (typeof body?.['minutes'] === 'number' && Number.isFinite(body['minutes'])) {
      minutes = Math.max(1, Math.round(body['minutes']));
    } else if (
      typeof body?.['seconds'] === 'number' &&
      Number.isFinite(body['seconds'])
    ) {
      minutes = Math.max(1, Math.round(body['seconds'] / 60));
    }
    const state = ctx.productivityService.extendFocus(minutes);
    sendJson(res, 200, state);
  });

  router.post('/api/focus/finish', (_req, res) => {
    const state = ctx.productivityService.finishFocus();
    sendJson(res, 200, state);
  });

  router.post('/api/focus/stop', (_req, res) => {
    const state = ctx.productivityService.stopFocus();
    sendJson(res, 200, state);
  });
}
