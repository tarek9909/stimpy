'use client';

import { ReviewCard, Section } from '@stimpy/ui';
import type { ReactNode } from 'react';
import type { Drop, Pack, Review, Stimpie } from '@stimpy/api-client';
import { ScrollRow } from '@/components/ScrollRow';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { HomePackCard } from './HomePackCard';
import { HomeCommerce } from './HomeCommerce';

type CommerceProps = {
  kind: 'commerce'; fallback: ReactNode; packs: Pack[]; hoodieSlug: string | null;
  extraCents: number; minExtra: number | null; drop: Drop | null; coreStimpies: Stimpie[];
};
type ReviewProps = { kind: 'reviews'; fallback: ReactNode; reviews: Review[] };

export default function HomeDeferredCards(props: CommerceProps | ReviewProps) {
  if (props.kind === 'reviews') {
    return props.reviews.length > 0 ? (
      <Section tone="white" heading="Worn your way." className="store-reviews">
        <ScrollRow label="Customer swaps">
          {props.reviews.map((review) => <li key={review.id} className="w-72 shrink-0 snap-start"><ReviewCard review={review} className="h-full" /></li>)}
        </ScrollRow>
      </Section>
    ) : null;
  }
  return <HomeCommerce {...props}
    packCards={props.packs.map((pack) => <HomePackCard key={pack.id} pack={pack} hoodieSlug={props.hoodieSlug} effectiveExtraCents={pack.stimpieCount === 2 ? props.extraCents : undefined} />)}
    stimpieCards={props.coreStimpies.slice(0, 4).map((stimpie) => <li key={stimpie.id}><StimpieAddCard stimpie={stimpie} className="store-product-card" sizes="(min-width: 768px) 25vw, 50vw" /></li>)}
  />;
}
