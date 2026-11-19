import {
  CheckSquare,
  Crosshair,
  Droplets,
  Home,
  Laptop,
  LogOut,
  Mail,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { useRef } from 'react';
import type {
  AccessoryCatalogItem,
  AmbientSoundId,
  AppSettings,
  CompanionId,
  CompanionProgressionMap,
  DueStudyReview,
  EmailDraft,
  EmailMessage,
  FocusAssistantSnapshot,
  GuardianConfig,
  GuardianRuntimeStatus,
  IntegrationRecord,
  IslandStatusPayload,
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
import type {
  ChatMessageItem,
  DesktopScanResponse,
  FocusStateResponse,
  HabitWithProgress,
} from '../../api/client.ts';
import { AjustesTab } from '../Tabs/AjustesTab.tsx';
import { ChatTab } from '../Tabs/ChatTab.tsx';
import { CorreoTab } from '../Tabs/CorreoTab.tsx';
import { EnfoqueTab } from '../Tabs/EnfoqueTab.tsx';
import { HabitosTab } from '../Tabs/HabitosTab.tsx';
import { InicioTab } from '../Tabs/InicioTab.tsx';
import { MiEquipoTab } from '../Tabs/MiEquipoTab.tsx';
import { TareasTab } from '../Tabs/TareasTab.tsx';
import { TrokoAvatar } from '../TrokoAvatar/TrokoAvatar.tsx';

export interface IslandPanelProps {
  status: IslandStatusPayload;
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
  activeCompanion: CompanionId;
  companions: CompanionProgressionMap | null;
  onSelectCompanion: (companion: CompanionId) => Promise<void>;
  progression: ProgressionState | null;
  accessoryCatalog: AccessoryCatalogItem[];
  guardianConfig: GuardianConfig | null;
  guardianRuntime: GuardianRuntimeStatus | null;
  studyDocs: StudyDocument[];
  studyDecodeStatus: StudyDecodeProgress | null;
  focusAssistant: FocusAssistantSnapshot | null;
  dueStudyReviews: DueStudyReview[];
  ambientSoundId: AmbientSoundId;
  ambientVolume: number;
  ambientIsPlaying: boolean;
  ambientAutoSync: boolean;
  onChangeAmbientSound: (sound: AmbientSoundId) => void;
  onChangeAmbientVolume: (vol: number) => void;
  onToggleAmbientAutoSync: (auto: boolean) => void;
  registerHead: (el: SVGSVGElement | null) => () => void;
  onSelectTab: (tab: TabId) => void;
  onSelectEnfoqueSubTab?: (sub: 'focus' | 'study') => void;
  onUpdateSettings: (patch: SettingsPatch & Record<string, unknown>) => Promise<void>;
  onQuickListen: () => void;
  onQuitTroko: () => void;
  onSendCommand: (text: string, inputMode?: 'text' | 'voice') => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onOpenAppWindow?: (app: string) => void;
}

const ALL_TABS: ReadonlyArray<{
  id: TabId;
  label: string;
}> = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'chat', label: 'Chat' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'habitos', label: 'Hábitos' },
  { id: 'enfoque', label: 'Enfoque' },
  { id: 'correo', label: 'Correo' },
  { id: 'mi_mac', label: 'Mi Mac' },
  { id: 'ajustes', label: 'Ajustes' },
];

