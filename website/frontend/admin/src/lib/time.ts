import { useSyncExternalStore } from 'react';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '@stimpy/ui';

/**
 * The business time zone (`settings.business.timezone`, default Asia/Beirut) is held in one tiny
 * store so every formatter and date input agrees, and a settings change updates every screen
 * (state-and-errors 12.2). The shell feeds it from `GET /admin/settings`.
 */
let zone: string = DEFAULT_TIME_ZONE;
const listeners = new Set<() => void>();

export function getBusinessTimeZone(): string {
  return zone;
}

/** Ignores invalid names (keeps the previous zone). Returns true when the zone changed. */
export function setBusinessTimeZone(next: string | null | undefined): boolean {
  if (!isValidTimeZone(next) || next === zone) return false;
  zone = next;
  listeners.forEach((l) => l());
  return true;
}

export function subscribeBusinessTimeZone(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the component when the business time zone changes. */
export function useBusinessTimeZone(): string {
  return useSyncExternalStore(subscribeBusinessTimeZone, getBusinessTimeZone, getBusinessTimeZone);
}

/* ------------------------------------------------------------------ zone arithmetic */

function wallParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** `YYYY-MM-DD` of an instant in the zone. */
export function ymdInZone(value: string | number | Date, timeZone: string): string {
  const d = value instanceof Date ? value : new Date(value);
  const p = wallParts(d.getTime(), timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today in the business zone, `YYYY-MM-DD`. Use for defaults and "not in the future" checks. */
export function todayInZone(timeZone: string = getBusinessTimeZone(), now: number = Date.now()): string {
  return ymdInZone(now, timeZone);
}

/** ISO instant to the value of `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) in the zone. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string = getBusinessTimeZone()): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const p = wallParts(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Wall-clock time typed in a datetime-local input, read as being in `timeZone`, to an ISO UTC string.
 * Returns null for empty or malformed input.
 */
export function zonedInputToIso(value: string | null | undefined, timeZone: string = getBusinessTimeZone()): string | null {
  if (!value) return null;
  const m = LOCAL_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let utc = guess - zoneOffsetMs(guess, timeZone);
  // The offset can differ at the corrected instant (around a DST change): settle once more.
  const second = guess - zoneOffsetMs(utc, timeZone);
  if (second !== utc) utc = second;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
