import { Bell, Flame, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { HABIT_SCENE_IDS } from '../../../../shared/types.ts';
import type { HabitSceneId, SummarySnapshot } from '../../../../shared/types.ts';
import { apiClient, type HabitWithProgress } from '../../api/client.ts';
import { HABIT_SCENE_META, HabitSceneSvg } from '../TrokoAvatar/HabitScenes.tsx';

export interface HabitosTabProps {
  summary: SummarySnapshot | null;
  habits: HabitWithProgress[];
  onRefreshAll: () => Promise<void>;
}

const WEEK_DAYS = ['S', 'D', 'L', 'M', 'X', 'J', 'V'] as const;

export function HabitosTab({ habits, onRefreshAll }: HabitosTabProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedScene, setSelectedScene] = useState<HabitSceneId>('water');
  const [name, setName] = useState('Beber agua');
  const [dailyGoal, setDailyGoal] = useState(8);
  const [unitLabel, setUnitLabel] = useState('vasos');
  const [reminderTime, setReminderTime] = useState('10:30');

  const handleSelectScene = (sceneId: HabitSceneId) => {
    setSelectedScene(sceneId);
  };

  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await apiClient.createHabit({
      name: trimmedName,
      sceneId: selectedScene,
      unitLabel: unitLabel.trim() || 'veces',
      dailyGoal: Math.max(1, Number(dailyGoal) || 1),
      reminderTime: reminderTime || null,
    });
    setShowModal(false);
    await onRefreshAll();
  };

  const firstWeeklyRing = habits[0]?.weeklyRing;

  return (
    <section
      className="view"
      data-testid="view-habitos"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">15 escenas ilustradas</span>
          <h2>Hábitos diarios</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="sub mono" data-testid="habits-summary-label">
            {habits.filter((h) => h.todayProgress >= h.dailyGoal).length}/{habits.length} cumplidos hoy
          </span>
          <button
            type="button"
            className="btn-lime"
            data-testid="open-add-habit-btn"
            onClick={() => setShowModal((v) => !v)}
          >
            + Agregar
          </button>
        </div>
      </header>

      {/* SEGUIMIENTO DE LA SEMANA */}
      <section className="card" data-testid="weekly-tracker">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          <span
            className="eyebrow"
            style={{ fontSize: '10px', letterSpacing: '0.08em' }}
          >
            SEGUIMIENTO DE LA SEMANA
          </span>
          <span className="sub mono" style={{ fontSize: '11px' }}>
            7 días
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: '6px',
            textAlign: 'center',
          }}
        >
          {WEEK_DAYS.map((day, idx) => {
            const entry = firstWeeklyRing?.[idx];
            const completed = entry?.completed ?? false;
            return (
              <div
                key={`${day}-${idx}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 26 26">
                  <circle
                    cx="13"
                    cy="13"
                    r="10"
                    fill="none"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="13"
                    cy="13"
                    r="10"
                    fill={completed ? 'rgba(182, 242, 58, 0.2)' : 'none'}
                    stroke={completed ? '#B6F23A' : 'rgba(182, 242, 58, 0.35)'}
                    strokeWidth="2.5"
                    strokeDasharray={completed ? '63 63' : '16 63'}
                  />
                </svg>
                <span className="mono sub" style={{ fontSize: '11px' }}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Creator Dialog / Form */}
      {showModal && (
        <div
          role="dialog"
          aria-label="Crear nuevo hábito"
          className="card"
          data-testid="habit-create-dialog"
        >
          <form
            onSubmit={handleCreateHabit}
            data-testid="create-habit-form"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '8px',
              }}
            >
              <label style={{ fontSize: '11px', color: '#8E8E93' }}>
                Nombre
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del hábito..."
                  aria-label="Nombre"
                  data-testid="habit-name-input"
                  className="input"
                  style={{ width: '100%', marginTop: '3px' }}
                />
              </label>

              <label style={{ fontSize: '11px', color: '#8E8E93' }}>
                Escena
                <select
                  name="scene"
                  value={selectedScene}
                  onChange={(e) => handleSelectScene(e.target.value as HabitSceneId)}
                  aria-label="Escena"
                  data-testid="scene-select"
                  className="input"
                  style={{ width: '100%', marginTop: '3px' }}
                >
                  {HABIT_SCENE_IDS.map((sc) => (
                    <option key={sc} value={sc}>
                      {HABIT_SCENE_META[sc]?.label ?? sc} ({sc})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: '11px', color: '#8E8E93' }}>
                Unidad
                <input
                  type="text"
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  placeholder="páginas"
                  aria-label="Unidad"
                  data-testid="habit-unit-input"
                  className="input"
                  style={{ width: '100%', marginTop: '3px' }}
                />
              </label>

              <label style={{ fontSize: '11px', color: '#8E8E93' }}>
                Meta
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Number(e.target.value))}
                  aria-label="Meta"
                  data-testid="habit-goal-input"
                  className="input mono"
                  style={{ width: '100%', marginTop: '3px' }}
                />
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <label style={{ fontSize: '11px', color: '#8E8E93', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Recordatorio:</span>
                <input
                  type="time"
                  name="reminder"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  aria-label="Hora de recordatorio"
                  data-testid="habit-reminder-input"
                  className="input mono"
                  style={{ width: '105px' }}
                />
              </label>

              <button
                type="submit"
                data-testid="create-habit-btn"
                className="btn-lime"
              >
                <Plus size={14} />
                <span>Guardar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 15-Scene Picker */}
      <div className="card">
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '6px',
            color: '#8E8E93',
          }}
        >
          Escenas ilustradas (15 disponibles):
        </div>

        <div
          data-testid="habit-scene-picker"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: '5px',
          }}
        >
          {HABIT_SCENE_IDS.map((sceneId) => {
            const active = selectedScene === sceneId;
            return (
              <button
                key={sceneId}
                type="button"
                data-scene={sceneId}
                data-testid={`scene-option-${sceneId}`}
                aria-label={sceneId}
                aria-pressed={active}
                onClick={() => handleSelectScene(sceneId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '4px',
                  borderRadius: '10px',
                  background: active ? 'rgba(182, 242, 58, 0.14)' : '#151518',
                  border: active
                    ? '1px solid #B6F23A'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: '#F5F5F7',
                  cursor: 'pointer',
                  fontSize: '10px',
                }}
              >
                <HabitSceneSvg sceneId={sceneId} size={40} />
                <span>{HABIT_SCENE_META[sceneId]?.label ?? sceneId}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Habits List */}
      <div
        data-testid="habits-list"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {habits.length === 0 ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="sub" style={{ margin: 0 }}>
              Sin hábitos registrados. Pulsa «+ Agregar» para crear el primero.
            </p>
          </div>
        ) : (
          habits.map((habit) => {
            const pct = Math.min(
              100,
              Math.round((habit.todayProgress / Math.max(1, habit.dailyGoal)) * 100)
            );
            const completed = habit.todayProgress >= habit.dailyGoal;

            return (
              <article
                key={habit.id}
                className="card"
                data-testid="habit-card"
                data-habit-id={habit.id}
                data-scene={habit.sceneId}
                data-completed={String(completed)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <HabitSceneSvg sceneId={habit.sceneId} size={52} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>
                        {habit.name}
                      </div>
                      <div
                        className="mono"
                        data-testid="habit-progress-text"
                        style={{
                          fontSize: '12px',
                          color: completed ? '#B6F23A' : '#8E8E93',
                        }}
                      >
                        {habit.todayProgress}/{habit.dailyGoal} {habit.unitLabel}
                        {completed && (
                          <span style={{ marginLeft: '6px', fontWeight: 700 }}>
                            · ¡Meta cumplida!
                          </span>
                        )}
                      </div>
                      <div
                        data-testid="habit-streak-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#F5A623',
                          marginTop: '2px',
                        }}
                      >
                        <Flame size={12} />
                        <span>
                          Racha: {habit.streakCurrent} (Mejor: {habit.streakBest})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      data-testid="habit-increment-btn"
                      aria-label={`+1 ${habit.name}`}
                      className="btn-lime"
                      onClick={() =>
                        void apiClient.incrementHabit(habit.id).then(() => onRefreshAll())
                      }
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      data-testid="habit-undo-btn"
                      aria-label={`Deshacer ${habit.name}`}
                      title="Deshacer último registro"
                      className="btn-ghost"
                      disabled={habit.todayProgress <= 0}
                      onClick={() =>
                        void apiClient.undoHabit(habit.id).then(() => onRefreshAll())
                      }
                    >
                      <RotateCcw size={13} />
                      <span>Deshacer</span>
                    </button>
                    <button
                      type="button"
                      data-testid="habit-test-reminder-btn"
                      aria-label={`Probar aviso de ${habit.name}`}
                      title="Probar aviso en la isla"
                      className="btn-ghost"
                      onClick={() =>
                        void apiClient
                          .testHabitReminder(habit.id)
                          .then(() => onRefreshAll())
                      }
                    >
                      <Bell size={13} />
                      <span>Probar</span>
                    </button>
                    <button
                      type="button"
                      data-testid="habit-delete-btn"
                      aria-label={`Eliminar hábito ${habit.name}`}
                      className="btn-ghost"
                      onClick={() =>
                        void apiClient.deleteHabit(habit.id).then(() => onRefreshAll())
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    background: '#151518',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    marginTop: '8px',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: completed ? '#2ECC71' : '#B6F23A',
                      transition: 'width 150ms ease',
                    }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
