/**
 * The submit sequence (checkout-and-order-flow 3): pre-submit `POST /cart/validate`, build the body, pick the
 * idempotency key, `POST /orders`, and map the result. UI-free so the whole sequence (and every error code) is
 * unit-tested. Nothing here clears the cart: the page does that after a success outcome (the cart is cleared only
 * after a success response, never before).
 */
import type { ApiClient, CreateOrderRequest, DeliveryFees, PlacedOrder, PurchaseProblem, StockProblem } from '@stimpy/api-client';
import { cartStore, type CartStore } from '@/features/cart/store';
import { hasUnavailable } from '@/features/cart/helpers';
import { validateCart } from '@/features/cart/validate-cart';
import { getAttribution, getFirstTouchAttribution, type Attribution } from '@/lib/utm';
import { areaIdFor, type CheckoutValues } from './form';
import { classifyOrderError } from './outcome';
import { buildOrderPayload, clearAttempt, keyForPayload, withoutAttribution } from './payload';

/** An attempt whose outcome is unknown (network, timeout, 5xx): Retry resends exactly this body with this key. */
export interface PendingAttempt {
  body: CreateOrderRequest;
  key: string;
  /** What the customer could change (form + cart): retry is only "identical" while this still matches. */
  signature: string;
}

export type SubmitOutcome =
  | { type: 'success'; placed: PlacedOrder; replayed: boolean }
  | { type: 'empty' }
  | { type: 'offline' }
  /** The pre-submit validate found lines that cannot be bought or were adjusted: notices are on the cart lines. */
  | { type: 'blocked'; reason: 'UNAVAILABLE' | 'CHANGED' }
  /** The total differs from what the customer saw (pre-submit validate or the server): confirm first. */
  | { type: 'price_changed'; oldTotalCents: number | null; newTotalCents: number; source: 'validate' | 'server' }
  | { type: 'validation'; fields: Record<string, string>; requestId: string | null }
  | { type: 'generic'; message: string; requestId: string | null }
  | { type: 'sold_out'; problems: StockProblem[] }
  | { type: 'not_purchasable'; problems: PurchaseProblem[] }
  | { type: 'rate_limited'; retryAfterSeconds: number }
  | { type: 'unknown_outcome'; network: boolean; message: string | null; requestId: string | null; pending: PendingAttempt };

export interface SubmitInput {
  client: ApiClient;
  store?: CartStore;
  values: CheckoutValues;
  fees: DeliveryFees | null;
  /** Current value of the honeypot input (read from the DOM at submit time). */
  hp: string;
  /** Total the customer currently sees (cents), or null when only an estimate-free state is shown. */
  displayedTotalCents: number | null;
  /** An unknown-outcome attempt to resend identically while nothing changed. */
  pending?: PendingAttempt | null;
  attribution?: Attribution | undefined;
  firstTouch?: Attribution | undefined;
  onToast?: (message: string) => void;
  isOnline?: () => boolean;
  now?: () => Date;
}

/** Stable text for "did the customer change anything since the failed attempt". */
export function submitSignature(values: CheckoutValues, store: CartStore, hp: string): string {
  const normalized = {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    whatsappSame: values.whatsappSame,
    whatsapp: values.whatsappSame ? '' : values.whatsapp.trim(),
    areaChoice: values.areaChoice,
    areaOther: values.areaOther.trim(),
    address: values.address.trim(),
    notes: values.notes.trim(),
  };
  return JSON.stringify({ values: normalized, hp, lines: store.getState().lines.map(({ lineId, item }) => [lineId, item]) });
}

