/**
 * Error mapping for `POST /orders` (checkout-and-order-flow 4). Switches on `code`, never on `message`.
 * Pure: classification and the cart updates implied by SOLD_OUT / NOT_PURCHASABLE live here so they can be tested
 * without React or the network.
 */
import { isApiError, type PurchaseProblem, type StockProblem } from '@stimpy/api-client';
import { clampQty } from '@/features/cart/helpers';
import type { CartItem, CartLine } from '@/features/cart/types';

export const GENERIC_TRY_AGAIN = 'Something went wrong. Please try again.';
export const SERVER_SIDE_MESSAGE = 'Something went wrong on our side.';

export type ErrorOutcome =
  /** 400 VALIDATION_ERROR with `fields`. */
  | { type: 'validation'; fields: Record<string, string>; attributionRejected: boolean; requestId: string | null }
  /** 400 VALIDATION_ERROR without `fields` (honeypot or unknown key), 401/403, other unexpected 4xx. */
  | { type: 'generic'; message: string; requestId: string | null }
  | { type: 'sold_out'; problems: StockProblem[] }
  | { type: 'not_purchasable'; problems: PurchaseProblem[] }
  | { type: 'key_conflict' }
  | { type: 'price_changed'; newTotalCents: number }
  | { type: 'rate_limited'; retryAfterSeconds: number }
  /**
   * Outcome unknown: the order may or may not exist. `network` = no response at all (offline, timeout), so there is
   * no request id; otherwise a 5xx with the server's message and request id.
   */
  | { type: 'unknown_outcome'; network: boolean; message: string | null; requestId: string | null };

export const DEFAULT_RETRY_SECONDS = 10;

function isStockProblem(p: unknown): p is StockProblem {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as Record<string, unknown>;
  return typeof v.itemIndex === 'number' && typeof v.name === 'string' && typeof v.requested === 'number' && typeof v.available === 'number';
}

function isPurchaseProblem(p: unknown): p is PurchaseProblem {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as Record<string, unknown>;
  return typeof v.itemIndex === 'number' && typeof v.name === 'string' && typeof v.reason === 'string';
}

function detailsItems(details: unknown): unknown[] {
  if (typeof details === 'object' && details !== null && Array.isArray((details as { items?: unknown }).items)) {
    return (details as { items: unknown[] }).items;
  }
  return [];
}

