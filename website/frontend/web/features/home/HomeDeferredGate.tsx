'use client';

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Drop, Pack, Stimpie } from '@stimpy/api-client';

const DeferredCards = lazy(() => import('./HomeDeferredCards'));

type Props = {
  kind: 'commerce';
  fallback: ReactNode;
  packs: Pack[];
  hoodieSlug: string | null;
  extraCents: number;
  minExtra: number | null;
  drop: Drop | null;
  coreStimpies: Stimpie[];
};

/** Keep the complete server preview in the HTML, then load its interactive cards shortly before they enter view. */
export function HomeDeferredGate(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setActive(true);
        observer.disconnect();
      },
      { rootMargin: '200px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {active ? (
        <Suspense fallback={props.fallback}>
          <DeferredCards {...props} />
        </Suspense>
      ) : (
        props.fallback
      )}
    </div>
  );
}
