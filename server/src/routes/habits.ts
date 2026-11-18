import { HABIT_SCENE_IDS } from '../../../shared/types.ts';
import type { HabitSceneId } from '../../../shared/types.ts';
import { validateCreateHabitInput } from '../../../shared/validators.ts';
import { HttpError, sendJson } from '../app.ts';
import type { Router, ServerContext } from '../app.ts';

export function registerHabitRoutes(router: Router, ctx: ServerContext): void {
  router.get('/api/habits', (_req, res) => {
    const habits = ctx.habitService.listHabits();
    sendJson(res, 200, { ok: true, habits });
  });

  router.post('/api/habits', async (req, res) => {
    const body = await req.readJson();
    const validated = validateCreateHabitInput(body);
    if (!validated.ok) {
      throw new HttpError(400, validated.error);
    }
    const habit = ctx.habitService.createHabit(validated.value);
    sendJson(res, 201, { ok: true, habit, ...habit });
  });

  router.patch('/api/habits/:id', async (req, res) => {
    const id = req.params['id'] ?? '';
    const body = await req.readJson<Record<string, unknown>>();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Habit patch must be an object');
    }
    const patch: {
      name?: string;
      sceneId?: HabitSceneId;
      unitLabel?: string;
      dailyGoal?: number;
      unitVolumeLabel?: string | null;
      reminderTime?: string | null;
    } = {};

    if ('name' in body) {
      if (typeof body['name'] !== 'string' || body['name'].trim().length === 0) {
        throw new HttpError(400, 'name must be a non-empty string');
      }
      patch.name = body['name'].trim();
    }
    if ('sceneId' in body) {
      if (
        typeof body['sceneId'] !== 'string' ||
        !(HABIT_SCENE_IDS as readonly string[]).includes(body['sceneId'])
      ) {
        throw new HttpError(400, 'Invalid sceneId');
      }
      patch.sceneId = body['sceneId'] as HabitSceneId;
    }
    if ('unitLabel' in body) {
      if (
        typeof body['unitLabel'] !== 'string' ||
        body['unitLabel'].trim().length === 0
      ) {
        throw new HttpError(400, 'unitLabel must be a non-empty string');
      }
      patch.unitLabel = body['unitLabel'].trim();
    }
    if ('dailyGoal' in body) {
      if (
        typeof body['dailyGoal'] !== 'number' ||
        !Number.isInteger(body['dailyGoal']) ||
        body['dailyGoal'] < 1
      ) {
        throw new HttpError(400, 'dailyGoal must be a positive integer');
      }
      patch.dailyGoal = body['dailyGoal'];
    }
    if ('unitVolumeLabel' in body) {
      patch.unitVolumeLabel =
        typeof body['unitVolumeLabel'] === 'string' && body['unitVolumeLabel'].trim()
          ? body['unitVolumeLabel'].trim()
          : null;
    }
    if ('reminderTime' in body) {
      patch.reminderTime =
        typeof body['reminderTime'] === 'string' && body['reminderTime'].trim()
          ? body['reminderTime'].trim()
          : null;
    }

    const habit = ctx.habitService.updateHabit(id, patch);
    sendJson(res, 200, { ok: true, habit, ...habit });
  });

  router.delete('/api/habits/:id', (req, res) => {
    const id = req.params['id'] ?? '';
    ctx.habitService.deleteHabit(id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/habits/:id/increment', (req, res) => {
    const id = req.params['id'] ?? '';
    const habit = ctx.habitService.incrementHabit(id);
    if (habit.todayProgress === habit.dailyGoal) {
      ctx.progressionService.awardXp(20, `Hábito completado: ${habit.name}`);
    }
    sendJson(res, 200, { ok: true, habit, ...habit });
  });

  for (const suffix of ['undo', 'decrement']) {
    router.post(`/api/habits/:id/${suffix}`, (req, res) => {
      const id = req.params['id'] ?? '';
      const habit = ctx.habitService.undoHabit(id);
      sendJson(res, 200, { ok: true, habit, ...habit });
    });
  }

  for (const suffix of ['test-reminder', 'remind']) {
    router.post(`/api/habits/:id/${suffix}`, (req, res) => {
      const id = req.params['id'] ?? '';
      const habit = ctx.habitService.testHabitReminder(id);
      sendJson(res, 200, { ok: true, habit, ...habit });
    });
  }
}
