'use client';

/**
 * The browser's API client (client components only): `NEXT_PUBLIC_API_URL`, no credentials, 2 automatic GET
 * retries after 1 s and 3 s on network failures and 5xx (state-and-errors 10.1). Throws ApiError.
 * Use `{ cache: 'no-store' }` per call for data that must be fresh (drops, stock).
 */
import { createPublicClient, type ApiClient, type ApiError } from '@stimpy/api-client';
import { publicEnv } from './env';

let client: ApiClient | null = null;

function logFailure(error: ApiError, info: { method: string; path: string }): void {
  // Expected product flow (state-and-errors 18) is not logged; only unexpected failures are.
  if (error.status >= 500 || error.code === 'BAD_RESPONSE' || error.code === 'UNKNOWN' || error.code === 'NETWORK') {
    // eslint-disable-next-line no-console -- client diagnostics, no bodies
    console.warn(`[stimpy:web] ${info.method} ${info.path} failed`, error.code, error.status, error.requestId ?? '');
  }
}

export function browserApi(): ApiClient {
  client ??= createPublicClient({
    baseUrl: publicEnv.NEXT_PUBLIC_API_URL,
    getRetryDelays: [1000, 3000],
    onError: logFailure,
  });
  return client;
}
