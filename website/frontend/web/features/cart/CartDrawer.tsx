'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Banner, Button, Drawer, EmptyState, formatCents, pluralize, useOptionalToast } from '@stimpy/ui';
import { ShoppingBag } from '@/components/icons';
import { browserApi } from '@/lib/api-browser';
import { track } from '@/lib/track';
import { CartLineRow } from './CartLineRow';
import { EditLineModal } from './EditLineModal';
import { cartItemCount, estimateSubtotalCents, hasUnavailable } from './helpers';
import { cartStore, useCart } from './store';
import { useDeliveryEstimate } from './useDeliveryEstimate';
import { validateCart } from './validate-cart';

/**
 * Cart drawer (checkout-and-order-flow 1.5/1.6, website-pages 3.3), mounted once in the layout. Opens from the header
 * and after every add; validates the cart in the background when it opens; Checkout is disabled while a line is
 * unavailable; pack and hoodie lines can be edited in place (PackComposer) and the delivery note shows the
 * estimate text from `GET /delivery/fees`.
 */
export function CartDrawer() {
  const open = useCart((s) => s.drawerOpen);
  const lines = useCart((s) => s.lines);
  const validation = useCart((s) => s.validation);
  const persistent = useCart((s) => s.persistent);
  const hydrated = useCart((s) => s.hydrated);
  const announcement = useCart((s) => s.announcement);
  const pathname = usePathname();
  const toast = useOptionalToast();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const lastPathname = useRef(pathname);
  const [checking, setChecking] = useState(false);
  const [offline, setOffline] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const count = cartItemCount(lines);
  const blocked = hasUnavailable(lines);
  const deliveryEstimate = useDeliveryEstimate(open);

  // The drawer is code-split and only mounted after it opens, so don't close it on first mount.
  // Close it only when the customer navigates while the drawer is already mounted.
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      cartStore.getState().closeDrawer();
      lastPathname.current = pathname;
    }
  }, [pathname]);

  // Validate when it opens, and again (debounced 500 ms) whenever quantities or lines change while open.
  const signature = lines.map((l) => `${l.lineId}:${l.item.qty}`).join('|');
  useEffect(() => {
    if (!open || lines.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true);
      return;
    }
    setOffline(false);
    let cancelled = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        await validateCart({ client: browserApi(), onToast: (m) => toast?.info(m) });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature stands for the line list
  }, [open, signature]);

  useEffect(() => {
    if (open) track('cart_open', { items_count: count });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens
  }, [open]);

  // Back online while the drawer is open: check again (the stored snapshot was shown meanwhile).
  useEffect(() => {
    if (!open) return;
    const onOnline = () => {
      setOffline(false);
      void validateCart({ client: browserApi(), force: true, onToast: (m) => toast?.info(m) });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast API identity is stable enough
  }, [open]);

  const estimated = estimateSubtotalCents(lines);
  const subtotal = validation ? validation.subtotalCents : estimated;
  const showEstimate = !validation;
  const estimateText = validation?.estimateText || deliveryEstimate;

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="cart-announcer">
        {announcement}
      </div>
      <Drawer
        open={open && hydrated}
        onClose={() => cartStore.getState().closeDrawer()}
        title="Your cart"
        className="store-cart-drawer"
        initialFocusRef={headingRef}
        footer={
          lines.length > 0 ? (
            <div className="flex w-full flex-col gap-2">
              <Button
                href="/checkout"
                variant="cta"
                size="lg"
                fullWidth
                disabled={blocked}
                onClick={() => track('cta_click', { id: 'cart_checkout', path: pathname ?? '' })}
              >
                Checkout
              </Button>
              {blocked ? (
                <p className="text-center text-body-sm text-fg-muted" data-testid="checkout-blocked">
                  Remove or replace the unavailable items to check out.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => cartStore.getState().closeDrawer()}
                className="min-h-11 text-body-sm font-medium text-fg underline underline-offset-4"
              >
                Continue shopping
              </button>
            </div>
          ) : undefined
        }
      >
        <p ref={headingRef} tabIndex={-1} className="text-body-sm text-fg-muted outline-none">
          {count === 0 ? 'Nothing here yet' : pluralize(count, 'item')}
        </p>
        {!persistent && lines.length > 0 ? (
          <Banner variant="info" className="mt-3">
            Your cart won&apos;t be saved if you close this tab.
          </Banner>
        ) : null}
        {lines.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag width={32} height={32} />}
            title="Your cart is empty."
            text="Add a hoodie and a Stimpie or two."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button href="/shop" variant="dark" onClick={() => cartStore.getState().closeDrawer()}>
                  Shop
                </Button>
                <Button href="/builder" variant="secondary" onClick={() => cartStore.getState().closeDrawer()}>
                  Try the Builder
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {offline ? (
              <Banner variant="info" className="mt-3" live>
                Prices and stock will be checked when you&apos;re back online.
              </Banner>
            ) : null}
            <ul className="mt-2" aria-label="Cart items">
              {lines.map((line) => (
                <CartLineRow key={line.lineId} line={line} onEdit={setEditingId} />
              ))}
            </ul>
            <dl className="mt-4 flex flex-col gap-1 text-body">
              <div className="flex items-baseline justify-between">
                <dt className="font-medium text-fg">{showEstimate ? 'Estimated subtotal' : 'Subtotal'}</dt>
                <dd className="font-bold tabular-nums text-fg" data-testid="cart-subtotal">
                  {formatCents(subtotal)}
                </dd>
              </div>
              <div className="text-body-sm text-fg-muted" data-testid="cart-delivery-note">
                Delivery calculated at checkout.{estimateText ? ` ${estimateText}.` : ''}
              </div>
            </dl>
            {checking ? (
              <p className="mt-2 text-body-sm text-fg-muted" role="status">
                Checking availability...
              </p>
            ) : null}
          </>
        )}
      </Drawer>
      <EditLineModal lineId={editingId} onClose={() => setEditingId(null)} />
    </>
  );
}
