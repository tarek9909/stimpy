/**
 * Pure formatting helpers shared by the storefront and the dashboard
 * (state-and-errors.md section 12, business-rules.md phone normalisation).
 * No framework imports and no global state: the business time zone is always passed in.
 */

/* ------------------------------------------------------------------ money */

export interface FormatCentsOptions {
  /** Always show two decimals (dashboard tables, finance, forms). */
  fixed?: boolean;
}

/**
 * Integer cents to a USD string with integer maths only (no `cents / 100` arithmetic).
 * Storefront: `4500 -> $45`, `4550 -> $45.50`, `125000 -> $1,250`.
 * Dashboard (`fixed`): `4500 -> $45.00`. Negative: `-$4.00` (never parentheses).
 */
export function formatCents(cents: number, options: FormatCentsOptions = {}): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  const total = Math.round(cents);
  const abs = Math.abs(total);
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = options.fixed || rem !== 0 ? `${grouped}.${String(rem).padStart(2, '0')}` : grouped;
  return `${total < 0 ? '-' : ''}$${body}`;
}

/**
 * Parse what a person types in a dashboard money input ("12.5", "$1250", "0.99") into integer
 * cents without floating point. Returns null for anything with more than two decimals, commas,
 * signs or letters.
 */
export function parseDollarsToCents(input: string): number | null {
  const match = /^\s*\$?\s*(\d+)?(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) return null;
  const whole = match[1];
  const frac = match[2];
  if (whole === undefined && frac === undefined) return null;
  if (input.includes('.') && frac === undefined) return null;
  const dollars = whole === undefined ? 0 : Number(whole);
  const cents = frac === undefined ? 0 : Number(frac.padEnd(2, '0'));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/* ------------------------------------------------------------ small values */

/** `1204 -> "1,204"`. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** `1 -> "1 item"`, `2 -> "2 items"`. */
export function pluralize(n: number, singular: string, plural: string = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}

/** API ratios are fractions 0..1. `0.62 -> "62%"`, `0.045 -> "4.5%"` (one decimal below 10%). */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const v = ratio * 100;
  if (v > 0 && v < 10) {
    const r = Math.round(v * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
  }
  return `${Math.round(v)}%`;
}

/* ------------------------------------------------------------ time zones */

export const DEFAULT_TIME_ZONE = 'Asia/Beirut';

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** `business.timezone` with the documented fallback when it is absent or invalid. */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** Pass `'device'` to format in the visitor's own zone (website, except drop start times). */
export type TimeZoneInput = string | 'device';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsOf(date: Date, timeZone: TimeZoneInput | undefined): Parts {
  const zone = timeZone === 'device' ? undefined : resolveTimeZone(timeZone);
  const key = zone ?? '__device__';
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(key, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return {
    year: o.year ?? 1970,
    month: o.month ?? 1,
    day: o.day ?? 1,
    hour: (o.hour ?? 0) % 24,
    minute: o.minute ?? 0,
  };
}

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const dayNumber = (p: Parts) => Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);

export interface DateFormatOptions {
  /** IANA name, `'device'`, or omitted for `Asia/Beirut`. */
  timeZone?: TimeZoneInput;
}

/** `14 Oct 2026`. Returns an em dash for invalid input. Never shows a raw ISO string. */
export function formatDate(value: string | number | Date, { timeZone }: DateFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const p = partsOf(d, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** `12:30` (24-hour clock). */
export function formatTime(value: string | number | Date, { timeZone }: DateFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const p = partsOf(d, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export interface DateTimeFormatOptions extends DateFormatOptions {
  /** When given, the same day shows "Today, 12:30" and the previous day "Yesterday, 18:05". */
  now?: Date | number;
}

/** `14 Oct 2026, 12:30`; with `now`, `Today, 12:30` / `Yesterday, 18:05` where they apply. */
export function formatDateTime(value: string | number | Date, options: DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const { timeZone, now } = options;
  const p = partsOf(d, timeZone);
  const time = `${pad2(p.hour)}:${pad2(p.minute)}`;
  if (now !== undefined) {
    const nowDate = toDate(now);
    if (nowDate) {
      const diff = dayNumber(partsOf(nowDate, timeZone)) - dayNumber(p);
      if (diff === 0) return `Today, ${time}`;
      if (diff === 1) return `Yesterday, ${time}`;
    }
  }
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${time}`;
}

/**
 * Dashboard relative time: "just now", "12 min ago", "3 h ago", "Yesterday, 18:05", then an
 * absolute date and time. Always put the absolute value in a `title` as well.
 * (Written out by hand: Intl.RelativeTimeFormat renders "12 min. ago" with a full stop.)
 */
export function formatRelative(value: string | number | Date, options: DateTimeFormatOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const nowDate = toDate(options.now ?? Date.now()) ?? new Date();
  const diff = nowDate.getTime() - d.getTime();
  if (diff < 0 && diff > -60_000) return 'just now';
  if (diff >= 0) {
    if (diff < 60_000) return 'just now';
    const sameDay =
      dayNumber(partsOf(nowDate, options.timeZone)) === dayNumber(partsOf(d, options.timeZone));
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000 && sameDay) return `${Math.floor(diff / 3_600_000)} h ago`;
  }
  return formatDateTime(d, { timeZone: options.timeZone, now: nowDate });
}

/** `14-16 Oct 2026`, `30 Oct - 2 Nov 2026`, `30 Dec 2026 - 2 Jan 2027`. */
export function formatDateRange(
  start: string | number | Date,
  end: string | number | Date,
  { timeZone }: DateFormatOptions = {},
): string {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return '—';
  const pa = partsOf(a, timeZone);
  const pb = partsOf(b, timeZone);
  if (pa.year === pb.year && pa.month === pb.month) {
    return pa.day === pb.day
      ? `${pa.day} ${MONTHS[pa.month - 1]} ${pa.year}`
      : `${pa.day}-${pb.day} ${MONTHS[pa.month - 1]} ${pa.year}`;
  }
  if (pa.year === pb.year) {
    return `${pa.day} ${MONTHS[pa.month - 1]} - ${pb.day} ${MONTHS[pb.month - 1]} ${pa.year}`;
  }
  return `${formatDate(a, { timeZone })} - ${formatDate(b, { timeZone })}`;
}

/** `Asia/Beirut -> "Beirut"`, `America/New_York -> "New York"`. */
export function timeZoneCity(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}

export interface DropStartOptions {
  /** `business.timezone`. */
  businessTimeZone?: string | null;
  /** The visitor's zone; defaults to the browser's. Pass it explicitly in tests. */
  deviceTimeZone?: string;
}

/**
 * Website drop start time: shown in the visitor's zone, with "(Beirut time)" appended when the
 * device zone differs from the business zone.
 */
export function formatDropStart(value: string | number | Date, options: DropStartOptions = {}): string {
  const d = toDate(value);
  if (!d) return '—';
  const business = resolveTimeZone(options.businessTimeZone);
  const device = options.deviceTimeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const text = formatDateTime(d, { timeZone: device });
  // Same wall-clock reading in both zones (e.g. Europe/Athens vs Asia/Beirut) needs no suffix.
  const sameWall = text === formatDateTime(d, { timeZone: business });
  return device === business || sameWall ? text : `${text} (${timeZoneCity(business)} time)`;
}

/* ---------------------------------------------------------------- countdown */

/**
 * `2d 04:12:09` (days only when > 0), `04:12:09`, `12:09`, `00:09`. Negative values clamp to
 * zero. Seconds round UP so the display reaches `00:00` exactly when the target passes.
 */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  if (hours > 0) return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/* ------------------------------------------------------------------- phone */

/**
 * Lebanese phone normalisation, identical to the server rule (business-rules.md): strip spaces,
 * dashes, dots and brackets; remove a leading `+961`, `00961` or `961`; remove ONE leading `0`;
 * the remainder must be 7 or 8 digits and must not start with `0`. Returns `+961XXXXXXXX` or
 * `null`. The server stays the authority: the UI sends what the person typed and only uses this
 * for display, `wa.me` and `tel:` links.
 */
export function normalizeLebanesePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.replace(/[\s\-.()]/g, '');
  if (s.startsWith('+961')) s = s.slice(4);
  else if (s.startsWith('00961')) s = s.slice(5);
  else if (s.startsWith('961')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^[1-9]\d{6,7}$/.test(s)) return null;
  return `+961${s}`;
}

/** `+96131123456 -> "+961 3 123 456"`, `+9617112345 6 -> "+961 71 123 456"`. Unknown input is returned as is. */
export function formatPhoneDisplay(input: string | null | undefined): string {
  if (!input) return '';
  const e164 = normalizeLebanesePhone(input);
  if (!e164) return input;
  const rest = e164.slice(4);
  return rest.length === 7
    ? `+961 ${rest.slice(0, 1)} ${rest.slice(1, 4)} ${rest.slice(4)}`
    : `+961 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
}

/** Digits only, as `wa.me` wants them. A leading `00` is dropped. */
export function phoneDigits(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D/g, '').replace(/^00/, '');
}

/** `https://wa.me/<digits>?text=<encoded>`; `null` when there is no usable number. */
export function whatsappLink(number: string | null | undefined, text?: string): string | null {
  if (!number) return null;
  const trimmed = number.trim();
  const local = !trimmed.startsWith('+') && !trimmed.startsWith('00') ? normalizeLebanesePhone(trimmed) : null;
  const digits = local ? phoneDigits(local) : phoneDigits(trimmed);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** `tel:+96131123456`; `null` when there is no usable number. */
export function telLink(number: string | null | undefined): string | null {
  if (!number) return null;
  const e164 = normalizeLebanesePhone(number);
  if (e164) return `tel:${e164}`;
  const digits = phoneDigits(number);
  return digits ? `tel:+${digits}` : null;
}

/* ------------------------------------------------------------------ colour */

/** WCAG relative luminance of a `#RRGGBB` string (used for swatch rings and contrast tests). */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return 0;
  const n = parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** WCAG contrast ratio between two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
