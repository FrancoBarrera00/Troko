import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IslandState,
  IslandStatusPayload,
  PeekCard,
  TabId,
  TrokoMood,
} from '../../shared/types.ts';
import { apiClient } from './api/client.ts';
import { DesktopStage } from './components/DesktopStage/DesktopStage.tsx';
import { IslandBar } from './components/Island/IslandBar.tsx';
import { BienvenidaModal } from './components/Tabs/BienvenidaModal.tsx';
import { TrokoAvatar } from './components/TrokoAvatar/TrokoAvatar.tsx';
import { useGazeTracking } from './hooks/useGazeTracking.ts';
import { useTrokoEvents } from './hooks/useTrokoEvents.ts';
import { useVoiceAudio } from './hooks/useVoiceAudio.ts';

const STATE_STATUS_TEXT: Record<IslandState, string> = {
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
  remind: 'Recordatorio',
};

const SAMPLE_PEEK_CARDS: Record<'desktop_tidy' | 'email_draft' | 'habit_remind', PeekCard> = {
  desktop_tidy: {
    kind: 'desktop_tidy',
    batchId: 'preview-batch',
    totalFiles: 7,
    categories: { Capturas: 3, Documentos: 2, Imágenes: 2 },
    items: [
      { fileName: 'Captura 1.png', category: 'Capturas' },
      { fileName: 'Notas.pdf', category: 'Documentos' },
    ],
  },
  email_draft: {
    kind: 'email_draft',
    draftId: 'preview-draft',
    toName: 'Ana López',
    toEmail: 'ana@equipo.local',
    subject: 'Re: Revisión de diseño',
    body: 'Hola Ana, te confirmo que revisé los avances y todo quedó listo para mañana.',
  },
  habit_remind: {
    kind: 'habit_remind',
    habitId: 'preview-habit',
    habitName: 'Tomar agua',
    progress: 3,
    goal: 8,
    unitLabel: 'vasos',
  },
};

