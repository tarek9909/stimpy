'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FreshOptions {
  /** Fetch once right after hydration (server data may be up to a minute old). Default true. */
  onMount?: boolean;
  /** Refetch when the window regains focus or the tab becomes visible, at most every `focusThrottleMs`. Default true. */
  onFocus?: boolean;
  focusThrottleMs?: number;
  /** Poll while the tab is visible. Paused when hidden; resumes with an immediate refetch. */
  intervalMs?: number;
  /** Turn everything off (e.g. the drop is not live). */
  enabled?: boolean;
}

/**
 * Server-rendered `initial` data kept fresh from the browser (no-store calls the caller supplies in `fetcher`).
 * Failures keep the previous data (stale is better than empty); `error` exposes the last one.
 * A new `initial` (after `router.refresh()`) replaces the state.
 */
export function useFreshData<T>(
  initial: T,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: FreshOptions = {},
): { data: T; refresh: () => Promise<void>; error: unknown; refreshing: boolean } {
  const { onMount = true, onFocus = true, focusThrottleMs = 15_000, intervalMs, enabled = true } = options;
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastRun = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => setData(initial), [initial]);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    lastRun.current = Date.now();
    setRefreshing(true);
    try {
      const next = await fetcherRef.current(controller.signal);
      if (!controller.signal.aborted) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e);
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (onMount) void refresh();
    const maybe = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun.current < focusThrottleMs) return;
      void refresh();
    };
    if (onFocus) {
      window.addEventListener('focus', maybe);
      document.addEventListener('visibilitychange', maybe);
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    if (intervalMs) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, intervalMs);
    }
    return () => {
      inFlight.current?.abort();
      if (onFocus) {
        window.removeEventListener('focus', maybe);
        document.removeEventListener('visibilitychange', maybe);
      }
      if (timer) clearInterval(timer);
    };
  }, [enabled, onMount, onFocus, focusThrottleMs, intervalMs, refresh]);

  return { data, refresh, error, refreshing };
}
