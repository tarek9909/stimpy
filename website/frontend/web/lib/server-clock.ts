'use client';

/**
 * Server clock for countdowns (state-and-errors section 13, HANDOFF "Server clock for countdowns").
 * The device clock may be minutes off; drop countdowns follow the API. `GET /health` is sampled three times,
 * 300 ms apart, and the smallest round trip wins. Fallback: the `Date` header (second precision). Re-measured
 * every 5 minutes and when the tab becomes visible after more than 60 s hidden. The result is cached in
 * sessionStorage (`stimpy.clockOffset`) so a reload does not repeat the burst.
 */
import { useEffect, useRef, useState } from 'react';
import { estimateClockOffset, offsetFromDateHeader, type ClockSample } from '@stimpy/ui';
import { browserApi } from './api-browser';
import { readStored, writeStored } from './storage';

export const CLOCK_STORAGE_KEY = 'stimpy.clockOffset';
export const CLOCK_REMEASURE_MS = 5 * 60 * 1000;
export const CLOCK_HIDDEN_MS = 60 * 1000;
export const SAMPLE_COUNT = 3;
export const SAMPLE_GAP_MS = 300;

export interface ClockEstimate {
  offsetMs: number;
  uncertain: boolean;
}

export interface HealthProbe {
  /** `time` from GET /health (ISO, ms precision). */
  time: string;
  /** The `Date` response header, when readable. */
  dateHeader: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Take up to `samples` health samples and estimate the offset. `probe` is injected for tests.
 * With no usable sample but a `Date` header the fallback is used; with nothing, `uncertain: true`.
 */
export async function measureClockOffset(
  probe: () => Promise<HealthProbe>,
  options: { samples?: number; gapMs?: number; now?: () => number; perf?: () => number } = {},
): Promise<ClockEstimate> {
  const count = options.samples ?? SAMPLE_COUNT;
  const gap = options.gapMs ?? SAMPLE_GAP_MS;
  const now = options.now ?? Date.now;
  const perf = options.perf ?? (() => performance.now());
  const samples: ClockSample[] = [];
  let lastHeaderOffset: number | null = null;
  for (let i = 0; i < count; i++) {
    const sentAt = now();
    const t0 = perf();
    try {
      const res = await probe();
      const rttMs = perf() - t0;
      samples.push({ serverTime: res.time, sentAt, rttMs });
      if (res.dateHeader) lastHeaderOffset = offsetFromDateHeader(res.dateHeader, now());
    } catch {
      /* a failed sample is simply missing */
    }
    if (i < count - 1) await sleep(gap);
  }
  const estimate = estimateClockOffset(samples);
  if (!estimate.uncertain) return { offsetMs: estimate.offsetMs, uncertain: false };
  if (lastHeaderOffset !== null) return { offsetMs: lastHeaderOffset, uncertain: false };
  return { offsetMs: 0, uncertain: true };
}

async function probeHealth(): Promise<HealthProbe> {
  const { data, response } = await browserApi().GET('/api/v1/health', { cache: 'no-store' });
  if (!data) throw new Error('empty health response');
  return { time: data.time, dateHeader: response.headers.get('Date') };
}

function readCached(): ClockEstimate | null {
  const raw = readStored('session', CLOCK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { offsetMs?: unknown; at?: unknown };
    if (typeof v.offsetMs === 'number' && typeof v.at === 'number' && Date.now() - v.at < CLOCK_REMEASURE_MS) {
      return { offsetMs: v.offsetMs, uncertain: false };
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

/** Hook used once by <Providers>. Starts uncertain (device clock) and improves after mount. */
export function useServerClockOffset(): ClockEstimate {
  const [estimate, setEstimate] = useState<ClockEstimate>({ offsetMs: 0, uncertain: true });
  const hiddenAt = useRef<number | null>(null);
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const measure = async (force: boolean) => {
      if (running.current) return;
      if (!force) {
        const cached = readCached();
        if (cached) {
          setEstimate(cached);
          return;
        }
      }
      running.current = true;
      try {
        const result = await measureClockOffset(probeHealth);
        if (cancelled) return;
        setEstimate(result);
        if (!result.uncertain) writeStored('session', CLOCK_STORAGE_KEY, JSON.stringify({ offsetMs: result.offsetMs, at: Date.now() }));
      } finally {
        running.current = false;
      }
    };

    // Defer the burst until the page is idle: the clock is not needed for first paint.
    const idle = (cb: () => void): (() => void) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(cb, { timeout: 2000 });
        return () => window.cancelIdleCallback(id);
      }
      const id = window.setTimeout(cb, 300);
      return () => window.clearTimeout(id);
    };
    const cancelIdle = idle(() => void measure(false));
    const interval = window.setInterval(() => void measure(true), CLOCK_REMEASURE_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null && Date.now() - hiddenAt.current > CLOCK_HIDDEN_MS) {
        hiddenAt.current = null;
        void measure(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      cancelIdle();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return estimate;
}
