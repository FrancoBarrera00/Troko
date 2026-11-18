import { Check, Pause, Play, Plus, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, SummarySnapshot } from '../../../../shared/types.ts';
import { apiClient, type FocusStateResponse } from '../../api/client.ts';
import { FocusScene } from '../TrokoAvatar/FocusScene.tsx';

export interface EnfoqueTabProps {
  settings: AppSettings | null;
  summary: SummarySnapshot | null;
  focusState: FocusStateResponse | null;
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
  onRefreshAll,
}: EnfoqueTabProps) {
  const [label, setLabel] = useState(focusState?.label ?? 'Trabajo profundo');

  useEffect(() => {
    if (focusState?.label) {
      setLabel(focusState.label);
    }
  }, [focusState?.label]);

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
          <h2>Modo Enfoque</h2>
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
    </section>
  );
}
