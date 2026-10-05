import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isApiError, type components } from '@stimpy/api-client';
import { useEffect } from 'react';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { notifySessionExpired, resetSessionExpiry } from './expiry';

export type AuthUser = components['schemas']['AuthUser'];

/** What the `['session']` query holds. `null` = known to be logged out. `expiresAt` is null right after login until the next `GET /auth/me`. */
export interface SessionData {
  user: AuthUser;
  expiresAt: string | null;
}

/**
 * `GET /auth/me` (auth-and-sessions 2.1). `staleTime: Infinity`, no retry, no focus refetch: the
 * guard re-validates on its own schedule (`useSessionRevalidation`). A 401 resolves to `null`
 * (logged out) instead of an error; if there WAS a session before, it is an expiry and the global
 * flow runs (banner and returnTo). Network and 5xx errors stay errors: the guard shows "Can't reach
 * the server" rather than the login page, because the session may well be valid.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: queryKeys.session,
  queryFn: async ({ client }): Promise<SessionData | null> => {
    try {
      const data = await unwrap(api.GET('/api/v1/auth/me'));
      resetSessionExpiry();
      return { user: data.user, expiresAt: data.session.expiresAt };
    } catch (e) {
      if (isApiError(e) && e.code === 'UNAUTHENTICATED') {
        const had = client.getQueryData<SessionData | null>(queryKeys.session);
        if (had) notifySessionExpired({ method: 'GET' });
        return null;
      }
      throw e;
    }
  },
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

/**
 * The signed-in session. Only valid under `<RequireAuth>`: throws elsewhere, so a page can never
 * render without a user.
 */
export function useSession(): SessionData {
  const queryClient = useQueryClient();
  const { data } = useQuery({ ...sessionQueryOptions, enabled: false });
  const value = data ?? queryClient.getQueryData<SessionData | null>(queryKeys.session);
  if (!value) throw new Error('useSession() must be used inside <RequireAuth>.');
  return value;
}

/** Writes the logged-in user into the cache (login success). */
export function setSession(queryClient: QueryClient, data: SessionData | null): void {
  queryClient.setQueryData(queryKeys.session, data);
}

const REVALIDATE_AFTER_HIDDEN_MS = 5 * 60 * 1000;
const REVALIDATE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Quiet re-validation (auth-and-sessions 2.2): refetch `['session']` when the tab regains focus
 * after more than 5 minutes hidden, and every 15 minutes while visible. This keeps `expiresAt`
 * current; a 401 here goes through the normal expiry flow.
 */
export function useSessionRevalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    const refresh = () => {
      void queryClient.refetchQueries({ queryKey: queryKeys.session });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt > REVALIDATE_AFTER_HIDDEN_MS) refresh();
      hiddenAt = null;
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REVALIDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient]);
}
