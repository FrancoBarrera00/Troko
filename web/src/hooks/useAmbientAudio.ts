import { useCallback, useEffect, useRef, useState } from 'react';
import type { AmbientSoundId } from '../../../shared/types.ts';

interface ActiveGraph {
  ctx: AudioContext;
  masterGain: GainNode;
  stopNodes: () => void;
}

export interface UseAmbientAudioOptions {
  isFocusRunning: boolean;
  soundEnabled?: boolean;
}

export function useAmbientAudio({
  isFocusRunning,
  soundEnabled = true,
}: UseAmbientAudioOptions) {
  const [soundId, setSoundId] = useState<AmbientSoundId>('off');
  const [volume, setVolume] = useState<number>(0.35);
  const [autoSyncFocus, setAutoSyncFocus] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const graphRef = useRef<ActiveGraph | null>(null);

  const stopGraph = useCallback((immediate = false) => {
    const graph = graphRef.current;
    if (!graph) {
      setIsPlaying(false);
      return;
    }
    graphRef.current = null;
    try {
      const now = graph.ctx.currentTime;
      if (immediate) {
        graph.stopNodes();
        void graph.ctx.close();
      } else {
        graph.masterGain.gain.cancelScheduledValues(now);
        graph.masterGain.gain.setValueAtTime(graph.masterGain.gain.value, now);
        graph.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
        window.setTimeout(() => {
          try {
            graph.stopNodes();
            void graph.ctx.close();
          } catch {
            // ignore
          }
        }, 400);
      }
    } catch {
      // ignore
    }
    setIsPlaying(false);
  }, []);

  const startGraph = useCallback(
    (targetSound: AmbientSoundId, targetVolume: number) => {
      stopGraph(true);
      if (targetSound === 'off' || typeof window === 'undefined') {
        return;
      }

      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      try {
        const ctx = new AudioCtx();
        const masterGain = ctx.createGain();
        const now = ctx.currentTime;
        const clampedVol = Math.min(1, Math.max(0.02, targetVolume));
        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(clampedVol * 0.45, now + 0.6);
        masterGain.connect(ctx.destination);

        const cleanups: Array<() => void> = [];

        if (targetSound === 'brown') {
          const bufferSize = ctx.sampleRate * 3;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          let lastOut = 0;
          for (let i = 0; i < bufferSize; i += 1) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + 0.02 * white) / 1.02;
            data[i] = lastOut * 3.2;
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;

          const lowpass = ctx.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.value = 320;

          src.connect(lowpass);
          lowpass.connect(masterGain);
          src.start();
          cleanups.push(() => {
            try {
              src.stop();
            } catch {
              // ignore
            }
          });
        } else if (targetSound === 'rain') {
          const bufferSize = ctx.sampleRate * 3;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          let b0 = 0;
          let b1 = 0;
          let b2 = 0;
          for (let i = 0; i < bufferSize; i += 1) {
            const white = Math.random() * 2 - 1;
            b0 = 0.997 * b0 + white * 0.029;
            b1 = 0.985 * b1 + white * 0.032;
            b2 = 0.95 * b2 + white * 0.048;
            data[i] = (b0 + b1 + b2 + white * 0.12) * 1.4;
          }

          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;

          const bandpass = ctx.createBiquadFilter();
          bandpass.type = 'bandpass';
          bandpass.frequency.value = 950;
          bandpass.Q.value = 0.55;

          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 0.18;
          lfoGain.gain.value = 180;
          lfo.connect(lfoGain);
          lfoGain.connect(bandpass.frequency);

          src.connect(bandpass);
          bandpass.connect(masterGain);
          src.start();
          lfo.start();
          cleanups.push(() => {
            try {
              src.stop();
              lfo.stop();
            } catch {
              // ignore
            }
          });
        } else if (targetSound === 'binaural40') {
          const oscL = ctx.createOscillator();
          const oscR = ctx.createOscillator();
          oscL.type = 'sine';
          oscR.type = 'sine';
          oscL.frequency.value = 200;
          oscR.frequency.value = 240;

          const merger = ctx.createChannelMerger(2);
          const toneGain = ctx.createGain();
          toneGain.gain.value = 0.35;

          oscL.connect(merger, 0, 0);
          oscR.connect(merger, 0, 1);
          merger.connect(toneGain);
          toneGain.connect(masterGain);

          oscL.start();
          oscR.start();
          cleanups.push(() => {
            try {
              oscL.stop();
              oscR.stop();
            } catch {
              // ignore
            }
          });
        }

        graphRef.current = {
          ctx,
          masterGain,
          stopNodes: () => {
            for (const fn of cleanups) fn();
          },
        };
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    },
    [stopGraph]
  );

  const shouldPlay =
    soundEnabled && soundId !== 'off' && (!autoSyncFocus || isFocusRunning);

  useEffect(() => {
    if (shouldPlay) {
      startGraph(soundId, volume);
    } else {
      stopGraph(false);
    }
  }, [shouldPlay, soundId, startGraph, stopGraph]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      const now = graph.ctx.currentTime;
      const clampedVol = Math.min(1, Math.max(0.02, volume));
      graph.masterGain.gain.cancelScheduledValues(now);
      graph.masterGain.gain.setTargetAtTime(clampedVol * 0.45, now, 0.08);
    } catch {
      // ignore
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      stopGraph(true);
    };
  }, [stopGraph]);

  return {
    soundId,
    setSoundId,
    volume,
    setVolume,
    autoSyncFocus,
    setAutoSyncFocus,
    isPlaying,
  };
}
