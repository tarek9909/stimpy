/** Date helpers. API dates are ISO-8601 UTC strings; day boundaries use the business timezone (default Asia/Beirut). */
export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at the instant `d` (positive east of Greenwich). */
export function tzOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" of instant `d` as seen in `tz`. */
export function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** UTC instant at which the calendar day `ymd` ("2026-10-14") starts in `tz`. */
export function startOfDayInTz(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  let result = new Date(guess.getTime() - tzOffsetMs(guess, tz));
  // second pass handles days where the offset changes (DST)
  result = new Date(guess.getTime() - tzOffsetMs(result, tz));
  return result;
}

/** [start, endExclusive) of the calendar day `ymd` in `tz`. */
export function dayRangeInTz(ymd: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const nextYmd = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: startOfDayInTz(ymd, tz), end: startOfDayInTz(nextYmd, tz) };
}

/** Day of week (0 = Sunday) of instant `d` in `tz`. */
export function weekdayInTz(d: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}
