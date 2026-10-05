/**
 * Countdown hand-off (state-and-errors 13.3, website-pages 2.2): the DEVICE never decides a drop is live.
 * At zero we refetch `GET /drops` (no-store) immediately, then with backoff 1 s, 2 s, 4 s, 4 s ... until the server says
 * `LIVE` for that drop (up to 30 s). Pure and injectable so it is testable with fake timers.
 */
import type { DropState } from '@stimpy/api-client';

export const HANDOFF_MAX_MS = 30_000;
export const HANDOFF_BACKOFF_MS = [1000, 2000, 4000] as const;
export const EARLY_POLL_MS = 5000;
export const EARLY_WINDOW_MS = 60_000;

export type HandoffResult = 'live' | 'timeout' | 'cancelled';

export interface HandoffDeps {
  /** Returns the drop's state as the server reports it now, or null when it could not be read. */
  fetchState: () => Promise<DropState | null>;
  /** What counts as done. Default: the server says LIVE (a start). For an end countdown: anything but LIVE. */
  reached?: (state: DropState) => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxMs?: number;
  isCancelled?: () => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Delay before attempt `n` (0-based, the first attempt has no delay): 1 s, 2 s, 4 s, then 4 s again. */
export function backoffDelay(attempt: number): number {
  return HANDOFF_BACKOFF_MS[Math.min(attempt, HANDOFF_BACKOFF_MS.length - 1)] ?? 4000;
}

export async function runHandoff(deps: HandoffDeps): Promise<HandoffResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const maxMs = deps.maxMs ?? HANDOFF_MAX_MS;
  const start = now();
  for (let attempt = 0; ; attempt++) {
    if (deps.isCancelled?.()) return 'cancelled';
    let state: DropState | null = null;
    try {
      state = await deps.fetchState();
    } catch {
      state = null; // a failed read counts as "not yet"
    }
    if (state !== null && (deps.reached ? deps.reached(state) : state === 'LIVE')) return 'live';
    if (now() - start >= maxMs) return 'timeout';
    await sleep(backoffDelay(attempt));
  }
}

/** True while the server-adjusted time is within the last 60 s before `startsAt` (and not past it). */
export function inEarlyWindow(startsAtMs: number, nowMs: number, offsetMs: number): boolean {
  const remaining = startsAtMs - (nowMs + offsetMs);
  return remaining > 0 && remaining <= EARLY_WINDOW_MS;
}
