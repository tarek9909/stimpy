/**
 * Analytics entry point (state-and-errors section 17). Privacy-friendly, cookieless, no PII: callers pass enums,
 * slugs, integers and booleans only. Until a provider is configured (NEXT_PUBLIC_ANALYTICS_SRC/_DOMAIN) events are
 * logged to the console in development and otherwise dropped. Respects Do Not Track and Global Privacy Control.
 */
import { publicEnv } from './env';

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

type PlausibleArguments = [event: string, options?: { props?: TrackProps; url?: string }];

interface PlausibleFunction {
  (...args: PlausibleArguments): void;
  q?: PlausibleArguments[];
  init?: (options: { autoCapturePageviews: boolean }) => void;
  o?: { autoCapturePageviews: boolean };
}

declare global {
  interface Window {
    plausible?: PlausibleFunction;
  }
}

function privacySignalOn(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

const FORBIDDEN_KEYS = /(email|phone|name|address|order_?number|delivery_?number|note|query)/i;

/** Use a path only; collapse secret order/unsubscribe tokens before they can reach an analytics provider. */
export function safeAnalyticsPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || '/';
  if (/^\/order\/[^/]+\/thanks\/?$/.test(pathname)) return '/order/thanks';
  if (/^\/unsubscribe\/[^/]+\/?$/.test(pathname)) return '/unsubscribe';
  return pathname.startsWith('/') ? pathname : '/';
}

/** Defensive scrub: drops any property whose key suggests personal data. */
export function scrub(props: TrackProps | undefined): TrackProps {
  if (!props) return {};
  const out: TrackProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function track(event: string, props?: TrackProps): void {
  if (typeof window === 'undefined') return;
  const clean = scrub(props);
  try {
    if (publicEnv.NEXT_PUBLIC_APP_ENV === 'local' && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console -- dev-only event log
      console.debug('[stimpy:web] track', event, clean);
    }
    if (privacySignalOn()) return;
    if (process.env.NODE_ENV !== 'production' || publicEnv.NEXT_PUBLIC_APP_ENV !== 'production') return;
    if (!publicEnv.NEXT_PUBLIC_ANALYTICS_SRC || !publicEnv.NEXT_PUBLIC_ANALYTICS_DOMAIN) return;
    if (event === 'page_view') {
      const path = safeAnalyticsPath(typeof clean.path === 'string' ? clean.path : window.location.pathname);
      window.plausible?.('pageview', { props: { ...clean, path }, url: `${window.location.origin}${path}` });
      return;
    }
    window.plausible?.(event, { props: clean });
  } catch {
    /* analytics must never break the page */
  }
}
