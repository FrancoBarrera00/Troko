import { CheckCircle2, Crosshair, Mic } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  AccessoryCatalogItem,
  AppSettings,
  EmailDraft,
  EmailMessage,
  GuardianConfig,
  GuardianRuntimeStatus,
  IntegrationRecord,
  IslandStatusPayload,
  PeekCard,
  ProgressionState,
  Reminder,
  SettingsPatch,
  StudyDecodeProgress,
  StudyDocument,
  SummarySnapshot,
  TabId,
  Task,
  Timer,
} from '../../../../shared/types.ts';
import type { ChatMessageItem, DesktopScanResponse, FocusStateResponse, HabitWithProgress } from '../../api/client.ts';
import { TrokoAvatar } from '../TrokoAvatar/TrokoAvatar.tsx';
import { IslandPanel } from './IslandPanel.tsx';

export interface IslandBarProps {
  status: IslandStatusPayload;
  isOpen: boolean;
  isPinned: boolean;
  isPeeking: boolean;
  activeTab: TabId;
  enfoqueSubTab?: 'focus' | 'study';
  summary: SummarySnapshot | null;
  settings: AppSettings | null;
  settingsSaving: boolean;
  settingsSavedAt: number | null;
  settingsError: string | null;
  tasks: Task[];
  reminders: Reminder[];
  timers: Timer[];
  habits: HabitWithProgress[];
  focusState: FocusStateResponse | null;
  chatMessages: ChatMessageItem[];
  inboxMessages: EmailMessage[];
  emailDrafts: EmailDraft[];
  desktopScan: DesktopScanResponse | null;
  integrations: IntegrationRecord[];
  launchedApps: Array<{ app: string; launchedAt: string }>;
  progression: ProgressionState | null;
  accessoryCatalog: AccessoryCatalogItem[];
  guardianConfig: GuardianConfig | null;
  guardianRuntime: GuardianRuntimeStatus | null;
  studyDocs: StudyDocument[];
  studyDecodeStatus: StudyDecodeProgress | null;
  registerHead: (el: SVGSVGElement | null) => () => void;
  onTriggerClick: () => void;
  onHoverOpen: () => void;
  onHoverClose: () => void;
  onClose: () => void;
  onSelectTab: (tab: TabId) => void;
  onSelectEnfoqueSubTab?: (sub: 'focus' | 'study') => void;
  onUpdateSettings: (patch: SettingsPatch & Record<string, unknown>) => Promise<void>;
  onQuickListen: () => void;
  onQuitTroko: () => void;
  onPeekAction: (action: string, card: PeekCard) => void;
  onSendCommand: (text: string, inputMode?: 'text' | 'voice') => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onOpenAppWindow?: (app: string) => void;
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function getLiveAnnouncement(status: IslandStatusPayload): string {
  switch (status.state) {
    case 'listen':
      return `Escuchando ${status.transcript ?? ''}`.trim();
    case 'think':
      return 'Pensando';
    case 'speak':
      return 'Hablando';
    case 'alert':
      return status.statusText || 'Alerta';
    case 'attentive':
      return 'Atento';
    case 'notification':
      return 'Notificación';
    case 'sleep':
      return 'Dormido';
    case 'focus':
      return `Enfoque ${formatMMSS(status.focusRemainingSec ?? 1500)}`;
    case 'success':
      return status.badgeWord ?? 'Listo';
    case 'remind':
      return status.remindMessage ?? 'Recordatorio';
    default:
      return status.statusText || 'Reposo';
  }
}

function NotificationRaysSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g stroke="#B6F23A" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 12L6 9" />
        <path d="M8 13V8" />
        <path d="M13 12L10 9" />
      </g>
    </svg>
  );
}

function RemindIconSvg() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.8C8 1.8 3.2 7.2 3.2 10.2C3.2 12.8 5.3 14.8 8 14.8C10.7 14.8 12.8 12.8 12.8 10.2C12.8 7.2 8 1.8 8 1.8Z"
        fill="#58B2FF"
      />
    </svg>
  );
}

