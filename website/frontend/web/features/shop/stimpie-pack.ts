import type { CartItem, CartLine } from '@/features/cart/types';
import { stimpieUnitsInCart } from '@/features/cart/helpers';

export interface StimpieOffer {
  id: number;
  slug: string;
  name: string;
  type: 'HOODIE_SET' | 'STIMPIE_ONLY';
  stimpieCount: number;
  eligibleStimpieIds: readonly number[] | null;
  priceCents: number;
}

export interface StimpieQuantityChoice {
  stimpieId: number;
  qty: number;
}

export function isStimpieOnlyOffer(offer: Pick<StimpieOffer, 'type'>): boolean {
  return offer.type === 'STIMPIE_ONLY';
}

export function eligibleForOffer(offer: StimpieOffer, stimpieId: number): boolean {
  return offer.eligibleStimpieIds === null || offer.eligibleStimpieIds.includes(stimpieId);
}

export function selectedStimpieCount(quantities: Readonly<Record<number, number>>): number {
  return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
}

export function availableUnits(stimpie: { id: number; purchasable: boolean; remaining: number | null }, lines: readonly CartLine[]): number {
  if (!stimpie.purchasable) return 0;
  return stimpie.remaining === null ? Number.MAX_SAFE_INTEGER : Math.max(0, stimpie.remaining - stimpieUnitsInCart(lines, stimpie.id));
}

export function availablePerOffer(
  stimpie: { id: number; purchasable: boolean; remaining: number | null },
  lines: readonly CartLine[],
  offerQty: number,
): number {
  return Math.floor(availableUnits(stimpie, lines) / Math.max(1, offerQty));
}

export function fitOfferQuantities(
  offer: StimpieOffer,
  quantities: Readonly<Record<number, number>>,
  availableById: ReadonlyMap<number, number>,
): Record<number, number> {
  let remaining = offer.stimpieCount;
  const next: Record<number, number> = {};
  for (const [id, rawQty] of Object.entries(quantities)) {
    const stimpieId = Number(id);
    if (!eligibleForOffer(offer, stimpieId)) continue;
    const max = availableById.get(stimpieId) ?? 0;
    const qty = Math.max(0, Math.min(Math.trunc(rawQty), max, remaining));
    if (qty > 0) {
      next[stimpieId] = qty;
      remaining -= qty;
    }
    if (remaining === 0) break;
  }
  return next;
}

export function buildStimpiePackItem(offer: StimpieOffer, quantities: Readonly<Record<number, number>>, qty = 1): CartItem | null {
  if (!isStimpieOnlyOffer(offer) || selectedStimpieCount(quantities) !== offer.stimpieCount) return null;
  const stimpies: StimpieQuantityChoice[] = Object.entries(quantities)
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .map(([stimpieId, count]) => ({ stimpieId: Number(stimpieId), qty: count }))
    .sort((a, b) => a.stimpieId - b.stimpieId);
  if (stimpies.reduce((sum, item) => sum + item.qty, 0) !== offer.stimpieCount) return null;
  if (stimpies.some((item) => !eligibleForOffer(offer, item.stimpieId))) return null;
  return { kind: 'stimpie_pack', packId: offer.id, stimpies, qty };
}

export function parseStimpieQuantitySlugs(values: readonly string[], stimpies: readonly { id: number; slug: string }[]): Record<number, number> {
  const bySlug = new Map(stimpies.map((s) => [s.slug, s.id]));
  const quantities: Record<number, number> = {};
  for (const value of values) {
    const match = /^([a-z0-9][a-z0-9-]{0,80})(?::([1-9]\d{0,6}))?$/.exec(value.trim().toLowerCase());
    const stimpieId = match ? bySlug.get(match[1]!) : undefined;
    if (stimpieId === undefined) continue;
    quantities[stimpieId] = Math.min(1_000_000, (quantities[stimpieId] ?? 0) + Number(match?.[2] ?? 1));
  }
  return quantities;
}

export function serializeStimpieQuantities(quantities: Readonly<Record<number, number>>, stimpies: readonly { id: number; slug: string }[]): string {
  return stimpies.flatMap((stimpie) => {
    const qty = quantities[stimpie.id] ?? 0;
    return qty > 0 ? [`${stimpie.slug}:${qty}`] : [];
  }).join(',');
}
