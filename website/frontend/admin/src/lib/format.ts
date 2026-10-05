import { useMemo } from 'react';
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
  type DateTimeFormatOptions,
} from '@stimpy/ui';
import { getBusinessTimeZone, useBusinessTimeZone } from './time';

/** Dashboard money: always two decimals, tabular numerals in the markup (`$45.00`, `-$4.00`). */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return formatCents(cents, { fixed: true });
}

export interface Formatters {
  timeZone: string;
  money(cents: number | null | undefined): string;
  date(value: string | null | undefined): string;
  time(value: string | null | undefined): string;
  dateTime(value: string | null | undefined, options?: Pick<DateTimeFormatOptions, 'now'>): string;
  /** "12 min ago" for the last day, otherwise the absolute date. Put `dateTime()` in the `title`. */
  relative(value: string | null | undefined): string;
}

const dash = '—';

export function createFormatters(timeZone: string): Formatters {
  return {
    timeZone,
    money: formatMoney,
    date: (v) => (v ? formatDate(v, { timeZone }) : dash),
    time: (v) => (v ? formatTime(v, { timeZone }) : dash),
    dateTime: (v, o) => (v ? formatDateTime(v, { timeZone, ...o }) : dash),
    relative: (v) => (v ? formatRelative(v, { timeZone }) : dash),
  };
}

/**
 * The standard way for components to format values: bound to the business time zone and
 * re-rendered when it changes. Never call `toLocaleString()` or format with the device zone.
 */
export function useFormatters(): Formatters {
  const timeZone = useBusinessTimeZone();
  return useMemo(() => createFormatters(timeZone), [timeZone]);
}

/** Non-hook variant for event handlers and plain functions. */
export function currentFormatters(): Formatters {
  return createFormatters(getBusinessTimeZone());
}

/** Dollars typed in a form (`"12.5"`) from cents, with no float arithmetic: `1250 -> "12.50"`. */
export function centsToDollarString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
