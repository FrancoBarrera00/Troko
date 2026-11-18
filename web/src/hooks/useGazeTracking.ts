import { useEffect, useRef, useState } from 'react';
import type { IslandState } from '../../../shared/types.ts';

interface UseGazeTrackingOptions {
  islandRef: React.RefObject<HTMLElement | null>;
  sleepTimeoutSec: number;
  currentState: IslandState;
  onAutoSleep: () => void;
  onAutoWake?: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isReducedMotionActive(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useGazeTracking({
  islandRef,
  sleepTimeoutSec,
  currentState,
  onAutoSleep,
  onAutoWake,
}: UseGazeTrackingOptions) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    isReducedMotionActive()
  );

  const targetRef = useRef({ gx: 0, gy: 0 });
  const currentRef = useRef({ gx: 0, gy: 0 });
  const lastMoveRef = useRef<number>(Date.now());
  const autoSleptRef = useRef<boolean>(false);
  const glanceStepRef = useRef<number>(0);

  const applyCssVars = (gx: number, gy: number) => {
    const gxStr = `${gx.toFixed(2)}px`;
    const gyStr = `${gy.toFixed(2)}px`;
    const el = islandRef.current ?? document.getElementById('island');
    if (el) {
      el.style.setProperty('--gx', gxStr);
      el.style.setProperty('--gy', gyStr);
    }
    const avatarEl = document.querySelector<HTMLElement>('[data-testid="troko-avatar"]');
    if (avatarEl) {
      avatarEl.style.setProperty('--gx', gxStr);
      avatarEl.style.setProperty('--gy', gyStr);
    }
    document.documentElement.style.setProperty('--gx', gxStr);
    document.documentElement.style.setProperty('--gy', gyStr);
  };

  useEffect(() => {
    const el = islandRef.current ?? document.getElementById('island');
    if (el) {
      el.setAttribute('data-blinking', isBlinking ? 'true' : 'false');
    }
  }, [isBlinking, islandRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (currentState !== 'sleep') {
      autoSleptRef.current = false;
    }
  }, [currentState]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      lastMoveRef.current = Date.now();
      if (autoSleptRef.current || currentState === 'sleep') {
        autoSleptRef.current = false;
        onAutoWake?.();
      }
      const el = islandRef.current ?? document.getElementById('island');
      const rect = el?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const cy = rect ? rect.top + 19 : 25;

      const dx = (e.clientX - cx) / 140;
      const dy = (e.clientY - cy) / 120;

      const gx = clamp(dx * 2.5, -2.5, 2.5);
      const gy = clamp(dy * 2.0, -2.0, 2.0);
      targetRef.current = { gx, gy };

      if (isReducedMotionActive()) {
        currentRef.current = { gx, gy };
        applyCssVars(gx, gy);
      } else {
        // Apply an immediate responsive step so synchronous E2E pointer checks see movement right away
        currentRef.current.gx += (gx - currentRef.current.gx) * 0.45;
        currentRef.current.gy += (gy - currentRef.current.gy) * 0.45;
        applyCssVars(currentRef.current.gx, currentRef.current.gy);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [islandRef, currentState, onAutoWake]);

  // Smooth spring interpolation loop
  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      if (!isReducedMotionActive()) {
        currentRef.current.gx += (targetRef.current.gx - currentRef.current.gx) * 0.18;
        currentRef.current.gy += (targetRef.current.gy - currentRef.current.gy) * 0.18;
        applyCssVars(currentRef.current.gx, currentRef.current.gy);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [islandRef, prefersReducedMotion]);

  // Idle peripheral glances (every 5s of pointer inactivity) & auto-sleep (after sleepTimeoutSec)
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      const idleMs = now - lastMoveRef.current;
      const reduced = isReducedMotionActive();

      if (!reduced && idleMs >= 4800 && currentState !== 'sleep') {
        glanceStepRef.current += 1;
        const dir = glanceStepRef.current % 2 === 1 ? 1 : -1;
        const glanceGx = 1.65 * dir;
        const glanceGy = -0.65 * dir;
        targetRef.current = { gx: glanceGx, gy: glanceGy };
        currentRef.current = { gx: glanceGx, gy: glanceGy };
        applyCssVars(glanceGx, glanceGy);
      }

      if (
        sleepTimeoutSec > 0 &&
        currentState === 'idle' &&
        !autoSleptRef.current &&
        idleMs >= sleepTimeoutSec * 1000
      ) {
        autoSleptRef.current = true;
        onAutoSleep();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentState, sleepTimeoutSec, onAutoSleep]);

  // Natural double/single blink every 3.5s
  useEffect(() => {
    if (prefersReducedMotion || currentState === 'sleep') {
      setIsBlinking(false);
      return;
    }

    let timeoutId: number;
    let innerTimeoutId: number;

    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 800;
      timeoutId = window.setTimeout(() => {
        setIsBlinking(true);
        innerTimeoutId = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 260);
      }, delay);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(innerTimeoutId);
    };
  }, [prefersReducedMotion, currentState]);

  return { isBlinking, prefersReducedMotion };
}
