/**
 * Cart persistence (checkout-and-order-flow 1.2). Key `stimpy.cart` holds `{ v: 1, updatedAt, lines }`.
 * Unknown versions, corrupt JSON and malformed lines reset to an empty cart without throwing. Carts older than
 * 30 days are discarded. All storage access is wrapped (in-app browsers, private mode, full quota).
 */
import { readStored, removeStored, storageAvailable, writeStored } from '@/lib/storage';
import { contractItem, isCartItem } from './helpers';
import { CART_MAX_LINES, type CartLine } from './types';

export const CART_STORAGE_KEY = 'stimpy.cart';
export const CART_SCHEMA_VERSION = 1;
export const CART_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredCart {
  v: number;
  updatedAt: string;
  lines: unknown[];
}

export interface LoadedCart {
  lines: CartLine[];
  /** The stored cart was older than 30 days and was discarded. */
  purgedOld: boolean;
  /** Anything unreadable was found and the cart was reset. */
  reset: boolean;
}

const CHECK_STATES = new Set(['OK', 'PRICE_CHANGED', 'ADJUSTED', 'UNAVAILABLE']);

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function reviveLine(value: unknown): CartLine | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isString(v.lineId) || !isCartItem(v.item)) return null;
  const ui = v.ui as Record<string, unknown> | undefined;
  if (!ui || !isString(ui.title) || typeof ui.unitPriceCents !== 'number' || !Number.isFinite(ui.unitPriceCents)) return null;
  const check = v.check as Record<string, unknown> | undefined;
  const state = check && isString(check.state) && CHECK_STATES.has(check.state) ? check.state : 'OK';
  return {
    lineId: v.lineId,
    item: contractItem(v.item),
    ui: {
      title: ui.title,
      imageUrl: isString(ui.imageUrl) ? ui.imageUrl : null,
      hoodieSlug: isString(ui.hoodieSlug) ? ui.hoodieSlug : null,
      packSlug: isString(ui.packSlug) ? ui.packSlug : null,
      colorName: isString(ui.colorName) ? ui.colorName : null,
      colorHex: isString(ui.colorHex) ? ui.colorHex : null,
      sizeLabel: isString(ui.sizeLabel) ? ui.sizeLabel : null,
      stimpies: Array.isArray(ui.stimpies)
        ? ui.stimpies.flatMap((s: unknown) => {
            if (typeof s !== 'object' || s === null) return [];
            const x = s as Record<string, unknown>;
            if (typeof x.id !== 'number' || !isString(x.slug) || !isString(x.name) || !isString(x.artworkUrl)) return [];
            return [{ id: x.id, slug: x.slug, name: x.name, artworkUrl: x.artworkUrl, type: x.type === 'LIMITED' ? ('LIMITED' as const) : ('CORE' as const) }];
          })
        : [],
      unitPriceCents: ui.unitPriceCents,
      addedAt: isString(ui.addedAt) ? ui.addedAt : new Date(0).toISOString(),
    },
    check: {
      state: state as CartLine['check']['state'],
      reasons: Array.isArray(check?.reasons) ? (check.reasons as unknown[]).filter(isString) : [],
      checkedAt: isString(check?.checkedAt) ? check.checkedAt : null,
    },
  };
}

export function loadCart(now: Date = new Date()): LoadedCart {
  const raw = readStored('local', CART_STORAGE_KEY);
  if (!raw) return { lines: [], purgedOld: false, reset: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeStored('local', CART_STORAGE_KEY);
    return { lines: [], purgedOld: false, reset: true };
  }
  const stored = parsed as Partial<StoredCart> | null;
  if (!stored || typeof stored !== 'object' || stored.v !== CART_SCHEMA_VERSION || !Array.isArray(stored.lines)) {
    // Unknown (possibly higher) version or wrong shape: start empty, no error.
    removeStored('local', CART_STORAGE_KEY);
    return { lines: [], purgedOld: false, reset: true };
  }
  const updated = isString(stored.updatedAt) ? Date.parse(stored.updatedAt) : NaN;
  if (Number.isFinite(updated) && now.getTime() - updated > CART_MAX_AGE_MS) {
    removeStored('local', CART_STORAGE_KEY);
    return { lines: [], purgedOld: stored.lines.length > 0, reset: false };
  }
  // At most 20 lines (contract): anything past that could never be validated or ordered.
  const lines = stored.lines.map(reviveLine).filter((l): l is CartLine => l !== null).slice(0, CART_MAX_LINES);
  return { lines, purgedOld: false, reset: lines.length !== stored.lines.length };
}

/** Returns false when the cart could only be kept in memory. */
export function saveCart(lines: readonly CartLine[], now: Date = new Date()): boolean {
  if (lines.length === 0) {
    removeStored('local', CART_STORAGE_KEY);
    return storageAvailable('local');
  }
  const payload: StoredCart = { v: CART_SCHEMA_VERSION, updatedAt: now.toISOString(), lines: [...lines] };
  return writeStored('local', CART_STORAGE_KEY, JSON.stringify(payload));
}
