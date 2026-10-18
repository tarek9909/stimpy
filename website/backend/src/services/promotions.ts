import type { PromotionProductType } from '@prisma/client';
import type { Db } from '../lib/db';

export type PromotionPriceTarget = {
  productType: PromotionProductType;
  productId: number;
  priceCents: number;
};

export type PromotionPrice = { priceCents: number; compareAtPriceCents: number | null };

const targetKey = (productType: PromotionProductType, productId: number) => `${productType}:${productId}`;

/** Current sale prices for the requested catalog products. Overlapping promotions use the lowest price. */
export async function promotionPriceMap(db: Db, targets: PromotionPriceTarget[], at: Date): Promise<Map<string, PromotionPrice>> {
  if (targets.length === 0) return new Map();
  const promotions = await db.promotion.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
      ],
    },
    include: { items: { select: { productType: true, productId: true } } },
  });
  const result = new Map<string, PromotionPrice>();
  for (const target of targets) {
    let priceCents = target.priceCents;
    const eligible = promotions.filter((promotion) =>
      promotion.allProducts || promotion.items.some((item) => item.productType === target.productType && item.productId === target.productId),
    );
    for (const promotion of eligible) {
      const next = promotion.discountType === 'PERCENTAGE'
        ? Math.round((target.priceCents * (100 - promotion.discountValue)) / 100)
        : Math.max(0, target.priceCents - promotion.discountValue);
      if (next < priceCents) priceCents = next;
    }
    result.set(targetKey(target.productType, target.productId), {
      priceCents,
      compareAtPriceCents: priceCents < target.priceCents ? target.priceCents : null,
    });
  }
  return result;
}

export const promotionPriceKey = targetKey;
