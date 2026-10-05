import { z } from 'zod';
import type { AppContext } from '../context';
import { AppError } from './errors';
import { startOfDayInTz, ymdInTz } from './dates';

/**
 * Date-only ranges for finance and insights. `from` and `to` are calendar dates ("2026-10-01") INCLUSIVE, interpreted in the
 * business timezone (`settings.business.timezone`, default Asia/Beirut): the range covers the instants
 * `[startOfDay(from), startOfDay(to + 1 day))`. Omitting a bound leaves that side open (all time).
 */
export const ymdString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, 'Enter a real calendar date.');

export const rangeQuerySchema = z.object({ from: ymdString.optional(), to: ymdString.optional() });
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export type DateRange = {
  from: string | null;
  to: string | null;
  /** First instant in range (UTC), or null when open. */
  start: Date | null;
  /** First instant AFTER the range (exclusive), or null when open. */
  end: Date | null;
  timezone: string;
};

export const addDaysYmd = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export function makeRange(q: RangeQuery, timezone: string): DateRange {
  if (q.from && q.to && q.from > q.to) throw AppError.validation({ to: 'The end date must not be before the start date.' });
  return {
    from: q.from ?? null,
    to: q.to ?? null,
    start: q.from ? startOfDayInTz(q.from, timezone) : null,
    end: q.to ? startOfDayInTz(addDaysYmd(q.to, 1), timezone) : null,
    timezone,
  };
}

export async function resolveRange(ctx: AppContext, q: RangeQuery): Promise<DateRange> {
  return makeRange(q, (await ctx.settings.get('business')).timezone);
}

/** Prisma `DateTime` filter for a timestamp column inside the range (`undefined` when fully open). */
export function instantFilter(r: DateRange): { gte?: Date; lt?: Date } | undefined {
  if (!r.start && !r.end) return undefined;
  return { ...(r.start ? { gte: r.start } : {}), ...(r.end ? { lt: r.end } : {}) };
}

/** Calendar-date column (`spent_on`) filter: dates are stored as UTC midnight. */
export function dateColumnFilter(r: Pick<DateRange, 'from' | 'to'>): { gte?: Date; lte?: Date } | undefined {
  if (!r.from && !r.to) return undefined;
  return { ...(r.from ? { gte: new Date(`${r.from}T00:00:00.000Z`) } : {}), ...(r.to ? { lte: new Date(`${r.to}T00:00:00.000Z`) } : {}) };
}

export const dayOf = (d: Date, tz: string): string => ymdInTz(d, tz);
