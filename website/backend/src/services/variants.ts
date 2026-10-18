import type { Tx } from '../lib/db';
import { AppError } from '../lib/errors';

/** e.g. `HOOD-1-C2-S3` (unique per variant). */
export const variantSku = (hoodieId: number, colorId: number, sizeId: number): string => `HOOD-${hoodieId}-C${colorId}-S${sizeId}`;

/**
 * Seed helper: creates missing variants for every active colour and size on a hoodie.
 * Admin product editing uses syncHoodieVariants so catalog options are attached explicitly per hoodie.
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

/** Sets one hoodie's offered colour/size matrix while retaining unselected variants for order and stock history. */
export async function syncHoodieVariants(tx: Tx, hoodieId: number, colorIds: number[], sizeIds: number[]): Promise<void> {
  const uniqueColors = [...new Set(colorIds)];
  const uniqueSizes = [...new Set(sizeIds)];
  if (uniqueColors.length !== colorIds.length) throw AppError.validation({ colorIds: 'Choose each colour once.' });
  if (uniqueSizes.length !== sizeIds.length) throw AppError.validation({ sizeIds: 'Choose each size once.' });
  if (uniqueColors.length * uniqueSizes.length > 500) {
    throw AppError.validation({ colorIds: 'A hoodie can have at most 500 colour and size combinations.' });
  }

  const existing = await tx.hoodieVariant.findMany({
    where: { hoodieId },
    select: { id: true, colorId: true, sizeId: true, active: true },
  });
  const currentlySelected = existing.filter((variant) => variant.active);
  const existingColorIds = new Set(currentlySelected.map((variant) => variant.colorId));
  const existingSizeIds = new Set(currentlySelected.map((variant) => variant.sizeId));
  const [colors, sizes] = await Promise.all([
    uniqueColors.length ? tx.color.findMany({ where: { id: { in: uniqueColors } }, select: { id: true, active: true } }) : [],
    uniqueSizes.length ? tx.size.findMany({ where: { id: { in: uniqueSizes } }, select: { id: true, active: true } }) : [],
  ]);
  if (colors.length !== uniqueColors.length || colors.some((color) => !color.active && !existingColorIds.has(color.id))) {
    throw AppError.validation({ colorIds: 'Choose active colours. Hidden colours can stay selected only on hoodies that already use them.' });
  }
  if (sizes.length !== uniqueSizes.length || sizes.some((size) => !size.active && !existingSizeIds.has(size.id))) {
    throw AppError.validation({ sizeIds: 'Choose active sizes. Hidden sizes can stay selected only on hoodies that already use them.' });
  }

  const desired = new Set(uniqueColors.flatMap((colorId) => uniqueSizes.map((sizeId) => `${colorId}-${sizeId}`)));
  const byPair = new Map(existing.map((variant) => [`${variant.colorId}-${variant.sizeId}`, variant]));
  const activate = existing.filter((variant) => desired.has(`${variant.colorId}-${variant.sizeId}`)).map((variant) => variant.id);
  const deactivate = existing.filter((variant) => !desired.has(`${variant.colorId}-${variant.sizeId}`)).map((variant) => variant.id);
  if (activate.length) await tx.hoodieVariant.updateMany({ where: { id: { in: activate }, active: false }, data: { active: true } });
  if (deactivate.length) await tx.hoodieVariant.updateMany({ where: { id: { in: deactivate }, active: true }, data: { active: false } });

  const missing = uniqueColors.flatMap((colorId) => uniqueSizes.flatMap((sizeId) => {
    if (byPair.has(`${colorId}-${sizeId}`)) return [];
    return [{ hoodieId, colorId, sizeId, sku: variantSku(hoodieId, colorId, sizeId), quantity: 0, reserved: 0, active: true }];
  }));
  if (missing.length) await tx.hoodieVariant.createMany({ data: missing, skipDuplicates: true });
}
