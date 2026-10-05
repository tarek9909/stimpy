'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Banner, useOptionalToast } from '@stimpy/ui';
import { cartStore } from '@/features/cart/store';
import { track, type TrackProps } from '@/lib/track';
import { captureUtm, cleanForApi, readFirstTouch } from '@/lib/utm';

export function buildPageViewProps(pathname: string): TrackProps {
  const props: TrackProps = { path: pathname };
  const params = new URLSearchParams(window.location.search);
  const firstTouch = readFirstTouch();
  for (const [queryKey, property] of [
    ['utm_source', 'utm_source'],
    ['utm_medium', 'utm_medium'],
    ['utm_campaign', 'utm_campaign'],
  ] as const) {
    const value = params.get(queryKey) ?? firstTouch?.[property];
    if (value) {
      const safe = cleanForApi(value);
      if (safe) props[property as 'utm_source' | 'utm_medium' | 'utm_campaign'] = safe;
    }
  }
  try {
    const host = document.referrer
      ? new URL(document.referrer).hostname
      : firstTouch?.referrer
        ? new URL(firstTouch.referrer).hostname
        : '';
    if (host) props.referrer_host = host.toLowerCase();
  } catch {
    /* Ignore malformed referrers. */
  }
  return props;
}

/**
 * Mounted once in the root layout. Does the app-wide client work that has no UI of its own:
 * - hydrates the cart from localStorage (and shows its one-time notices)
 * - captures UTM values on landing (sessionStorage `stimpy.utm`)
 * - tracks page views
 * - moves focus to the page `h1` on client navigation and announces the new title (accessibility 14)
 * - logs unhandled errors to the console with the `[stimpy:web]` prefix (no DSN transport in v1)
 * - shows the offline banner
 */
export function ClientEffects() {
  const pathname = usePathname();
  const toast = useOptionalToast();
  const first = useRef(true);
  const [announcement, setAnnouncement] = useState('');

  // Cart hydration + notices.
  useEffect(() => {
    const store = cartStore;
    store.getState().hydrate();
    const show = () => {
      const { notices } = store.getState();
      if (notices.includes('OLD_CART_CLEARED')) {
        toast?.info('Your cart was cleared because it was old.');
        store.getState().dismissNotice('OLD_CART_CLEARED');
      }
      if (notices.includes('NOT_PERSISTENT')) {
        toast?.info("Your cart won't be saved if you close this tab.");
        store.getState().dismissNotice('NOT_PERSISTENT');
      }
    };
    show();
    return store.subscribe(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast API identity is stable enough; run once
  }, []);

  // UTM capture on first client render (latest campaign touch wins).
  useEffect(() => {
    captureUtm(window.location.search, { landingPath: window.location.pathname, referrer: document.referrer });
  }, []);

  // Page views and route-change focus.
  useEffect(() => {
    track('page_view', buildPageViewProps(pathname ?? '/'));
    if (first.current) {
      first.current = false;
      return;
    }
    // After the new route has rendered: focus its h1 and announce the title.
    const id = window.setTimeout(() => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.setAttribute('data-route-heading', '');
        h1.focus({ preventScroll: true });
      }
      setAnnouncement(document.title);
    }, 120);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // Unhandled errors: console only, scrubbed (state-and-errors 18).
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // eslint-disable-next-line no-console -- error reporting without a DSN is console only
      console.error('[stimpy:web] unhandled error', e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { code?: string; message?: string } | undefined;
      // eslint-disable-next-line no-console -- error reporting without a DSN is console only
      console.error('[stimpy:web] unhandled rejection', reason?.code ?? reason?.message ?? 'unknown');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <>
      <OfflineBanner />
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="route-announcer">
        {announcement}
      </div>
    </>
  );
}

function OfflineBanner() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setState('offline');
    let timer: number | undefined;
    const goOffline = () => {
      window.clearTimeout(timer);
      setState('offline');
      track('offline_shown');
    };
    const goOnline = () => {
      setState('back');
      timer = window.setTimeout(() => setState('online'), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.clearTimeout(timer);
    };
  }, []);
  if (state === 'online') return null;
  return (
    <div className="sticky top-14 z-20 lg:top-[72px]">
      <Banner variant={state === 'offline' ? 'warning' : 'info'} live className="rounded-none">
        {state === 'offline' ? "You're offline. We'll reconnect when you're back." : 'Back online.'}
      </Banner>
    </div>
  );
}
