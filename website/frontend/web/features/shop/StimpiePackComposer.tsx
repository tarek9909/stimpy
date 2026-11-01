'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Pack, Stimpie } from '@stimpy/api-client';
import { Button, PriceTag, formatCents } from '@stimpy/ui';
import { CART_FULL_TEXT, useAddToCart } from '@/features/cart/useAddToCart';
import { cartStore, useCart } from '@/features/cart/store';
import type { CartLine, CartLineUi } from '@/features/cart/types';
import {
  availablePerOffer,
  buildStimpiePackItem,
  eligibleForOffer,
  fitOfferQuantities,
  isStimpieOnlyOffer,
  parseStimpieQuantitySlugs,
  selectedStimpieCount,
  serializeStimpieQuantities,
  type StimpieOffer,
} from './stimpie-pack';

export interface StimpiePackPreset {
  packSlug?: string | null;
  stimpieSlugs?: readonly string[];
}

export interface StimpiePackComposerProps {
  packs: readonly Pack[];
  stimpies: readonly Stimpie[];
  preset?: StimpiePackPreset;
  replaceLine?: { lineId: string; qty: number };
  onAdded?: () => void;
}

function asOffer(pack: Pack): StimpieOffer {
  return {
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    type: pack.type,
    stimpieCount: pack.stimpieCount,
    eligibleStimpieIds: pack.eligibleStimpieIds,
    priceCents: pack.priceCents,
  };
}

