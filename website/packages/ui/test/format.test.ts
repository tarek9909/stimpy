import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatCents,
  formatCount,
  formatCountdown,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDropStart,
  formatPercent,
  formatPhoneDisplay,
  formatRelative,
  formatTime,
  isValidTimeZone,
  normalizeLebanesePhone,
  parseDollarsToCents,
  phoneDigits,
  pluralize,
  resolveTimeZone,
  telLink,
  timeZoneCity,
  whatsappLink,
} from '../src/format';

describe('formatCents', () => {
  it('drops decimals for whole dollars on the storefront', () => {
    expect(formatCents(4500)).toBe('$45');
    expect(formatCents(3500)).toBe('$35');
    expect(formatCents(0)).toBe('$0');
    expect(formatCents(100)).toBe('$1');
  });
  it('shows two decimals otherwise', () => {
    expect(formatCents(4550)).toBe('$45.50');
    expect(formatCents(1250)).toBe('$12.50');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(99)).toBe('$0.99');
    expect(formatCents(101)).toBe('$1.01');
  });
  it('groups thousands', () => {
    expect(formatCents(125000)).toBe('$1,250');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(100000000)).toBe('$1,000,000');
  });
  it('always shows two decimals with fixed (dashboard)', () => {
    expect(formatCents(4500, { fixed: true })).toBe('$45.00');
    expect(formatCents(0, { fixed: true })).toBe('$0.00');
    expect(formatCents(125000, { fixed: true })).toBe('$1,250.00');
  });
  it('formats negatives with a minus sign, never parentheses', () => {
    expect(formatCents(-400, { fixed: true })).toBe('-$4.00');
    expect(formatCents(-400)).toBe('-$4');
    expect(formatCents(-5)).toBe('-$0.05');
    expect(formatCents(-125050)).toBe('-$1,250.50');
  });
  it('never prints negative zero', () => {
    expect(formatCents(-0)).toBe('$0');
  });
  it('rounds stray fractions and survives bad input', () => {
    expect(formatCents(4550.4)).toBe('$45.50');
    expect(formatCents(Number.NaN)).toBe('—');
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('parseDollarsToCents', () => {
  it('parses without floating point', () => {
    expect(parseDollarsToCents('12.5')).toBe(1250);
    expect(parseDollarsToCents('12.50')).toBe(1250);
    expect(parseDollarsToCents('45')).toBe(4500);
    expect(parseDollarsToCents('$1250')).toBe(125000);
    expect(parseDollarsToCents('0.99')).toBe(99);
    expect(parseDollarsToCents('.5')).toBe(50);
    expect(parseDollarsToCents(' 0.07 ')).toBe(7);
    expect(parseDollarsToCents('1.15')).toBe(115); // 1.15 * 100 === 114.99999 with floats
    expect(parseDollarsToCents('19.99')).toBe(1999);
  });
  it('rejects more than two decimals and junk', () => {
    expect(parseDollarsToCents('12.345')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('12.')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('1,250')).toBeNull();
  });
});

describe('small value formatters', () => {
  it('counts, plurals and percentages', () => {
    expect(formatCount(1204)).toBe('1,204');
    expect(pluralize(1, 'item')).toBe('1 item');
    expect(pluralize(2, 'item')).toBe('2 items');
    expect(pluralize(0, 'item')).toBe('0 items');
    expect(pluralize(2, 'box', 'boxes')).toBe('2 boxes');
    expect(formatPercent(0.62)).toBe('62%');
    expect(formatPercent(0.045)).toBe('4.5%');
    expect(formatPercent(0.04)).toBe('4%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(-0.045)).toBe('-4.5%');
    expect(formatPercent(-0.125)).toBe('-13%');
  });
});

describe('time zones', () => {
  it('validates and falls back to Asia/Beirut', () => {
    expect(isValidTimeZone('Asia/Beirut')).toBe(true);
    expect(isValidTimeZone('Mars/Phobos')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(resolveTimeZone(undefined)).toBe('Asia/Beirut');
    expect(resolveTimeZone('Mars/Phobos')).toBe('Asia/Beirut');
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York');
    expect(timeZoneCity('Asia/Beirut')).toBe('Beirut');
    expect(timeZoneCity('America/New_York')).toBe('New York');
  });
});

describe('date and time in the business time zone', () => {
  // Lebanon is UTC+3 until the last Sunday of October 2026 (25 Oct), UTC+2 after.
  const summer = '2026-10-14T09:30:00Z';
  it('formats dates and times in Asia/Beirut by default', () => {
    expect(formatDate(summer)).toBe('14 Oct 2026');
    expect(formatTime(summer)).toBe('12:30');
    expect(formatDateTime(summer)).toBe('14 Oct 2026, 12:30');
  });
  it('honours DST (UTC+2 in winter)', () => {
    expect(formatDateTime('2026-12-01T10:00:00Z')).toBe('1 Dec 2026, 12:00');
    expect(formatDateTime('2026-12-01T10:00:00Z', { timeZone: 'Asia/Beirut' })).toBe('1 Dec 2026, 12:00');
  });
  it('uses the business zone for day boundaries, not the device', () => {
    // 21:30 UTC is already 15 Oct 00:30 in Beirut
    expect(formatDateTime('2026-10-14T21:30:00Z')).toBe('15 Oct 2026, 00:30');
    expect(formatDateTime('2026-10-14T21:30:00Z', { timeZone: 'America/New_York' })).toBe('14 Oct 2026, 17:30');
    expect(formatDateTime('2026-10-14T21:30:00Z', { timeZone: 'UTC' })).toBe('14 Oct 2026, 21:30');
  });
  it('never emits hour 24 at midnight', () => {
    expect(formatTime('2026-10-14T21:00:00Z')).toBe('00:00');
  });
  it('abbreviates every month to three letters (September is Sep, not Sept)', () => {
    expect(formatDate('2026-09-03T10:00:00Z')).toBe('3 Sep 2026');
  });
  it('shows Today and Yesterday when given `now`', () => {
    const now = '2026-10-14T10:00:00Z';
    expect(formatDateTime('2026-10-14T09:30:00Z', { now: new Date(now) })).toBe('Today, 12:30');
    expect(formatDateTime('2026-10-13T15:05:00Z', { now: new Date(now) })).toBe('Yesterday, 18:05');
    expect(formatDateTime('2026-10-10T15:05:00Z', { now: new Date(now) })).toBe('10 Oct 2026, 18:05');
  });
  it('returns an em dash for invalid input, never a raw ISO string', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatTime('x')).toBe('—');
  });
  it('accepts epoch milliseconds and Date objects', () => {
    expect(formatDate(Date.parse(summer))).toBe('14 Oct 2026');
    expect(formatDate(new Date(summer))).toBe('14 Oct 2026');
  });
  it('supports the device zone sentinel', () => {
    expect(formatDateTime(summer, { timeZone: 'device' })).toMatch(/^\d{1,2} Oct 2026, \d{2}:\d{2}$/);
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const rel = (iso: string) => formatRelative(iso, { now });
  it('uses just now, minutes and hours', () => {
    expect(rel('2026-10-14T11:59:30Z')).toBe('just now');
    expect(rel('2026-10-14T11:59:00Z')).toBe('1 min ago');
    expect(rel('2026-10-14T11:48:00Z')).toBe('12 min ago');
    expect(rel('2026-10-14T09:00:00Z')).toBe('3 h ago');
  });
  it('switches to Yesterday and then an absolute date', () => {
    expect(rel('2026-10-13T15:05:00Z')).toBe('Yesterday, 18:05');
    expect(rel('2026-10-01T15:05:00Z')).toBe('1 Oct 2026, 18:05');
  });
  it('treats a different calendar day as Yesterday even inside 24 hours', () => {
    const late = new Date('2026-10-14T00:30:00Z'); // 03:30 in Beirut
    expect(formatRelative('2026-10-13T20:30:00Z', { now: late })).toBe('Yesterday, 23:30');
  });
  it('does not claim the future is "ago"', () => {
    expect(formatRelative('2026-10-14T12:00:20Z', { now })).toBe('just now');
    expect(formatRelative('2026-10-15T12:00:00Z', { now })).toBe('15 Oct 2026, 15:00');
  });
});

describe('formatDateRange', () => {
  it('collapses within a month and a year', () => {
    expect(formatDateRange('2026-10-14T09:00:00Z', '2026-10-16T09:00:00Z')).toBe('14-16 Oct 2026');
    expect(formatDateRange('2026-10-14T09:00:00Z', '2026-10-14T18:00:00Z')).toBe('14 Oct 2026');
    expect(formatDateRange('2026-10-30T09:00:00Z', '2026-11-02T09:00:00Z')).toBe('30 Oct - 2 Nov 2026');
    expect(formatDateRange('2026-12-30T09:00:00Z', '2027-01-02T09:00:00Z')).toBe('30 Dec 2026 - 2 Jan 2027');
  });
});

describe('formatDropStart', () => {
  const t = '2026-10-14T21:30:00Z';
  it('appends the business zone when the device zone differs', () => {
    expect(formatDropStart(t, { businessTimeZone: 'Asia/Beirut', deviceTimeZone: 'America/New_York' })).toBe(
      '14 Oct 2026, 17:30 (Beirut time)',
    );
  });
  it('has no suffix in the business zone', () => {
    expect(formatDropStart(t, { businessTimeZone: 'Asia/Beirut', deviceTimeZone: 'Asia/Beirut' })).toBe('15 Oct 2026, 00:30');
  });
  it('has no suffix when another zone shows the same wall clock', () => {
    expect(formatDropStart(t, { businessTimeZone: 'Asia/Beirut', deviceTimeZone: 'Europe/Athens' })).toBe('15 Oct 2026, 00:30');
  });
  it('falls back to Beirut for a missing business zone', () => {
    expect(formatDropStart(t, { businessTimeZone: null, deviceTimeZone: 'America/New_York' })).toContain('(Beirut time)');
  });
});

describe('formatCountdown', () => {
  const s = 1000;
  const m = 60 * s;
  const h = 60 * m;
  const d = 24 * h;
  it('formats days, hours, minutes and seconds', () => {
    expect(formatCountdown(2 * d + 4 * h + 12 * m + 9 * s)).toBe('2d 04:12:09');
    expect(formatCountdown(4 * h + 12 * m + 9 * s)).toBe('04:12:09');
    expect(formatCountdown(12 * m + 9 * s)).toBe('12:09');
    expect(formatCountdown(9 * s)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
  });
  it('rounds seconds up and clamps negatives', () => {
    expect(formatCountdown(500)).toBe('00:01');
    expect(formatCountdown(1)).toBe('00:01');
    expect(formatCountdown(-5000)).toBe('00:00');
    expect(formatCountdown(d)).toBe('1d 00:00:00');
  });
});

describe('Lebanese phone normalisation (server rule)', () => {
  it.each([
    ['03 123 456', '+9613123456'],
    ['03123456', '+9613123456'],
    ['3123456', '+9613123456'],
    ['+961 3 123 456', '+9613123456'],
    ['+96131123456', '+96131123456'],
    ['0096171123456', '+96171123456'],
    ['00961 71 123 456', '+96171123456'],
    ['96171123456', '+96171123456'],
    ['71-123-456', '+96171123456'],
    ['(03) 123.456', '+9613123456'],
    ['+961 03 123 456', '+9613123456'],
    ['  76 123 456  ', '+96176123456'],
    ['01 234 567', '+9611234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeLebanesePhone(input)).toBe(expected);
  });

  it.each([[''], ['12345'], ['00123456'], ['+44 7700 900123'], ['123456789'], ['abc'], ['03 123 45x'], ['0 0']])(
    'rejects %s',
    (input) => {
      expect(normalizeLebanesePhone(input)).toBeNull();
    },
  );

  it('handles null and undefined', () => {
    expect(normalizeLebanesePhone(null)).toBeNull();
    expect(normalizeLebanesePhone(undefined)).toBeNull();
  });

  it('is idempotent', () => {
    const once = normalizeLebanesePhone('03 123 456') as string;
    expect(normalizeLebanesePhone(once)).toBe(once);
  });

  it('formats for reading', () => {
    expect(formatPhoneDisplay('+9613123456')).toBe('+961 3 123 456');
    expect(formatPhoneDisplay('+96171123456')).toBe('+961 71 123 456');
    expect(formatPhoneDisplay('03 123 456')).toBe('+961 3 123 456');
    expect(formatPhoneDisplay('+44 7700 900123')).toBe('+44 7700 900123');
    expect(formatPhoneDisplay(null)).toBe('');
  });
});

describe('WhatsApp and tel links', () => {
  it('builds wa.me with digits only', () => {
    expect(whatsappLink('+96171123456')).toBe('https://wa.me/96171123456');
    expect(whatsappLink('+961 71 123 456')).toBe('https://wa.me/96171123456');
    expect(whatsappLink('+96171123456', 'Hi Stimpy')).toBe('https://wa.me/96171123456?text=Hi%20Stimpy');
  });
  it('encodes the message', () => {
    expect(whatsappLink('+96171123456', 'Order #1 & more? yes')).toBe(
      'https://wa.me/96171123456?text=Order%20%231%20%26%20more%3F%20yes',
    );
  });
  it('normalises local Lebanese numbers and keeps foreign numbers', () => {
    expect(whatsappLink('03 123 456')).toBe('https://wa.me/9613123456');
    expect(whatsappLink('+44 7700 900123')).toBe('https://wa.me/447700900123');
    expect(whatsappLink('0044 7700 900123')).toBe('https://wa.me/447700900123');
  });
  it('returns null without a usable number', () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink(undefined)).toBeNull();
    expect(whatsappLink('')).toBeNull();
    expect(whatsappLink('   ')).toBeNull();
    expect(whatsappLink('n/a')).toBeNull();
  });
  it('strips non digits', () => {
    expect(phoneDigits('+961 (71) 123-456')).toBe('96171123456');
    expect(phoneDigits(null)).toBe('');
  });
  it('builds tel links', () => {
    expect(telLink('03 123 456')).toBe('tel:+9613123456');
    expect(telLink('+44 7700 900123')).toBe('tel:+447700900123');
    expect(telLink(null)).toBeNull();
  });
});

describe('contrast helpers', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#111111', '#FFFFFF')).toBeCloseTo(18.9, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
