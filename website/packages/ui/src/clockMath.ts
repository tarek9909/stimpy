/**
 * Pure server-clock and countdown maths. No React, no globals beyond `Date.now()` defaults,
 * so server components and tests can call these directly (the clock hooks live in clock.tsx).
 */
import type { ISODate } from './types';

export interface ServerClock {
  /** Add to `Date.now()` to get server time. */
  offsetMs: number;
  /** True while no server sample exists: the device clock is used and the server confirms the end. */
  uncertain: boolean;
}

export interface ClockSample {
  /** `time` from `GET /health` (ISO with milliseconds) or epoch ms. */
  serverTime: string | number;
  /** `Date.now()` taken immediately BEFORE the request was sent. */
  sentAt: number;
  /** Round-trip time in ms (`performance.now()` around the request). */
  rttMs: number;
}

/**
 * One health sample to an offset. The server stamped `serverTime` about half a round trip after
 * `sentAt`, so `offset = serverTime - sentAt - rtt/2` (equivalently `serverTime + rtt/2 - Date.now()`
 * measured on arrival, which is the website-pages 2.2 formula).
 */
export function offsetFromSample(sample: ClockSample): number {
  const server = typeof sample.serverTime === 'number' ? sample.serverTime : Date.parse(sample.serverTime);
  return server - sample.sentAt - sample.rttMs / 2;
}

/**
 * Pick the best of several samples: the smallest RTT, ignoring samples above 3000 ms unless
 * nothing better exists. Returns `uncertain: true` and a zero offset when given no valid sample.
 */
export function estimateClockOffset(samples: ClockSample[]): ServerClock & { rttMs: number | null } {
  const valid = samples.filter((s) => Number.isFinite(offsetFromSample(s)) && s.rttMs >= 0);
  if (valid.length === 0) return { offsetMs: 0, uncertain: true, rttMs: null };
  const good = valid.filter((s) => s.rttMs <= 3000);
  const pool = good.length > 0 ? good : valid;
  const best = pool.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));
  return { offsetMs: offsetFromSample(best), uncertain: false, rttMs: best.rttMs };
}

/** Fallback source: the `Date` response header (second precision, so centred inside the second). */
export function offsetFromDateHeader(dateHeader: string, receivedAt: number): number | null {
  const ms = Date.parse(dateHeader);
  return Number.isNaN(ms) ? null : ms + 500 - receivedAt;
}

/* ------------------------------------------------------------------------------ countdown maths */

export function toEpochMs(target: ISODate | number | Date): number {
  if (typeof target === 'number') return target;
  if (target instanceof Date) return target.getTime();
  return Date.parse(target);
}

/** Remaining milliseconds to `target` on the SERVER clock. Never negative; NaN targets read as 0. */
export function computeRemainingMs(target: ISODate | number | Date, offsetMs: number, nowMs: number = Date.now()): number {
  const t = toEpochMs(target);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - (nowMs + offsetMs));
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

/** Splits remaining ms into display parts. Seconds round UP so the clock hits zero with the target. */
export function countdownParts(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

/**
 * Screen reader announcements (state-and-errors 13.2): at most once per minute, then every 10
 * seconds during the final minute. Two readings with the same key must not be announced twice.
 */
export function announcementKey(remainingMs: number): string {
  const { totalSeconds } = countdownParts(remainingMs);
  if (totalSeconds <= 60) return `s${Math.ceil(totalSeconds / 10)}`;
  return `m${Math.ceil(totalSeconds / 60)}`;
}

function unit(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "2 days, 4 hours, 12 minutes remaining" / "40 seconds remaining". */
export function describeRemaining(remainingMs: number): string {
  const p = countdownParts(remainingMs);
  if (p.totalSeconds <= 60) return `${unit(p.totalSeconds, 'second')} remaining`;
  // Whole minutes, rounded up, matching announcementKey().
  const totalMinutes = Math.ceil(p.totalSeconds / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(unit(days, 'day'));
  if (days > 0 || hours > 0) parts.push(unit(hours, 'hour'));
  parts.push(unit(minutes, 'minute'));
  return `${parts.join(', ')} remaining`;
}
