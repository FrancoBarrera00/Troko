import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AccessoryCatalogItem,
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
  ServerEvent,
  SettingsPatch,
  StudyDecodeProgress,
  StudyDocument,
  SummarySnapshot,
  Task,
  Timer,
} from '../../../shared/types.ts';
import {
  apiClient,
  type ChatMessageItem,
  type DesktopScanResponse,
  type FocusStateResponse,
  type HabitWithProgress,
  type OnboardingStateResponse,
} from '../api/client.ts';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export interface FocusTickSnapshot {
  remainingSec: number;
  phase: string;
  label?: string;
}

const DEFAULT_ISLAND: IslandStatusPayload = {
  state: 'idle',
  mood: 'contento',
  statusText: 'Reposo',
  peekCard: null,
};

export interface UseTrokoEventsOptions {
  onAlertSpeech?: (text: string) => void;
}

export function useTrokoEvents(options: UseTrokoEventsOptions = {}) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [serverIsland, setServerIsland] = useState<IslandStatusPayload>(DEFAULT_ISLAND);
  const [summary, setSummary] = useState<SummarySnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [habits, setHabits] = useState<HabitWithProgress[]>([]);
  const [focusState, setFocusState] = useState<FocusStateResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [inboxMessages, setInboxMessages] = useState<EmailMessage[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [desktopScan, setDesktopScan] = useState<DesktopScanResponse | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [launchedApps, setLaunchedApps] = useState<Array<{ app: string; launchedAt: string }>>([]);
  const [onboarding, setOnboarding] = useState<OnboardingStateResponse | null>(null);
  const [activeCompanion, setActiveCompanion] = useState<CompanionId>('nuko');
  const [companions, setCompanions] = useState<CompanionProgressionMap | null>(null);
  const [progression, setProgression] = useState<ProgressionState | null>(null);
  const [accessoryCatalog, setAccessoryCatalog] = useState<AccessoryCatalogItem[]>([]);
  const [guardianConfig, setGuardianConfig] = useState<GuardianConfig | null>(null);
  const [guardianRuntime, setGuardianRuntime] = useState<GuardianRuntimeStatus | null>(null);
  const [studyDocs, setStudyDocs] = useState<StudyDocument[]>([]);
  const [studyDecodeStatus, setStudyDecodeStatus] = useState<StudyDecodeProgress | null>(null);
  const [focusAssistant, setFocusAssistant] = useState<FocusAssistantSnapshot | null>(null);
  const [dueStudyReviews, setDueStudyReviews] = useState<DueStudyReview[]>([]);
  const [lastFocusTick, setLastFocusTick] = useState<FocusTickSnapshot | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSavedAt, setSettingsSavedAt] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const onAlertSpeechRef = useRef(options.onAlertSpeech);
  onAlertSpeechRef.current = options.onAlertSpeech;

  const refreshSummary = useCallback(async () => {
    try {
      const next = await apiClient.getSummary();
      setSummary(next);
    } catch {
      // ignore transient error
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const next = await apiClient.getSettings();
      setSettings(next);
    } catch {
      // ignore transient error
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [
      sumRes,
      setRes,
      islRes,
      tskRes,
      remRes,
      tmrRes,
      habRes,
      focRes,
      chtRes,
      inbRes,
      dskRes,
      intRes,
      appRes,
      onbRes,
      prgRes,
      grdRes,
      stdRes,
      fasRes,
      revRes,
    ] = await Promise.allSettled([
      apiClient.getSummary(),
      apiClient.getSettings(),
      apiClient.getIslandState(),
      apiClient.listTasks(),
      apiClient.listReminders(),
      apiClient.listTimers(),
      apiClient.listHabits(),
      apiClient.getFocus(),
      apiClient.listChatMessages(),
      apiClient.getInbox(),
      apiClient.scanDesktop(),
      apiClient.listIntegrations(),
      apiClient.listApps(),
      apiClient.getOnboarding(),
      apiClient.getProgression(),
      apiClient.getGuardian(),
      apiClient.getStudyDocs(),
      apiClient.getFocusAssistant(),
      apiClient.getDueStudyReviews(),
    ]);

    if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
    if (setRes.status === 'fulfilled') setSettings(setRes.value);
    if (islRes.status === 'fulfilled') setServerIsland(islRes.value);
    if (tskRes.status === 'fulfilled') setTasks(tskRes.value);
    if (remRes.status === 'fulfilled') setReminders(remRes.value);
    if (tmrRes.status === 'fulfilled') setTimers(tmrRes.value);
    if (habRes.status === 'fulfilled') setHabits(habRes.value);
    if (focRes.status === 'fulfilled') setFocusState(focRes.value);
    if (chtRes.status === 'fulfilled') setChatMessages(chtRes.value);
    if (inbRes.status === 'fulfilled') {
      setInboxMessages(inbRes.value.messages ?? []);
      setEmailDrafts(inbRes.value.drafts ?? []);
    }
    if (dskRes.status === 'fulfilled') setDesktopScan(dskRes.value);
    if (intRes.status === 'fulfilled') setIntegrations(intRes.value);
    if (appRes.status === 'fulfilled') {
      setLaunchedApps(appRes.value.recentLaunches ?? []);
    }
    if (onbRes.status === 'fulfilled') setOnboarding(onbRes.value);
    if (prgRes.status === 'fulfilled') {
      if (prgRes.value.activeCompanion) {
        setActiveCompanion(prgRes.value.activeCompanion);
      }
      if (prgRes.value.companions) {
        setCompanions(prgRes.value.companions);
      }
      setProgression(prgRes.value.progression);
      setAccessoryCatalog(prgRes.value.catalog ?? []);
    }
    if (grdRes.status === 'fulfilled') {
      setGuardianConfig(grdRes.value.config);
      setGuardianRuntime(grdRes.value.runtime);
    }
    if (stdRes.status === 'fulfilled') {
      setStudyDocs(stdRes.value.docs ?? []);
      setStudyDecodeStatus(stdRes.value.decodeStatus ?? null);
    }
    if (fasRes.status === 'fulfilled') {
      setFocusAssistant(fasRes.value);
    }
    if (revRes.status === 'fulfilled') {
      setDueStudyReviews(revRes.value.dueReviews ?? []);
    }
  }, []);

  // Auto-reset `success` state back to `idle` after 2400ms in browser clock
  useEffect(() => {
    if (serverIsland.state !== 'success') return;
    const t = window.setTimeout(() => {
      setServerIsland((prev) =>
        prev.state === 'success'
          ? {
              ...prev,
              state: 'idle',
              statusText: 'Reposo',
              badgeWord: undefined,
            }
          : prev
      );
    }, 2400);
    return () => window.clearTimeout(t);
  }, [serverIsland.state]);

  useEffect(() => {
    let active = true;
    void refreshAll();

    const es = new EventSource('/api/events');

    es.onopen = () => {
      if (!active) return;
      setConnectionStatus('connected');
    };

    es.onerror = () => {
      if (!active) return;
      setConnectionStatus('reconnecting');
    };

    es.onmessage = (msg) => {
      if (!active) return;
      setConnectionStatus('connected');
      try {
        const evt = JSON.parse(msg.data) as ServerEvent<Record<string, unknown>>;
        if (evt.type === 'island.state' && evt.payload) {
          setServerIsland(evt.payload as unknown as IslandStatusPayload);
        } else if (evt.type === 'focus.tick' && evt.payload) {
          const tick = evt.payload as unknown as FocusTickSnapshot;
          setLastFocusTick(tick);
          setFocusState((prev) =>
            prev
              ? {
                  ...prev,
                  remainingSec: tick.remainingSec,
                  session: prev.session
                    ? { ...prev.session, remainingSec: tick.remainingSec }
                    : null,
                }
              : prev
          );
          setServerIsland((prev) =>
            prev.state === 'focus'
              ? { ...prev, focusRemainingSec: tick.remainingSec }
              : prev
          );
        } else if (evt.type === 'timer.tick' && evt.payload) {
          const tId = String(evt.payload['id'] ?? '');
          const remSec = Number(evt.payload['remainingSec'] ?? 0);
          const status = String(evt.payload['status'] ?? 'running') as Timer['status'];
          setTimers((prev) =>
            prev.map((tm) =>
              tm.id === tId ? { ...tm, remainingSec: remSec, status } : tm
            )
          );
        } else if (evt.type === 'reminder.due' && evt.payload) {
          const id = String(evt.payload['id'] ?? 'all');
          const title = String(evt.payload['title'] ?? 'Recordatorio');
          const triggerAt = String(evt.payload['triggerAt'] ?? new Date().toISOString());
          setServerIsland((prev) => ({
            ...prev,
            state: 'remind',
            mood: 'animo',
            statusText: 'Recordatorio',
            remindMessage: title,
            peekCard: {
              kind: 'missed_reminders',
              reminders: [{ id, title, triggerAt }],
            },
          }));
          onAlertSpeechRef.current?.(`Recordatorio: ${title}`);
          void refreshAll();
        } else if (evt.type === 'habit.nudge' && evt.payload) {
          const habitName = String(evt.payload['habitName'] ?? 'Hábito');
          setServerIsland((prev) => ({
            ...prev,
            state: 'remind',
            mood: 'animo',
            statusText: 'Hábito',
            remindMessage: habitName,
            peekCard: {
              kind: 'habit_remind',
              habitId: String(evt.payload['habitId'] ?? ''),
              habitName,
              progress: Number(evt.payload['progress'] ?? 0),
              goal: Number(evt.payload['goal'] ?? 1),
              unitLabel: String(evt.payload['unitLabel'] ?? ''),
            },
          }));
          onAlertSpeechRef.current?.(`Recuerda tu hábito: ${habitName}`);
          void refreshAll();
        } else if (evt.type === 'data.updated' || evt.type === 'desktop.changed') {
          if (evt.payload?.['scope'] === 'study' && evt.payload?.['decodeProgress']) {
            setStudyDecodeStatus(evt.payload['decodeProgress'] as StudyDecodeProgress);
          }
          void refreshAll();
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    return () => {
      active = false;
      es.close();
    };
  }, [refreshAll]);

  const updateSettings = useCallback(
    async (patch: SettingsPatch & Record<string, unknown>) => {
      const prevSettings = settings;
      if (prevSettings) {
        setSettings({
          ...prevSettings,
          ...patch,
          permissions: patch.permissions
            ? { ...prevSettings.permissions, ...patch.permissions }
            : prevSettings.permissions,
        });
      }
      setSettingsSaving(true);
      setSettingsError(null);
      try {
        const saved = await apiClient.patchSettings(patch);
        setSettings(saved);
        setSettingsSavedAt(Date.now());
      } catch (err) {
        if (prevSettings) setSettings(prevSettings);
        setSettingsError(err instanceof Error ? err.message : 'Error al guardar');
      } finally {
        setSettingsSaving(false);
      }
    },
    [settings]
  );

  const selectCompanion = useCallback(async (companion: CompanionId) => {
    setActiveCompanion(companion);
    try {
      const res = await apiClient.setCompanion(companion);
      setActiveCompanion(res.activeCompanion);
      setCompanions(res.companions);
      setProgression(res.progression);
      setAccessoryCatalog(res.catalog ?? []);
    } catch {
      // ignore transient error
    }
  }, []);

  return {
    connectionStatus,
    serverIsland,
    setServerIsland,
    summary,
    settings,
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
    onboarding,
    activeCompanion,
    companions,
    selectCompanion,
    progression,
    accessoryCatalog,
    guardianConfig,
    guardianRuntime,
    studyDocs,
    studyDecodeStatus,
    focusAssistant,
    dueStudyReviews,
    lastFocusTick,
    settingsSaving,
    settingsSavedAt,
    settingsError,
    updateSettings,
    refreshSummary,
    refreshSettings,
    refreshAll,
  };
}
