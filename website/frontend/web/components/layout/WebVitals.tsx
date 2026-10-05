'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { safeAnalyticsPath, track } from '@/lib/track';

const REPORTED_METRICS = new Set(['LCP', 'INP', 'CLS', 'TTFB']);

/** Report one anonymous field sample per documented metric and route; no URL query or customer data is included. */
export function WebVitals() {
  const pathname = usePathname() ?? '/';
  const reported = useRef(new Set<string>());

  useEffect(() => {
    reported.current.clear();
  }, [pathname]);

  useReportWebVitals((metric) => {
    if (!REPORTED_METRICS.has(metric.name) || !Number.isFinite(metric.value)) return;
    const key = `${pathname}:${metric.name}`;
    if (reported.current.has(key)) return;
    reported.current.add(key);
    track('web_vitals', {
      metric: metric.name,
      value: Math.round(metric.value * 100) / 100,
      rating: metric.rating,
      path: safeAnalyticsPath(pathname),
    });
  });

  return null;
}
