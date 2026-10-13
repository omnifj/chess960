import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Runs the optional clock. It ticks four times a second, which is plenty for a mm:ss display and
 * cheap enough to leave running.
 */
export function useClock(enabled: boolean, onFlag: (color: 'white' | 'black') => void): void {
  const flagRef = useRef(onFlag);
  flagRef.current = onFlag;

  useEffect(() => {
    if (!enabled) return;
    const state = useGameStore.getState();
    if (state.clock.baseMs === 0) {
      state.setClock(10, 0, true);
    } else {
      state.resumeClock();
    }
    const interval = setInterval(() => {
      const flag = useGameStore.getState().tickClock();
      if (flag) flagRef.current(flag);
    }, 250);
    const onVisibility = (): void => {
      const store = useGameStore.getState();
      if (document.hidden) store.pauseClock();
      else store.resumeClock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      useGameStore.getState().pauseClock();
    };
  }, [enabled]);
}

/** Format milliseconds as `m:ss` (or `h:mm:ss` past an hour). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.ceil(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
