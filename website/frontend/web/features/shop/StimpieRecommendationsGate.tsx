'use client';

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Stimpie } from '@stimpy/api-client';

const RecommendationCards = lazy(() => import('./StimpieRecommendationCards'));

export function StimpieRecommendationsGate({
  stimpies,
  heading,
  tone,
  fallback,
}: {
  stimpies: Stimpie[];
  heading: string;
  tone: 'white' | 'cream';
  fallback: ReactNode;
}) {
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
        <Suspense fallback={fallback}>
          <RecommendationCards stimpies={stimpies} heading={heading} tone={tone} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
