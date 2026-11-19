import { Droplets, Eye, Play, RotateCcw, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient, type HabitWithProgress } from '../../api/client.ts';
import { TrokoAvatar } from '../TrokoAvatar/TrokoAvatar.tsx';

export interface BreakCoachCardProps {
  habits: HabitWithProgress[];
  onRefreshAll: () => Promise<void>;
}

type RitualId = 'breathe' | 'eyes20' | 'hydrate';

const BREATHE_PHASES = [
  { label: 'Inhala despacio', sec: 4, scale: 1.14 },
  { label: 'Sostén el aire', sec: 4, scale: 1.14 },
  { label: 'Exhala suave', sec: 4, scale: 0.94 },
] as const;

export function BreakCoachCard({ habits, onRefreshAll }: BreakCoachCardProps) {
  const [ritual, setRitual] = useState<RitualId>('breathe');
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [hydratedMsg, setHydratedMsg] = useState<string | null>(null);

  const totalSec = ritual === 'eyes20' ? 20 : 60;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => {
        if (prev + 1 >= totalSec) {
          setRunning(false);
          return totalSec;
        }
        return prev + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, totalSec]);

  const cyclePos = elapsedSec % 12;
  const phaseIdx = cyclePos < 4 ? 0 : cyclePos < 8 ? 1 : 2;
  const currentBreathe = BREATHE_PHASES[phaseIdx]!;
  const phaseSecLeft = 4 - (cyclePos % 4);
  const remainingSec = Math.max(0, totalSec - elapsedSec);

  const primaryHabit =
    habits.find((h) => /agua|hidrat|estir|respir/i.test(h.name)) ?? habits[0] ?? null;

  const handleLogHabit = async () => {
    if (!primaryHabit) return;
    await apiClient.incrementHabit(primaryHabit.id);
    setHydratedMsg(`+1 registrado en «${primaryHabit.name}»`);
    await onRefreshAll();
    window.setTimeout(() => setHydratedMsg(null), 2600);
  };

  return (
    <div
      className="card"
      data-testid="break-coach-card"
      style={{
        display: 'grid',
        gap: '10px',
        padding: '12px',
        border: '1px solid rgba(182, 242, 58, 0.35)',
        background: 'rgba(182, 242, 58, 0.05)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '13px', color: 'var(--cream)' }}>
          Descanso activo guiado por Troko
        </strong>
        <span className="mono" style={{ fontSize: '11px', color: 'var(--lime)' }}>
          {remainingSec}s
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button
          type="button"
          className={ritual === 'breathe' ? 'btn-lime' : 'btn-ghost'}
          onClick={() => {
            setRitual('breathe');
            setRunning(false);
            setElapsedSec(0);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '5px 10px' }}
        >
          <Wind size={12} /> Respiración 4-4-4
        </button>
        <button
          type="button"
          className={ritual === 'eyes20' ? 'btn-lime' : 'btn-ghost'}
          onClick={() => {
            setRitual('eyes20');
            setRunning(false);
            setElapsedSec(0);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '5px 10px' }}
        >
          <Eye size={12} /> Regla 20-20-20
        </button>
        <button
          type="button"
          className={ritual === 'hydrate' ? 'btn-lime' : 'btn-ghost'}
          onClick={() => {
            setRitual('hydrate');
            setRunning(false);
            setElapsedSec(0);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '5px 10px' }}
        >
          <Droplets size={12} /> Hidratar / Estirar
        </button>
      </div>

      {ritual === 'breathe' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              transition: 'transform 1.1s ease-in-out',
              transform: running ? `scale(${currentBreathe.scale})` : 'scale(1)',
            }}
          >
            <TrokoAvatar size="lg" mood={running ? 'animo' : 'contento'} state="idle" />
          </div>
          <div style={{ display: 'grid', gap: '6px', flex: 1 }}>
            <strong style={{ fontSize: '13px', color: 'var(--cream)' }}>
              {running ? `${currentBreathe.label} (${phaseSecLeft}s)` : 'Respiración cuadrada 4-4-4 (1 min)'}
            </strong>
            <span className="sub" style={{ fontSize: '11px' }}>
              Baja pulsaciones y oxigena el cerebro antes del siguiente bloque.
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn-lime"
                onClick={() => {
                  if (elapsedSec >= totalSec) setElapsedSec(0);
                  setRunning((prev) => !prev);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}
              >
                <Play size={12} /> {running ? 'Pausar' : 'Iniciar 60s'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setRunning(false);
                  setElapsedSec(0);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}
              >
                <RotateCcw size={12} /> Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {ritual === 'eyes20' && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <p className="sub" style={{ margin: 0, fontSize: '12px' }}>
            Mirá un punto fijo a más de 6 metros durante 20 segundos para relajar la vista de la pantalla.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-lime"
              onClick={() => {
                setElapsedSec(0);
                setRunning(true);
              }}
              style={{ fontSize: '11px' }}
            >
              {running ? `Mirando lejos… ${remainingSec}s` : 'Empezar 20s'}
            </button>
            {elapsedSec >= totalSec && (
              <span style={{ fontSize: '12px', color: 'var(--lime)' }}>¡Vista descansada!</span>
            )}
          </div>
        </div>
      )}

      {ritual === 'hydrate' && (
        <div style={{ display: 'grid', gap: '8px' }}>
          <p className="sub" style={{ margin: 0, fontSize: '12px' }}>
            Levantate, estirá hombros y cuello, y registrá tu hábito directamente desde acá:
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {primaryHabit ? (
              <button
                type="button"
                className="btn-lime"
                onClick={() => void handleLogHabit()}
                style={{ fontSize: '11px' }}
              >
                +1 {primaryHabit.name} ({primaryHabit.todayProgress}/{primaryHabit.dailyGoal})
              </button>
            ) : (
              <span className="sub" style={{ fontSize: '11px' }}>
                Creá un hábito en la pestaña Hábitos para conectarlo aquí.
              </span>
            )}
            {hydratedMsg && (
              <span style={{ fontSize: '11px', color: 'var(--lime)' }}>{hydratedMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
