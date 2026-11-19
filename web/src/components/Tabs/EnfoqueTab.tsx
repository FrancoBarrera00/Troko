import {
  Award,
  BarChart3,
  BookOpen,
  Check,
  Lock,
  Pause,
  Play,
  Plus,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AccessoryCatalogItem,
  AmbientSoundId,
  AppSettings,
  CompanionId,
  CompanionProgressionMap,
  DueStudyReview,
  FocusAssistantSnapshot,
  FocusPresetId,
  GuardianConfig,
  GuardianRuntimeStatus,
  ProgressionState,
  StudyDecodeProgress,
  StudyDocument,
  SummarySnapshot,
  Task,
  TrokoAccessoryId,
} from '../../../../shared/types.ts';
import {
  apiClient,
  type FocusStateResponse,
  type HabitWithProgress,
} from '../../api/client.ts';
import { FocusScene } from '../TrokoAvatar/FocusScene.tsx';
import { TrokoAvatar } from '../TrokoAvatar/TrokoAvatar.tsx';
import { BreakCoachCard } from './BreakCoachCard.tsx';
import { StudyDecoderView } from './StudyDecoderView.tsx';

export interface EnfoqueTabProps {
  settings: AppSettings | null;
  summary: SummarySnapshot | null;
  focusState: FocusStateResponse | null;
  tasks?: Task[];
  habits?: HabitWithProgress[];
  activeCompanion?: CompanionId;
  companions?: CompanionProgressionMap | null;
  onSelectCompanion?: (companion: CompanionId) => Promise<void>;
  progression?: ProgressionState | null;
  accessoryCatalog?: AccessoryCatalogItem[];
  guardianConfig?: GuardianConfig | null;
  guardianRuntime?: GuardianRuntimeStatus | null;
  studyDocs?: StudyDocument[];
  studyDecodeStatus?: StudyDecodeProgress | null;
  focusAssistant?: FocusAssistantSnapshot | null;
  dueStudyReviews?: DueStudyReview[];
  ambientSoundId?: AmbientSoundId;
  ambientVolume?: number;
  ambientIsPlaying?: boolean;
  ambientAutoSync?: boolean;
  onChangeAmbientSound?: (sound: AmbientSoundId) => void;
  onChangeAmbientVolume?: (vol: number) => void;
  onToggleAmbientAutoSync?: (auto: boolean) => void;
  subTab?: 'focus' | 'study';
  onChangeSubTab?: (sub: 'focus' | 'study') => void;
  onRefreshAll: () => Promise<void>;
}

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function EnfoqueTab({
  settings,
  focusState,
  tasks = [],
  habits = [],
  activeCompanion = 'nuko',
  companions = null,
  onSelectCompanion,
  progression = null,
  accessoryCatalog = [],
  guardianConfig = null,
  guardianRuntime = null,
  studyDocs = [],
  studyDecodeStatus = null,
  focusAssistant = null,
  dueStudyReviews = [],
  ambientSoundId = 'off',
  ambientVolume = 0.35,
  ambientIsPlaying = false,
  ambientAutoSync = true,
  onChangeAmbientSound,
  onChangeAmbientVolume,
  onToggleAmbientAutoSync,
  subTab,
  onChangeSubTab,
  onRefreshAll,
}: EnfoqueTabProps) {
  const [localSubTab, setLocalSubTab] = useState<'focus' | 'study'>(subTab ?? 'focus');
  const activeSubTab = subTab ?? localSubTab;
  const switchSubTab = (next: 'focus' | 'study') => {
    setLocalSubTab(next);
    onChangeSubTab?.(next);
  };

  const [label, setLabel] = useState(focusState?.label ?? 'Trabajo profundo');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [parkingInput, setParkingInput] = useState('');
  const [showBreakCoachManual, setShowBreakCoachManual] = useState(false);
  const [keywordsText, setKeywordsText] = useState('');
  const [guardianSavedMsg, setGuardianSavedMsg] = useState<string | null>(null);
  const [guardianAlertMsg, setGuardianAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    if (focusState?.label) {
      setLabel(focusState.label);
    }
  }, [focusState?.label]);

  useEffect(() => {
    if (!guardianConfig) return;
    const arr =
      guardianConfig.mode === 'whitelist'
        ? guardianConfig.allowedKeywords
        : guardianConfig.distractionKeywords;
    setKeywordsText(arr.join(', '));
  }, [guardianConfig]);

  const defaultSec = (settings?.focusMinutes ?? 25) * 60;
  const breakSec = (settings?.breakMinutes ?? 5) * 60;
  const readyForBreak = Boolean(focusState?.readyForBreak);
  const status = focusState?.status ?? 'idle';
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  const phase = focusState?.phase ?? (readyForBreak ? 'break' : 'focus');
  const remainingSec =
    isActive || isPaused
      ? focusState?.remainingSec ?? defaultSec
      : readyForBreak
      ? breakSec
      : defaultSec;
  const totalPhaseSec =
    isActive || isPaused
      ? focusState?.durationSec ?? defaultSec
      : readyForBreak
      ? breakSec
      : defaultSec;

  const cycleIndex = focusState?.cycleIndex ?? 1;
  const completedToday = focusState?.completedBlocksToday ?? 0;
  const minutesToday = focusState?.totalMinutesToday ?? 0;
  const weeklyStats = focusState?.weeklyStats ?? [
    { day: 'S', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'D', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'L', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'M', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'X', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'J', dateYmd: '', blocks: 0, minutes: 0 },
    { day: 'V', dateYmd: '', blocks: 0, minutes: 0 },
  ];

  const handleStart = async () => {
    await apiClient.startFocus({
      label: label.trim() || 'Enfoque',
      durationSec: readyForBreak ? breakSec : defaultSec,
      breakSec,
      phase: readyForBreak ? 'break' : 'focus',
    });
    await onRefreshAll();
  };

  const handlePause = async () => {
    await apiClient.pauseFocus();
    await onRefreshAll();
  };

  const handleResume = async () => {
    await apiClient.resumeFocus();
    await onRefreshAll();
  };

  const handleExtend = async () => {
    await apiClient.extendFocus(5);
    await onRefreshAll();
  };

  const handleFinish = async () => {
    await apiClient.finishFocus();
    await onRefreshAll();
  };

  const handleStop = async () => {
    await apiClient.stopFocus();
    await onRefreshAll();
  };

  const handleEquipAccessory = async (id: TrokoAccessoryId) => {
    try {
      await apiClient.equipAccessory(id);
      await onRefreshAll();
    } catch {
      // Locked accessory
    }
  };

  const handleSaveKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardianConfig) return;
    const list = keywordsText
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    await apiClient.patchGuardian(
      guardianConfig.mode === 'whitelist'
        ? { allowedKeywords: list }
        : { distractionKeywords: list }
    );
    setGuardianSavedMsg('Reglas actualizadas');
    window.setTimeout(() => setGuardianSavedMsg(null), 2000);
    await onRefreshAll();
  };

  const handleTestGuardian = async () => {
    const res = await apiClient.testGuardianAlert();
    setGuardianAlertMsg(res.message);
    await onRefreshAll();
  };

  const handleStartPreset = async (presetId: FocusPresetId) => {
    const res = await apiClient.startFocusPreset(presetId, {
      label: label.trim() || undefined,
      taskId: selectedTaskId || null,
    });
    onChangeAmbientSound?.(res.preset.soundId);
    await onRefreshAll();
  };

  const handleAddParking = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = parkingInput.trim();
    if (!text) return;
    await apiClient.addParkingLotItem(text);
    setParkingInput('');
    await onRefreshAll();
  };

  const handlePromoteParking = async (id: string) => {
    await apiClient.promoteParkingLotItem(id);
    await onRefreshAll();
  };

  const handleDeleteParking = async (id: string) => {
    await apiClient.deleteParkingLotItem(id);
    await onRefreshAll();
  };

  const pendingTasks = tasks.filter((t) => !t.completed);
  const progressRatio = Math.max(
    0,
    Math.min(1, remainingSec / Math.max(1, totalPhaseSec))
  );
  const circumference = 2 * Math.PI * 38;
  const dashOffset = circumference * (1 - progressRatio);
  const activeLabel = focusState?.label || label;

  return (
    <section
      className="view"
      data-testid="view-enfoque"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <header className="vhead">
        <div>
          <span className="eyebrow">
            Pomodoro · {settings?.focusMinutes ?? 25}m / {settings?.breakMinutes ?? 5}m
          </span>
          <h2>Modo Enfoque y Estudio</h2>
        </div>
        <div
          data-testid="focus-cycle-dots"
          aria-label={`Ciclo ${cycleIndex} de 4`}
          style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
        >
          {[1, 2, 3, 4].map((idx) => {
            const filled = idx <= cycleIndex;
            return (
              <span
                key={idx}
                data-testid="focus-cycle-dot"
                data-cycle={idx}
                data-active={String(filled)}
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '999px',
                  background: filled ? '#B6F23A' : 'rgba(255,255,255,0.16)',
                }}
              />
            );
          })}
        </div>
      </header>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="subtab-focus"
          className={activeSubTab === 'focus' ? 'btn-lime' : 'btn-ghost'}
          style={{ fontSize: '12px', padding: '6px 11px' }}
          onClick={() => switchSubTab('focus')}
        >
          <Shield size={13} />
          <span>Enfoque & Guardián</span>
        </button>
        <button
          type="button"
          data-testid="subtab-study"
          className={activeSubTab === 'study' ? 'btn-lime' : 'btn-ghost'}
          style={{ fontSize: '12px', padding: '6px 11px' }}
          onClick={() => switchSubTab('study')}
        >
          <BookOpen size={13} />
          <span>
            Estudio PDF & Bloques{studyDocs.length > 0 ? ` (${studyDocs.length})` : ''}
            {dueStudyReviews.length > 0 ? ` · ${dueStudyReviews.length} repaso` : ''}
          </span>
        </button>
      </div>

      {activeSubTab === 'study' ? (
        <StudyDecoderView
          studyDocs={studyDocs}
          decodeStatus={studyDecodeStatus}
          dueStudyReviews={dueStudyReviews}
          onRefreshAll={onRefreshAll}
          onSwitchToFocus={() => switchSubTab('focus')}
        />
      ) : (
        <>
          {/* 1-Click Focus Presets + Intention Anchor */}
          {focusAssistant && (
            <section
              className="card"
              data-testid="focus-presets-card"
              style={{ display: 'grid', gap: '8px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '12.5px', color: 'var(--cream)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={13} color="#B6F23A" /> Perfiles de enfoque (1 clic)
                </strong>
                {focusAssistant.activeIntention && (
                  <span style={{ fontSize: '11px', color: '#B6F23A' }}>
                    Meta: {focusAssistant.activeIntention.label.slice(0, 26)}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px' }}>
                {focusAssistant.presets.map((preset) => {
                  const selected = focusAssistant.activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`preset-btn-${preset.id}`}
                      onClick={() => void handleStartPreset(preset.id)}
                      className={selected ? 'btn-lime' : 'btn-ghost'}
                      style={{
                        textAlign: 'left',
                        padding: '7px 9px',
                        borderRadius: '11px',
                        display: 'grid',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', fontWeight: 700 }}>{preset.name}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>
                        {preset.focusMinutes}/{preset.breakMinutes}m · {preset.guardianMode === 'whitelist' ? 'Solo estudio' : 'Lista negra'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {pendingTasks.length > 0 && (
                <select
                  aria-label="Vincular tarea como intención"
                  className="input"
                  value={selectedTaskId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTaskId(id);
                    const found = pendingTasks.find((t) => t.id === id);
                    if (found) setLabel(found.title);
                  }}
                  style={{ fontSize: '11.5px', padding: '5px 8px' }}
                >
                  <option value="">Elegir meta desde tus tareas pendientes ({pendingTasks.length})...</option>
                  {pendingTasks.slice(0, 8).map((t) => (
                    <option key={t.id} value={t.id}>
                      ✓ {t.title}
                    </option>
                  ))}
                </select>
              )}
            </section>
          )}

          {/* Due Spaced Repetition Nudge */}
          {dueStudyReviews.length > 0 && (
            <div
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 12px',
                border: '1px solid rgba(182, 242, 58, 0.35)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--cream)' }}>
                <Sparkles size={13} color="#B6F23A" style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                Tenés <strong>{dueStudyReviews.length}</strong> bloque(s) PDF para repasar hoy.
              </span>
              <button
                type="button"
                className="btn-lime"
                style={{ fontSize: '11px', padding: '4px 9px' }}
                onClick={() => switchSubTab('study')}
              >
                Repasar ahora
              </button>
            </div>
          )}

          {/* Active Guided Break Coach */}
          {(phase === 'break' || phase === 'long_break' || readyForBreak || showBreakCoachManual) && (
            <BreakCoachCard habits={habits} onRefreshAll={onRefreshAll} />
          )}
          <div className="card" style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              <FocusScene phase={phase} isActive={isActive} />

              <div
                data-testid="focus-ring"
                style={{
                  position: 'relative',
                  width: '92px',
                  height: '92px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="92" height="92" viewBox="0 0 92 92">
                  <circle
                    cx="46"
                    cy="46"
                    r="38"
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="46"
                    cy="46"
                    r="38"
                    fill="none"
                    stroke={phase === 'break' ? '#58B2FF' : '#B6F23A'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 46 46)"
                  />
                </svg>
                <div
                  className="mono"
                  data-testid="focus-timer-display"
                  style={{
                    position: 'absolute',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: isActive ? '#B6F23A' : '#F5F5F7',
                  }}
                >
                  {formatMMSS(remainingSec)}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: phase === 'break' ? '#58B2FF' : '#F2EBD9',
                marginBottom: '6px',
              }}
            >
              {phase === 'break' || readyForBreak
                ? `Descanso · ${formatMMSS(breakSec)} (${activeLabel})`
                : `Tarea actual: ${activeLabel}`}
            </div>

            <div style={{ maxWidth: '280px', margin: '0 auto 10px' }}>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="¿En qué te vas a enfocar? (ej. informe)"
                aria-label="Etiqueta de enfoque"
                data-testid="focus-label-input"
                className="input"
                style={{ textAlign: 'center', width: '100%' }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {!isActive && !isPaused && (
                <button
                  type="button"
                  data-testid="focus-start-btn"
                  className="btn-lime"
                  onClick={() => void handleStart()}
                >
                  <Play size={14} />
                  <span>{readyForBreak ? 'Empezar descanso' : 'Empezar'}</span>
                </button>
              )}

              {isActive && (
                <button
                  type="button"
                  data-testid="focus-pause-btn"
                  className="btn-ghost"
                  onClick={() => void handlePause()}
                >
                  <Pause size={14} />
                  <span>Pausar</span>
                </button>
              )}

              {isPaused && (
                <button
                  type="button"
                  data-testid="focus-resume-btn"
                  className="btn-lime"
                  onClick={() => void handleResume()}
                >
                  <Play size={14} />
                  <span>Reanudar</span>
                </button>
              )}

              {(isActive || isPaused) && (
                <>
                  <button
                    type="button"
                    data-testid="focus-extend-btn"
                    className="btn-ghost"
                    onClick={() => void handleExtend()}
                  >
                    <Plus size={14} />
                    <span>+5 min</span>
                  </button>

                  <button
                    type="button"
                    data-testid="focus-finish-btn"
                    className="btn-ghost"
                    onClick={() => void handleFinish()}
                  >
                    <Check size={14} />
                    <span>Terminar</span>
                  </button>

                  <button
                    type="button"
                    data-testid="focus-stop-btn"
                    className="btn-ghost"
                    onClick={() => void handleStop()}
                  >
                    <Square size={13} />
                    <span>Detener</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Weekly 7-Day Bar Chart */}
          <section className="card" data-testid="focus-weekly-chart">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '13px' }}>
                Resumen semanal (S D L M X J V)
              </span>
              <span className="sub mono" data-testid="focus-stats-summary">
                HOY: {completedToday} {completedToday === 1 ? 'bloque' : 'bloques'} ·{' '}
                {minutesToday} min
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '8px',
                alignItems: 'end',
                height: '64px',
                paddingTop: '8px',
              }}
            >
              {weeklyStats.map((day, idx) => {
                const barHeight = Math.max(8, Math.min(44, day.blocks * 14));
                return (
                  <div
                    key={`${day.day}-${idx}`}
                    data-testid="focus-day-bar"
                    data-day={day.day}
                    data-blocks={day.blocks}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '24px',
                        height: `${barHeight}px`,
                        borderRadius: '6px',
                        background:
                          day.blocks > 0 ? '#B6F23A' : 'rgba(255,255,255,0.08)',
                        transition: 'height 150ms ease',
                      }}
                    />
                    <span className="sub mono" style={{ fontSize: '11px' }}>
                      {day.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Progression, Dual Companions (Nuko & Luma) & Unlockable Accessories */}
          {progression && (
            <section className="card" data-testid="progression-card">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px',
                  marginBottom: '10px',
                }}
              >
                <button
                  type="button"
                  data-testid="enfoque-companion-nuko"
                  className={activeCompanion === 'nuko' ? 'btn-lime' : 'btn-ghost'}
                  onClick={() => void onSelectCompanion?.('nuko')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 9px',
                    borderRadius: '12px',
                    textAlign: 'left',
                  }}
                >
                  <TrokoAvatar
                    size="sm"
                    mood="contento"
                    state="idle"
                    companion="nuko"
                    accessory={companions?.nuko.equippedAccessory ?? 'none'}
                  />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>Nuko · Búho</div>
                    <div className="mono" style={{ fontSize: '10px', opacity: 0.85 }}>
                      Nv.{companions?.nuko.level ?? (activeCompanion === 'nuko' ? progression.level : 1)} ·{' '}
                      {companions?.nuko.xp ?? (activeCompanion === 'nuko' ? progression.xp : 0)} XP
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="enfoque-companion-luma"
                  className={activeCompanion === 'luma' ? 'btn-lime' : 'btn-ghost'}
                  onClick={() => void onSelectCompanion?.('luma')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 9px',
                    borderRadius: '12px',
                    textAlign: 'left',
                  }}
                >
                  <TrokoAvatar
                    size="sm"
                    mood="contento"
                    state="idle"
                    companion="luma"
                    accessory={companions?.luma.equippedAccessory ?? 'none'}
                  />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>Luma · Luciérnaga</div>
                    <div className="mono" style={{ fontSize: '10px', opacity: 0.85 }}>
                      Nv.{companions?.luma.level ?? (activeCompanion === 'luma' ? progression.level : 1)} ·{' '}
                      {companions?.luma.xp ?? (activeCompanion === 'luma' ? progression.xp : 0)} XP
                    </div>
                  </div>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={15} color="#B6F23A" />
                  <strong style={{ fontSize: '13px', color: 'var(--cream)' }}>
                    {activeCompanion === 'luma' ? 'Luma' : 'Nuko'} · Nivel {progression.level} ·{' '}
                    {progression.levelTitle}
                  </strong>
                </div>
                <span className="sub mono" data-testid="progression-xp-label">
                  {progression.xp} XP · Combo limpio: {progression.focusStreakBlocks}
                </span>
              </div>

              <div
                style={{
                  height: '6px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(4, progression.progressPct)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #8B5CF6, #B6F23A)',
                  }}
                />
              </div>

              <div className="sub" style={{ fontSize: '11px', marginBottom: '8px' }}>
                {progression.xpIntoLevel}/{progression.xpForNextLevel} XP para el siguiente nivel de{' '}
                {activeCompanion === 'luma' ? 'Luma' : 'Nuko'}
                {progression.lastRewardReason ? ` · Último: ${progression.lastRewardReason}` : ''}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {accessoryCatalog.map((item) => {
                  const equipped = progression.equippedAccessory === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`accessory-btn-${item.id}`}
                      disabled={!item.unlocked}
                      title={item.description}
                      className={equipped ? 'btn-lime' : 'btn-ghost'}
                      onClick={() => void handleEquipAccessory(item.id)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        opacity: item.unlocked ? 1 : 0.52,
                      }}
                    >
                      {!item.unlocked && <Lock size={11} />}
                      <span>
                        {item.name}
                        {!item.unlocked ? ` (Nv.${item.minLevel})` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Anti-Distraction Focus Guardian */}
          {guardianConfig && (
            <section
              className="card"
              data-testid="guardian-card"
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={15} color={guardianConfig.enabled ? '#B6F23A' : '#8E8E93'} />
                  <strong style={{ fontSize: '13px', color: 'var(--cream)' }}>
                    Guardián Real de Enfoque
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    data-testid="guardian-toggle-btn"
                    className={guardianConfig.enabled ? 'btn-lime' : 'btn-ghost'}
                    style={{ fontSize: '11px', padding: '4px 9px' }}
                    onClick={async () => {
                      await apiClient.patchGuardian({ enabled: !guardianConfig.enabled });
                      await onRefreshAll();
                    }}
                  >
                    {guardianConfig.enabled ? 'Activo' : 'Pausado'}
                  </button>
                  <button
                    type="button"
                    data-testid="guardian-test-btn"
                    className="btn-ghost"
                    style={{ fontSize: '11px', padding: '4px 9px' }}
                    onClick={() => void handleTestGuardian()}
                  >
                    Probar alerta
                  </button>
                </div>
              </div>

              <p className="sub" style={{ margin: 0, fontSize: '11.5px' }}>
                Vigila en tiempo real si te desvías a apps o páginas distractoras durante el Pomodoro y cuida tu racha limpia.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className={guardianConfig.mode === 'blacklist' ? 'btn-lime' : 'btn-ghost'}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={async () => {
                    await apiClient.patchGuardian({ mode: 'blacklist' });
                    await onRefreshAll();
                  }}
                >
                  Lista negra (bloquear)
                </button>
                <button
                  type="button"
                  className={guardianConfig.mode === 'whitelist' ? 'btn-lime' : 'btn-ghost'}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={async () => {
                    await apiClient.patchGuardian({ mode: 'whitelist' });
                    await onRefreshAll();
                  }}
                >
                  Solo estudio (permitidos)
                </button>
                <select
                  aria-label="Gracia en segundos"
                  className="input"
                  value={guardianConfig.graceSec}
                  onChange={async (e) => {
                    await apiClient.patchGuardian({ graceSec: Number(e.target.value) });
                    await onRefreshAll();
                  }}
                  style={{ fontSize: '11px', padding: '4px 7px', width: 'auto' }}
                >
                  <option value={5}>Aviso rápido (5s)</option>
                  <option value={12}>Gracia normal (12s)</option>
                  <option value={25}>Gracia larga (25s)</option>
                </select>
              </div>

              <form
                onSubmit={(e) => void handleSaveKeywords(e)}
                style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
              >
                <input
                  type="text"
                  className="input"
                  data-testid="guardian-keywords-input"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="Palabras clave separadas por coma..."
                  style={{ flex: 1, fontSize: '11.5px' }}
                />
                <button
                  type="submit"
                  className="btn-ghost"
                  data-testid="guardian-save-btn"
                  style={{ fontSize: '11px', padding: '5px 9px' }}
                >
                  Guardar
                </button>
              </form>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#8E8E93',
                }}
              >
                <span>
                  Distracciones en sesión: {guardianRuntime?.sessionDistractions ?? 0}
                  {guardianRuntime?.lastDetectedTitle
                    ? ` · Última ventana: ${guardianRuntime.lastDetectedTitle.slice(0, 32)}`
                    : ''}
                </span>
                {guardianSavedMsg && <span style={{ color: '#B6F23A' }}>{guardianSavedMsg}</span>}
              </div>

              {guardianAlertMsg && (
                <div
                  data-testid="guardian-alert-banner"
                  style={{
                    fontSize: '11.5px',
                    padding: '6px 9px',
                    borderRadius: '8px',
                    background: 'rgba(255, 90, 95, 0.14)',
                    border: '1px solid rgba(255, 90, 95, 0.35)',
                    color: '#FF9EA1',
                  }}
                >
                  {guardianAlertMsg}
                </div>
              )}
            </section>
          )}

          {/* Offline Ambient Soundscapes + Notification Shield */}
          <section
            className="card"
            data-testid="ambient-shield-card"
            style={{ display: 'grid', gap: '10px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '12.5px', color: 'var(--cream)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {ambientIsPlaying ? <Volume2 size={14} color="#B6F23A" /> : <VolumeX size={14} color="#8E8E93" />}
                Paisajes sonoros offline (Web Audio)
              </strong>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => setShowBreakCoachManual((v) => !v)}
              >
                {showBreakCoachManual ? 'Ocultar pausa activa' : 'Probar pausa activa'}
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(
                [
                  { id: 'off', label: 'Silencio' },
                  { id: 'brown', label: 'Ruido marrón' },
                  { id: 'rain', label: 'Lluvia suave' },
                  { id: 'binaural40', label: 'Gamma 40 Hz' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`sound-btn-${opt.id}`}
                  className={ambientSoundId === opt.id ? 'btn-lime' : 'btn-ghost'}
                  style={{ fontSize: '11px', padding: '4px 9px' }}
                  onClick={() => onChangeAmbientSound?.(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                Volumen
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={ambientVolume}
                  onChange={(e) => onChangeAmbientVolume?.(Number(e.target.value))}
                  style={{ width: '90px', accentColor: '#B6F23A' }}
                />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ambientAutoSync}
                  onChange={(e) => onToggleAmbientAutoSync?.(e.target.checked)}
                />
                Solo sonar en Pomodoro
              </label>
            </div>

            {focusAssistant && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--line)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '11.5px', color: 'var(--cream)' }}>
                  <Shield size={12} color="#58B2FF" style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                  <strong>Escudo de avisos:</strong>{' '}
                  {focusAssistant.shieldEnabled ? 'Retiene recordatorios en foco' : 'Desactivado'}
                  {focusAssistant.shieldedQueue.length > 0 && (
                    <span style={{ color: '#58B2FF', marginLeft: '6px' }}>
                      ({focusAssistant.shieldedQueue.length} retenido(s))
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {focusAssistant.shieldedQueue.length > 0 && (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: '10.5px', padding: '4px 8px' }}
                      onClick={async () => {
                        await apiClient.flushFocusShield();
                        await onRefreshAll();
                      }}
                    >
                      Entregar ahora
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="shield-toggle-btn"
                    className={focusAssistant.shieldEnabled ? 'btn-lime' : 'btn-ghost'}
                    style={{ fontSize: '10.5px', padding: '4px 9px' }}
                    onClick={async () => {
                      await apiClient.setFocusShield(!focusAssistant.shieldEnabled);
                      await onRefreshAll();
                    }}
                  >
                    {focusAssistant.shieldEnabled ? 'Activo' : 'Activar'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Mental Parking Lot */}
          {focusAssistant && (
            <section
              className="card"
              data-testid="parking-lot-card"
              style={{ display: 'grid', gap: '8px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '12.5px', color: 'var(--cream)' }}>
                  Parking Lot mental ({focusAssistant.parkingLot.length})
                </strong>
                <span className="sub" style={{ fontSize: '10.5px' }}>
                  Estacioná ideas sin perder el foco
                </span>
              </div>

              <form onSubmit={(e) => void handleAddParking(e)} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  className="input"
                  data-testid="parking-lot-input"
                  value={parkingInput}
                  onChange={(e) => setParkingInput(e.target.value)}
                  placeholder="Ej: Responder mail a Juan después del bloque..."
                  style={{ flex: 1, fontSize: '11.5px' }}
                />
                <button
                  type="submit"
                  className="btn-lime"
                  data-testid="parking-lot-add-btn"
                  style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Send size={11} /> Estacionar
                </button>
              </form>

              {focusAssistant.parkingLot.length > 0 && (
                <div style={{ display: 'grid', gap: '5px' }}>
                  {focusAssistant.parkingLot.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        borderRadius: '9px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11.5px',
                          color: item.promotedTaskId ? '#8E8E93' : 'var(--cream)',
                          textDecoration: item.promotedTaskId ? 'line-through' : 'none',
                        }}
                      >
                        {item.text}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {!item.promotedTaskId && (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ fontSize: '10.5px', padding: '3px 7px', color: '#B6F23A' }}
                            onClick={() => void handlePromoteParking(item.id)}
                          >
                            → Tarea
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label="Eliminar del Parking Lot"
                          style={{ fontSize: '10.5px', padding: '3px 6px' }}
                          onClick={() => void handleDeleteParking(item.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Focus Insights (Radiografía de Enfoque) */}
          {focusAssistant && (
            <section
              className="card"
              data-testid="focus-insights-card"
              style={{ display: 'grid', gap: '8px' }}
            >
              <strong style={{ fontSize: '12.5px', color: 'var(--cream)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <BarChart3 size={14} color="#58B2FF" /> Radiografía de enfoque
              </strong>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <div style={{ padding: '7px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Mejor franja</div>
                  <strong style={{ fontSize: '12.5px', color: '#B6F23A' }}>
                    {focusAssistant.insights.bestTimeSlot}
                  </strong>
                </div>
                <div style={{ padding: '7px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Bloques limpios</div>
                  <strong className="mono" style={{ fontSize: '12.5px', color: 'var(--cream)' }}>
                    {focusAssistant.insights.cleanBlocksPct}%
                  </strong>
                </div>
                <div style={{ padding: '7px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Minutos totales</div>
                  <strong className="mono" style={{ fontSize: '12.5px', color: '#58B2FF' }}>
                    {focusAssistant.insights.totalFocusMinutes}m
                  </strong>
                </div>
              </div>

              {focusAssistant.insights.topDistractions.length > 0 ? (
                <div style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Principales distracciones detectadas por el Guardián:
                  </span>
                  {focusAssistant.insights.topDistractions.slice(0, 3).map((d) => (
                    <div
                      key={d.label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: 'rgba(255, 90, 95, 0.08)',
                        color: '#FFB4B6',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label}
                      </span>
                      <span className="mono" style={{ flexShrink: 0 }}>
                        {d.count}× · {d.totalSec}s
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="sub" style={{ fontSize: '11px' }}>
                  Sin distracciones registradas todavía. ¡Seguí cuidando tu racha limpia!
                </span>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
