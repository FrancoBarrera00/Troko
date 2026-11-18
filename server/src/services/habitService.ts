import crypto from 'node:crypto';
import type { Habit, HabitSceneId } from '../../../shared/types.ts';
import { HttpError } from '../app.ts';
import type { TrokoDatabase } from '../db/database.ts';
import type { EventBus } from '../eventBus.ts';

function getLocalYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface HabitWithProgress extends Habit {
  todayProgress: number;
  progressToday: number;
  weeklyRing: Array<{
    day: string;
    dateYmd: string;
    progress: number;
    goal: number;
    completed: boolean;
  }>;
}

export class HabitService {
  private readonly db: TrokoDatabase;
  private readonly eventBus: EventBus;

  constructor(db: TrokoDatabase, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  private getTodayProgress(habitId: string, ymd = getLocalYmd()): number {
    const row = this.db.db
      .prepare(
        'SELECT COALESCE(SUM(delta), 0) AS total FROM habit_logs WHERE habit_id = ? AND date_ymd = ?'
      )
      .get(habitId, ymd) as Record<string, unknown> | undefined;
    return Math.max(0, Number(row?.['total'] ?? 0));
  }

  private getWeeklyRing(habitId: string, dailyGoal: number) {
    const dayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const now = new Date();
    const result: Array<{
      day: string;
      dateYmd: string;
      progress: number;
      goal: number;
      completed: boolean;
    }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateYmd = getLocalYmd(d);
      const progress = this.getTodayProgress(habitId, dateYmd);
      result.push({
        day: dayLabels[d.getDay()] ?? 'L',
        dateYmd,
        progress,
        goal: dailyGoal,
        completed: progress >= dailyGoal,
      });
    }
    return result;
  }

  private mapRow(row: Record<string, unknown>): HabitWithProgress {
    const id = String(row['id']);
    const dailyGoal = Number(row['daily_goal']);
    const todayProgress = this.getTodayProgress(id);
    return {
      id,
      name: String(row['name']),
      sceneId: String(row['scene_id']) as HabitSceneId,
      unitLabel: String(row['unit_label']),
      dailyGoal,
      unitVolumeLabel:
        row['unit_volume_label'] != null ? String(row['unit_volume_label']) : null,
      reminderTime:
        row['reminder_time'] != null ? String(row['reminder_time']) : null,
      streakCurrent: Number(row['streak_current'] ?? 0),
      streakBest: Number(row['streak_best'] ?? 0),
      sortOrder: Number(row['sort_order'] ?? 0),
      createdAt: String(row['created_at']),
      todayProgress,
      progressToday: todayProgress,
      weeklyRing: this.getWeeklyRing(id, dailyGoal),
    };
  }

