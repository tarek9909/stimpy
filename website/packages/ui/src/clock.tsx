'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeRemainingMs, countdownParts, toEpochMs, type CountdownParts, type ServerClock } from './clockMath';
import { formatCountdown } from './format';
import type { ISODate } from './types';

/* ------------------------------------------------------------------------------------------
 * Server clock (state-and-errors.md section 13 / website-pages 2.2).
 * The UI package does NOT fetch `GET /health`; the app measures the offset and feeds it to
 * <ServerClockProvider>. `serverNow() = Date.now() + offsetMs`.
 * ---------------------------------------------------------------------------------------- */

const ServerClockContext = createContext<ServerClock>({ offsetMs: 0, uncertain: true });

export interface ServerClockProviderProps {
  offsetMs: number;
  uncertain?: boolean;
  children: ReactNode;
}

export function ServerClockProvider({ offsetMs, uncertain = false, children }: ServerClockProviderProps) {
  const value = useMemo(() => ({ offsetMs, uncertain }), [offsetMs, uncertain]);
  return <ServerClockContext.Provider value={value}>{children}</ServerClockContext.Provider>;
}

export function useServerClock(): ServerClock {
  return useContext(ServerClockContext);
}

export interface UseCountdownOptions {
  /** Injected clock for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Stop ticking (for example while the element is off screen). */
  paused?: boolean;
}

export interface CountdownState extends CountdownParts {
  remainingMs: number;
  /** True once the SERVER-adjusted clock has passed the target. The server still decides "live". */
  done: boolean;
  /** `2d 04:12:09`. */
  text: string;
  /** No server sample is available, so the device clock is in use. */
  uncertain: boolean;
}

/**
 * Ticking countdown on the server clock. `offsetMs` overrides the value from <ServerClockProvider>.
 * Re-renders once per second, aligned to the second boundary of the remaining time, and
 * re-syncs when the tab becomes visible again.
 */
export function useCountdown(
  target: ISODate | number | Date,
  offsetMs?: number,
  options: UseCountdownOptions = {},
): CountdownState {
  const clock = useServerClock();
  const offset = offsetMs ?? clock.offsetMs;
  const uncertain = offsetMs === undefined ? clock.uncertain : false;
  const nowFn = options.now ?? Date.now;
  const nowRef = useRef(nowFn);
  nowRef.current = nowFn;
  const targetMs = toEpochMs(target);
  const paused = options.paused ?? false;

  const [remainingMs, setRemainingMs] = useState(() => computeRemainingMs(targetMs, offset, nowFn()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const remaining = computeRemainingMs(targetMs, offset, nowRef.current());
      setRemainingMs(remaining);
      if (remaining <= 0 || paused) return;
      // Wake just after the displayed second changes (ceil-based display): +1 ms so a timer that
      // fires on the boundary never leaves the previous second on screen.
      const untilNextSecond = remaining % 1000 || 1000;
      timer = setTimeout(tick, untilNextSecond + 1);
    };

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer);
        tick();
      }
    };

    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [targetMs, offset, paused]);

  const parts = countdownParts(remainingMs);
  return {
    ...parts,
    remainingMs,
    done: remainingMs <= 0,
    text: formatCountdown(remainingMs),
    uncertain,
  };
}
