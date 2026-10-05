/**
 * Builds the `POST /orders` body (checkout-and-order-flow 2.2, 2.3, 2.5, 8) and the idempotency attempt
 * bookkeeping (2.6). Pure except for sessionStorage access in `attempt*`, which is wrapped by lib/storage.
 */
import type { CreateOrderRequest, DeliveryFees } from '@stimpy/api-client';
import { readStored, removeStored, writeStored } from '@/lib/storage';
import { uuid } from '@/lib/uuid';
import type { CartLine } from '@/features/cart/types';
import { areaIdFor, areaNameFor, OTHER_AREA, type CheckoutValues } from './form';
import type { Attribution } from '@/lib/utm';

export interface BuildPayloadInput {
  values: CheckoutValues;
  lines: readonly CartLine[];
  fees: DeliveryFees | null;
  /** The grand total including delivery (from the pre-submit `POST /cart/validate`). */
  expectedTotalCents: number | null;
  attribution: Attribution | undefined;
  firstTouch: Attribution | undefined;
  /** Current value of the honeypot input. A real person leaves it empty. */
  hp: string;
}

/** The exact request body. `attribution` is omitted when absent; `expectedTotalCents` when unknown. */
export function buildOrderPayload(input: BuildPayloadInput): CreateOrderRequest {
  const { values, lines, fees } = input;
  const areaId = areaIdFor(values, fees);
  const notes = values.notes.trim();
  const body: CreateOrderRequest = {
    customer: {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      whatsapp: values.whatsappSame ? null : values.whatsapp.trim(),
      whatsappSameAsPhone: values.whatsappSame,
    },
    delivery: {
      ...(areaId !== null ? { areaId } : {}),
      areaName: areaNameFor(values, fees),
      address: values.address.trim(),
      notes: notes === '' ? null : notes,
    },
    // Every cart line in cart order: `itemIndex` in server answers is the position in this array.
    items: lines.map((l) => l.item),
    ...(input.expectedTotalCents !== null ? { expectedTotalCents: input.expectedTotalCents } : {}),
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(input.firstTouch ? { firstTouch: input.firstTouch } : {}),
    hp: input.hp,
  };
  return body;
}

/** Restore visible checkout fields from a pending body if the draft write had not completed before reload. */
export function checkoutValuesFromPayload(body: CreateOrderRequest): CheckoutValues {
  const hasAreaId = body.delivery.areaId !== undefined;
  return {
    name: body.customer.name,
    email: body.customer.email,
    phone: body.customer.phone,
    whatsappSame: body.customer.whatsappSameAsPhone,
    whatsapp: body.customer.whatsapp ?? '',
    areaChoice: hasAreaId ? String(body.delivery.areaId) : OTHER_AREA,
    areaOther: hasAreaId ? '' : body.delivery.areaName,
    address: body.delivery.address,
    notes: body.delivery.notes ?? '',
  };
}

/** Same body without `attribution` (resend once when the server rejects it, 4.3). */
export function withoutAttribution(body: CreateOrderRequest): CreateOrderRequest {
  const { attribution: _dropped, firstTouch: _firstTouch, ...rest } = body;
  void _dropped;
  void _firstTouch;
  return rest;
}

/** Deterministic hash (cyrb53) of the exact request body. Not cryptographic; it only detects "payload changed". */
export function hashPayload(body: unknown): string {
  const str = JSON.stringify(body);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/* ------------------------------------------------------------------------ idempotency attempt */

export const ATTEMPT_STORAGE_KEY = 'stimpy.checkout.attempt';

interface StoredAttempt {
  v: 1;
  key: string;
  payloadHash: string;
  /** Needed to replay an accepted order when its response was lost and the page was reloaded. */
  body: CreateOrderRequest;
  /** Checkout fields + cart identity, used to reject a stale pending replay after user edits. */
  signature: string;
}

function readAttempt(): StoredAttempt | null {
  const raw = readStored('session', ATTEMPT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredAttempt> | null;
    if (
      v && v.v === 1 && typeof v.key === 'string' && typeof v.payloadHash === 'string' &&
      v.body && typeof v.body === 'object' && !Array.isArray(v.body) && typeof v.signature === 'string' &&
      hashPayload(v.body) === v.payloadHash
    ) return { v: 1, key: v.key, payloadHash: v.payloadHash, body: v.body, signature: v.signature };
  } catch {
    /* fall through */
  }
  removeStored('session', ATTEMPT_STORAGE_KEY);
  return null;
}

/**
 * The key for this payload (2.6): reuse the stored key when the payload is identical (retry after a network
 * failure, timeout, 5xx, refresh, RATE_LIMITED); otherwise generate a new UUID and store `{ key, payloadHash }`.
 */
export function keyForPayload(body: unknown, signature = ''): { key: string; reused: boolean } {
  const payloadHash = hashPayload(body);
  const stored = readAttempt();
  if (stored && stored.payloadHash === payloadHash) {
    writeStored('session', ATTEMPT_STORAGE_KEY, JSON.stringify({ ...stored, signature } satisfies StoredAttempt));
    return { key: stored.key, reused: true };
  }
  const key = uuid();
  writeStored('session', ATTEMPT_STORAGE_KEY, JSON.stringify({ v: 1, key, payloadHash, body: body as CreateOrderRequest, signature } satisfies StoredAttempt));
  return { key, reused: false };
}

/** Forget the attempt: after success, after a definitive 4xx, or when the server reports a key conflict. */
export function clearAttempt(): void {
  removeStored('session', ATTEMPT_STORAGE_KEY);
}

/** Test helper / debugging: the stored attempt. */
export function peekAttempt(): { key: string; payloadHash: string } | null {
  const stored = readAttempt();
  return stored ? { key: stored.key, payloadHash: stored.payloadHash } : null;
}

/** Pending order data is session-scoped and cleared by `clearAttempt` on success or any definitive response. */
export function readPendingAttempt(): { key: string; body: CreateOrderRequest; signature: string } | null {
  const stored = readAttempt();
  return stored ? { key: stored.key, body: stored.body, signature: stored.signature } : null;
}
