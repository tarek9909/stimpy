/**
 * Server-side API access (server components, route handlers, sitemap). Uses `API_URL_INTERNAL`, no credentials,
 * and Next's data cache: `fetch(url, { next: { revalidate, tags } })` with the per-endpoint windows of
 * state-and-errors 2.2. In development `NEXT_PUBLIC_DEV_NO_CACHE=1` turns every window into 0.
 */
import { cache } from 'react';
import { connection } from 'next/server';
import { createPublicClient, isApiError, type ApiClient } from '@stimpy/api-client';
import { apiBaseUrl, devNoCache } from './env';

export interface CacheOptions {
  /** Seconds; 0 = never cache (no-store). */
  revalidate: number;
  tags?: string[];
}

/** Revalidation windows per endpoint group (state-and-errors section 2.2). */
export const REVALIDATE = {
  content: 60,
  options: 60,
  sizeChart: 300,
  delivery: 300,
  hoodies: 60,
  stimpies: 30,
  packs: 60,
  drops: 10,
  builder: 60,
} as const;

export function serverApi(cacheOptions: CacheOptions): ApiClient {
  const revalidate = devNoCache ? 0 : cacheOptions.revalidate;
  return createPublicClient({
    baseUrl: apiBaseUrl,
    fetch: (request) =>
      fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        ...(revalidate === 0
          ? { cache: 'no-store' as const }
          : { next: { revalidate, ...(cacheOptions.tags ? { tags: cacheOptions.tags } : {}) } }),
      }),
  });
}

/** Unwrap an openapi-fetch result: errors already threw, so `data` is present on success. */
export function unwrap<T>(result: { data?: T }): T {
  if (result.data === undefined) throw new Error('The API returned an empty response.');
  return result.data;
}

/**
 * During `next build` an unreachable API must not fail the whole build: the page opts out of prerendering and is
 * rendered per request instead (connection() postpones the render). At runtime the original error is rethrown so
 * `error.tsx` can show it.
 */
export async function onFetchFailure(error: unknown): Promise<never> {
  // Next's own control-flow errors (notFound, redirect, dynamic bail-out) must pass through untouched.
  const digest = typeof error === 'object' && error !== null ? (error as { digest?: unknown }).digest : undefined;
  if (typeof digest === 'string' && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT)/.test(digest)) throw error;
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    await connection();
  }
  throw error;
}

/** Run a server fetch; map API 404 to `null` so pages can call `notFound()`. */
export async function orNull<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isApiError(error) && error.code === 'NOT_FOUND') return null;
    return onFetchFailure(error);
  }
}

/** Run a server fetch where a failure is fatal for the page (rethrown to error.tsx). */
export async function must<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return onFetchFailure(error);
  }
}

export { cache };
