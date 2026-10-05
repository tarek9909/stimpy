import type { QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { postAuthEvent, type AuthEventType } from './broadcast';
import { clearAllDrafts, saveAllDrafts } from './drafts';
import { loginUrl } from './returnTo';
import type { ExpiryInfo } from './expiry';

/** Router state the login page reads to pick its banner (auth-and-sessions 1.2). */
export type LoginReason = 'expired' | 'logout' | 'other-tab';
export interface LoginLocationState {
  reason?: LoginReason;
  /** A save was in flight when the session ended: "Your last change wasn't saved." */
  lastChangeLost?: boolean;
}

let pending: LoginLocationState | null = null;
/** The banner reason survives a route-guard redirect that drops router state. Read once by the login page. */
export function takePendingLoginState(): LoginLocationState | null {
  const p = pending;
  pending = null;
  return p;
}

export interface SessionFlowDeps {
  queryClient: QueryClient;
  navigate: (to: string, options: { replace: boolean; state?: LoginLocationState }) => void;
  getLocation: () => { pathname: string; search: string };
}

export interface SessionFlow {
  /** 401 mid-session (2.3). Saves drafts, clears memory, broadcasts, goes to login with returnTo. */
  expire(info?: ExpiryInfo): void;
  /** Intentional logout (2.4). Resolves `{ networkFailed }` when the server could not be reached. */
  logout(): Promise<{ networkFailed: boolean }>;
  /** Another tab announced something (2.5). */
  receive(type: AuthEventType): void;
}

export function createSessionFlow({ queryClient, navigate, getLocation }: SessionFlowDeps): SessionFlow {
  /** Stops in-flight work and leaves no customer data behind the login page. */
  function wipeMemory(): void {
    void queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    queryClient.setQueryData(queryKeys.session, null);
  }

  return {
    expire(info = {}) {
      const { pathname, search } = getLocation();
      // Drafts are written BEFORE anything is cleared so the form still has its values.
      saveAllDrafts();
      // Navigate first: wiping the session re-renders the route guard, which must not win the race and drop the banner state.
      pending = { reason: 'expired', lastChangeLost: !!info.method && info.method !== 'GET' };
      navigate(loginUrl(`${pathname}${search}`), {
        replace: true,
        state: { reason: 'expired', lastChangeLost: !!info.method && info.method !== 'GET' },
      });
      wipeMemory();
      postAuthEvent('logout');
    },

    async logout() {
      let networkFailed = false;
      try {
        await api.POST('/api/v1/auth/logout');
      } catch {
        // Always 204 for a reachable server; only a network failure gets here. Log out locally anyway.
        networkFailed = true;
      }
      clearAllDrafts();
      pending = { reason: 'logout' };
      navigate('/login', { replace: true, state: { reason: 'logout' } });
      wipeMemory();
      postAuthEvent('logout');
      return { networkFailed };
    },

    receive(type) {
      if (type !== 'logout') return;
      clearAllDrafts();
      pending = { reason: 'other-tab' };
      navigate('/login', { replace: true, state: { reason: 'other-tab' } });
      wipeMemory();
    },
  };
}
