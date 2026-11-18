import { ArrowUp, Bell, BookOpen, CheckSquare, Crosshair, Droplets, Mic, Plus } from 'lucide-react';
import { useState } from 'react';
import type {
  ProgressionState,
  Reminder,
  SummarySnapshot,
  TabId,
  Task,
} from '../../../../shared/types.ts';
import {
  apiClient,
  type FocusStateResponse,
  type HabitWithProgress,
} from '../../api/client.ts';

export interface InicioTabProps {
  summary: SummarySnapshot | null;
  tasks: Task[];
  reminders: Reminder[];
  habits: HabitWithProgress[];
  focusState: FocusStateResponse | null;
  progression?: ProgressionState | null;
  onNavigateTab: (tab: TabId) => void;
  onOpenStudy?: () => void;
  onQuickListen: () => void;
  onSendCommand: (text: string, inputMode?: 'text' | 'voice') => Promise<void>;
  onRefreshAll?: () => Promise<void>;
}

function getSpanishGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function getSpanishDateLabel(): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  } catch {
    return 'Hoy';
  }
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function InicioTab({
  summary,
  tasks,
  reminders,
  habits,
  focusState,
  progression,
  onNavigateTab,
  onOpenStudy,
  onQuickListen,
  onSendCommand,
  onRefreshAll,
}: InicioTabProps) {
  const [promptText, setPromptText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const habitsDone =
    summary?.habitsCompletedToday ??
    habits.filter((h) => h.todayProgress >= h.dailyGoal).length;
  const habitsTotal = summary?.habitsTotalToday ?? habits.length;
  const pendingTasks =
    summary?.pendingTasksCount ?? tasks.filter((t) => !t.completed).length;
  const nextReminder =
    summary?.nextReminder ??
    reminders.find((r) => r.status === 'scheduled') ??
    null;
  const activeFocus =
    summary?.activeFocus ??
    (focusState?.session &&
    (focusState.session.status === 'active' ||
      focusState.session.status === 'paused')
      ? focusState.session
      : null);

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setPromptText('');
    try {
      await onSendCommand(trimmed, 'text');
    } finally {
      setSending(false);
    }
  };

  const handleQuickTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    setNewTaskTitle('');
    setShowNewTaskInput(false);
    await apiClient.createTask(trimmed);
    await onRefreshAll?.();
  };

  return (
    <section className="view" data-testid="view-inicio">
      <header className="vhead">
        <div>
          <span className="eyebrow">{getSpanishDateLabel()}</span>
          <h2>{getSpanishGreeting()}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {progression && (
            <button
              type="button"
              className="btn-ghost"
              data-testid="inicio-level-badge"
              onClick={() => onNavigateTab('enfoque')}
              title={`${progression.levelTitle} · Racha limpia: ${progression.focusStreakBlocks}`}
              style={{
                fontSize: '11px',
                padding: '5px 10px',
                borderColor: 'rgba(182, 242, 58, 0.35)',
                color: '#B6F23A',
              }}
            >
              <span>Nv. {progression.level}</span>
              <span className="mono">· {progression.xp} XP</span>
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={onQuickListen}
            data-testid="inicio-listen-btn"
          >
            <Mic size={14} />
            <span>Hablar</span>
          </button>
        </div>
      </header>

      <div
        className="grid2"
        data-testid="inicio-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '10px',
        }}
      >
        <article
          className="card"
          data-testid="kpi-habits-today"
          onClick={() => onNavigateTab('habitos')}
          style={{ cursor: 'pointer' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sub">Hábitos hoy</span>
            <Droplets size={15} color="#B6F23A" />
          </header>
          <p style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px' }} className="mono">
            {' '}{habitsDone}/{habitsTotal}{' '}
          </p>
          <footer className="sub">
            {habitsTotal === 0
              ? 'Crea tu primer hábito diario'
              : habitsDone >= habitsTotal
              ? '¡Todas las metas cumplidas!'
              : `${habitsTotal - habitsDone} pendientes`}
          </footer>
        </article>

        <article
          className="card"
          data-testid="kpi-pending-tasks"
          onClick={() => onNavigateTab('tareas')}
          style={{ cursor: 'pointer' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sub">Tareas pendientes</span>
            <CheckSquare size={15} color="#58B2FF" />
          </header>
          <p style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px' }} className="mono">
            {' '}{pendingTasks}{' '}
          </p>
          <footer className="sub">
            {pendingTasks === 0
              ? 'Todo al día'
              : `${pendingTasks} ${pendingTasks === 1 ? 'tarea por hacer' : 'tareas por hacer'}`}
          </footer>
        </article>

        <article
          className="card"
          data-testid="kpi-next-reminder"
          onClick={() => onNavigateTab('tareas')}
          style={{ cursor: 'pointer' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sub">Próximo aviso</span>
            <Bell size={15} color="#F5A623" />
          </header>
          <p style={{ fontSize: '15px', fontWeight: 600, margin: '6px 0 2px' }}>
            {' '}{nextReminder ? nextReminder.title : 'Sin avisos'}{' '}
          </p>
          <footer className="sub">
            {nextReminder
              ? new Date(nextReminder.triggerAt).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Programar recordatorio'}
          </footer>
        </article>

        <article
          className="card"
          data-testid="summary-card-focus"
          onClick={() => onNavigateTab('enfoque')}
          style={{ cursor: 'pointer' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sub">Sesión de enfoque</span>
            <Crosshair size={15} color="#8B5CF6" />
          </header>
          <p style={{ fontSize: '20px', fontWeight: 700, margin: '6px 0 2px' }} className="mono">
            {' '}{activeFocus ? formatMMSS(activeFocus.remainingSec) : '25:00'}{' '}
          </p>
          <footer className="sub">
            {activeFocus
              ? activeFocus.status === 'paused'
                ? 'En pausa'
                : 'Enfoque activo'
              : 'Iniciar bloque Pomodoro'}
          </footer>
        </article>
      </div>

      {showNewTaskInput && (
        <form
          onSubmit={handleQuickTaskSubmit}
          data-testid="inicio-new-task-form"
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Nueva tarea..."
            aria-label="Nueva tarea"
            autoFocus
            className="input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-lime">
            Guardar tarea
          </button>
        </form>
      )}

      <form
        onSubmit={handleQuickSubmit}
        data-testid="quick-prompt-form"
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '12px',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Escribe o habla con Troko..."
          aria-label="Escribe o habla con Troko"
          data-testid="quick-prompt-input"
          className="input"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={sending || !promptText.trim()}
          aria-label="Enviar"
          data-testid="quick-prompt-send"
          className="btn-lime"
          style={{ padding: '8px 12px' }}
        >
          <ArrowUp size={15} />
          <span>Enviar</span>
        </button>
      </form>

      <div style={{ marginTop: '10px' }}>
        <div
          className="eyebrow"
          style={{ fontSize: '10px', marginBottom: '6px', letterSpacing: '0.08em' }}
        >
          ATAJOS
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '11px', padding: '4px 9px' }}
            onClick={() => setShowNewTaskInput((v) => !v)}
          >
            <Plus size={12} />
            <span>+ Nueva tarea</span>
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '11px', padding: '4px 9px' }}
            onClick={onQuickListen}
          >
            <Mic size={12} />
            <span>Hablar</span>
          </button>
          {onOpenStudy && (
            <button
              type="button"
              className="btn-ghost"
              data-testid="inicio-study-shortcut"
              style={{ fontSize: '11px', padding: '4px 9px', borderColor: 'rgba(139, 92, 246, 0.45)' }}
              onClick={onOpenStudy}
            >
              <BookOpen size={12} />
              <span>Estudiar PDF</span>
            </button>
          )}
          {[
            'Enfócate 25 minutos',
            '¿Qué tengo hoy?',
            'Ordena mi escritorio',
            'Descansa',
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              className="btn-ghost"
              style={{ fontSize: '11px', padding: '4px 9px' }}
              onClick={() => void onSendCommand(chip, 'text')}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