export function App() {
  const isElectron = Boolean(window.trokoElectron?.isElectron);
  const lastInteractiveRef = useRef<boolean | null>(null);
  const speakRef = useRef<(text: string) => void>(() => {});
  const playChimeRef = useRef<(kind?: 'remind' | 'success' | 'focus') => void>(() => {});

  const {
    connectionStatus,
    serverIsland,
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
    lastFocusTick,
    settingsSaving,
    settingsSavedAt,
    settingsError,
    updateSettings,
    refreshAll,
  } = useTrokoEvents({
    onAlertSpeech: (text) => {
      speakRef.current(text);
      playChimeRef.current('remind');
      window.trokoElectron?.notify?.('Troko-Desk', text);
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('inicio');
  const [showNotchHint, setShowNotchHint] = useState(true);
  const [isExited, setIsExited] = useState(false);
  const [activeAppWindow, setActiveAppWindow] = useState<string | null>(null);

  const [previewState, setPreviewState] = useState<IslandState | null>(null);
  const [previewMood, setPreviewMood] = useState<TrokoMood | null>(null);
  const [previewPeek, setPreviewPeek] = useState<PeekCard | null | undefined>(undefined);
  const [liveTranscript, setLiveTranscript] = useState<string | undefined>(undefined);
  const [asleepByCommand, setAsleepByCommand] = useState(false);

  const effectiveStatus: IslandStatusPayload = useMemo(() => {
    const activePreviewState =
      isOpen && previewState === 'attentive' ? null : previewState;
    const state = activePreviewState ?? serverIsland.state;
    const mood = previewMood ?? serverIsland.mood;
    const statusText =
      activePreviewState !== null
        ? STATE_STATUS_TEXT[activePreviewState]
        : serverIsland.statusText;
    const peekCard =
      previewPeek !== undefined ? previewPeek : serverIsland.peekCard ?? null;

    return {
      ...serverIsland,
      state,
      mood,
      statusText,
      peekCard,
      transcript: liveTranscript ?? serverIsland.transcript,
      focusRemainingSec:
        state === 'focus'
          ? lastFocusTick?.remainingSec ?? serverIsland.focusRemainingSec ?? 1500
          : serverIsland.focusRemainingSec,
      badgeWord: state === 'success' ? serverIsland.badgeWord ?? 'Listo' : serverIsland.badgeWord,
      remindMessage:
        state === 'remind'
          ? serverIsland.remindMessage ?? 'Tomar agua'
          : serverIsland.remindMessage,
    };
  }, [isOpen, lastFocusTick, liveTranscript, previewMood, previewPeek, previewState, serverIsland]);

  const handleAutoSleep = useCallback(() => {
    setPreviewState('sleep');
  }, []);

  const handleAutoWake = useCallback(() => {
    setPreviewState((prev) => (prev === 'sleep' ? null : prev));
  }, []);

  const islandElementRef = useRef<HTMLElement | null>(null);

  const registerHead = useCallback((el: SVGSVGElement | null) => {
    islandElementRef.current = document.getElementById('island') ?? (el as unknown as HTMLElement | null);
    return () => {};
  }, []);

  useGazeTracking({
    islandRef: islandElementRef,
    currentState: effectiveStatus.state,
    sleepTimeoutSec: settings?.sleepTimeoutSec ?? 35,
    onAutoSleep: handleAutoSleep,
    onAutoWake: handleAutoWake,
  });

  const handleSendCommand = useCallback(
    async (text: string, inputMode: 'text' | 'voice' = 'text') => {
      setAsleepByCommand(false);
      setPreviewState(null);
      setPreviewMood(null);
      if (inputMode === 'voice') {
        setLiveTranscript(text);
        window.setTimeout(() => {
          setLiveTranscript((prev) => (prev === text ? undefined : prev));
        }, 3500);
      } else {
        setLiveTranscript(undefined);
      }

      const res = await apiClient.sendChatCommand(text, inputMode);

      if (res.island?.state === 'sleep') {
        setAsleepByCommand(true);
      }

      if (res.toolAction?.type === 'launch_app' && res.toolAction.app) {
        setActiveAppWindow(String(res.toolAction.app));
      } else if (res.toolAction?.type === 'email_draft' && isOpen) {
        setActiveTab('correo');
      }

      await refreshAll();

      if (settings?.voiceEnabled ?? false) {
        speakRef.current(res.reply);
      }
    },
    [isOpen, refreshAll, settings?.voiceEnabled]
  );

  const { togglePushToTalk, speakText, playChime } = useVoiceAudio({
    voiceEnabled: settings?.voiceEnabled ?? false,
    soundEnabled: settings?.soundEnabled ?? true,
    wakeWordEnabled: settings?.wakeWordEnabled ?? true,
    wakeWord: settings?.wakeWord ?? 'Troko',
    onListenStart: (transcript) => {
      setPreviewState('listen');
      setPreviewMood('escucha');
      if (transcript) setLiveTranscript(transcript);
      void apiClient.setIslandState({
        state: 'listen',
        mood: 'escucha',
        statusText: 'Escuchando',
        transcript,
      });
    },
    onTranscriptUpdate: (transcript) => {
      setLiveTranscript(transcript);
      void apiClient.setIslandState({
        state: 'listen',
        mood: 'escucha',
        statusText: 'Escuchando',
        transcript,
      });
    },
    onVoiceCommand: async (commandText) => {
      await handleSendCommand(commandText, 'voice');
    },
    onMicDenied: () => {
      setPreviewState('alert');
      setPreviewMood('molesto');
      void apiClient.setIslandState({
        state: 'alert',
        mood: 'molesto',
        statusText: 'Alerta',
      });
    },
    onSpeakStart: () => {
      setPreviewState('speak');
      void apiClient.setIslandState({
        state: 'speak',
        statusText: 'Hablando',
      });
    },
    onSpeakEnd: () => {
      setPreviewState((prev) => (prev === 'speak' ? null : prev));
      void apiClient.setIslandState({
        state: 'idle',
        statusText: 'Reposo',
      });
    },
  });

  speakRef.current = speakText;
  playChimeRef.current = playChime;

  useEffect(() => {
    const bridge = window.trokoElectron;
    if (!bridge?.onSummoned) return;
    let pulseTimer: number | undefined;
    const unsubscribe = bridge.onSummoned(() => {
      setAsleepByCommand(false);
      setPreviewMood(null);
      setPreviewState('attentive');
      if (pulseTimer) window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => {
        setPreviewState((prev) => (prev === 'attentive' ? null : prev));
      }, 1600);
    });
    return () => {
      if (pulseTimer) window.clearTimeout(pulseTimer);
      unsubscribe();
    };
  }, []);

  const prevReadyForBreakRef = useRef<boolean | null>(null);
  useEffect(() => {
    const ready = Boolean(focusState?.readyForBreak);
    if (prevReadyForBreakRef.current === false && ready) {
      playChime('focus');
      const msg =
        focusState?.lastCompletedPhase === 'break'
          ? 'Descanso completado. ¡Listo para volver al enfoque!'
          : 'Bloque de enfoque completado. Hora de tomar un descanso.';
      window.trokoElectron?.notify?.('Troko-Desk', msg);
    }
    prevReadyForBreakRef.current = ready;
  }, [focusState?.readyForBreak, focusState?.lastCompletedPhase, playChime]);

  const seenFinishedTimersRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const finished = timers.filter((t) => t.status === 'finished');
    if (seenFinishedTimersRef.current === null) {
      seenFinishedTimersRef.current = new Set(finished.map((t) => t.id));
      return;
    }
    for (const tm of finished) {
      if (!seenFinishedTimersRef.current.has(tm.id)) {
        seenFinishedTimersRef.current.add(tm.id);
        playChime('success');
        window.trokoElectron?.notify?.('Temporizador finalizado', tm.label || 'Tiempo cumplido');
      }
    }
  }, [timers, playChime]);

  const handleTriggerClick = (): void => {
    setShowNotchHint(false);
    setIsPeeking(false);
    if (effectiveStatus.state === 'sleep' || asleepByCommand) {
      setAsleepByCommand(false);
      setPreviewState(null);
      setPreviewMood(null);
      void apiClient.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
      });
    } else if (previewState === 'attentive') {
      setPreviewState(null);
    }
    if (isOpen) {
      setIsPinned(false);
      setIsOpen(false);
    } else {
      setIsPinned(true);
      setIsOpen(true);
    }
  };

  const handleHoverOpen = (): void => {
    setShowNotchHint(false);
    if (!isOpen) {
      setIsPeeking(true);
      if (effectiveStatus.state === 'idle') {
        setPreviewState('attentive');
      }
    }
  };

  const handleHoverClose = (): void => {
    setIsPeeking(false);
    setPreviewState((prev) => (prev === 'attentive' ? null : prev));
  };

  const handleClose = useCallback(() => {
    setIsPinned(false);
    setIsOpen(false);
    setIsPeeking(false);
  }, []);

  const handleSelectState = (state: IslandState): void => {
    setAsleepByCommand(state === 'sleep');
    setPreviewState(state);
    if (state !== 'remind') {
      setPreviewPeek(undefined);
    }
  };

  const handleSelectMood = (mood: TrokoMood): void => {
    setAsleepByCommand(false);
    setPreviewState('idle');
    setPreviewMood(mood);
  };

  const handleSelectPeek = (kind: PeekCard['kind'] | null): void => {
    setIsPinned(false);
    setIsOpen(false);
    if (kind === null) {
      setPreviewPeek(null);
      if (previewState === 'remind') setPreviewState(null);
      return;
    }
    if (kind === 'missed_reminders') {
      setPreviewPeek({
        kind: 'missed_reminders',
        reminders: [
          {
            id: 'missed-1',
            title: 'Revisar agenda del día',
            triggerAt: new Date().toISOString(),
          },
        ],
      });
      setPreviewState('remind');
      return;
    }
    setPreviewPeek(SAMPLE_PEEK_CARDS[kind]);
    setPreviewState('remind');
  };

  const handleResetPreview = (): void => {
    setAsleepByCommand(false);
    setPreviewState(null);
    setPreviewMood(null);
    setPreviewPeek(undefined);
  };

  const handlePeekAction = async (action: string, card: PeekCard): Promise<void> => {
    if (action === 'open_mi_mac') {
      setActiveTab('mi_mac');
      setIsPinned(true);
      setIsOpen(true);
      setPreviewPeek(undefined);
      setPreviewState(null);
      return;
    }
    if (action === 'edit_draft') {
      setActiveTab('correo');
      setIsPinned(true);
      setIsOpen(true);
      setPreviewPeek(undefined);
      setPreviewState(null);
      return;
    }
    if (action === 'dismiss') {
      setPreviewPeek(undefined);
      setPreviewState(null);
      await apiClient.setIslandState({
        state: 'idle',
        mood: 'contento',
        statusText: 'Reposo',
        peekCard: null,
      });
      await refreshAll();
      return;
    }

    try {
      if (
        (action === 'confirm_tidy' || action === 'apply_tidy') &&
        card.kind === 'desktop_tidy' &&
        card.batchId !== 'preview-batch'
      ) {
        await apiClient.applyDesktopTidy();
      } else if (action === 'send_draft' && card.kind === 'email_draft' && card.draftId !== 'preview-draft') {
        await apiClient.sendEmailDraft(card.draftId);
      } else if (action === 'discard_draft' && card.kind === 'email_draft' && card.draftId !== 'preview-draft') {
        await apiClient.discardEmailDraft(card.draftId);
        setPreviewPeek(undefined);
        setPreviewState(null);
        await refreshAll();
        return;
      } else if (
        (action === 'log_habit' || action === 'habit_plus_one') &&
        card.kind === 'habit_remind' &&
        card.habitId !== 'preview-habit'
      ) {
        await apiClient.incrementHabit(card.habitId);
      } else if (action === 'ack_missed' && card.kind === 'missed_reminders') {
        const firstId = card.reminders[0]?.id;
        if (firstId && firstId !== 'missed-1') {
          await apiClient.ackMissedReminder(firstId);
        } else {
          await apiClient.ackMissedReminder('all');
        }
        setPreviewPeek(undefined);
        setPreviewState(null);
        await refreshAll();
        return;
      }
    } catch {
      // Fallback to local state transition if preview card
    }

    setPreviewPeek(undefined);
    setPreviewState('success');
    await refreshAll();
  };

  const handleQuickListen = (): void => {
    togglePushToTalk();
  };

  const handleQuitTroko = (): void => {
    setIsPinned(false);
    setIsOpen(false);
    if (isElectron) {
      window.trokoElectron?.quitApp();
      return;
    }
    setIsExited(true);
    void apiClient.exitApp();
  };

  const showOnboarding = onboarding !== null && !onboarding.onboardingCompleted;

  useEffect(() => {
    if (!isElectron) return;
    document.documentElement.classList.add('troko-electron');
    return () => {
      document.documentElement.classList.remove('troko-electron');
    };
  }, [isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.trokoElectron;
    if (!bridge) return;

    const updateInteractive = (next: boolean) => {
      if (lastInteractiveRef.current === next) return;
      lastInteractiveRef.current = next;
      bridge.setInteractive(next);
    };

    if (showOnboarding) {
      updateInteractive(true);
    }

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const overInteractive = Boolean(
        showOnboarding ||
          target?.closest(
            '#island, [data-testid="bienvenida-modal"], [data-testid="launched-app-window"], [data-testid="exit-overlay"]'
          )
      );
      updateInteractive(overInteractive);
    };

    const handleMouseLeave = () => {
      if (!showOnboarding) {
        updateInteractive(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isElectron, showOnboarding]);

  return (
    <>
      {!isExited && (
        <IslandBar
          status={effectiveStatus}
          isOpen={isOpen}
          isPinned={isPinned}
          isPeeking={isPeeking}
          activeTab={activeTab}
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
          registerHead={registerHead}
          onTriggerClick={handleTriggerClick}
          onHoverOpen={handleHoverOpen}
          onHoverClose={handleHoverClose}
          onClose={handleClose}
          onSelectTab={setActiveTab}
          onUpdateSettings={updateSettings}
          onQuickListen={handleQuickListen}
          onQuitTroko={handleQuitTroko}
          onPeekAction={(action, card) => {
            void handlePeekAction(action, card);
          }}
          onSendCommand={handleSendCommand}
          onRefreshAll={refreshAll}
          onOpenAppWindow={(app) => setActiveAppWindow(app)}
        />
      )}

      {activeAppWindow && (
        <div
          className="card"
          data-testid="launched-app-window"
          data-ignore-outside-close="true"
          role="dialog"
          aria-label={`Ventana de ${activeAppWindow}`}
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '28px',
            zIndex: 90,
            width: '300px',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: '18px',
            padding: '14px',
            boxShadow: '0 20px 48px rgba(0,0,0,0.65)',
            display: 'grid',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '14px', color: 'var(--cream)' }}>
              {activeAppWindow}
            </strong>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActiveAppWindow(null)}
            >
              Cerrar
            </button>
          </div>
          <p className="sub" style={{ margin: 0, fontSize: '12px' }}>
            Aplicación abierta desde el lanzador seguro de Troko-Desk.
          </p>
        </div>
      )}

      {!isElectron && (
        <DesktopStage
          connectionStatus={connectionStatus}
          currentState={effectiveStatus.state}
          currentMood={effectiveStatus.mood}
          currentPeekKind={effectiveStatus.peekCard?.kind ?? null}
          showNotchHint={showNotchHint && !isOpen}
          onSelectState={handleSelectState}
          onSelectMood={handleSelectMood}
          onSelectPeek={handleSelectPeek}
          onResetPreview={handleResetPreview}
        />
      )}

      <BienvenidaModal
        open={showOnboarding}
        onCompleted={() => {
          void refreshAll();
        }}
      />

      {isExited && (
        <div
          className="exit-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Troko en reposo"
          data-testid="exit-overlay"
        >
          <div className="exit-card">
            <TrokoAvatar size="xl" mood="bostezo" state="sleep" />
            <h2 className="vt" style={{ fontSize: '21px' }}>
              Hasta pronto · Troko cerrado (Dormido)
            </h2>
            <p className="sub">
              Tus datos permanecen guardados de forma local y segura en SQLite.
            </p>
            <button
              type="button"
              className="btn-lime"
              data-testid="reopen-troko-btn"
              onClick={() => setIsExited(false)}
            >
              Volver a abrir Troko
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