function QuantityControl({ name, value, max, onChange }: { name: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <div role="group" aria-label={`Quantity of ${name}`} className="flex w-full min-w-0 items-center gap-1">
      <button type="button" aria-label={`Decrease ${name} quantity`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}
        className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-control text-body disabled:opacity-40">−</button>
      <input type="number" inputMode="numeric" min={0} max={max} step={1} value={value} aria-label={`${name} quantity`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-9 min-w-0 flex-1 rounded-md border border-control bg-white px-1 text-center tabular-nums" />
      <button type="button" aria-label={`Increase ${name} quantity`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}
        className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-control text-body disabled:opacity-40">+</button>
    </div>
  );
}

/** Quantity-aware Stimpies-only offer builder. Each design appears once; repeat units are compact counts. */
export function StimpiePackComposer({ packs, stimpies, preset, replaceLine, onAdded }: StimpiePackComposerProps) {
  const add = useAddToCart();
  const allLines = useCart((state) => state.lines);
  const lines = useMemo(() => replaceLine ? allLines.filter((line) => line.lineId !== replaceLine.lineId) : allLines, [allLines, replaceLine]);
  const offers = useMemo(() => packs.map(asOffer).filter(isStimpieOnlyOffer), [packs]);
  const [packId, setPackId] = useState(() => offers.find((offer) => offer.slug === preset?.packSlug)?.id ?? offers[0]?.id ?? null);
  const pack = offers.find((offer) => offer.id === packId) ?? null;
  const catalog = useMemo(() => stimpies.filter((stimpie) => !pack || eligibleForOffer(pack, stimpie.id)), [stimpies, pack]);
  const offerQty = replaceLine?.qty ?? 1;
  const availability = useMemo(() => new Map(stimpies.map((stimpie) => [stimpie.id, availablePerOffer(stimpie, lines, offerQty)])), [stimpies, lines, offerQty]);
  const requestedPreset = useMemo(() => parseStimpieQuantitySlugs(preset?.stimpieSlugs ?? [], stimpies), [preset, stimpies]);
  const [quantities, setQuantities] = useState<Record<number, number>>(() => pack ? fitOfferQuantities(pack, requestedPreset, availability) : {});
  const [notice, setNotice] = useState<string | null>(null);
  const [cartFull, setCartFull] = useState(false);
  const [added, setAdded] = useState(false);
  const count = pack ? selectedStimpieCount(quantities) : 0;
  const remaining = pack ? Math.max(0, pack.stimpieCount - count) : 0;
  const complete = !!pack && count === pack.stimpieCount;
  const availableDesigns = catalog.filter((stimpie) => (availability.get(stimpie.id) ?? 0) > 0);

  useEffect(() => {
    if (!pack) return;
    setQuantities((current) => fitOfferQuantities(pack, current, availability));
  }, [pack, availability]);

  const onOfferChange = (nextId: number) => {
    const nextOffer = offers.find((offer) => offer.id === nextId);
    if (!nextOffer) return;
    setPackId(nextId);
    setQuantities((current) => fitOfferQuantities(nextOffer, current, availability));
    setNotice(null);
  };

  const changeQuantity = (stimpie: Stimpie, requested: number) => {
    if (!pack) return;
    const totalWithout = count - (quantities[stimpie.id] ?? 0);
    const maxForThisOffer = Math.max(0, Math.min(availability.get(stimpie.id) ?? 0, pack.stimpieCount - totalWithout));
    const qty = Math.max(0, Math.min(Math.trunc(Number.isFinite(requested) ? requested : 0), maxForThisOffer));
    setQuantities((current) => {
      const next = { ...current };
      if (qty === 0) delete next[stimpie.id];
      else next[stimpie.id] = qty;
      return next;
    });
    setNotice(null);
    setAdded(false);
  };

  const addToCart = () => {
    if (!pack || !complete) return;
    const item = buildStimpiePackItem(pack, quantities, replaceLine?.qty ?? 1);
    if (!item) return;
    const selected = stimpies.filter((stimpie) => (quantities[stimpie.id] ?? 0) > 0);
    const first = selected[0] ?? null;
    const ui: Omit<CartLineUi, 'addedAt'> & { addedAt?: string } = {
      title: pack.name,
      imageUrl: first?.images[0] ?? first?.artworkUrl ?? null,
      hoodieSlug: null,
      packSlug: pack.slug,
      colorName: null,
      colorHex: null,
      sizeLabel: null,
      stimpies: selected.map((stimpie) => ({
        id: stimpie.id,
        slug: stimpie.slug,
        name: stimpie.name,
        artworkUrl: stimpie.artworkUrl,
        type: stimpie.type,
        qty: quantities[stimpie.id] ?? 0,
      })),
      unitPriceCents: pack.priceCents,
    };
    const result = replaceLine
      ? cartStore.getState().replaceLine(replaceLine.lineId, item, ui)
      : add({ item, ui }, 'shop');
    if (!result.ok) {
      setCartFull(result.reason === 'FULL');
      return;
    }
    setCartFull(false);
    setAdded(true);
    onAdded?.();
  };

  const shareQuery = pack ? `?pack=${encodeURIComponent(pack.slug)}&stimpies=${encodeURIComponent(serializeStimpieQuantities(quantities, stimpies))}` : '';
  const shareHref = `/shop/stimpie-packs${shareQuery}`;

  return (
    <div className="flex flex-col gap-6" data-stimpie-pack-composer data-offer-count={pack?.stimpieCount ?? 0}>
      {offers.length > 1 ? (
        <label className="flex flex-col gap-2 text-body-sm font-medium" htmlFor="stimpie-pack-offer">
          Choose an offer
          <select id="stimpie-pack-offer" aria-label="Stimpie-only offer" value={pack?.id ?? ''} onChange={(event) => onOfferChange(Number(event.currentTarget.value))}
            className="min-h-12 rounded-md border border-control bg-white px-3 text-body text-fg">
            {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name} · {offer.stimpieCount} Stimpies · {formatCents(offer.priceCents)}</option>)}
          </select>
        </label>
      ) : pack ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-base bg-cream/50 px-4 py-3" data-testid="stimpie-pack-offer">
          <span className="font-medium">{packs.find((p) => p.id === pack.id)?.name ?? `${pack.stimpieCount} Stimpies`}</span>
          <PriceTag cents={pack.priceCents} compareAtCents={packs.find((p) => p.id === pack.id)?.compareAtPriceCents ?? undefined} size="md" />
        </div>
      ) : null}

      {!pack ? <p role="status" className="text-body text-fg-muted">No Stimpie-only offers are available right now.</p> : (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-base bg-white/95 p-4 shadow-sm" aria-live="polite" data-testid="stimpie-pack-progress">
            <p className="text-body font-semibold" data-testid="stimpie-pack-progress-label">Choose {pack.stimpieCount} Stimpies ({count}/{pack.stimpieCount})</p>
            <PriceTag cents={pack.priceCents} size="lg" />
          </div>
          {pack.eligibleStimpieIds ? <p className="text-body-sm text-fg-muted">This offer includes the eligible designs shown below.</p> : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Eligible Stimpies" data-testid="eligible-stimpies">
            {catalog.map((stimpie) => {
              const selectedQty = quantities[stimpie.id] ?? 0;
              const available = availability.get(stimpie.id) ?? 0;
              const max = Math.max(0, Math.min(available, pack.stimpieCount - count + selectedQty));
              return (
                <li key={stimpie.id} className={`flex flex-col overflow-hidden rounded-md border ${selectedQty > 0 ? 'border-ink' : 'border-base'} bg-white`} data-stimpie-id={stimpie.id}>
                  <div className="relative overflow-hidden" style={{ aspectRatio: '0.64' }}>
                    <img src={stimpie.artworkUrl} alt={`${stimpie.name} Stimpie`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    <div className="flex min-h-10 items-start justify-between gap-2">
                      <h3 className="text-body-sm font-semibold text-fg">{stimpie.name}</h3>
                      {stimpie.remaining !== null && stimpie.remaining > 0 ? <span className="shrink-0 text-caption text-fg-muted">{stimpie.remaining} left</span> : null}
                    </div>
                    {available > 0 ? <QuantityControl name={stimpie.name} value={selectedQty} max={max} onChange={(qty) => changeQuantity(stimpie, qty)} /> : (
                      <p className="min-h-10 content-center text-body-sm font-medium text-fg-muted" role="status">{stimpie.purchasable ? 'In your cart' : 'Sold out'}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {availableDesigns.length === 0 ? <p className="text-body-sm text-fg-muted">No eligible Stimpies are available right now.</p> : null}
          <p className="text-body-sm text-fg-muted" role="status" aria-live="polite" data-testid="stimpie-pack-remaining">
            {remaining === 0 ? 'Your offer is complete.' : `Choose ${remaining} more Stimpie${remaining === 1 ? '' : 's'}.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="cta" size="lg" disabled={!complete} onClick={addToCart}>
              {replaceLine ? 'Save changes' : 'Add Stimpie set to cart'}
            </Button>
            <a href={shareHref} className="inline-flex min-h-11 items-center text-body-sm font-medium underline underline-offset-4" data-testid="share-stimpie-set">
              Share this set
            </a>
          </div>
          {notice ? <p className="text-body-sm text-fg-muted" role="status">{notice}</p> : null}
          {cartFull ? <p className="text-body-sm font-medium text-fg" role="status">{CART_FULL_TEXT}</p> : null}
          {added ? <p className="text-body-sm font-medium text-fg" role="status">{replaceLine ? 'Your Stimpie set was updated.' : 'Your Stimpie set was added to the cart.'}</p> : null}
        </>
      )}
    </div>
  );
}
