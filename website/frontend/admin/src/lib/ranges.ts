/**
 * Date-range presets shared by Finance and Insights (dashboard-pages 11.1, 12). All values are
 * `YYYY-MM-DD` strings in the BUSINESS time zone: pass `todayInZone()` as `today`; the server applies the
 * same zone to the date-only `from` / `to`.
 */
export type RangePreset = 'month' | '30d' | 'last-month' | 'all' | 'custom';

export interface DateRange {
  from: string | null;
  to: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

export function addDays(ymd: string, days: number): string {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: string): DateRange {
  const t = parse(today);
  switch (preset) {
    case 'month':
      return { from: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), to: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))) };
    case 'last-month':
      return { from: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))), to: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0))) };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'all':
      return { from: null, to: null };
  }
}

/** Which preset (if any) the URL's `from` / `to` correspond to; otherwise `custom`. */
export function detectPreset(range: DateRange, today: string): RangePreset {
  for (const p of ['month', '30d', 'last-month', 'all'] as const) {
    const r = presetRange(p, today);
    if (r.from === range.from && r.to === range.to) return p;
  }
  return 'custom';
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  month: 'This month',
  '30d': 'Last 30 days',
  'last-month': 'Last month',
  all: 'All time',
  custom: 'Custom',
};

/** "1 Oct to 31 Oct 2026" style label for headings; open ends read "All time" / "Up to ..." / "From ...". */
export function describeRange(range: DateRange): string {
  if (!range.from && !range.to) return 'All time';
  if (range.from && range.to) return range.from === range.to ? range.from : `${range.from} to ${range.to}`;
  return range.from ? `From ${range.from}` : `Up to ${range.to}`;
}

/** Fraction (0..1) to a percentage text: `0.285` -> `28.5%`, `0.3` -> `30%`. Ratios are never percentages in the API. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '0%';
  return `${Math.round(fraction * 1000) / 10}%`;
}

export const SOURCE_LABELS: Record<string, string> = { WEBSITE: 'Website', INSTAGRAM: 'Instagram', WHATSAPP: 'WhatsApp', MANUAL: 'Manual' };
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Average profit per order in cents (integer, rounds half away from zero); 0 when there are no orders. */
export function averageProfitCents(profitCents: number, ordersCount: number): number {
  if (ordersCount <= 0) return 0;
  const v = profitCents / ordersCount;
  return v < 0 ? -Math.round(-v) : Math.round(v);
}

/** Units sold per hour since launch ("avg since launch"), one decimal; null before the launch or with no time elapsed. */
export function unitsPerHour(unitsSold: number, startsAtIso: string, nowMs: number): number | null {
  const hours = (nowMs - Date.parse(startsAtIso)) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 1 / 60) return null;
  return Math.round((unitsSold / hours) * 10) / 10;
}
