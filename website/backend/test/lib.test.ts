import { describe, expect, it } from 'vitest';
import { formatUsd } from '../src/lib/money';
import { normalizePhone, waDigits } from '../src/lib/phone';
import { isValidSlug, slugify, uniqueSlug } from '../src/lib/slug';
import { escapeHtml, extractPlaceholders, renderTemplate, unknownPlaceholders } from '../src/lib/template';
import { formatOrderNumber, parseOrderLookup } from '../src/lib/order-number';
import { maskEmail, maskPhone, scrubText } from '../src/lib/mask';
import { dayRangeInTz, isValidTimezone, weekdayInTz, ymdInTz } from '../src/lib/dates';
import { parseSort, toPage, toSkipTake, pageQuerySchema } from '../src/lib/http';
import { RateLimiter, type RateRule } from '../src/lib/rate-limiter';
import { freezeTime, advanceTime, unfreezeTime } from './helpers/clock';

describe('phone normalisation (business-rules 2)', () => {
  it.each([
    ['03 123 456', '+9613123456'],
    ['+961 71 123 456', '+96171123456'],
    ['71123456', '+96171123456'],
    ['071-123-456', '+96171123456'],
    ['00961 3 123 456', '+9613123456'],
    ['961 71123456', '+96171123456'],
    ['(03) 123.456', '+9613123456'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(['', 'abc', '123', '1234567890123', '+44 7700 900123', '03 12a 456', '0123456', '+961', '00'])(
    'rejects %j',
    (input) => expect(normalizePhone(input)).toBeNull(),
  );

  it('waDigits strips the plus', () => expect(waDigits('+9613123456')).toBe('9613123456'));
});

describe('money', () => {
  it('formats cents as USD', () => {
    expect(formatUsd(5800)).toBe('$58.00');
    expect(formatUsd(5)).toBe('$0.05');
    expect(formatUsd(0)).toBe('$0.00');
  });
  it('rejects non-integers', () => expect(() => formatUsd(10.5)).toThrow());
});

describe('slug', () => {
  it('slugifies', () => {
    expect(slugify('THE VOID')).toBe('the-void');
    expect(slugify('  Café  Crème!! ')).toBe('cafe-creme');
  });
  it('validates', () => {
    expect(isValidSlug('the-void')).toBe(true);
    expect(isValidSlug('The-Void')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
  });
  it('finds a free slug', async () => {
    const taken = new Set(['the-void', 'the-void-2']);
    expect(await uniqueSlug('THE VOID', async (s) => taken.has(s))).toBe('the-void-3');
  });
});

describe('templates', () => {
  it('renders placeholders and blanks missing ones', () => {
    expect(renderTemplate('Hi {customer_name}, {order_number}{cancel_reason}', { customer_name: 'Rami', order_number: 'STP-1' })).toBe('Hi Rami, STP-1');
  });
  it('finds unknown placeholders', () => {
    expect(extractPlaceholders('{a} {b} {a}')).toEqual(['a', 'b']);
    expect(unknownPlaceholders('{customer_name} {nope}', ['customer_name'])).toEqual(['nope']);
  });
  it('escapes html', () => expect(escapeHtml('<b>"x"&\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;'));
});

describe('order numbers', () => {
  it('formats and parses lookups', () => {
    expect(formatOrderNumber('STP', 1042)).toBe('STP-1042');
    expect(parseOrderLookup('stp-1042')).toEqual({ kind: 'full', number: 'STP-1042' });
    expect(parseOrderLookup(' 1042 ')).toEqual({ kind: 'digits', digits: '1042' });
    expect(parseOrderLookup('nonsense!')).toBeNull();
  });
});

describe('masking', () => {
  it('masks phones and e-mails', () => {
    expect(maskPhone('+96171123456')).toBe('***456');
    expect(maskEmail('rami@example.com')).toBe('***@example.com');
    const s = scrubText('failed for rami@example.com phone +96171123456 id 12');
    expect(s).not.toContain('rami');
    expect(s).not.toContain('71123456');
  });
});

describe('dates in the business timezone', () => {
  it('validates IANA names', () => {
    expect(isValidTimezone('Asia/Beirut')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
  it('computes day ranges and weekdays in Asia/Beirut', () => {
    // 2026-10-14 00:00 in Beirut (UTC+3, summer time ended 2026-10-25) = 2026-10-13T21:00Z
    const { start, end } = dayRangeInTz('2026-10-14', 'Asia/Beirut');
    expect(start.toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-14T21:00:00.000Z');
    expect(ymdInTz(new Date('2026-10-13T22:30:00Z'), 'Asia/Beirut')).toBe('2026-10-14');
    expect(weekdayInTz(new Date('2026-10-14T12:00:00Z'), 'Asia/Beirut')).toBe(3); // Wednesday
  });
});

describe('http helpers', () => {
  it('pagination defaults and bounds', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(pageQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    const q = pageQuerySchema.parse({ page: '3', pageSize: '10' });
    expect(toSkipTake(q)).toEqual({ skip: 20, take: 10 });
    expect(toPage([1], 41, q)).toEqual({ items: [1], page: 3, pageSize: 10, total: 41 });
  });
  it('parses sort with an allow-list', () => {
    const fallback = { field: 'id' as const, dir: 'asc' as const };
    expect(parseSort('-name', ['id', 'name'], fallback)).toEqual({ field: 'name', dir: 'desc' });
    expect(parseSort('evil', ['id', 'name'], fallback)).toEqual(fallback);
    expect(parseSort(undefined, ['id'], fallback)).toEqual(fallback);
  });
});

describe('rate limiter with the injectable clock', () => {
  const rule: RateRule = { name: 't', max: 2, windowMs: 60_000 };
  it('limits, reports Retry-After, and resets after the window', () => {
    freezeTime('2026-10-14T10:00:00Z');
    const rl = new RateLimiter();
    expect(rl.consume(rule, 'a').allowed).toBe(true);
    expect(rl.consume(rule, 'a').allowed).toBe(true);
    const third = rl.consume(rule, 'a');
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(60);
    expect(rl.consume(rule, 'b').allowed).toBe(true); // other key unaffected
    advanceTime(30_000);
    expect(rl.consume(rule, 'a').retryAfterSeconds).toBe(30);
    advanceTime(31_000);
    expect(rl.consume(rule, 'a').allowed).toBe(true);
    unfreezeTime();
  });
});
