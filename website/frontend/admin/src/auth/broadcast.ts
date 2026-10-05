/**
 * Multi-tab sync (auth-and-sessions 2.5): `BroadcastChannel('stimpy-auth')` with a storage-event
 * fallback. Messages carry an event name only: no credential, no user data. A tab never receives
 * its own message (BroadcastChannel does not echo to the posting object; `storage` events do not
 * fire in the tab that wrote).
 */
export type AuthEventType = 'logout' | 'login' | 'password-changed';

const CHANNEL_NAME = 'stimpy-auth';
export const AUTH_STORAGE_KEY = 'stimpy.auth.event';

const TYPES: readonly string[] = ['logout', 'login', 'password-changed'];
const isType = (v: unknown): v is AuthEventType => typeof v === 'string' && TYPES.includes(v);

let channel: BroadcastChannel | null | undefined;
let forceFallback = false;

function getChannel(): BroadcastChannel | null {
  if (forceFallback) return null;
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    channel = null;
  }
  return channel;
}

export function postAuthEvent(type: AuthEventType): void {
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage({ type });
      return;
    } catch {
      /* fall through to the storage path */
    }
  }
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ type, at: Date.now() }));
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* storage blocked: nothing else to do */
  }
}

export function subscribeAuthEvents(handler: (type: AuthEventType) => void): () => void {
  const ch = getChannel();
  const onMessage = (event: MessageEvent) => {
    const type = (event.data as { type?: unknown } | null)?.type;
    if (isType(type)) handler(type);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as { type?: unknown };
      if (isType(parsed.type)) handler(parsed.type);
    } catch {
      /* ignore malformed */
    }
  };
  ch?.addEventListener('message', onMessage);
  // The storage listener is always attached: it is the fallback path and harmless otherwise.
  window.addEventListener('storage', onStorage);
  return () => {
    ch?.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
  };
}

/** Test helper: forget the cached channel; `fallback: true` simulates a browser without BroadcastChannel. */
export function resetBroadcastForTests(options: { fallback?: boolean } = {}): void {
  try {
    channel?.close();
  } catch {
    /* ignore */
  }
  channel = undefined;
  forceFallback = options.fallback ?? false;
}
