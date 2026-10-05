'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useServerClock } from '@stimpy/ui';
import type { DropState } from '@stimpy/api-client';
import { browserApi } from '@/lib/api-browser';
import { track } from '@/lib/track';
import { EARLY_POLL_MS, inEarlyWindow, runHandoff } from './handoff';

/** The server's current state of one drop, from `GET /drops` (no-store). Null when it is not listed or unreadable. */
export async function fetchDropState(slug: string): Promise<DropState | null> {
  const { data } = await browserApi().GET('/api/v1/drops', { cache: 'no-store' });
  if (!data) return null;
  const all = [...(data.live ? [data.live] : []), ...data.upcoming, ...data.archive];
  return all.find((d) => d.slug === slug)?.state ?? null;
}

export type HandoffStatus = 'idle' | 'waiting' | 'delayed';

/**
 * Wire a drop's `Countdown` to the server:
 * - `onComplete` (pass to `<Countdown onComplete>`) runs the zero hand-off, then `router.refresh()` once LIVE;
 * - while the final 60 s before `startsAt` are running, `GET /drops` is polled every 5 s to catch an early manual start.
 * `status` is `waiting` after zero, and `delayed` ("Starting any moment") when the server still says UPCOMING after 30 s.
 */
export function useDropHandoff(slug: string, startsAt: string | null, enabled = true, mode: 'start' | 'end' = 'start') {
  const router = useRouter();
  const { offsetMs } = useServerClock();
  const [status, setStatus] = useState<HandoffStatus>('idle');
  const running = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const goLive = useCallback(
    (zeroAt: number | null) => {
      setStatus('idle');
      if (zeroAt !== null) track('countdown_zero', { drop_slug: slug, server_confirmed_ms: Date.now() - zeroAt });
      router.refresh();
    },
    [router, slug],
  );

  const onComplete = useCallback(async () => {
    if (running.current || !enabled) return;
    running.current = true;
    const zeroAt = Date.now();
    setStatus('waiting');
    try {
      const reached = mode === 'end' ? (s: DropState) => s !== 'LIVE' : undefined;
      const result = await runHandoff({
        fetchState: () => fetchDropState(slug),
        ...(reached ? { reached } : {}),
        isCancelled: () => cancelled.current,
      });
      if (result === 'live') {
        goLive(zeroAt);
        return;
      }
      if (result === 'timeout' && !cancelled.current) {
        // Device clock fast: keep the server's data, say so, and keep watching every 5 s.
        setStatus('delayed');
        while (!cancelled.current) {
          await new Promise((r) => setTimeout(r, EARLY_POLL_MS));
          if (document.visibilityState !== 'visible') continue;
          const state = await fetchDropState(slug).catch(() => null);
          if (state !== null && (mode === 'end' ? state !== 'LIVE' : state === 'LIVE')) {
            goLive(zeroAt);
            return;
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, [enabled, goLive, mode, slug]);

  // Final minute: poll every 5 s so an early manual start by the founder shows up.
  useEffect(() => {
    if (!enabled || !startsAt || mode !== 'start') return;
    const startsMs = Date.parse(startsAt);
    if (Number.isNaN(startsMs)) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      if (!inEarlyWindow(startsMs, Date.now(), offsetMs)) return;
      if ((await fetchDropState(slug).catch(() => null)) === 'LIVE') goLive(null);
    }, EARLY_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, startsAt, offsetMs, slug, goLive, mode]);

  return { onComplete, status };
}

