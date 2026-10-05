'use client';

import { DropCard, ReviewCard, Section, formatCents } from '@stimpy/ui';
import type { ReactNode } from 'react';
import type { Drop, Pack, Review, Stimpie } from '@stimpy/api-client';
import { ScrollRow } from '@/components/ScrollRow';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { HomePackCard } from './HomePackCard';

type CommerceProps = {
  kind: 'commerce';
  fallback: ReactNode;
  packs: Pack[];
  hoodieSlug: string | null;
  extraCents: number;
  minExtra: number | null;
  drop: Drop | null;
  coreStimpies: Stimpie[];
};

type ReviewProps = { kind: 'reviews'; fallback: ReactNode; reviews: Review[] };

/** Interactive controls hydrate on approach; server-rendered fallbacks remain available without JavaScript. */
export default function HomeDeferredCards(props: CommerceProps | ReviewProps) {
  if (props.kind === 'reviews') {
    return props.reviews.length > 0 ? (
      <Section tone="white" heading="Customer swaps">
        <ScrollRow label="Customer swaps">
          {props.reviews.map((review) => (
            <li key={review.id} className="w-72 shrink-0 snap-start">
              <ReviewCard review={{ name: review.name, text: review.text, mediaUrl: review.mediaUrl }} className="h-full" />
            </li>
          ))}
        </ScrollRow>
      </Section>
    ) : null;
  }

  return (
    <>
      <Section tone="white" heading="Pick your set" id="packs">
        {props.packs.length === 0 ? (
          <a href="/shop" className="inline-flex min-h-11 items-center rounded-md bg-cta px-5 font-medium text-white">
            Shop
          </a>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 md:gap-6">
            {props.packs.map((pack) => (
              <HomePackCard
                key={pack.id}
                pack={pack}
                hoodieSlug={props.hoodieSlug}
                highlight={!!pack.badge}
                effectiveExtraCents={pack.stimpieCount === 2 ? props.extraCents : undefined}
              />
            ))}
            {props.minExtra !== null ? (
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-base p-5">
                <div>
                  <h3 className="text-h4">Extra Stimpies</h3>
                  <p className="mt-1 text-body-sm text-fg-muted">Already have the hoodie? Add a new back.</p>
                </div>
                <a href="/shop?tab=stimpies" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                  Extra Stimpies from {formatCents(props.minExtra)}
                </a>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {props.drop ? (
        <Section tone="cream" heading="Current drop">
          <div className="mx-auto max-w-sm">
            <DropCard drop={props.drop} variant={props.drop.state === 'LIVE' ? 'live' : 'upcoming'} sizes="(min-width: 768px) 24rem, 100vw" />
          </div>
        </Section>
      ) : null}

      {props.coreStimpies.length > 0 ? (
        <Section tone="white" heading="The core collection">
          <ScrollRow label="Core Stimpies">
            {props.coreStimpies.slice(0, 4).map((stimpie) => (
              <li key={stimpie.id} className="w-44 shrink-0 snap-start md:w-60">
                <StimpieAddCard stimpie={stimpie} sizes="(min-width: 768px) 240px, 176px" />
              </li>
            ))}
          </ScrollRow>
          <p className="mt-6">
            <a href="/shop?tab=stimpies&amp;type=CORE" className="font-medium underline underline-offset-4">
              See all Stimpies
            </a>
          </p>
        </Section>
      ) : null}
    </>
  );
}
