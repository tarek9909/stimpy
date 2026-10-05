'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../cn';
import { ZIP_DURATION, ZIP_EASING, ZIP_FADE_MS } from '../constants';
import { SURFACE_CLASSES, accentSurface } from '../surfaces';
import type { AccentColor } from '../types';
import { useIsomorphicLayoutEffect } from '../hooks';
import { prefersReducedMotion } from '../utils';

/**
 * ZipWipe: the brand's signature transition (design-system 10.2, website-pages 2.1).
 *
 * Visual (design-system): a 4px line with 2px teeth at a 6px pitch travels across the element; the
 * incoming content (your children) is revealed behind the line while the outgoing layer (a solid
 * `color`, or your own `outgoing` node) remains on the other side. Default direction is `down`:
 * top to bottom, incoming above the line.
 * Props (website-pages): `direction`, `color`, `durationMs`, `trigger`, `onDone`.
 *
 * Rules enforced here:
 * - Only `clip-path` and `transform` animate (Web Animations API). `will-change` exists only while playing.
 * - The cover and line are `aria-hidden`, `inert` and `pointer-events: none`. The children are never
 *   removed or hidden from the accessibility tree, so content is readable at all times.
 * - At most ONE wipe plays at a time per page: others queue behind it.
 * - Reduced motion: `instant` (default, design-system) or a 120 ms cross-fade (`reducedMotion="fade"`).
 * - Server render and first paint show the plain content (no cover) so there is no layout shift and
 *   no hidden content without JavaScript.
 */

export type ZipDirection = 'ltr' | 'rtl' | 'up' | 'down';
export type ZipColor = 'coral' | 'black' | 'cream' | 'accent';

export interface ZipWipeHandle {
  /** Play the wipe now (`trigger="manual"`). Resolves when it has finished (or immediately when reduced motion). */
  play(): Promise<void>;
}

export interface ZipWipeProps {
  children: ReactNode;
  direction?: ZipDirection;
  /** The panel colour left behind the line. `accent` needs the `accent` prop. */
  color?: ZipColor;
  accent?: AccentColor | null;
  /** Rendered in the cover instead of a plain colour (the OLD scene, for the Builder swap). */
  outgoing?: ReactNode;
  durationMs?: number;
  /** `inView`: plays once when 35% visible. `manual`: call `ref.play()`. */
  trigger?: 'inView' | 'manual';
  /** Fraction of the element (or of the viewport, for tall elements) that must be visible. */
  threshold?: number;
  /** The line is white instead of black (incoming content is a dark band). Default black. */
  onDark?: boolean;
  /** What replaces the wipe under `prefers-reduced-motion`. */
  reducedMotion?: 'instant' | 'fade';
  onDone?: () => void;
  className?: string;
}

type Phase = 'idle' | 'armed' | 'playing' | 'done';

/* One wipe at a time, across the whole page. */
let queue: Promise<void> = Promise.resolve();
function acquireZipSlot(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = queue;
  queue = before.then(() => mine);
  return before.then(() => release);
}

const COVER_CLIP: Record<ZipDirection, [string, string]> = {
  down: ['inset(0% 0 0 0)', 'inset(100% 0 0 0)'],
  up: ['inset(0 0 0% 0)', 'inset(0 0 100% 0)'],
  ltr: ['inset(0 0 0 0%)', 'inset(0 0 0 100%)'],
  rtl: ['inset(0 0% 0 0)', 'inset(0 100% 0 0)'],
};

const LINE_TRANSFORM: Record<ZipDirection, [string, string]> = {
  down: ['translateY(0%)', 'translateY(100%)'],
  up: ['translateY(100%)', 'translateY(0%)'],
  ltr: ['translateX(0%)', 'translateX(100%)'],
  rtl: ['translateX(100%)', 'translateX(0%)'],
};

const COVER_COLOR: Record<Exclude<ZipColor, 'accent'>, string> = {
  coral: 'bg-coral',
  black: 'bg-ink',
  cream: 'bg-cream',
};

