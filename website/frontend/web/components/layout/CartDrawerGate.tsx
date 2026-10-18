'use client';

import dynamic from 'next/dynamic';
import { Drawer, Spinner } from '@stimpy/ui';
import { cartStore, useCart } from '@/features/cart/store';
import { isDataSaver } from '@/lib/useSaveData';

const loadDrawer = () => import('@/features/cart/CartDrawer');

/** Start the chunk on intent so opening the bag usually needs no further download. */
export function preloadCartDrawer() {
  if (!isDataSaver()) void loadDrawer().catch(() => undefined);
}

const CartDrawer = dynamic(() => loadDrawer().then((module) => module.CartDrawer), {
  ssr: false,
  loading: () => (
    <Drawer open onClose={() => cartStore.getState().closeDrawer()} title="Your cart" className="store-cart-drawer">
      <div className="flex min-h-32 items-center justify-center gap-3 text-fg-muted" role="status">
        <Spinner size="sm" /> Loading your cart…
      </div>
    </Drawer>
  ),
});

/** Load the cart's validation and editing UI only when a customer opens the drawer. */
export function CartDrawerGate() {
  const open = useCart((state) => state.drawerOpen);
  return open ? <CartDrawer /> : null;
}
