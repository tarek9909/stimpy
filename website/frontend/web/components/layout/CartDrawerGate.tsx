'use client';

import dynamic from 'next/dynamic';
import { useCart } from '@/features/cart/store';

const CartDrawer = dynamic(() => import('@/features/cart/CartDrawer').then((module) => module.CartDrawer), {
  ssr: false,
});

/** Load the cart's validation and editing UI only when a customer opens the drawer. */
export function CartDrawerGate() {
  const open = useCart((state) => state.drawerOpen);
  return open ? <CartDrawer /> : null;
}