/** Map anything thrown by the order request to the UI outcome of section 4.1. */
export function classifyOrderError(error: unknown): ErrorOutcome {
  if (!isApiError(error)) {
    return { type: 'unknown_outcome', network: true, message: null, requestId: null };
  }
  const requestId = error.requestId;
  switch (error.code) {
    case 'VALIDATION_ERROR': {
      const fields = error.fields;
      if (fields && Object.keys(fields).length > 0) {
        return {
          type: 'validation',
          fields,
          requestId,
          attributionRejected: Object.keys(fields).some((k) => /^(?:attribution|firstTouch)(?:\.|$)/.test(k)),
        };
      }
      return { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
    }
    case 'SOLD_OUT': {
      const problems = detailsItems(error.details).filter(isStockProblem);
      return problems.length > 0 ? { type: 'sold_out', problems } : { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
    }
    case 'NOT_PURCHASABLE': {
      const problems = detailsItems(error.details).filter(isPurchaseProblem);
      return problems.length > 0 ? { type: 'not_purchasable', problems } : { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
    }
    case 'CONFLICT': {
      const field = typeof error.details === 'object' && error.details !== null ? (error.details as { field?: unknown }).field : null;
      return field === 'Idempotency-Key' ? { type: 'key_conflict' } : { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
    }
    case 'PRICE_CHANGED': {
      const total = typeof error.details === 'object' && error.details !== null ? (error.details as { totalCents?: unknown }).totalCents : null;
      return typeof total === 'number' ? { type: 'price_changed', newTotalCents: total } : { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
    }
    case 'RATE_LIMITED':
      return { type: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds && error.retryAfterSeconds > 0 ? error.retryAfterSeconds : DEFAULT_RETRY_SECONDS };
    case 'NETWORK':
    case 'TIMEOUT':
      return { type: 'unknown_outcome', network: true, message: null, requestId: null };
    default:
      // INTERNAL, BAD_RESPONSE, UNKNOWN and any 5xx: the outcome is unknown, retry with the same key.
      if (error.status >= 500 || error.code === 'BAD_RESPONSE' || error.code === 'INTERNAL' || error.code === 'UNKNOWN') {
        return { type: 'unknown_outcome', network: false, message: error.code === 'INTERNAL' && error.message ? error.message : null, requestId };
      }
      // 401 / 403 / unexpected 4xx: generic, with the support line.
      return { type: 'generic', message: GENERIC_TRY_AGAIN, requestId };
  }
}

/** The path `items.N...` of a cart problem in `fields`, grouped by line index. */
export function cartFieldIndices(fields: Record<string, string>): number[] {
  const out = new Set<number>();
  for (const key of Object.keys(fields)) {
    const m = /^items\.(\d+)(?:\.|$)/.exec(key);
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

/** `items.<n>.stimpieIds.<m>`: a duplicate Stimpie inside a pack (line n). */
export function duplicateStimpieLines(fields: Record<string, string>): number[] {
  const out = new Set<number>();
  for (const key of Object.keys(fields)) {
    const m = /^items\.(\d+)\.stimpieIds\.\d+$/.exec(key);
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

export const DUPLICATE_STIMPIE_TEXT = 'A pack needs different Stimpies. Change the repeated one.';

/* ----------------------------------------------------------------------------- SOLD_OUT (4.4) */

export function soldOutHeading(problems: readonly StockProblem[]): string {
  if (problems.length === 1) {
    const p = problems[0] as StockProblem;
    return p.available > 0 ? `Only ${p.available} left of ${p.name}.` : `Sorry, ${p.name} just sold out.`;
  }
  return 'A few items just sold out.';
}

export function soldOutLine(p: StockProblem): string {
  return p.available > 0 ? `Only ${p.available} left of ${p.name}.` : `${p.name} just sold out.`;
}

function withQty(item: CartItem, qty: number): CartItem {
  return { ...item, qty } as CartItem;
}

/**
 * Update the cart from a SOLD_OUT response (4.4.2): the line is `lines[itemIndex]`. `available > 0` lowers that
 * line's quantity by `requested - available` (below 1 -> UNAVAILABLE); `available == 0` marks it UNAVAILABLE.
 * The caller then runs `POST /cart/validate` once to catch other lines sharing the shortage and to refresh totals.
 */
export function applyStockProblems(lines: readonly CartLine[], problems: readonly StockProblem[], now: Date = new Date()): CartLine[] {
  const checkedAt = now.toISOString();
  const next = lines.map((l) => ({ ...l }));
  for (const p of problems) {
    const line = next[p.itemIndex];
    if (!line) continue;
    if (p.available > 0) {
      const lowered = line.item.qty - (p.requested - p.available);
      if (lowered >= 1) {
        next[p.itemIndex] = {
          ...line,
          item: withQty(line.item, clampQty(lowered)),
          check: { state: 'ADJUSTED', reasons: [`Only ${p.available} left of ${p.name}, we updated your cart.`], checkedAt },
        };
        continue;
      }
      next[p.itemIndex] = { ...line, check: { state: 'UNAVAILABLE', reasons: [`Only ${p.available} left of ${p.name}.`], checkedAt } };
      continue;
    }
    const label =
      p.kind === 'HOODIE_VARIANT' ? [line.ui.colorName, line.ui.sizeLabel].filter(Boolean).join(', ') || p.name : p.name;
    next[p.itemIndex] = { ...line, check: { state: 'UNAVAILABLE', reasons: [`${label} just sold out.`], checkedAt } };
  }
  return next;
}

/* ------------------------------------------------------------------- NOT_PURCHASABLE (4.1) */

export function purchaseProblemText(p: PurchaseProblem): string {
  switch (p.reason) {
    case 'INACTIVE':
      return `${p.name} isn't available any more.`;
    case 'DROP_NOT_STARTED':
      return `${p.name} isn't on sale yet. The drop hasn't started.`;
    case 'DROP_ENDED':
      return `${p.name}: this drop has ended.`;
  }
}

export function applyPurchaseProblems(lines: readonly CartLine[], problems: readonly PurchaseProblem[], now: Date = new Date()): CartLine[] {
  const checkedAt = now.toISOString();
  const next = lines.map((l) => ({ ...l }));
  for (const p of problems) {
    const line = next[p.itemIndex];
    if (!line) continue;
    const reasons = line.check.state === 'UNAVAILABLE' ? [...line.check.reasons] : [];
    const text = purchaseProblemText(p);
    if (!reasons.includes(text)) reasons.push(text);
    next[p.itemIndex] = { ...line, check: { state: 'UNAVAILABLE', reasons, checkedAt } };
  }
  return next;
}

/** Cart line indices an `items.N...` validation error points at, marked "Please check this item". */
export function markCheckLines(lines: readonly CartLine[], indices: readonly number[], text: string, now: Date = new Date()): CartLine[] {
  const set = new Set(indices);
  return lines.map((l, i) => (set.has(i) ? { ...l, check: { state: 'ADJUSTED', reasons: [text], checkedAt: now.toISOString() } } : l));
}
