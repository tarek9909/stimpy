import type { Pack, Stimpie } from '@prisma/client';
import type { Db } from '../lib/db';
import { promotionPriceKey, promotionPriceMap, type PromotionPrice } from './promotions';

export type PackTypeName = 'HOODIE_SET' | 'STIMPIE_ONLY';

/** Safe reader for the nullable JSON eligibility set. Null means every design is eligible. */
export function eligibleStimpieIds(value: unknown): number[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is number => Number.isInteger(id) && id > 0);
}

export function packAllowsStimpie(pack: Pick<Pack, 'eligibleStimpieIds'>, stimpieId: number): boolean {
  const ids = eligibleStimpieIds(pack.eligibleStimpieIds);
  return ids === null || ids.includes(stimpieId);
}

/**
 * Effective standalone catalog price: an active one-Stimpie-only offer sets the price for its eligible designs.
 * Such offer prices are fixed offer prices, so product promotions do not stack on top of them.
 */
export async function stimpiePriceMap(
  db: Db,
  stimpies: Pick<Stimpie, 'id' | 'priceCents'>[],
  at: Date,
): Promise<Map<number, PromotionPrice>> {
  if (!stimpies.length) return new Map();
  const offers = await db.pack.findMany({
    where: { type: 'STIMPIE_ONLY', active: true, stimpieCount: 1 },
    select: { eligibleStimpieIds: true, priceCents: true },
  });
  const fixedPrice = new Map<number, number>();
  for (const stimpie of stimpies) {
    for (const offer of offers) {
      const eligible = eligibleStimpieIds(offer.eligibleStimpieIds);
      if (eligible !== null && !eligible.includes(stimpie.id)) continue;
      const current = fixedPrice.get(stimpie.id);
      if (current === undefined || offer.priceCents < current) fixedPrice.set(stimpie.id, offer.priceCents);
    }
  }

  const promoted = await promotionPriceMap(
    db,
    stimpies.filter((stimpie) => !fixedPrice.has(stimpie.id)).map((stimpie) => ({ productType: 'STIMPIE' as const, productId: stimpie.id, priceCents: stimpie.priceCents })),
    at,
  );
  const result = new Map<number, PromotionPrice>();
  for (const stimpie of stimpies) {
    const offerPrice = fixedPrice.get(stimpie.id);
    result.set(stimpie.id, offerPrice === undefined
      ? promoted.get(promotionPriceKey('STIMPIE', stimpie.id)) ?? { priceCents: stimpie.priceCents, compareAtPriceCents: null }
      : { priceCents: offerPrice, compareAtPriceCents: null });
  }
  return result;
}
