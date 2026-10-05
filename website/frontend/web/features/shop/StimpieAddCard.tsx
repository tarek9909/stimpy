'use client';

import { StimpieCard, useOptionalToast, type StimpieCardProps } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { cartStore } from '@/features/cart/store';
import { stimpieUnitsInCart } from '@/features/cart/helpers';
import { CART_FULL_TEXT, useAddToCart, type AddSource } from '@/features/cart/useAddToCart';
import { buildStimpieLine } from './composer';

/**
 * `StimpieCard` with the "Add" button wired to the cart (an extra Stimpie: `{ kind: 'stimpie', stimpieId, qty: 1 }`).
 * Server components cannot pass functions to the card, so every grid that needs Add renders this island.
 */
export function StimpieAddCard({
  stimpie,
  source = 'shop',
  ...rest
}: Omit<StimpieCardProps, 'stimpie' | 'onAdd'> & { stimpie: Stimpie; source?: AddSource }) {
  const add = useAddToCart();
  const toast = useOptionalToast();
  return (
    <StimpieCard
      {...rest}
      stimpie={stimpie}
      onAdd={() => {
        // A LOW Stimpie: the whole cart (pack picks plus extras) may not exceed `remaining`.
        if (stimpie.remaining !== null && stimpieUnitsInCart(cartStore.getState().lines, stimpie.id) + 1 > stimpie.remaining) {
          toast?.info(`Only ${stimpie.remaining} left, and they are already in your cart.`);
          return;
        }
        const result = add(buildStimpieLine(stimpie), source);
        if (!result.ok && result.reason === 'FULL') toast?.info(CART_FULL_TEXT);
      }}
    />
  );
}
