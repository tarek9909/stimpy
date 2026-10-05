'use client';

import { useRef, type ReactNode } from 'react';
import { cn, prefersReducedMotion } from '@stimpy/ui';
import { ChevronLeft, ChevronRight } from './icons';

/**
 * Horizontally scrolling row with snap scrolling, keyboard focus on the scroll container and Previous/Next buttons
 * (visible from `md`; touch users swipe). Children are list items.
 */
export function ScrollRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <div className={cn('relative', className)}>
      <ul
        ref={ref}
        aria-label={label}
        tabIndex={0}
        className="scroll-row -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:scroll-px-0 md:mx-0 md:gap-6 md:px-0"
      >
        {children}
      </ul>
      <div className="mt-4 hidden justify-end gap-2 md:flex">
        <button
          type="button"
          aria-label={`Previous ${label.toLowerCase()}`}
          onClick={() => scrollBy(-1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-control text-fg hover:border-fg"
        >
          <ChevronLeft width={24} height={24} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Next ${label.toLowerCase()}`}
          onClick={() => scrollBy(1)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-control text-fg hover:border-fg"
        >
          <ChevronRight width={24} height={24} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
