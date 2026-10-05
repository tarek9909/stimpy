/**
 * Hand-off from checkout to the confirmation page (checkout-and-order-flow 5.2). There is no public endpoint that
 * re-reads a placed order, so checkout writes the whole `POST /orders` response to sessionStorage under
 * `stimpy.order.<number>` and the confirmation page reads it. Also remembers the most recent order number in this
 * tab (empty-cart link on /checkout, prefill on /track). Everything is wrapped: storage may be blocked.
 */
import type { PlacedOrder } from '@stimpy/api-client';
import { readStored, removeStored, writeStored } from '@/lib/storage';

export const ORDER_KEY_PREFIX = 'stimpy.order.';
export const LAST_ORDER_KEY = 'stimpy.order.last';

/** Order numbers in URLs: letters, digits and dashes, 3 to 20 characters (5.2). */
export const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9-]{3,20}$/;

export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}

function orderKey(number: string): string {
  return `${ORDER_KEY_PREFIX}${number.toUpperCase()}`;
}

export function saveOrderHandoff(placed: PlacedOrder): boolean {
  const ok = writeStored('session', orderKey(placed.order.number), JSON.stringify(placed));
  writeStored('session', LAST_ORDER_KEY, placed.order.number);
  return ok;
}

function isPlacedOrder(v: unknown): v is PlacedOrder {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  const o = p.order as Record<string, unknown> | undefined;
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o.number === 'string' &&
    typeof o.status === 'string' &&
    Array.isArray(o.items) &&
    typeof o.subtotalCents === 'number' &&
    typeof o.deliveryFeeCents === 'number' &&
    typeof o.totalCents === 'number' &&
    typeof o.estimateText === 'string' &&
    (p.whatsappUrl === null || typeof p.whatsappUrl === 'string')
  );
}

/** The stored response for this order number, or null (another tab, new session, corrupt data). */
export function readOrderHandoff(number: string): PlacedOrder | null {
  const raw = readStored('session', orderKey(number));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPlacedOrder(parsed) && parsed.order.number.toUpperCase() === number.toUpperCase()) return parsed;
  } catch {
    /* corrupt */
  }
  removeStored('session', orderKey(number));
  return null;
}

/** The most recent order number placed in this tab session, if any. */
export function lastOrderNumber(): string | null {
  const v = readStored('session', LAST_ORDER_KEY);
  return v && isValidOrderNumber(v) ? v : null;
}

/** Path of the confirmation page (a client-side route; the number is validated server side). */
export function thanksPath(number: string): string {
  return `/order/${encodeURIComponent(number)}/thanks`;
}
