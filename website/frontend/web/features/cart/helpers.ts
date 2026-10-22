import { CART_MAX_QTY, CART_MIN_QTY, type CartItem, type CartLine } from './types';

/** Contract limit: `stimpieIds` holds 1 to 5 ids. */
const PACK_MAX_STIMPIES = 5;

/** Clamp to the contract range 1..10. */
export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return CART_MIN_QTY;
  return Math.min(CART_MAX_QTY, Math.max(CART_MIN_QTY, Math.trunc(n)));
}

/** Distinct ids, original order kept (a pack is N different designs). */
export function dedupeIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids));
}

/**
 * Identity of a cart line for merging: same kind, ids, colour, size and the same SET of stimpieIds
 * (order does not matter). Quantity is not part of the key.
 */
export function itemKey(item: CartItem): string {
  switch (item.kind) {
    case 'pack':
      return `pack:${item.packId}:${item.hoodieId}:${item.colorId}:${item.sizeId}:${[...item.stimpieIds].sort((a, b) => a - b).join(',')}`;
    case 'hoodie':
      return `hoodie:${item.hoodieId}:${item.colorId}:${item.sizeId}`;
    case 'stimpie':
      return `stimpie:${item.stimpieId}`;
  }
}

/** Fingerprint the exact cart payload and line identities captured by an async validation request. */
export function cartLinesFingerprint(lines: readonly CartLine[]): string {
  return JSON.stringify(lines.map(({ lineId, item }) => [lineId, item]));
}

/** Units of one Stimpie across all lines: pack picks and extras, each multiplied by the line quantity. */
export function stimpieUnitsInCart(lines: readonly CartLine[], stimpieId: number): number {
  let total = 0;
  for (const line of lines) {
    const { item } = line;
    if (item.kind === 'pack') {
      if (item.stimpieIds.includes(stimpieId)) total += item.qty;
    } else if (item.kind === 'stimpie' && item.stimpieId === stimpieId) {
      total += item.qty;
    }
  }
  return total;
}

/** Sum of `qty` over all lines (what the header badge shows). */
export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.item.qty, 0);
}

/** Client estimate of the lines that are not UNAVAILABLE. Always labelled "estimated" in the UI. */
export function estimateSubtotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => (l.check.state === 'UNAVAILABLE' ? sum : sum + l.ui.unitPriceCents * l.item.qty), 0);
}

export function hasUnavailable(lines: readonly CartLine[]): boolean {
  return lines.some((l) => l.check.state === 'UNAVAILABLE');
}

/** Type guard for stored data: only well-formed items survive a load. */
export function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0;
  const qtyOk = typeof v.qty === 'number' && Number.isInteger(v.qty) && v.qty >= CART_MIN_QTY && v.qty <= CART_MAX_QTY;
  if (!qtyOk) return false;
  switch (v.kind) {
    case 'pack':
      return (
        int(v.packId) &&
        int(v.hoodieId) &&
        int(v.colorId) &&
        int(v.sizeId) &&
        Array.isArray(v.stimpieIds) &&
        v.stimpieIds.length > 0 &&
        v.stimpieIds.length <= PACK_MAX_STIMPIES &&
        v.stimpieIds.every(int)
      );
    case 'hoodie':
      return int(v.hoodieId) && int(v.colorId) && int(v.sizeId);
    case 'stimpie':
      return int(v.stimpieId);
    default:
      return false;
  }
}

/**
 * Only the contract keys of a stored item. `POST /cart/validate` and `POST /orders` use strict schemas, so one stray
 * key left in `stimpy.cart` (an older build, a hand edit) would otherwise fail every check and every order.
 */
export function contractItem(item: CartItem): CartItem {
  switch (item.kind) {
    case 'pack':
      return { kind: 'pack', packId: item.packId, hoodieId: item.hoodieId, colorId: item.colorId, sizeId: item.sizeId, stimpieIds: [...item.stimpieIds], qty: item.qty };
    case 'hoodie':
      return { kind: 'hoodie', hoodieId: item.hoodieId, colorId: item.colorId, sizeId: item.sizeId, qty: item.qty };
    case 'stimpie':
      return { kind: 'stimpie', stimpieId: item.stimpieId, qty: item.qty };
  }
}
