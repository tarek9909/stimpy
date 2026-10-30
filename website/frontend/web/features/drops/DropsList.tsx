import Link from 'next/link';
import { Badge, Button, Media, Pill, Section, accentColorStyle, accentTone, pluralize } from '@stimpy/ui';
import type { Drop } from '@stimpy/api-client';
import { DropStart } from '@/components/DropStart';
import { HeroMedia } from '@/components/HeroMedia';
import { staticDropText } from '@/lib/business';
import { excerpt } from '@/lib/seo';
import { DropCountdown } from './DropCountdown';
import { SubscribeForm } from './SubscribeForm';

/** The current drop: a framed editorial feature with the artwork and live sale details. */
export function CurrentDropBanner({ drop, timeZone }: { drop: Drop; timeZone: string }) {
  return (
    <Section tone="white" className="store-drops-feature" aria-label="Current drop">
      <div className="store-drops-showcase">
        <div className="store-drops-art-col">
          <HeroMedia
            videoUrl={drop.teaserVideo}
            imageUrl={drop.teaserImage ?? drop.stimpies[0]?.artworkUrl ?? null}
            alt={`${drop.name} drop`}
            ratio="4 / 5"
            priority
            className="store-drops-artwork"
            mediaClassName="store-drops-art-image"
            sizes="(min-width: 1024px) 500px, (min-width: 768px) 42vw, 90vw"
            label="Drop teaser video"
          />
        </div>
        <div className="store-drops-copy">
          <div className="store-drops-overline">
            <Badge kind="CUSTOM" label="Live now" tone="coral" />
            <span className="store-drops-edition">Stimpy / limited release</span>
          </div>
          <h2 className="store-drops-title">{drop.name}</h2>
          <p className="store-drops-description">{excerpt(drop.story, 220)}</p>
          {drop.unitsRemaining !== null ? (
            <p className="store-drops-stock">{pluralize(drop.unitsRemaining, 'unit')} remaining</p>
          ) : null}
          {drop.endsAt ? (
            <div className="store-drops-timer-panel">
              <p className="store-drops-timer-label">This drop closes in</p>
              <DropCountdown drop={drop} variant="large" className="store-drops-countdown" staticText={staticDropText(drop.endsAt, timeZone)} />
            </div>
          ) : null}
          <Button href={`/drops/${drop.slug}`} variant="coral" size="lg" className="store-drops-enter">
            Explore the drop
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Upcoming drop tile: neutral card with a small accent chip, date, countdown and the Notify me form. */
export function UpcomingDropCard({ drop, timeZone }: { drop: Drop; timeZone: string }) {
  return (
    <article className="store-drops-card flex flex-col overflow-hidden rounded-lg border border-base bg-surface-base" aria-label={drop.name}>
      <Media src={drop.teaserImage} alt={`${drop.name} drop teaser`} ratio="4 / 5" sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 100vw" />
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind="UPCOMING" />
          <Pill tone={accentTone(drop.accentColor)} style={accentColorStyle(drop.accentHex)}>{drop.name}</Pill>
        </div>
        <h3 className="text-h3 text-fg">
          <Link href={`/drops/${drop.slug}`}>{drop.name}</Link>
        </h3>
        <p className="text-body-sm text-fg-muted">
          Starts <DropStart iso={drop.startsAt} businessTimeZone={timeZone} />
        </p>
        <DropCountdown drop={drop} variant="inline" staticText={staticDropText(drop.startsAt, timeZone)} />
        <div className="mt-auto pt-2">
          <h4 className="mb-2 text-body font-medium">Get notified</h4>
          <SubscribeForm dropId={drop.id} dropSlug={drop.slug} dropName={drop.name} />
        </div>
      </div>
    </article>
  );
}

/** Archive tile: muted. SOLD_OUT drops "won't return"; ENDED drops simply ended. */
export function ArchiveDropCard({ drop }: { drop: Drop }) {
  return (
    <article className="store-drops-archive-card flex flex-col overflow-hidden rounded-lg border border-base bg-surface-base text-fg" aria-label={drop.name}>
      <div className="opacity-60">
        <Media src={drop.teaserImage ?? drop.stimpies[0]?.artworkUrl} alt={`${drop.name} drop`} ratio="4 / 5" sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 50vw" />
      </div>
      <div className="flex flex-col gap-2 p-3 md:p-4">
        <Pill tone={accentTone(drop.accentColor)} className="self-start" style={accentColorStyle(drop.accentHex)}>
          {drop.state === 'SOLD_OUT' ? 'Sold out' : 'Ended'}
        </Pill>
        <h3 className="text-h4 text-fg">
          <Link href={`/drops/${drop.slug}`}>{drop.name}</Link>
        </h3>
        <p className="text-body-sm text-fg-muted">{drop.state === 'SOLD_OUT' ? "Sold out. It won't return." : 'Ended'}</p>
      </div>
    </article>
  );
}

