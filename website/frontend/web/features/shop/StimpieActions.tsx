'use client';

import { useState } from 'react';
import { Button, Countdown, PriceTag, QuantityStepper, TextLink } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { useCart } from '@/features/cart/store';
import { CART_FULL_TEXT, useAddToCart } from '@/features/cart/useAddToCart';
import { SubscribeForm } from '@/features/drops/SubscribeForm';
import { useDropHandoff } from '@/features/drops/useDropHandoff';
import { track } from '@/lib/track';
import { buildStimpieLine, stimpieMaxQty } from './composer';

/** "Only 4 left" text, only when the API provides `remaining` (status LOW). Never "0 left". */
export function remainingText(s: Pick<Stimpie, 'remaining'>): string | null {
  return s.remaining !== null && s.remaining > 0 ? `Only ${s.remaining} left` : null;
}

/**
 * Everything on the Stimpie page that depends on its status (website-pages 4.4):
 * AVAILABLE/LOW add to cart (LOW caps the quantity), SOLD_OUT, UPCOMING (countdown + notify me), ENDED.
 */
export function StimpieActions({
  stimpie,
  staticStartText,
}: {
  stimpie: Stimpie;
  /** Server-rendered start time in the business zone for the countdown's `<time>`. */
  staticStartText: string | null;
}) {
  const add = useAddToCart();
  const lines = useCart((s) => s.lines);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [full, setFull] = useState(false);
  const drop = stimpie.drop;
  const handoff = useDropHandoff(drop?.slug ?? '', drop?.startsAt ?? null, stimpie.status === 'UPCOMING' && !!drop);
  const max = stimpieMaxQty(stimpie, lines);
  const remaining = remainingText(stimpie);

  function onAdd() {
    const result = add(buildStimpieLine(stimpie, Math.min(qty, Math.max(1, max))), 'product');
    if (!result.ok) {
      setFull(result.reason === 'FULL');
      return;
    }
    setFull(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  const sharedLinks = (
    <div className="flex flex-col gap-3">
      <Button
        href={`/builder?stimpie=${encodeURIComponent(stimpie.slug)}`}
        variant="secondary"
        size="lg"
        fullWidth
        onClick={() => track('cta_click', { id: 'stimpie_preview', path: `/shop/stimpie/${stimpie.slug}` })}
      >
        Preview on my hoodie
      </Button>
      <TextLink href="/shop?tab=hoodies" className="self-start text-body">
        Get it in a pack
      </TextLink>
    </div>
  );

  if (stimpie.status === 'ENDED') {
    return (
      <div className="flex flex-col gap-4" data-testid="stimpie-status-ended">
        <PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="lg" />
        <p className="text-body font-medium text-fg">This drop has ended.</p>
        <Button href="/shop" variant="dark" size="lg" fullWidth>
          Back to the shop
        </Button>
      </div>
    );
  }

  if (stimpie.status === 'UPCOMING') {
    return (
      <div className="flex flex-col gap-4" data-testid="stimpie-status-upcoming">
        <PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="lg" />
        <p className="text-body font-medium text-fg">Coming soon</p>
        {drop ? (
          <>
            <Countdown
              target={drop.startsAt}
              label={`${drop.name} starts in`}
              variant="large"
              staticText={staticStartText ?? undefined}
              onComplete={handoff.onComplete}
            />
            {handoff.status === 'delayed' ? <p className="text-body-sm text-fg-muted">Starting any moment.</p> : null}
            <div className="rounded-lg border border-base p-4">
              <h2 className="mb-3 text-h4">Get notified when it drops</h2>
              <SubscribeForm dropId={drop.id} dropSlug={drop.slug} dropName={drop.name} />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (stimpie.status === 'SOLD_OUT' || !stimpie.purchasable) {
    return (
      <div className="flex flex-col gap-4" data-testid="stimpie-status-sold-out">
        <PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="lg" />
        <p className="text-body font-medium text-fg">Sold out</p>
        {stimpie.type === 'LIMITED' ? <p className="text-body-sm text-fg-muted">Limited Stimpies never come back.</p> : null}
        {sharedLinks}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="stimpie-status-available">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="lg" />
        {remaining ? (
          <span className="text-body font-medium text-fg" data-testid="remaining">
            {remaining}
          </span>
        ) : null}
      </div>
      {max > 0 ? (
        <>
          <div className="flex items-center gap-4">
            <QuantityStepper value={Math.min(qty, max)} onChange={setQty} max={max} label={`Quantity of ${stimpie.name}`} />
          </div>
          <Button variant="cta" size="lg" fullWidth onClick={onAdd}>
            {added ? 'Added' : 'Add to cart'}
          </Button>
          {full ? <p className="text-body-sm font-medium text-fg">{CART_FULL_TEXT}</p> : null}
        </>
      ) : (
        <p className="text-body font-medium text-fg" role="status">
          You already have the last ones in your cart.
        </p>
      )}
      {sharedLinks}
    </div>
  );
}

