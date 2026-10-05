import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@stimpy/api-client';

/**
 * Global TanStack Query defaults (state-and-errors 3.1):
 * - `staleTime` 30 s, `gcTime` 10 min, refetch on focus and reconnect (the founder switches apps).
 * - Queries retry twice with 1 s / 2 s back-off for network errors and 5xx, never for 4xx.
 * - Mutations never retry. Order and stock mutations are pessimistic by policy: components update
 *   from the server response, never optimistically (only reorders and active toggles roll back).
 * - 401 handling is NOT here: it lives in the API client wrapper (`api/client.ts`) so every call,
 *   including uploads and non-query requests, goes through the same one-shot expiry flow.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isApiError(error) && error.isRetryable;
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetryQuery,
        retryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        networkMode: 'online',
      },
      mutations: {
        retry: 0,
        // Attempt even when offline so the user sees "Not sent. Check your connection" instead of a hung spinner.
        networkMode: 'always',
      },
    },
  });
}
