import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ISLAND_STATES, TROKO_MOODS } from '../../../../shared/types.ts';
import type { IslandState, PeekCard, TrokoMood } from '../../../../shared/types.ts';
import type { ConnectionStatus } from '../../hooks/useTrokoEvents.ts';

export interface DesktopStageProps {
  connectionStatus: ConnectionStatus;
  currentState: IslandState;
  currentMood: TrokoMood;
  currentPeekKind: PeekCard['kind'] | null;
  showNotchHint: boolean;
  onSelectState: (state: IslandState) => void;
  onSelectMood: (mood: TrokoMood) => void;
  onSelectPeek: (kind: PeekCard['kind'] | null) => void;
  onResetPreview: () => void;
}

const STATE_LABELS: Record<IslandState, string> = {
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
  remind: 'Aviso',
};

const MOOD_LABELS: Record<TrokoMood, string> = {
  contento: 'Contento',
  enamorado: 'Enamorado',
  sorpresa: 'Sorpresa',
  orgulloso: 'Orgulloso',
  guino: 'Guiño',
  bostezo: 'Bostezo',
  molesto: 'Molesto',
  escucha: 'Escucha',
  mareado: 'Mareado',
  festejo: 'Festejo',
  saludo: 'Saludo',
  animo: 'Ánimo',
};

function formatClock(now: Date): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  } catch {
    return now.toTimeString().slice(0, 5);
  }
}

export function DesktopStage({
  connectionStatus,
  currentState,
  currentMood,
  currentPeekKind,
  showNotchHint,
  onSelectState,
  onSelectMood,
  onSelectPeek,
  onResetPreview,
}: DesktopStageProps) {
  const [clockText, setClockText] = useState(() => formatClock(new Date()));
  const [dockExpanded, setDockExpanded] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockText(formatClock(new Date()));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const sseLabel =
    connectionStatus === 'connected'
      ? 'SSE en línea'
      : connectionStatus === 'reconnecting'
      ? 'Reconectando'
      : 'Conectando';

  return (
    <div className="stage">
      <svg
        className="stage__horizon"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 640L240 520L480 610L760 470L1040 590L1280 510L1440 580V900H0Z"
          fill="rgba(255,255,255,0.025)"
        />
        <path
          d="M0 740L320 650L640 720L960 630L1260 700L1440 670V900H0Z"
          fill="rgba(182,242,58,0.025)"
        />
      </svg>

      <header className="menubar">
        <div className="menubar__left">
          <span className="menubar__brand">Troko-Desk</span>
          <span className="menubar__item">Archivo</span>
          <span className="menubar__item">Asistente</span>
          <span className="menubar__item">Privacidad local</span>
        </div>

        <div className="menubar__right">
          <span
            className="sse-pill"
            data-testid="sse-status"
            data-status={connectionStatus}
          >
            <span className="sse-pill__dot" />
            <span>{sseLabel}</span>
          </span>
          <time className="mono" data-testid="menubar-clock">
            {clockText}
          </time>
        </div>
      </header>

      <div className="stage__folders" aria-hidden="true">
        <div className="desktop-folder">
          <div className="desktop-folder__icon" />
          <span className="desktop-folder__label">Capturas</span>
        </div>
        <div className="desktop-folder">
          <div className="desktop-folder__icon" />
          <span className="desktop-folder__label">Imágenes</span>
        </div>
        <div className="desktop-folder">
          <div className="desktop-folder__icon" />
          <span className="desktop-folder__label">Documentos</span>
        </div>
      </div>

      {showNotchHint && (
        <div className="notch-hint" aria-hidden="true">
          <span className="notch-hint__dot" />
          <span>Pasa el cursor por el notch o toca para abrir Troko</span>
        </div>
      )}

      <main className="stage__workspace">
        <section
          className="stage-dock"
          data-testid="stage-controls"
          data-ignore-outside-close="true"
          aria-label="Laboratorio de expresiones y estados de Troko"
        >
          <div className="stage-dock__head">
            <div className="stage-dock__title">
              <span>Escenario Troko</span>
              <span className="stage-dock__badge mono">
                {STATE_LABELS[currentState]} · {MOOD_LABELS[currentMood]}
              </span>
            </div>
            <div className="stage-dock__actions">
              <button
                type="button"
                className="stage-dock__btn"
                data-testid="preview-reset"
                onClick={onResetPreview}
              >
                <RotateCcw
                  size={11}
                  style={{ marginRight: '4px', verticalAlign: '-1px' }}
                />
                Restablecer
              </button>
              <button
                type="button"
                className="stage-dock__btn"
                data-testid="stage-controls-toggle"
                aria-expanded={dockExpanded}
                onClick={() => setDockExpanded((v) => !v)}
              >
                {dockExpanded ? (
                  <>
                    Ocultar <ChevronDown size={12} style={{ verticalAlign: '-2px' }} />
                  </>
                ) : (
                  <>
                    Probar estados{' '}
                    <ChevronUp size={12} style={{ verticalAlign: '-2px' }} />
                  </>
                )}
              </button>
            </div>
          </div>

          {dockExpanded && (
            <div className="stage-dock__body">
              <div className="dock-row">
                <span className="dock-row__label">Estados de la isla</span>
                {ISLAND_STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className="chip"
                    data-testid={`preview-state-${st}`}
                    aria-pressed={currentState === st}
                    onClick={() => onSelectState(st)}
                  >
                    {STATE_LABELS[st]}
                  </button>
                ))}
              </div>

              <div className="dock-row">
                <span className="dock-row__label">Emociones de Troko</span>
                {TROKO_MOODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chip"
                    data-testid={`preview-mood-${m}`}
                    aria-pressed={currentState === 'idle' && currentMood === m}
                    onClick={() => onSelectMood(m)}
                  >
                    {MOOD_LABELS[m]}
                  </button>
                ))}
              </div>

              <div className="dock-row">
                <span className="dock-row__label">Asomos</span>
                <button
                  type="button"
                  className="chip"
                  data-testid="preview-peek-desktop"
                  aria-pressed={currentPeekKind === 'desktop_tidy'}
                  onClick={() => onSelectPeek('desktop_tidy')}
                >
                  Escritorio
                </button>
                <button
                  type="button"
                  className="chip"
                  data-testid="preview-peek-email"
                  aria-pressed={currentPeekKind === 'email_draft'}
                  onClick={() => onSelectPeek('email_draft')}
                >
                  Correo
                </button>
                <button
                  type="button"
                  className="chip"
                  data-testid="preview-peek-habit"
                  aria-pressed={currentPeekKind === 'habit_remind'}
                  onClick={() => onSelectPeek('habit_remind')}
                >
                  Hábito
                </button>
                <button
                  type="button"
                  className="chip"
                  data-testid="preview-peek-clear"
                  aria-pressed={currentPeekKind === null}
                  onClick={() => onSelectPeek(null)}
                >
                  Cerrar asomo
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
