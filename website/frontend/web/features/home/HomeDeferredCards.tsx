'use client';

import type { ReactNode } from 'react';
import type { Drop, Pack, Stimpie } from '@stimpy/api-client';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { HomePackCard } from './HomePackCard';
import { HomeCommerce } from './HomeCommerce';

type CommerceProps = {
  kind: 'commerce'; fallback: ReactNode; packs: Pack[]; hoodieSlug: string | null;
  extraCents: number; minExtra: number | null; drop: Drop | null; coreStimpies: Stimpie[];
};
export default function HomeDeferredCards(props: CommerceProps) {
  return <HomeCommerce {...props}
    packCards={props.packs.map((pack) => <HomePackCard key={pack.id} pack={pack} hoodieSlug={props.hoodieSlug} effectiveExtraCents={pack.stimpieCount === 2 ? props.extraCents : undefined} />)}
    stimpieCards={props.coreStimpies.slice(0, 4).map((stimpie) => <li key={stimpie.id}><StimpieAddCard stimpie={stimpie} className="store-product-card" sizes="(min-width: 768px) 25vw, 50vw" /></li>)}
  />;
}