  listHabits(): HabitWithProgress[] {
    const rows = this.db.db
      .prepare('SELECT * FROM habits ORDER BY sort_order ASC, created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  getHabitOrThrow(id: string): HabitWithProgress {
    const row = this.db.db.prepare('SELECT * FROM habits WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new HttpError(404, 'Hábito no encontrado');
    }
    return this.mapRow(row);
  }

  createHabit(input: {
    name: string;
    sceneId: HabitSceneId;
    unitLabel: string;
    dailyGoal: number;
    unitVolumeLabel: string | null;
    reminderTime: string | null;
  }): HabitWithProgress {
    const id = `hab-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    this.db.db
      .prepare(
        `INSERT INTO habits (
           id, name, scene_id, unit_label, daily_goal,
           unit_volume_label, reminder_time,
           streak_current, streak_best, sort_order, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`
      )
      .run(
        id,
        input.name,
        input.sceneId,
        input.unitLabel,
        input.dailyGoal,
        input.unitVolumeLabel,
        input.reminderTime,
        nowIso
      );
    const habit = this.getHabitOrThrow(id);
    this.eventBus.publish('data.updated', { scope: 'habits', habitId: id });
    return habit;
  }

  updateHabit(
    id: string,
    input: {
      name?: string;
      sceneId?: HabitSceneId;
      unitLabel?: string;
      dailyGoal?: number;
      unitVolumeLabel?: string | null;
      reminderTime?: string | null;
    }
  ): HabitWithProgress {
    const existing = this.getHabitOrThrow(id);
    this.db.db
      .prepare(
        `UPDATE habits
         SET name = ?, scene_id = ?, unit_label = ?, daily_goal = ?,
             unit_volume_label = ?, reminder_time = ?
         WHERE id = ?`
      )
      .run(
        input.name ?? existing.name,
        input.sceneId ?? existing.sceneId,
        input.unitLabel ?? existing.unitLabel,
        input.dailyGoal ?? existing.dailyGoal,
        input.unitVolumeLabel !== undefined
          ? input.unitVolumeLabel
          : existing.unitVolumeLabel,
        input.reminderTime !== undefined
          ? input.reminderTime
          : existing.reminderTime,
        id
      );
    const updated = this.getHabitOrThrow(id);
    this.eventBus.publish('data.updated', { scope: 'habits', habitId: id });
    return updated;
  }

  deleteHabit(id: string): void {
    this.getHabitOrThrow(id);
    this.db.db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    this.eventBus.publish('data.updated', { scope: 'habits', habitId: id });
  }

  incrementHabit(id: string): HabitWithProgress {
    const existing = this.getHabitOrThrow(id);
    const todayYmd = getLocalYmd();
    const prevProgress = existing.todayProgress;
    const nowIso = new Date().toISOString();

    this.db.db
      .prepare(
        'INSERT INTO habit_logs (id, habit_id, date_ymd, delta, logged_at) VALUES (?, ?, ?, 1, ?)'
      )
      .run(`hlog-${crypto.randomUUID()}`, id, todayYmd, nowIso);

    const newProgress = this.getTodayProgress(id, todayYmd);
    if (prevProgress < existing.dailyGoal && newProgress >= existing.dailyGoal) {
      const nextStreak = existing.streakCurrent + 1;
      const nextBest = Math.max(existing.streakBest, nextStreak);
      this.db.db
        .prepare(
          'UPDATE habits SET streak_current = ?, streak_best = ? WHERE id = ?'
        )
        .run(nextStreak, nextBest, id);

      this.eventBus.setIslandState({
        state: 'idle',
        mood: 'festejo',
        statusText: '¡Meta cumplida!',
        peekCard: null,
      });
    }

    const updated = this.getHabitOrThrow(id);
    this.eventBus.publish('data.updated', { scope: 'habits', habitId: id });
    return updated;
  }

  undoHabit(id: string): HabitWithProgress {
    const existing = this.getHabitOrThrow(id);
    const todayYmd = getLocalYmd();
    const prevProgress = existing.todayProgress;
    if (prevProgress <= 0) {
      return existing;
    }

    const latestLog = this.db.db
      .prepare(
        'SELECT id FROM habit_logs WHERE habit_id = ? AND date_ymd = ? AND delta > 0 ORDER BY logged_at DESC, rowid DESC LIMIT 1'
      )
      .get(id, todayYmd) as Record<string, unknown> | undefined;

    const nowIso = new Date().toISOString();
    if (latestLog?.['id']) {
      this.db.db.prepare('DELETE FROM habit_logs WHERE id = ?').run(String(latestLog['id']));
    } else {
      this.db.db
        .prepare(
          'INSERT INTO habit_logs (id, habit_id, date_ymd, delta, logged_at) VALUES (?, ?, ?, -1, ?)'
        )
        .run(`hlog-${crypto.randomUUID()}`, id, todayYmd, nowIso);
    }

    const newProgress = this.getTodayProgress(id, todayYmd);
    if (prevProgress >= existing.dailyGoal && newProgress < existing.dailyGoal) {
      const nextStreak = Math.max(0, existing.streakCurrent - 1);
      this.db.db
        .prepare('UPDATE habits SET streak_current = ? WHERE id = ?')
        .run(nextStreak, id);
    }

    const updated = this.getHabitOrThrow(id);
    this.eventBus.publish('data.updated', { scope: 'habits', habitId: id });
    return updated;
  }

  testHabitReminder(id: string): HabitWithProgress {
    const habit = this.getHabitOrThrow(id);
    this.eventBus.publish('habit.nudge', {
      habitId: habit.id,
      habitName: habit.name,
      name: habit.name,
      progress: habit.todayProgress,
      todayProgress: habit.todayProgress,
      goal: habit.dailyGoal,
      dailyGoal: habit.dailyGoal,
      unitLabel: habit.unitLabel,
    });
    this.eventBus.setIslandState({
      state: 'remind',
      mood: 'animo',
      statusText: 'Recordatorio',
      remindMessage: `${habit.name} (${habit.todayProgress}/${habit.dailyGoal} ${habit.unitLabel})`,
      peekCard: {
        kind: 'habit_remind',
        habitId: habit.id,
        habitName: habit.name,
        progress: habit.todayProgress,
        goal: habit.dailyGoal,
        unitLabel: habit.unitLabel,
      },
    });
    return habit;
  }
}
