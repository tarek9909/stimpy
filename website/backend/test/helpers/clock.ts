import { resetClock, setClock } from '../../src/lib/clock';

/**
 * Injectable clock for tests: sessions, holds, drops, rate limits all read `now()` from src/lib/clock.ts.
 * `useTestApp()` calls `resetClock()` before every test, so you never need to clean up.
 */
let current: Date | null = null;

export function freezeTime(at: Date | string | number): Date {
  current = new Date(at);
  setClock(() => new Date(current!));
  return current;
}

export function advanceTime(ms: number): Date {
  if (!current) throw new Error('freezeTime() first');
  current = new Date(current.getTime() + ms);
  return current;
}

export function unfreezeTime(): void {
  current = null;
  resetClock();
}

export { resetClock };
