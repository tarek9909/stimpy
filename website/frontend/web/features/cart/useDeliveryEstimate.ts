'use client';

import { useEffect, useState } from 'react';
import { browserApi } from '@/lib/api-browser';

let cached: string | null = null;

/**
 * `estimateText` of `GET /delivery/fees` for the cart drawer's delivery note (website-pages 3.3). Fetched once
 * when the drawer first opens and kept in memory; a failure just leaves the note without an estimate.
 */
export function useDeliveryEstimate(active: boolean): string | null {
  const [text, setText] = useState<string | null>(cached);
  useEffect(() => {
    if (!active || cached !== null) return;
    let cancelled = false;
    browserApi()
      .GET('/api/v1/delivery/fees', { cache: 'no-store' })
      .then(({ data }) => {
        if (data) {
          cached = data.estimateText;
          if (!cancelled) setText(data.estimateText);
        }
      })
      .catch(() => {
        /* the note simply has no estimate */
      });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return text;
}