function Waves({ purple = false }: { purple?: boolean }) {
  return (
    <span className={purple ? 'waves waves--p' : 'waves'} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function IslandBar({
  status,
  isOpen,
  isPinned,
  isPeeking,
  activeTab,
  enfoqueSubTab,
  summary,
  settings,
  settingsSaving,
  settingsSavedAt,
  settingsError,
  tasks,
  reminders,
  timers,
  habits,
  focusState,
  chatMessages,
  inboxMessages,
  emailDrafts,
  desktopScan,
  integrations,
  launchedApps,
  progression,
  accessoryCatalog,
  guardianConfig,
  guardianRuntime,
  studyDocs,
  studyDecodeStatus,
  registerHead,
  onTriggerClick,
  onHoverOpen,
  onHoverClose,
  onClose,
  onSelectTab,
  onSelectEnfoqueSubTab,
  onUpdateSettings,
  onQuickListen,
  onQuitTroko,
  onPeekAction,
  onSendCommand,
  onRefreshAll,
  onOpenAppWindow,
}: IslandBarProps) {
  const islandRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (islandRef.current?.contains(target)) return;
      if (target.closest('[data-ignore-outside-close="true"]')) return;
      onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen, onClose]);

  const handlePointerEnter = (e: React.PointerEvent<HTMLElement>): void => {
    if (e.pointerType === 'touch' || isPinned || isOpen) return;
    onHoverOpen();
  };

  const handlePointerLeave = (): void => {
    if (isPinned || isOpen) return;
    onHoverClose();
  };

  const hasPeek = !isOpen && Boolean(status.peekCard);

  return (
    <aside
      id="island"
      ref={islandRef}
      data-testid="island"
      data-state={status.state}
      data-mood={status.mood}
      data-open={String(isOpen)}
      data-peek={String(isPeeking || hasPeek)}
      data-has-peek={String(hasPeek)}
      className="island"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div
        id="live"
        data-testid="island-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {getLiveAnnouncement(status)}
      </div>
      <span id="status-text" data-testid="status-text" className="sr-only">
        {status.statusText}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
        <button
          id="island-btn"
          ref={triggerRef}
          type="button"
          data-testid="island-trigger"
          aria-expanded={isOpen}
          aria-controls="panel"
          aria-label="Alternar panel de Troko"
          className="island__bar"
          onClick={() => {
            onTriggerClick();
          }}
        >
          <span id="slot-l" data-testid="island-slot-left" className="island__slot-l">
            {status.state === 'listen' && <Waves />}
            {status.state === 'speak' && <Waves purple />}
            {status.state === 'notification' && <NotificationRaysSvg />}
            {status.state === 'remind' && <RemindIconSvg />}
          </span>

          <span className="island__avatar-slot">
            <TrokoAvatar
              size="sm"
              mood={status.mood}
              state={status.state}
              registerHead={registerHead}
            />
          </span>

          <span id="slot-r" data-testid="island-slot-right" className="island__slot-r">
            {status.state === 'idle' && <span className="island__dot" />}
            {status.state === 'listen' && <Waves />}
            {status.state === 'think' && (
              <span className="think" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            {status.state === 'speak' && <Waves purple />}
            {status.state === 'alert' && (
              <span className="island__alert-badge" aria-hidden="true">
                !
              </span>
            )}
            {status.state === 'attentive' && (
              <span className="island__dot island__dot--amber" />
            )}
            {status.state === 'notification' && <NotificationRaysSvg />}
            {status.state === 'sleep' && (
              <span className="island__zzz" aria-hidden="true">
                z<small>z</small>
              </span>
            )}
            {status.state === 'focus' && (
              <>
                <Crosshair size={13} color="#B6F23A" aria-hidden="true" />
                <span
                  className="island__count mono"
                  data-testid="island-focus-timer"
                >
                  {formatMMSS(status.focusRemainingSec ?? 1500)}
                </span>
              </>
            )}
            {status.state === 'success' && (
              <>
                <CheckCircle2 size={14} color="#B6F23A" aria-hidden="true" />
                <span className="island__word" data-testid="island-success-word">
                  {status.badgeWord ?? 'Listo'}
                </span>
              </>
            )}
            {status.state === 'remind' && (
              <span
                className="island__remind-txt"
                data-testid="island-remind-text"
              >
                {status.remindMessage ?? 'Aviso'}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          data-testid="mic-btn"
          aria-label="Hablar con Troko"
          title="Hablar con Troko"
          onClick={(e) => {
            e.stopPropagation();
            onQuickListen();
          }}
          style={{
            position: 'absolute',
            right: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '24px',
            borderRadius: '999px',
            border: 'none',
            background:
              status.state === 'listen'
                ? 'rgba(182, 242, 58, 0.22)'
                : 'rgba(255, 255, 255, 0.06)',
            color: status.state === 'listen' ? '#B6F23A' : '#8E8E93',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 3,
          }}
        >
          <Mic size={12} />
        </button>
      </div>

      {status.transcript && (
        <div
          className="say"
          data-testid="transcript-bubble"
          data-transcript={status.transcript}
        >
          “{status.transcript}”
        </div>
      )}

      {!isOpen && status.peekCard && (
        <div
          className="peek-card"
          data-testid="island-peek-card"
          data-peek-card={status.peekCard.kind}
          data-peek-kind={status.peekCard.kind}
        >
          {status.peekCard.kind === 'desktop_tidy' && (
            <>
              <div className="peek-card__head">
                <span className="peek-card__eyebrow">Ordenar escritorio</span>
                <span className="sub mono">{status.peekCard.totalFiles} archivos</span>
              </div>
              <p className="peek-card__title">
                Vista previa lista para organizar tu escritorio
              </p>
              <p className="peek-card__meta">
                {Object.entries(status.peekCard.categories)
                  .filter(([, count]) => count > 0)
                  .map(([cat, count]) => `${cat}: ${count}`)
                  .join(' · ') || 'Sin archivos sueltos'}
              </p>
              <div className="peek-card__actions">
                <button
                  type="button"
                  className="btn-lime"
                  data-testid="peek-confirm-tidy-btn"
                  onClick={() => onPeekAction('apply_tidy', status.peekCard!)}
                >
                  Ordenar ahora
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onPeekAction('open_mi_mac', status.peekCard!)}
                >
                  Ver detalle
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="peek-cancel-tidy-btn"
                  onClick={() => onPeekAction('dismiss', status.peekCard!)}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}

          {status.peekCard.kind === 'email_draft' && (
            <>
              <div className="peek-card__head">
                <span className="peek-card__eyebrow">Borrador de correo</span>
                <span className="sub">Para: {status.peekCard.toName}</span>
              </div>
              <p className="peek-card__title">{status.peekCard.subject}</p>
              <p className="peek-card__meta">{status.peekCard.body}</p>
              <div className="peek-card__actions">
                <button
                  type="button"
                  className="btn-lime"
                  data-testid="peek-send-draft-btn"
                  onClick={() => onPeekAction('send_draft', status.peekCard!)}
                >
                  Enviar
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onPeekAction('edit_draft', status.peekCard!)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="peek-discard-draft-btn"
                  onClick={() => onPeekAction('discard_draft', status.peekCard!)}
                >
                  Descartar
                </button>
              </div>
            </>
          )}

          {status.peekCard.kind === 'habit_remind' && (
            <>
              <div className="peek-card__head">
                <span className="peek-card__eyebrow">Hábito pendiente</span>
                <span className="sub mono">
                  {status.peekCard.progress}/{status.peekCard.goal}{' '}
                  {status.peekCard.unitLabel}
                </span>
              </div>
              <p className="peek-card__title">{status.peekCard.habitName}</p>
              <div className="peek-card__actions">
                <button
                  type="button"
                  className="btn-lime"
                  data-testid="peek-habit-plus-one"
                  onClick={() => onPeekAction('habit_plus_one', status.peekCard!)}
                >
                  +1
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onPeekAction('dismiss', status.peekCard!)}
                >
                  Más tarde
                </button>
              </div>
            </>
          )}

          {status.peekCard.kind === 'missed_reminders' && (
            <>
              <div className="peek-card__head">
                <span className="peek-card__eyebrow">Avisos mientras dormías</span>
                <span className="sub mono">
                  {status.peekCard.reminders.length}
                </span>
              </div>
              <p className="peek-card__title">
                {status.peekCard.reminders.map((r) => r.title).join(' · ')}
              </p>
              <div className="peek-card__actions">
                <button
                  type="button"
                  className="btn-lime"
                  data-testid="peek-ack-missed-btn"
                  onClick={() => onPeekAction('ack_missed', status.peekCard!)}
                >
                  Entendido
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <IslandPanel
        status={status}
        activeTab={activeTab}
        enfoqueSubTab={enfoqueSubTab}
        summary={summary}
        settings={settings}
        settingsSaving={settingsSaving}
        settingsSavedAt={settingsSavedAt}
        settingsError={settingsError}
        tasks={tasks}
        reminders={reminders}
        timers={timers}
        habits={habits}
        focusState={focusState}
        chatMessages={chatMessages}
        inboxMessages={inboxMessages}
        emailDrafts={emailDrafts}
        desktopScan={desktopScan}
        integrations={integrations}
        launchedApps={launchedApps}
        progression={progression}
        accessoryCatalog={accessoryCatalog}
        guardianConfig={guardianConfig}
        guardianRuntime={guardianRuntime}
        studyDocs={studyDocs}
        studyDecodeStatus={studyDecodeStatus}
        registerHead={registerHead}
        onSelectTab={onSelectTab}
        onSelectEnfoqueSubTab={onSelectEnfoqueSubTab}
        onUpdateSettings={onUpdateSettings}
        onQuickListen={onQuickListen}
        onQuitTroko={onQuitTroko}
        onSendCommand={onSendCommand}
        onRefreshAll={onRefreshAll}
        onOpenAppWindow={onOpenAppWindow}
      />
    </aside>
  );
}
