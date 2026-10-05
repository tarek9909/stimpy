/** Money is ALWAYS integer cents (USD). Fields are named `...Cents`. */
export function assertCents(n: number, label = 'amount'): number {
  if (!Number.isInteger(n)) throw new TypeError(`${label} must be an integer number of cents, got ${n}`);
  return n;
}

/** 5800 -> "$58.00" (used by email/WhatsApp placeholders). */
export function formatUsd(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 4500 -> 45 (display only; never send dollars to the API). */
export const centsToDollars = (cents: number): number => cents / 100;
