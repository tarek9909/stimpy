'use client';

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BuilderData } from '@stimpy/builder';

const InteractiveTeaser = lazy(() => import('./BuilderTeaserClient').then((module) => ({ default: module.BuilderTeaserClient })));

/**
 * Keep the server-rendered teaser visible and accessible, then load its interactive Builder code shortly before the
 * section enters view. The compact Builder is sizeable and below the home-page fold; visitors who scroll to it get the
 * same controls, while the initial route avoids downloading Builder code during first paint.
 */
export function BuilderTeaserGate({ data, fallback }: { data: BuilderData; fallback: ReactNode }) {
  const section = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const target = section.current;
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
      { rootMargin: '200px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={section}>
      {active ? (
        <Suspense fallback={fallback}>
          <InteractiveTeaser data={data} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
