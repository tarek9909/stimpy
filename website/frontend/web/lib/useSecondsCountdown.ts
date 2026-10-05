'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A whole-seconds countdown for `RATE_LIMITED` waits (state-and-errors 5.2): `start(n)` begins counting down from
 * `n`; `remaining` is 0 when idle or finished. Uses wall-clock deadlines so background-tab throttling cannot stretch it.
 */
export function useSecondsCountdown(): { remaining: number; start: (seconds: number) => void; cancel: () => void } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        stop();
        setEndsAt(null);
        setRemaining(0);
      }
    };
    tick();
    timer.current = setInterval(tick, 250);
    return stop;
  }, [endsAt, stop]);

  const start = useCallback((seconds: number) => {
    const whole = Math.max(1, Math.ceil(seconds));
    setRemaining(whole); // visible on the very next render, before the interval ticks
    setEndsAt(Date.now() + whole * 1000);
  }, []);
  const cancel = useCallback(() => {
    setEndsAt(null);
    setRemaining(0);
  }, []);

  return { remaining, start, cancel };
}
