import { z } from 'zod';
import { parseDollarsToCents } from '@stimpy/ui';

/**
 * Small Zod building blocks for dashboard forms. Client validation is a convenience and must be
 * no stricter than the server (state-and-errors 6.1): the API's `fields` errors always win.
 */

/** A dollars string such as `"12.50"`. Rejects more than two decimals, commas, signs and letters. */
export function moneySchema(options: { min?: number; message?: string } = {}) {
  const message = options.message ?? 'Enter an amount like 12.50.';
  return z
    .string()
    .trim()
    .refine((v) => parseDollarsToCents(v) !== null, message)
    .refine((v) => {
      const cents = parseDollarsToCents(v);
      return cents === null || cents >= (options.min ?? 0);
    }, options.min && options.min > 0 ? 'That amount is too low.' : 'Enter an amount of $0.00 or more.');
}

/** Cents from a validated dollars string. Only call on values that passed `moneySchema`. */
export function dollarsToCents(value: string): number {
  const cents = parseDollarsToCents(value);
  if (cents === null) throw new Error('Not a dollars amount');
  return cents;
}

/** `^[a-z0-9]+(-[a-z0-9]+)*$`, up to 140 characters (api-reference 1). */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Enter a slug.')
  .max(140, 'Use at most 140 characters.')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens.');

/** Turns a name into a slug candidate: `"Midnight Cedar!"` -> `"midnight-cedar"`. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #FF7A59.');

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** A valid e-mail address. */
export const emailSchema = (message = 'Enter a valid email address.') => z.string().trim().refine(isEmail, message);

/** An e-mail address or an empty string (optional field). */
export const optionalEmailSchema = (message = 'Enter a valid email address.') => z.string().trim().refine((v) => v === '' || isEmail(v), message);

/** A whole number typed as text, in `[min, max]`. The form keeps the string; convert with `Number()` on submit. */
export function intStringSchema(opts: { min?: number; max?: number; label?: string } = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, label = 'a whole number' } = opts;
  const message = max === Number.MAX_SAFE_INTEGER ? `Enter ${label} of ${min} or more.` : `Enter ${label} from ${min} to ${max}.`;
  return z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .refine((v) => {
      const n = Number(v);
      return n >= min && n <= max;
    }, message);
}
