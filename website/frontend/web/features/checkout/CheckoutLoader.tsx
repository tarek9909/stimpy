'use client';

import dynamic from 'next/dynamic';
import { Skeleton, SkeletonGroup } from '@stimpy/ui';

/**
 * The checkout depends entirely on browser state (cart, session storage, live validation), so it renders on the client
 * only: nothing it shows can ever disagree with server HTML, and the page ships a skeleton until it is ready.
 */
const CheckoutView = dynamic(() => import('./CheckoutView').then((m) => m.CheckoutView), {
  ssr: false,
  loading: () => (
    <SkeletonGroup label="Loading your cart">
      <Skeleton variant="rect" className="h-40" />
    </SkeletonGroup>
  ),
});

export function CheckoutLoader() {
  return <CheckoutView />;
}
