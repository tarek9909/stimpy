'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ColorSwatches, Media, PriceTag, RichText } from '@stimpy/ui';
import type { HoodieDetail, HoodieSummary } from '@stimpy/api-client';
import { ArrowRight } from '@/components/icons';

/** Single-hoodie shop feature with real colour selection and colour-aware product links. */
export function HoodieFeature({ hoodie, detail, campaignPhoto, campaignColorIds }: {
  hoodie: HoodieSummary;
  detail: HoodieDetail;
  campaignPhoto: ReactNode;
  campaignColorIds: number[];
}) {
  const [colorId, setColorId] = useState<number | null>(hoodie.colors[0]?.id ?? null);
  const color = detail.colors.find((candidate) => candidate.id === colorId) ?? null;
  const selectedSummaryColor = hoodie.colors.find((candidate) => candidate.id === colorId) ?? null;
  const image = color?.images[0] ?? detail.images[0] ?? hoodie.images[0] ?? null;
  const campaignColor = selectedSummaryColor && campaignColorIds.includes(selectedSummaryColor.id) ? selectedSummaryColor : null;
  const productHref = `/shop/hoodie/${hoodie.slug}${colorId === null ? '' : `?color=${colorId}`}`;

  return (
    <div className="store-hoodie-feature">
      <Link href={productHref} aria-label={`View ${hoodie.name}${selectedSummaryColor ? ` in ${selectedSummaryColor.name}` : ''}`}>
        {campaignColor ? <div data-campaign-hoodie-photo role="img"
          aria-label={`${campaignColor.name} Stimpy hoodie, back view with THE VOID Stimpie`}
          className="relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden md:max-w-[580px]"
          style={{ isolation: 'isolate', '--hoodie-preview-color': campaignColor.hex } as CSSProperties}>
          {campaignPhoto}
        </div> : <Media
          key={colorId ?? 'default'}
          src={image}
          alt={`${hoodie.name}${selectedSummaryColor ? `, ${selectedSummaryColor.name}` : ''}, front view`}
          ratio="4 / 5"
          fit="contain"
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
        />}
      </Link>
      <div>
        <p className="store-eyebrow">The everyday original</p>
        <h2><Link href={productHref}>{hoodie.name}</Link></h2>
        <PriceTag cents={hoodie.priceCents} compareAtCents={hoodie.compareAtPriceCents ?? undefined} size="lg" className="store-hoodie-price" />
        <RichText text={hoodie.description} className="store-hoodie-description" />
        {campaignColor ? <p className="mb-4 text-body-sm text-fg-muted">Shown with a Stimpie, sold separately.</p> : null}
        <ColorSwatches colors={hoodie.colors} value={colorId} onChange={setColorId} label="Colour" />
        <Link href={productHref} className="store-button">{hoodie.inStock ? 'Choose your hoodie' : 'View hoodie'} <ArrowRight size={17} aria-hidden="true" /></Link>
        <p className="mt-4 text-body-sm text-fg-muted">Cash on delivery across Lebanon.</p>
      </div>
    </div>
  );
}
