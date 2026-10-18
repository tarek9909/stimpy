'use client';

import { Countdown, type AccentColor } from '@stimpy/ui';
import type { Drop } from '@stimpy/api-client';
import { useDropHandoff } from './useDropHandoff';

type DropTiming = Pick<Drop, 'slug' | 'name' | 'startsAt' | 'endsAt' | 'state' | 'accentColor' | 'accentHex'>;

/**
 * The countdown of one drop, wired to the server (website-pages 2.2): to `startsAt` while UPCOMING, to `endsAt` while
 * LIVE and an end time is set. At zero it asks the server (never decides itself), then refreshes the route.
 * Renders nothing for SOLD_OUT / ENDED drops or a LIVE drop without an end time.
 */
export function DropCountdown({
  drop,
  variant = 'inline',
  accent,
  staticText,
  className,
}: {
  drop: DropTiming;
  variant?: 'strip' | 'inline' | 'large';
  accent?: AccentColor | null;
  /** Server-rendered text in the business zone, shown until hydration. */
  staticText?: string;
  className?: string;
}) {
  const toStart = drop.state === 'UPCOMING';
  const toEnd = drop.state === 'LIVE' && !!drop.endsAt;
  const target = toStart ? drop.startsAt : toEnd ? drop.endsAt : null;
  const handoff = useDropHandoff(drop.slug, toStart ? drop.startsAt : null, !!target, toStart ? 'start' : 'end');
  if (!target) return null;
  return (
    <div className={className}>
      <Countdown
        target={target}
        label={toStart ? `${drop.name} starts in` : `${drop.name} ends in`}
        variant={variant}
        accent={accent ?? null}
        accentHex={drop.accentHex}
        staticText={staticText}
        onComplete={handoff.onComplete}
      />
      {handoff.status === 'delayed' ? <p className="mt-2 text-body-sm">Starting any moment.</p> : null}
    </div>
  );
}
