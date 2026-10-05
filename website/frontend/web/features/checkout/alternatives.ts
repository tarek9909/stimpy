/**
 * "Alternatives" after SOLD_OUT (checkout-and-order-flow 4.4.3). Pure helpers: which Stimpies to offer, which other
 * hoodie colour/size combinations are in stock, and how a swap rewrites a cart line.
 */
import type { HoodieDetail, Stimpie } from '@stimpy/api-client';
import type { CartItem, CartLine, CartLineUi } from '@/features/cart/types';
import { clampQty, dedupeIds } from '@/features/cart/helpers';

/** Up to `limit` purchasable Stimpies, the sold-out one's `type` first, never one already in the same pack. */
export function stimpieAlternatives(
  all: readonly Stimpie[],
  soldOutId: number,
  soldOutType: 'CORE' | 'LIMITED' | null,
  excludeIds: readonly number[],
  limit = 4,
): Stimpie[] {
  const blocked = new Set([soldOutId, ...excludeIds]);
  const usable = all.filter((s) => s.purchasable && !blocked.has(s.id));
  const same = soldOutType ? usable.filter((s) => s.type === soldOutType) : [];
  const other = usable.filter((s) => !same.includes(s));
  return [...same, ...other].slice(0, limit);
}

export interface VariantChoice {
  colorId: number;
  sizeId: number;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
}

/** In-stock colour/size combinations other than the one that sold out. */
export function variantAlternatives(hoodie: HoodieDetail, soldOut: { colorId: number; sizeId: number }, limit = 6): VariantChoice[] {
  const out: VariantChoice[] = [];
  for (const v of hoodie.variants) {
    if (!v.inStock || (v.colorId === soldOut.colorId && v.sizeId === soldOut.sizeId)) continue;
    const color = hoodie.colors.find((c) => c.id === v.colorId);
    const size = hoodie.sizes.find((s) => s.id === v.sizeId);
    if (!color || !size) continue;
    out.push({ colorId: color.id, sizeId: size.id, colorName: color.name, colorHex: color.hex, sizeLabel: size.label });
  }
  // The sold-out colour first (just another size), then the rest.
  out.sort((a, b) => Number(b.colorId === soldOut.colorId) - Number(a.colorId === soldOut.colorId));
  return out.slice(0, limit);
}

/** Replace `oldId` by `replacement` in a line: inside a pack's `stimpieIds`, or the extra Stimpie itself. */
export function swapStimpieInLine(line: CartLine, oldId: number, replacement: Stimpie): { item: CartItem; ui: Omit<CartLineUi, 'addedAt'> & { addedAt: string } } | null {
  const picked = { id: replacement.id, slug: replacement.slug, name: replacement.name, artworkUrl: replacement.artworkUrl, type: replacement.type };
  const { item, ui } = line;
  if (item.kind === 'pack') {
    if (!item.stimpieIds.includes(oldId) || item.stimpieIds.includes(replacement.id)) return null;
    const stimpieIds = dedupeIds(item.stimpieIds.map((id) => (id === oldId ? replacement.id : id)));
    return {
      item: { ...item, stimpieIds },
      ui: { ...ui, stimpies: ui.stimpies.map((s) => (s.id === oldId ? picked : s)) },
    };
  }
  if (item.kind === 'stimpie' && item.stimpieId === oldId) {
    return {
      item: { kind: 'stimpie', stimpieId: replacement.id, qty: clampQty(item.qty) },
      ui: {
        ...ui,
        title: `Stimpie: ${replacement.name}`,
        imageUrl: replacement.images[0] ?? replacement.artworkUrl,
        stimpies: [picked],
        unitPriceCents: replacement.priceCents,
      },
    };
  }
  return null;
}

/** Change a pack or hoodie line to another colour/size of the same hoodie. */
export function switchVariantInLine(line: CartLine, hoodie: HoodieDetail, choice: VariantChoice): { item: CartItem; ui: Omit<CartLineUi, 'addedAt'> & { addedAt: string } } | null {
  const { item, ui } = line;
  if (item.kind === 'stimpie') return null;
  const color = hoodie.colors.find((c) => c.id === choice.colorId);
  return {
    item: { ...item, colorId: choice.colorId, sizeId: choice.sizeId },
    ui: { ...ui, colorName: choice.colorName, colorHex: choice.colorHex, sizeLabel: choice.sizeLabel, imageUrl: color?.images[0] ?? ui.imageUrl },
  };
}