async function send(
  client: ApiClient,
  body: CreateOrderRequest,
  key: string,
  signature: string,
  retried: { conflict: boolean; attribution: boolean },
): Promise<SubmitOutcome> {
  try {
    const { data, response } = await client.POST('/api/v1/orders', { body, headers: { 'Idempotency-Key': key } });
    if (!data) return { type: 'unknown_outcome', network: false, message: null, requestId: response?.headers.get('X-Request-Id') ?? null, pending: { body, key, signature } };
    // 201 (created) and 200 (replay of the same key) are treated identically.
    return { type: 'success', placed: data, replayed: response.status === 200 };
  } catch (error) {
    const outcome = classifyOrderError(error);
    switch (outcome.type) {
      case 'key_conflict': {
        if (retried.conflict) return { type: 'generic', message: 'Something went wrong. Please try again.', requestId: null };
        // The key was reused with a different body: discard it, take a new one, resend once.
        return send(client, body, freshKey(body, signature), signature, { ...retried, conflict: true });
      }
      case 'validation': {
        if (outcome.attributionRejected && !retried.attribution && (body.attribution || body.firstTouch)) {
          // Never block an order over tracking data: drop both attribution records and resend once with a new key.
          const stripped = withoutAttribution(body);
          return send(client, stripped, keyForPayload(stripped, signature).key, signature, { ...retried, attribution: true });
        }
        clearAttempt();
        return { type: 'validation', fields: outcome.fields, requestId: outcome.requestId };
      }
      case 'sold_out':
      case 'not_purchasable':
        clearAttempt();
        return outcome;
      case 'price_changed':
        clearAttempt();
        return { type: 'price_changed', oldTotalCents: body.expectedTotalCents ?? null, newTotalCents: outcome.newTotalCents, source: 'server' };
      case 'rate_limited':
        // Nothing was created: the same key may be reused.
        return outcome;
      case 'generic':
        clearAttempt();
        return outcome;
      case 'unknown_outcome':
        return { ...outcome, pending: { body, key, signature } };
    }
  }
}

/** Replace the stored attempt with a brand-new key for this exact body. */
function freshKey(body: CreateOrderRequest, signature: string): string {
  clearAttempt();
  return keyForPayload(body, signature).key;
}

/**
 * Run the sequence. Safe to call again after any outcome; it re-validates the cart and rebuilds the body, except for
 * `pending` (unknown outcome) which is resent byte for byte while the form and cart are unchanged.
 */
export async function submitOrder(input: SubmitInput): Promise<SubmitOutcome> {
  const store = input.store ?? cartStore;
  const online = input.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const lines = store.getState().lines;
  if (lines.length === 0) return { type: 'empty' };
  if (!online()) return { type: 'offline' };

  const signature = submitSignature(input.values, store, input.hp);
  if (input.pending && input.pending.signature === signature) {
    return send(input.client, input.pending.body, input.pending.key, signature, { conflict: false, attribution: false });
  }

  // 1. Fresh server totals and per-line problems for the chosen area (3: "POST /cart/validate").
  const areaId = areaIdFor(input.values, input.fees);
  const checked = await validateCart({ client: input.client, store, areaId, force: true, onToast: input.onToast, now: input.now });
  let expectedTotalCents: number | null = input.displayedTotalCents;
  if (checked === 'ok') {
    const state = store.getState();
    if (hasUnavailable(state.lines)) return { type: 'blocked', reason: 'UNAVAILABLE' };
    if (state.lines.some((l) => l.check.state === 'ADJUSTED') || (state.validation && !state.validation.ok)) {
      return { type: 'blocked', reason: 'CHANGED' };
    }
    if (state.validation) {
      // The server's total is what the customer must have seen; if it differs they confirm the new figure first.
      if (input.displayedTotalCents !== null && state.validation.totalCents !== input.displayedTotalCents) {
        return { type: 'price_changed', oldTotalCents: input.displayedTotalCents, newTotalCents: state.validation.totalCents, source: 'validate' };
      }
      expectedTotalCents = state.validation.totalCents;
    }
  }
  // 'kept' (network failure, timeout, 429) and 'skipped': the server's answer at submit is the authority; send the
  // displayed total (or none).

  const body = buildOrderPayload({
    values: input.values,
    lines: store.getState().lines,
    fees: input.fees,
    expectedTotalCents,
    attribution: input.attribution ?? getAttribution(),
    firstTouch: input.firstTouch ?? getFirstTouchAttribution(),
    hp: input.hp,
  });
  const { key } = keyForPayload(body, signature);
  return send(input.client, body, key, signature, { conflict: false, attribution: false });
}
