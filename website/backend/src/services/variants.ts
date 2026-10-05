import type { Tx } from '../lib/db';

/** e.g. `HOOD-1-C2-S3` (unique per variant). */
export const variantSku = (hoodieId: number, colorId: number, sizeId: number): string => `HOOD-${hoodieId}-C${colorId}-S${sizeId}`;

/**
 * Shared by options (new colour/size), catalog (new hoodie) and anywhere the variant grid can change.
 * Creates the missing zero-stock variants for hoodie x ACTIVE colour x ACTIVE size, optionally limited to one
 * hoodie / colour / size. Idempotent. Returns how many variants were created.
 */
export async function ensureVariants(tx: Tx, scope: { hoodieId?: number; colorId?: number; sizeId?: number } = {}): Promise<number> {
  const [hoodies, colors, sizes] = await Promise.all([
    tx.hoodie.findMany({ where: scope.hoodieId ? { id: scope.hoodieId } : {}, select: { id: true } }),
    tx.color.findMany({ where: { active: true, ...(scope.colorId ? { id: scope.colorId } : {}) }, select: { id: true } }),
    tx.size.findMany({ where: { active: true, ...(scope.sizeId ? { id: scope.sizeId } : {}) }, select: { id: true } }),
  ]);
  if (!hoodies.length || !colors.length || !sizes.length) return 0;

  const existing = await tx.hoodieVariant.findMany({
    where: {
      hoodieId: { in: hoodies.map((h) => h.id) },
      colorId: { in: colors.map((c) => c.id) },
      sizeId: { in: sizes.map((s) => s.id) },
    },
    select: { hoodieId: true, colorId: true, sizeId: true },
  });
  const have = new Set(existing.map((v) => `${v.hoodieId}-${v.colorId}-${v.sizeId}`));
  const data: { hoodieId: number; colorId: number; sizeId: number; sku: string; quantity: number; reserved: number }[] = [];
  for (const h of hoodies) {
    for (const c of colors) {
      for (const s of sizes) {
        if (!have.has(`${h.id}-${c.id}-${s.id}`)) {
          data.push({ hoodieId: h.id, colorId: c.id, sizeId: s.id, sku: variantSku(h.id, c.id, s.id), quantity: 0, reserved: 0 });
        }
      }
    }
  }
  if (!data.length) return 0;
  const res = await tx.hoodieVariant.createMany({ data, skipDuplicates: true });
  return res.count;
}
