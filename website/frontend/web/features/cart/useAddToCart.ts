'use client';

import { useCallback } from 'react';
import { track } from '@/lib/track';
import { cartStore, type AddResult } from './store';
import type { CartItem, CartLineUi } from './types';

export const CART_FULL_TEXT = 'Your cart is full. Check out first, or remove a line.';

export type AddSource = 'builder' | 'product' | 'shop';

/**
 * The one way to put something into the cart from the UI: adds (merging identical lines), opens the drawer,
 * tracks `add_to_cart` (kind, pack slug, value, source: never personal data) and returns the result so the caller
 * can show the "cart is full" text inline.
 */
export function useAddToCart(): (
  line: { item: CartItem; ui: Omit<CartLineUi, 'addedAt'> & { addedAt?: string } },
  source: AddSource,
) => AddResult {
  return useCallback((line, source) => {
    const result = cartStore.getState().add(line.item, line.ui, { openDrawer: true });
    if (result.ok) {
      track('add_to_cart', {
        kind: line.item.kind,
        pack_slug: line.ui.packSlug,
        value_cents: line.ui.unitPriceCents * line.item.qty,
        source,
      });
    }
    return result;
  }, []);
}
