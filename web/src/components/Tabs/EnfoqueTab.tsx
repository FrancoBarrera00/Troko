import {
  Award,
  BookOpen,
  Check,
  Lock,
  Pause,
  Play,
  Plus,
  Shield,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AccessoryCatalogItem,
  AppSettings,
  GuardianConfig,
  GuardianRuntimeStatus,
  ProgressionState,
  StudyDecodeProgress,
  StudyDocument,
  SummarySnapshot,
  TrokoAccessoryId,
} from '../../../../shared/types.ts';
import { apiClient, type FocusStateResponse } from '../../api/client.ts';
import { FocusScene } from '../TrokoAvatar/FocusScene.tsx';
import { StudyDecoderView } from './StudyDecoderView.tsx';

export interface EnfoqueTabProps {
  settings: AppSettings | null;
  summary: SummarySnapshot | null;
  focusState: FocusStateResponse | null;
  progression?: ProgressionState | null;
  accessoryCatalog?: AccessoryCatalogItem[];
  guardianConfig?: GuardianConfig | null;
  guardianRuntime?: GuardianRuntimeStatus | null;
  studyDocs?: StudyDocument[];
  studyDecodeStatus?: StudyDecodeProgress | null;
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
  progression = null,
  accessoryCatalog = [],
  guardianConfig = null,
  guardianRuntime = null,
  studyDocs = [],
  studyDecodeStatus = null,
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
      <div style={{ display: 'flex', gap: '6px' }}>
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
          </span>
        </button>
      </div>

      {activeSubTab === 'study' ? (
        <StudyDecoderView
          studyDocs={studyDocs}
          decodeStatus={studyDecodeStatus}
          onRefreshAll={onRefreshAll}
          onSwitchToFocus={() => switchSubTab('focus')}
        />
      ) : (
        <>
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

          {/* Progression & Unlockable Troko Accessories */}
          {progression && (
            <section className="card" data-testid="progression-card">
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
                    Nivel {progression.level} · {progression.levelTitle}
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
                {progression.xpIntoLevel}/{progression.xpForNextLevel} XP para el siguiente nivel
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
        </>
      )}
    </section>
  );
}
