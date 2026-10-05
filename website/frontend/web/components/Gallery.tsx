'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Media, cn, prefersReducedMotion } from '@stimpy/ui';
import { ChevronLeft, ChevronRight } from './icons';

export interface GalleryImage {
  src: string;
  alt: string;
}

export interface GalleryProps {
  images: GalleryImage[];
  /** Controlled index (e.g. the colour changed and its photo should show). */
  index: number;
  onIndexChange: (index: number) => void;
  /** Accessible name of the carousel, e.g. "Stimpy Hoodie photos". */
  label: string;
  ratio: number | string;
  /** The first slide is the page's LCP image. */
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/**
 * Swipeable gallery: native scroll-snap (works with touch, trackpad and keyboard through the buttons), dots on
 * phones, thumbnails from `lg`. Each slide reserves its ratio, so nothing shifts while images load.
 */
export function Gallery({ images, index, onIndexChange, label, ratio, priority, sizes, className }: GalleryProps) {
  const track = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const count = images.length;
  const current = Math.min(index, Math.max(0, count - 1));

  const scrollToIndex = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTo({ left: i * el.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    window.setTimeout(() => {
      programmatic.current = false;
    }, 400);
  }, []);

  // Keep the scroll position in step with the controlled index.
  useEffect(() => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    if (Math.round(el.scrollLeft / el.clientWidth) !== current) scrollToIndex(current);
  }, [current, scrollToIndex]);

  const onScroll = () => {
    const el = track.current;
    if (!el || programmatic.current || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== current) onIndexChange(i);
  };

  if (count === 0) {
    return <Media src={null} alt="" ratio={ratio} className={cn('rounded-lg', className)} />;
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative">
        <div
          ref={track}
          role="region"
          aria-roledescription="carousel"
          aria-label={label}
          tabIndex={0}
          onScroll={onScroll}
          className="scroll-row flex snap-x snap-mandatory overflow-x-auto rounded-lg"
        >
          {images.map((img, i) => (
            <div
              key={`${img.src}-${i}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              className="w-full shrink-0 snap-center"
            >
              <Media src={img.src} alt={img.alt} ratio={ratio} priority={priority && i === 0} sizes={sizes} />
            </div>
          ))}
        </div>
        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              aria-disabled={current === 0 || undefined}
              onClick={() => current > 0 && onIndexChange(current - 1)}
              className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-float aria-disabled:opacity-40 md:flex"
            >
              <ChevronLeft width={24} height={24} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              aria-disabled={current === count - 1 || undefined}
              onClick={() => current < count - 1 && onIndexChange(current + 1)}
              className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-float aria-disabled:opacity-40 md:flex"
            >
              <ChevronRight width={24} height={24} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <>
          <div className="flex justify-center gap-1 lg:hidden" role="group" aria-label="Choose photo">
            {images.map((img, i) => (
              <button
                key={`dot-${img.src}-${i}`}
                type="button"
                aria-label={`Show photo ${i + 1} of ${count}`}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => onIndexChange(i)}
                className="group inline-flex h-11 w-8 items-center justify-center"
              >
                <span className={cn('h-2 w-2 rounded-full', i === current ? 'bg-ink' : 'bg-line-strong')} />
              </button>
            ))}
          </div>
          <ul className="hidden gap-2 lg:flex" aria-label="Photo thumbnails">
            {images.map((img, i) => (
              <li key={`thumb-${img.src}-${i}`} className="w-20">
                <button
                  type="button"
                  aria-label={`Show photo ${i + 1} of ${count}`}
                  aria-current={i === current ? 'true' : undefined}
                  onClick={() => onIndexChange(i)}
                  className={cn('block w-full overflow-hidden rounded-md border-2', i === current ? 'border-ink' : 'border-transparent')}
                >
                  <Media src={img.src} alt="" ratio={ratio} sizes="80px" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
