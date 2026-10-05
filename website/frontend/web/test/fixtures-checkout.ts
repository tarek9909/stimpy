import type { CartItem } from '@stimpy/api-client';
import type { CartLineUi } from '@/features/cart/types';
import { ui } from './fixtures';

/** An extra-Stimpie cart line (price $10). */
export function stimpieLine(over: Partial<CartLineUi> = {}): { item: CartItem; ui: Omit<CartLineUi, 'addedAt'> } {
  return {
    item: { kind: 'stimpie', stimpieId: 4, qty: 1 },
    ui: ui({ title: 'Stimpie: THE VOID', hoodieSlug: null, packSlug: null, colorName: null, colorHex: null, sizeLabel: null, unitPriceCents: 1000, ...over }),
  };
}
