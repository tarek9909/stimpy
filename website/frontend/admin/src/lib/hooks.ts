import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** `matchMedia` as state. Returns `fallback` where it is unavailable (jsdom, SSR). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const get = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
    return window.matchMedia(query).matches;
  }, [query, fallback]);
  return useSyncExternalStore(subscribe, get, () => fallback);
}

/** Tailwind breakpoints used by the shell (min-width). */
export const BREAKPOINTS = { sm: '(min-width: 640px)', md: '(min-width: 768px)', lg: '(min-width: 1024px)' } as const;

/** True from `md` (768 px): tables instead of cards, sidebar instead of the bottom bar. */
export function useIsMdUp(): boolean {
  return useMediaQuery(BREAKPOINTS.md, true);
}

export function useIsLgUp(): boolean {
  return useMediaQuery(BREAKPOINTS.lg, true);
}

/** `navigator.onLine` with the `online` / `offline` events. A single failed request does not mean offline. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Value that follows `value` after `delayMs` of quiet. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Latest-value ref: read inside effects and handlers without re-subscribing. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** True while the document is visible (polling pauses when hidden). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );
}

/** True when the focused element is something the user is typing into (shortcuts must not fire). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
