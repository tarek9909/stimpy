'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useCountdown } from '../clock';
import { announcementKey, describeRemaining } from '../clockMath';
import { cn } from '../cn';
import { SURFACE_CLASSES, accentSurface } from '../surfaces';
import type { AccentColor, ISODate } from '../types';

export interface CountdownProps {
  /** ISO time to count down to. */
  target: ISODate;
  /** What is counting, e.g. "Drop 03 starts in". Also the accessible name of the timer. */
  label: string;
  /** Fired once when the SERVER-adjusted clock passes the target. The server still decides "live". */
  onComplete?: () => void;
  variant?: 'strip' | 'inline' | 'large';
  /** website-pages alias: `sm` = inline, `lg` = large. */
  size?: 'sm' | 'lg';
  /** Strip only: the drop accent as the band colour (black text). Default is the black strip. */
  accent?: AccentColor | null;
  /** Overrides the offset from <ServerClockProvider>. */
  offsetMs?: number;
  /** Parent already knows the state: show the live/ended label instead of counting. */
  status?: 'auto' | 'live' | 'ended';
  goingLiveLabel?: string;
  liveLabel?: string;
  endedLabel?: string;
  /** Server-rendered text for `<time>` before hydration (formatted in the business time zone). */
  staticText?: string;
  className?: string;
  /** Test hook. */
  now?: () => number;
}

function useInView(): [(el: Element | null) => void, boolean] {
  const [visible, setVisible] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = (el: Element | null) => {
    observer.current?.disconnect();
    if (!el || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver(([entry]) => setVisible(entry ? entry.isIntersecting : true));
    observer.current.observe(el);
  };
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, visible];
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Drop countdown on the server clock (website-pages 2.2, state-and-errors 13).
 * - Visible digits tick every second; the timer is `role="timer"` with `aria-live="off"`.
 * - A separate visually hidden polite region announces once a minute, and every 10 s in the last minute.
 * - Server and first client render show only the static `<time>` text: no hydration mismatch.
 * - At zero it shows "Going live..." and calls `onComplete`; it never claims the drop is live itself.
 * - No flip animation, so reduced motion needs no special case.
 */
export function Countdown({
  target,
  label,
  onComplete,
  variant,
  size,
  accent,
  offsetMs,
  status = 'auto',
  goingLiveLabel = 'Going live...',
  liveLabel = 'Live now',
  endedLabel = 'Ended',
  staticText,
  className,
  now,
}: CountdownProps) {
  const resolved = variant ?? (size === 'lg' ? 'large' : size === 'sm' ? 'inline' : 'strip');
  const [mounted, setMounted] = useState(false);
  const [viewRef, inView] = useInView();
  useEffect(() => setMounted(true), []);

  const c = useCountdown(target, offsetMs, { now, paused: !inView });

  // Announcement text changes only when its key changes.
  const key = announcementKey(c.remainingMs);
  const [announcement, setAnnouncement] = useState('');
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted || c.done || status !== 'auto') return;
    if (lastKey.current === null) {
      lastKey.current = key; // do not announce on first paint
      return;
    }
    if (lastKey.current !== key) {
      lastKey.current = key;
      setAnnouncement(describeRemaining(c.remainingMs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the key matters
  }, [key, mounted, c.done, status]);

  const completed = useRef(false);
  useEffect(() => {
    if (mounted && status === 'auto' && c.done && !completed.current) {
      completed.current = true;
      onComplete?.();
    }
    if (!c.done) completed.current = false;
  }, [mounted, status, c.done, onComplete]);

  const surface = resolved === 'strip' ? (accent ? SURFACE_CLASSES[accentSurface(accent)] : SURFACE_CLASSES.black) : '';
  const showCounting = mounted && status === 'auto' && !c.done;
  const message = status === 'live' ? liveLabel : status === 'ended' ? endedLabel : mounted && c.done ? goingLiveLabel : null;

  let body;
  if (message) {
    body = (
      <p role="status" className="font-bold">
        {message}
      </p>
    );
  } else if (!showCounting) {
    // Server render / first paint: static text only.
    body = (
      <time dateTime={target} className="font-bold tabular-nums">
        {staticText ?? '--:--:--'}
      </time>
    );
  } else if (resolved === 'inline') {
    body = (
      <time dateTime={target} className="font-bold tabular-nums">
        {c.text}
      </time>
    );
  } else {
    const units: Array<[string, string]> = [
      ...(c.days > 0 ? ([[pad(c.days), 'Days']] as Array<[string, string]>) : []),
      [pad(c.hours), 'Hours'],
      [pad(c.minutes), 'Mins'],
      [pad(c.seconds), 'Secs'],
    ];
    const digitSize = resolved === 'large' ? 'text-center text-h1 md:text-display' : 'text-center text-h3';
    body = (
      <time dateTime={target} className="flex items-start gap-1 tabular-nums">
        {units.map(([n, u], i) => (
          <Fragment key={u}>
            {i > 0 ? (
              <span aria-hidden="true" className={cn('font-bold leading-none', digitSize)}>
                :
              </span>
            ) : null}
            <span className="flex flex-col items-center">
              <span className={cn('font-bold leading-none', digitSize, resolved === 'large' ? 'min-w-16 md:min-w-20' : 'min-w-8')}>
                {n}
              </span>
              <span className={cn('mt-1 text-caption', resolved === 'strip' ? 'text-current' : 'text-fg-muted')}>{u}</span>
            </span>
          </Fragment>
        ))}
      </time>
    );
  }

  return (
    <div
      ref={viewRef}
      className={cn(
        resolved === 'strip' && cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3', surface),
        resolved === 'inline' && 'inline-flex flex-wrap items-baseline gap-x-2 text-fg',
        resolved === 'large' && 'flex flex-col gap-3 text-fg',
        className,
      )}
    >
      <span className={cn(resolved === 'large' ? 'text-lead' : 'text-body-sm font-medium')}>{label}</span>
      <div role="timer" aria-live="off" aria-label={label}>
        {body}
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true" data-testid="countdown-announcer">
        {announcement}
      </span>
    </div>
  );
}