export const ZipWipe = forwardRef<ZipWipeHandle, ZipWipeProps>(function ZipWipe(
  {
    children,
    direction = 'down',
    color = 'cream',
    accent,
    outgoing,
    durationMs = ZIP_DURATION.section,
    trigger = 'inView',
    threshold = 0.35,
    reducedMotion = 'instant',
    onDark = false,
    onDone,
    className,
  },
  ref,
) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [runId, setRunId] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const resolvers = useRef<Array<() => void>>([]);
  const mounted = useRef(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const vertical = direction === 'up' || direction === 'down';
  const flip = direction === 'up' || direction === 'rtl';

  const finish = () => {
    setPhase('done');
    onDoneRef.current?.();
    resolvers.current.splice(0).forEach((r) => r());
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolvers.current.splice(0).forEach((r) => r());
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: () =>
        new Promise<void>((resolve) => {
          resolvers.current.push(resolve);
          if (prefersReducedMotion() && reducedMotion === 'instant') {
            finish();
            return;
          }
          setRunId((n) => n + 1);
          setPhase('playing');
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish only touches refs and setters
    [reducedMotion],
  );

  // Arm on mount (client only): cover the content until it scrolls into view.
  useIsomorphicLayoutEffect(() => {
    if (trigger !== 'inView') return;
    const root = rootRef.current;
    const canAnimate = !!root && typeof root.animate === 'function' && typeof IntersectionObserver !== 'undefined';
    if (!canAnimate || (prefersReducedMotion() && reducedMotion === 'instant')) {
      finish();
      return;
    }
    setPhase('armed');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Wait for the element to be visible enough, then play once.
  useEffect(() => {
    if (phase !== 'armed') return;
    const root = rootRef.current;
    if (!root) return;
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
        const enough =
          entry.intersectionRatio >= threshold || entry.intersectionRect.height >= viewportHeight * threshold;
        if (entry.isIntersecting && enough) {
          io.disconnect();
          setRunId((n) => n + 1);
          setPhase('playing');
        }
      },
      { threshold: thresholds },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [phase, threshold]);

  // Run the animation.
  useEffect(() => {
    if (phase !== 'playing') return;
    let cancelled = false;
    const animations: Animation[] = [];
    const cover = coverRef.current;
    const track = trackRef.current;

    const run = async () => {
      const release = await acquireZipSlot();
      if (cancelled || !mounted.current || !cover) {
        release();
        return;
      }
      try {
        const fade = prefersReducedMotion();
        if (typeof cover.animate !== 'function') {
          finish();
          return;
        }
        if (fade) {
          animations.push(
            cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZIP_FADE_MS, easing: 'linear', fill: 'forwards' }),
          );
        } else {
          const options: KeyframeAnimationOptions = { duration: durationMs, easing: ZIP_EASING, fill: 'forwards' };
          cover.style.willChange = 'clip-path';
          animations.push(
            cover.animate(
              [{ clipPath: COVER_CLIP[direction][0] }, { clipPath: COVER_CLIP[direction][1] }],
              options,
            ),
          );
          if (track) {
            track.style.willChange = 'transform';
            animations.push(
              track.animate(
                [{ transform: LINE_TRANSFORM[direction][0] }, { transform: LINE_TRANSFORM[direction][1] }],
                options,
              ),
            );
          }
        }
        await Promise.all(animations.map((a) => a.finished));
        if (!cancelled && mounted.current) {
          cover.style.willChange = '';
          if (track) track.style.willChange = '';
          finish();
        }
      } catch {
        // An animation was cancelled (unmount or restart): nothing to finish.
      } finally {
        release();
      }
    };
    void run();
    return () => {
      cancelled = true;
      animations.forEach((a) => a.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per runId
  }, [phase, runId]);

  const showCover = phase === 'armed' || phase === 'playing';
  const coverColor = color === 'accent' ? SURFACE_CLASSES[accentSurface(accent)].split(' ')[0] : COVER_COLOR[color];
  const coverStyle: CSSProperties = { clipPath: COVER_CLIP[direction][0] };
  const trackStyle: CSSProperties = { transform: LINE_TRANSFORM[direction][0] };

  return (
    <div ref={rootRef} className={cn('relative', showCover && 'overflow-clip', className)} data-zip-phase={phase}>
      {children}
      {showCover ? (
        <>
          <div
            ref={coverRef}
            aria-hidden="true"
            inert
            data-zip-cover=""
            className={cn('pointer-events-none absolute inset-0 z-10 overflow-hidden', coverColor)}
            style={coverStyle}
          >
            {outgoing}
          </div>
          <div
            ref={trackRef}
            aria-hidden="true"
            data-zip-line=""
            className={cn('pointer-events-none absolute inset-0 z-10', onDark && 'zip-on-dark')}
            style={trackStyle}
          >
            <div
              className={cn(
                'zip-line absolute',
                vertical ? 'left-0 w-full' : 'top-0 h-full',
                vertical ? (flip ? 'top-0' : '-top-1.5') : flip ? 'left-0' : '-left-1.5',
              )}
              data-axis={vertical ? 'y' : 'x'}
              data-flip={flip ? 'true' : 'false'}
            >
              <span
                className={cn(
                  'absolute rounded-sm bg-fg',
                  vertical ? 'left-4 top-1/2 h-4 w-6 -translate-y-1/2' : 'left-1/2 top-4 h-6 w-4 -translate-x-1/2',
                )}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
});