function TabIcon({ id }: { id: TabId }) {
  switch (id) {
    case 'inicio':
      return <Home size={15} />;
    case 'chat':
      return <MessageSquare size={15} />;
    case 'tareas':
      return <CheckSquare size={15} />;
    case 'habitos':
      return <Droplets size={15} />;
    case 'enfoque':
      return <Crosshair size={15} />;
    case 'correo':
      return <Mail size={15} />;
    case 'mi_mac':
      return <Laptop size={15} />;
    case 'ajustes':
      return <Settings size={15} />;
  }
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function IslandPanel({
  status,
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
  activeCompanion,
  companions,
  onSelectCompanion,
  progression,
  accessoryCatalog,
  guardianConfig,
  guardianRuntime,
  studyDocs,
  studyDecodeStatus,
  focusAssistant,
  dueStudyReviews,
  ambientSoundId,
  ambientVolume,
  ambientIsPlaying,
  ambientAutoSync,
  onChangeAmbientSound,
  onChangeAmbientVolume,
  onToggleAmbientAutoSync,
  registerHead,
  onSelectTab,
  onSelectEnfoqueSubTab,
  onUpdateSettings,
  onQuickListen,
  onQuitTroko,
  onSendCommand,
  onRefreshAll,
  onOpenAppWindow,
}: IslandPanelProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const voiceEnabled = settings?.voiceEnabled ?? false;

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number
  ): void => {
    let nextIdx = idx;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % ALL_TABS.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + ALL_TABS.length) % ALL_TABS.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = ALL_TABS.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const targetTab = ALL_TABS[nextIdx];
    if (targetTab) {
      onSelectTab(targetTab.id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  const pendingTasks = summary?.pendingTasksCount ?? tasks.filter((t) => !t.completed).length;
  const habitsDone =
    summary?.habitsCompletedToday ??
    habits.filter((h) => h.todayProgress >= h.dailyGoal).length;
  const habitsTotal = summary?.habitsTotalToday ?? habits.length;
  const unreadEmails =
    summary?.unreadEmailsCount ?? inboxMessages.filter((m) => m.unread).length;
  const looseFiles =
    summary?.looseDesktopFilesCount ?? desktopScan?.totalFiles ?? 0;

  return (
    <article
      id="panel"
      data-testid="panel"
      role="region"
      aria-label="Panel de Nuko Desk"
      className="panel"
    >
      <article className="panel__clip">
        <article className="panel__in">
          <aside className="side">
            <div className="who">
              <TrokoAvatar
                size="lg"
                mood={status.mood}
                state={status.state}
                registerHead={registerHead}
              />
              <b>{activeCompanion === 'luma' ? 'Luma' : 'Nuko'}</b>
              <span className="status">
                <span className="status__dot" data-state={status.state} />
                <em>{status.statusText}</em>
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Secciones de Troko"
              className="tablist"
            >
              {ALL_TABS.map((tab, idx) => {
                const selected = activeTab === tab.id;
                let badge: string | null = null;
                let badgeId: string | undefined;
                let badgeTestId: string | undefined;

                if (tab.id === 'tareas') {
                  badge = String(pendingTasks);
                  badgeId = 'badge-tareas';
                  badgeTestId = 'badge-tareas';
                } else if (tab.id === 'habitos') {
                  badge = `${habitsDone}/${habitsTotal}`;
                  badgeId = 'badge-habitos';
                  badgeTestId = 'badge-habitos';
                } else if (tab.id === 'enfoque' && status.state === 'focus') {
                  badge = formatMMSS(status.focusRemainingSec ?? 1500);
                } else if (tab.id === 'correo' && unreadEmails > 0) {
                  badge = String(unreadEmails);
                } else if (tab.id === 'mi_mac' && looseFiles > 0) {
                  badge = String(looseFiles);
                }

                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[idx] = el;
                    }}
                    id={`tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`view-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    data-testid={`tab-${tab.id}`}
                    className="tab-btn"
                    onClick={() => onSelectTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  >
                    <span className="tab-btn__lead">
                      <TabIcon id={tab.id} />
                      <span>{tab.label}</span>
                    </span>
                    {badge !== null && (
                      <span
                        id={badgeId}
                        data-testid={badgeTestId}
                        className="tab-btn__badge mono"
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="side__foot">
              <div className="voice-switch-row">
                <span>Con voz</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={voiceEnabled}
                  aria-label="Con voz"
                  data-testid="voice-toggle"
                  className="switch"
                  onClick={() =>
                    void onUpdateSettings({ voiceEnabled: !voiceEnabled })
                  }
                >
                  <span className="switch__thumb" />
                </button>
              </div>

              <button
                type="button"
                data-testid="exit-troko-btn"
                className="quit-btn"
                onClick={onQuitTroko}
              >
                <LogOut size={14} />
                <span>Salir de Troko</span>
              </button>
            </div>
          </aside>

          <article
            className="views"
            role="tabpanel"
            id={`view-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {activeTab === 'inicio' && (
              <InicioTab
                summary={summary}
                tasks={tasks}
                reminders={reminders}
                habits={habits}
                focusState={focusState}
                progression={progression}
                onNavigateTab={onSelectTab}
                onOpenStudy={() => {
                  onSelectEnfoqueSubTab?.('study');
                  onSelectTab('enfoque');
                }}
                onQuickListen={onQuickListen}
                onSendCommand={onSendCommand}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'chat' && (
              <ChatTab
                messages={chatMessages}
                onSendCommand={onSendCommand}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'tareas' && (
              <TareasTab
                summary={summary}
                tasks={tasks}
                reminders={reminders}
                timers={timers}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'habitos' && (
              <HabitosTab
                summary={summary}
                habits={habits}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'enfoque' && (
              <EnfoqueTab
                settings={settings}
                summary={summary}
                focusState={focusState}
                tasks={tasks}
                habits={habits}
                activeCompanion={activeCompanion}
                companions={companions}
                onSelectCompanion={onSelectCompanion}
                progression={progression}
                accessoryCatalog={accessoryCatalog}
                guardianConfig={guardianConfig}
                guardianRuntime={guardianRuntime}
                studyDocs={studyDocs}
                studyDecodeStatus={studyDecodeStatus}
                focusAssistant={focusAssistant}
                dueStudyReviews={dueStudyReviews}
                ambientSoundId={ambientSoundId}
                ambientVolume={ambientVolume}
                ambientIsPlaying={ambientIsPlaying}
                ambientAutoSync={ambientAutoSync}
                onChangeAmbientSound={onChangeAmbientSound}
                onChangeAmbientVolume={onChangeAmbientVolume}
                onToggleAmbientAutoSync={onToggleAmbientAutoSync}
                subTab={enfoqueSubTab}
                onChangeSubTab={onSelectEnfoqueSubTab}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'correo' && (
              <CorreoTab
                summary={summary}
                messages={inboxMessages}
                drafts={emailDrafts}
                onRefreshAll={onRefreshAll}
              />
            )}
            {activeTab === 'mi_mac' && (
              <MiEquipoTab
                summary={summary}
                desktopScan={desktopScan}
                launchedApps={launchedApps}
                onRefreshAll={onRefreshAll}
                onOpenAppWindow={onOpenAppWindow}
              />
            )}
            {activeTab === 'ajustes' && (
              <AjustesTab
                settings={settings}
                integrations={integrations}
                saving={settingsSaving}
                savedAt={settingsSavedAt}
                error={settingsError}
                onUpdateSettings={onUpdateSettings}
                onRefreshAll={onRefreshAll}
              />
            )}
          </article>
        </article>
      </article>
    </article>
  );
}
