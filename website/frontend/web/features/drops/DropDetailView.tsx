'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, RichText, Section, TextLink, pluralize } from '@stimpy/ui';
import type { Drop } from '@stimpy/api-client';
import { HeroMedia } from '@/components/HeroMedia';
import { DropStart } from '@/components/DropStart';
import { browserApi } from '@/lib/api-browser';
import { useFreshData } from '@/lib/useFreshData';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { DropCountdown } from './DropCountdown';
import { SubscribeForm } from './SubscribeForm';

const POLL_MS = 30_000;

/** Statuses that changed to SOLD_OUT between two snapshots, for the polite live region. */
export function newlySoldOut(prev: Drop, next: Drop): string[] {
  const before = new Map(prev.stimpies.map((s) => [s.id, s.status]));
  return next.stimpies.filter((s) => s.status === 'SOLD_OUT' && before.get(s.id) !== undefined && before.get(s.id) !== 'SOLD_OUT').map((s) => s.name);
}

/**
 * Drop detail body (website-pages 4.7). Server data renders first; while the drop is LIVE and the tab is visible the
 * client polls `GET /drops/:slug` (no-store) every 30 s to refresh units and statuses. Polling pauses when the tab is
 * hidden and resumes with an immediate refetch. The accent colour is this drop's, once, in the hero.
 */
export function DropDetailView({ drop: initial, businessTimeZone, staticStartText }: { drop: Drop; businessTimeZone: string; staticStartText: string }) {
  const { data: drop } = useFreshData<Drop>(
    initial,
    async (signal) => {
      const { data } = await browserApi().GET('/api/v1/drops/{slug}', { params: { path: { slug: initial.slug } }, cache: 'no-store', signal });
      if (!data) throw new Error('empty response');
      return data;
    },
    { onMount: false, intervalMs: POLL_MS, enabled: initial.state === 'LIVE' },
  );

  // Announce only meaningful changes (a Stimpie selling out).
  const previous = useRef(drop);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const sold = newlySoldOut(previous.current, drop);
    if (sold.length > 0) setAnnouncement(`${sold.join(', ')} just sold out.`);
    previous.current = drop;
  }, [drop]);

  const upcoming = drop.state === 'UPCOMING';
  const live = drop.state === 'LIVE';
  const soldOut = drop.state === 'SOLD_OUT';
  const ended = drop.state === 'ENDED';

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Section tone="accent" accentColor={drop.accentColor} accentHex={drop.accentHex}>
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {live ? <Badge kind="CUSTOM" label="Live now" tone="black" /> : null}
              {upcoming ? <Badge kind="UPCOMING" /> : null}
              {soldOut ? <Badge kind="SOLD_OUT" /> : null}
              {ended ? <Badge kind="ENDED" /> : null}
            </div>
            <h1 className="text-display">{drop.name}</h1>
            {upcoming ? (
              <p className="text-lead">
                Starts <DropStart iso={drop.startsAt} businessTimeZone={businessTimeZone} />
              </p>
            ) : null}
            <DropCountdown drop={drop} variant="large" staticText={staticStartText} />
            {live && drop.unitsRemaining !== null ? (
              <p className="text-lead font-medium tabular-nums" data-testid="units-remaining">
                {pluralize(drop.unitsRemaining, 'unit')} left
              </p>
            ) : null}
            <RichText text={drop.story} />
          </div>
          <HeroMedia
            videoUrl={drop.teaserVideo}
            imageUrl={drop.teaserImage ?? drop.stimpies[0]?.artworkUrl ?? null}
            alt={`${drop.name} drop`}
            ratio="4 / 5"
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            label="Drop teaser video"
          />
        </div>
      </Section>

      {soldOut ? (
        <Section tone="white" className="!py-6">
          <Banner variant="info" live>
            <span className="font-medium">This drop is sold out.</span>{' '}
            <TextLink href="/drops">See the current drop</TextLink>
          </Banner>
        </Section>
      ) : null}
      {ended ? (
        <Section tone="white" className="!py-6">
          <Banner variant="info" live>
            <span className="font-medium">This drop has ended.</span>{' '}
            <TextLink href="/shop">Back to the shop</TextLink>
          </Banner>
        </Section>
      ) : null}

      <Section tone="white" heading={upcoming ? 'Coming in this drop' : 'The Stimpies'}>
        {drop.stimpies.length === 0 ? (
          <p className="text-body text-fg-muted">The Stimpies for this drop will be revealed soon.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4" data-testid="drop-stimpies">
            {drop.stimpies.map((s) => (
              <li key={s.id}>
                <StimpieAddCard stimpie={s} source="shop" sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 50vw" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section tone="cream">
        <div className="mx-auto flex max-w-xl flex-col items-start gap-4">
          {upcoming ? (
            <>
              <h2 className="text-h2">Get notified when it drops</h2>
              <SubscribeForm dropId={drop.id} dropSlug={drop.slug} dropName={drop.name} className="w-full" />
            </>
          ) : (
            <>
              <h2 className="text-h2">Put one on a hoodie</h2>
              <p className="text-body text-fg-muted">Pick a hoodie colour and size, then add your Stimpies in a pack.</p>
              <Button href="/shop?tab=hoodies" variant="dark" size="lg">
                Choose a hoodie
              </Button>
            </>
          )}
        </div>
      </Section>
    </>
  );
}
