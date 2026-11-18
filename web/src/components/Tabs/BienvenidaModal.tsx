import { useEffect, useState } from 'react';
import { apiClient, type OnboardingStateResponse } from '../../api/client.ts';
import { TrokoAvatar } from '../TrokoAvatar/TrokoAvatar.tsx';

export interface BienvenidaModalProps {
  open: boolean;
  onCompleted: () => void;
}

export function BienvenidaModal({ open, onCompleted }: BienvenidaModalProps) {
  const [state, setState] = useState<OnboardingStateResponse>({
    ok: true,
    completed: false,
    onboardingCompleted: false,
    modelName: 'Llama 3.2 3B Instruct',
    quantization: 'Q4_K_M',
    sizeLabel: '2,02 GB',
    totalBytes: 2_020_000_000,
    downloadedBytes: 0,
    progressPct: 0,
    status: 'idle',
  });

  useEffect(() => {
    if (!open) return;
    let active = true;
    const poll = () => {
      void apiClient
        .getOnboarding()
        .then((res) => {
          if (active) setState(res);
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 180);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  const handleStart = async () => {
    const res = await apiClient.startModelDownload();
    setState(res);
  };

  const handlePause = async () => {
    const res = await apiClient.pauseModelDownload();
    setState(res);
  };

  const handleResume = async () => {
    const res = await apiClient.resumeModelDownload();
    setState(res);
  };

  const handleSkip = async () => {
    await apiClient.completeOnboarding(true);
    onCompleted();
  };

  const handleComplete = async () => {
    await apiClient.completeOnboarding(false);
    onCompleted();
  };

  const mbDownloaded = (state.downloadedBytes / 1_000_000).toFixed(0);

  return (
    <div
      className="bienvenida-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenida a Troko"
        data-testid="bienvenida-modal"
        style={{
          width: 'min(480px, 94vw)',
          background: '#0E0E10',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '24px',
          padding: '24px',
          color: '#F5F5F7',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <TrokoAvatar size="lg" mood="saludo" state="idle" />
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#B6F23A',
              }}
            >
              Bienvenida · IA Local en tu equipo
            </span>
            <h2 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700 }}>
              Hola, soy Troko
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8E8E93' }}>
              Tu compañero inteligente en la Dynamic Island, 100 % privado y en español.
            </p>
          </div>
        </div>

        <div
          style={{
            background: '#1B1B1F',
            borderRadius: '16px',
            padding: '14px 16px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>
                {state.modelName} ({state.quantization})
              </div>
              <div style={{ fontSize: '12px', color: '#8E8E93' }}>
                Tamaño aproximado: <strong>{state.sizeLabel}</strong> · Inferencia privada
              </div>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: '#B6F23A',
                fontWeight: 600,
              }}
            >
              {state.progressPct}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Progreso de descarga del modelo local"
            aria-valuenow={state.progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="onboarding-progress"
            style={{
              width: '100%',
              height: '8px',
              background: '#151518',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                width: `${state.progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #B6F23A, #2ECC71)',
                transition: 'width 120ms ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#8E8E93',
            }}
          >
            <span>
              Estado:{' '}
              {state.status === 'downloading'
                ? `Descargando (${mbDownloaded} MB / 2,02 GB)`
                : state.status === 'paused'
                ? `En pausa (${state.progressPct}%)`
                : state.status === 'completed'
                ? 'Modelo listo en disco'
                : 'Pendiente de descarga'}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              {state.status === 'idle' && (
                <button
                  type="button"
                  data-testid="onboarding-download-btn"
                  onClick={handleStart}
                  style={{
                    background: '#B6F23A',
                    color: '#0B0B0D',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Descargar
                </button>
              )}

              {state.status === 'downloading' && (
                <button
                  type="button"
                  data-testid="onboarding-pause-btn"
                  onClick={handlePause}
                  style={{
                    background: '#F5A623',
                    color: '#0B0B0D',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Pausar
                </button>
              )}

              {state.status === 'paused' && (
                <button
                  type="button"
                  data-testid="onboarding-resume-btn"
                  onClick={handleResume}
                  style={{
                    background: '#B6F23A',
                    color: '#0B0B0D',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reanudar
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <button
            type="button"
            data-testid="onboarding-skip-btn"
            onClick={handleSkip}
            style={{
              background: 'transparent',
              color: '#8E8E93',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '12px',
              padding: '9px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ahora no (modo ligero)
          </button>

          {state.status === 'completed' && (
            <button
              type="button"
              data-testid="onboarding-complete-btn"
              onClick={handleComplete}
              style={{
                background: '#B6F23A',
                color: '#0B0B0D',
                border: 'none',
                borderRadius: '12px',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Empezar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
