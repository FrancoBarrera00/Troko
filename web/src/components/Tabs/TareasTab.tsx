import { Bell, CheckSquare, Clock, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type {
  Reminder,
  ReminderRecurrence,
  SummarySnapshot,
  Task,
  Timer,
} from '../../../../shared/types.ts';
import { apiClient } from '../../api/client.ts';

export interface TareasTabProps {
  summary: SummarySnapshot | null;
  tasks: Task[];
  reminders: Reminder[];
  timers: Timer[];
  onRefreshAll: () => Promise<void>;
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function TareasTab({
  tasks,
  reminders,
  timers,
  onRefreshAll,
}: TareasTabProps) {
  const [taskTitle, setTaskTitle] = useState('');
  const [remTitle, setRemTitle] = useState('');
  const [remMinutes, setRemMinutes] = useState(30);
  const [remRecurrence, setRemRecurrence] = useState<ReminderRecurrence>(null);
  const [timerLabel, setTimerLabel] = useState('Temporizador');
  const [timerSec, setTimerSec] = useState(60);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = taskTitle.trim();
    if (!trimmed) return;
    setTaskTitle('');
    await apiClient.createTask(trimmed);
    await onRefreshAll();
  };

  const handleToggleTask = async (task: Task) => {
    await apiClient.updateTask(task.id, { completed: !task.completed });
    await onRefreshAll();
  };

  const handleDeleteTask = async (id: string) => {
    await apiClient.deleteTask(id);
    await onRefreshAll();
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = remTitle.trim();
    if (!trimmed) return;
    setRemTitle('');
    const triggerAt = new Date(Date.now() + remMinutes * 60_000).toISOString();
    await apiClient.createReminder({
      title: trimmed,
      triggerAt,
      recurrence: remRecurrence,
      soundEnabled: true,
    });
    await onRefreshAll();
  };

  const handleDismissReminder = async (id: string) => {
    await apiClient.dismissReminder(id);
    await onRefreshAll();
  };

  const handleDeleteReminder = async (id: string) => {
    await apiClient.deleteReminder(id);
    await onRefreshAll();
  };

  const handleStartTimer = async (e: React.FormEvent) => {
    e.preventDefault();
    const sec = Math.max(1, Number(timerSec) || 60);
    await apiClient.createTimer({
      label: timerLabel.trim() || 'Temporizador',
      durationSec: sec,
    });
    await onRefreshAll();
  };

  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <section
      className="view"
      data-testid="view-tareas"
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">Productividad local</span>
          <h2>Tareas, Avisos y Temporizadores</h2>
        </div>
        <span className="sub mono" data-testid="tasks-pending-count">
          {pendingCount} pendientes
        </span>
      </header>

      {/* Tasks Section */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <CheckSquare size={14} color="#B6F23A" />
          <span>Lista de tareas</span>
        </div>

        <form
          onSubmit={handleAddTask}
          style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}
        >
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Nueva tarea..."
            aria-label="Nueva tarea"
            data-testid="task-input"
            className="input"
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            disabled={!taskTitle.trim()}
            data-testid="add-task-btn"
            className="btn-lime"
          >
            <Plus size={14} />
            <span>Agregar</span>
          </button>
        </form>

        <div
          data-testid="tasks-list"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {tasks.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>
              No tienes tareas registradas.
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                data-testid="task-item"
                data-task-id={task.id}
                data-completed={String(task.completed)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  background: '#151518',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    cursor: 'pointer',
                    flex: 1,
                    fontSize: '13px',
                    textDecoration: task.completed ? 'line-through' : 'none',
                    color: task.completed ? '#8E8E93' : '#F5F5F7',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => void handleToggleTask(task)}
                    aria-label={task.title}
                    data-testid="task-checkbox"
                  />
                  <span>{task.title}</span>
                </label>
                <button
                  type="button"
                  aria-label={`Eliminar tarea ${task.title}`}
                  data-testid="delete-task-btn"
                  className="btn-ghost"
                  style={{ padding: '4px 7px' }}
                  onClick={() => void handleDeleteTask(task.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Reminders Section */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <Bell size={14} color="#F5A623" />
          <span>Avisos y recordatorios</span>
        </div>

        <form
          onSubmit={handleAddReminder}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          <input
            type="text"
            value={remTitle}
            onChange={(e) => setRemTitle(e.target.value)}
            placeholder="Nuevo recordatorio..."
            aria-label="Nuevo recordatorio"
            data-testid="reminder-title-input"
            className="input"
            style={{ flex: '1 1 160px' }}
          />
          <select
            value={remMinutes}
            onChange={(e) => setRemMinutes(Number(e.target.value))}
            aria-label="En cuántos minutos"
            className="input"
            style={{ width: '95px' }}
          >
            <option value={1}>En 1 min</option>
            <option value={15}>En 15 min</option>
            <option value={30}>En 30 min</option>
            <option value={60}>En 1 hora</option>
          </select>
          <select
            value={remRecurrence ?? ''}
            onChange={(e) =>
              setRemRecurrence(
                (e.target.value || null) as ReminderRecurrence
              )
            }
            aria-label="Recurrencia"
            className="input"
            style={{ width: '115px' }}
          >
            <option value="">Una vez</option>
            <option value="daily">Diario</option>
            <option value="weekdays">Entre semana</option>
            <option value="weekly">Semanal</option>
          </select>
          <button
            type="submit"
            disabled={!remTitle.trim()}
            data-testid="add-reminder-btn"
            className="btn-lime"
          >
            Programar
          </button>
        </form>

        <div
          data-testid="reminders-list"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {reminders.map((rem) => (
            <div
              key={rem.id}
              data-testid="reminder-item"
              data-reminder-id={rem.id}
              data-status={rem.status}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '10px',
                background: '#151518',
                fontSize: '12px',
              }}
            >
              <div>
                <strong>{rem.title}</strong>{' '}
                {rem.recurrence && (
                  <span className="sub">
                    ·{' '}
                    {rem.recurrence === 'daily'
                      ? 'Diario'
                      : rem.recurrence === 'weekdays'
                      ? 'Entre semana'
                      : rem.recurrence === 'weekly'
                      ? 'Semanal'
                      : rem.recurrence}
                  </span>
                )}{' '}
                <span className="sub">({rem.status})</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {rem.status !== 'dismissed' && (
                  <button
                    type="button"
                    data-testid="dismiss-reminder-btn"
                    className="btn-ghost"
                    style={{ padding: '3px 7px', fontSize: '11px' }}
                    onClick={() => void handleDismissReminder(rem.id)}
                  >
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Eliminar recordatorio"
                  className="btn-ghost"
                  style={{ padding: '3px 7px' }}
                  onClick={() => void handleDeleteReminder(rem.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timers Section */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <Clock size={14} color="#58B2FF" />
          <span>Temporizadores</span>
        </div>

        <form
          onSubmit={handleStartTimer}
          style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}
        >
          <input
            type="text"
            value={timerLabel}
            onChange={(e) => setTimerLabel(e.target.value)}
            placeholder="Etiqueta..."
            aria-label="Etiqueta del temporizador"
            className="input"
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={1}
            max={86400}
            value={timerSec}
            onChange={(e) => setTimerSec(Number(e.target.value))}
            aria-label="Duración en segundos"
            data-testid="timer-duration-input"
            className="input mono"
            style={{ width: '80px' }}
          />
          <button
            type="submit"
            data-testid="start-timer-btn"
            className="btn-lime"
          >
            Iniciar
          </button>
        </form>

        <div
          data-testid="timers-list"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {timers.map((tmr) => (
            <div
              key={tmr.id}
              data-testid="timer-item"
              data-timer-id={tmr.id}
              data-status={tmr.status}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '10px',
                background: '#151518',
                fontSize: '12px',
              }}
            >
              <div>
                <strong>{tmr.label}</strong>{' '}
                <span className="mono" style={{ color: '#B6F23A' }}>
                  {formatMMSS(tmr.remainingSec)}
                </span>{' '}
                <span className="sub">({tmr.status})</span>
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {tmr.status === 'running' && (
                  <button
                    type="button"
                    data-testid="pause-timer-btn"
                    className="btn-ghost"
                    style={{ padding: '3px 7px' }}
                    onClick={() =>
                      void apiClient.pauseTimer(tmr.id).then(() => onRefreshAll())
                    }
                  >
                    <Pause size={12} />
                    <span>Pausar</span>
                  </button>
                )}
                {tmr.status === 'paused' && (
                  <button
                    type="button"
                    data-testid="resume-timer-btn"
                    className="btn-ghost"
                    style={{ padding: '3px 7px' }}
                    onClick={() =>
                      void apiClient.resumeTimer(tmr.id).then(() => onRefreshAll())
                    }
                  >
                    <Play size={12} />
                    <span>Reanudar</span>
                  </button>
                )}
                {tmr.status !== 'cancelled' && tmr.status !== 'finished' && (
                  <button
                    type="button"
                    data-testid="cancel-timer-btn"
                    className="btn-ghost"
                    style={{ padding: '3px 7px' }}
                    onClick={() =>
                      void apiClient.cancelTimer(tmr.id).then(() => onRefreshAll())
                    }
                  >
                    <X size={12} />
                    <span>Cancelar</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
