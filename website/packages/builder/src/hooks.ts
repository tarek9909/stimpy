'use client';

import { useEffect, useState, type RefObject } from 'react';
import { prefersReducedMotionNow } from './lib/env';

/** Reactive `prefers-reduced-motion`. Starts false so server HTML and the first client render agree. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export { prefersReducedMotionNow };

/** True once the element has come within `rootMargin` of the viewport (stays true). */
export function useInView(ref: RefObject<Element | null>, rootMargin = '200px', enabled = true): boolean {
  const [seen, setSeen] = useState(!enabled);
  useEffect(() => {
    if (!enabled || seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, enabled, seen]);
  return seen;
}
