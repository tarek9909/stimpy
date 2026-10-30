/**
 * Meta Pixel for paid-ad measurement. Like the analytics script it runs only in the production app, and never when the
 * visitor sends Do Not Track or Global Privacy Control. Automatic configuration is off, so Meta receives only the
 * events called here, never form contents. `Purchase` uses the order number as its event id; the API sends the same
 * id through the Conversions API (backend services/meta-capi.ts), so Meta counts each order once.
 */
import { publicEnv } from './env';
import { readStored, writeStored } from './storage';
import { privacySignalOn } from './track';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const META_PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
export const FBCLID_STORAGE_KEY = 'stimpy.fbclid';

export type MetaEvent = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
export type MetaParams = Record<string, string | number>;

/** The shape Meta uses for `_fbp` / `_fbc` (the API validates the same pattern). */
const META_COOKIE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]{1,400}$/;
const FBCLID = /^[A-Za-z0-9_\-.]{1,400}$/;

/** Production app and no privacy signal: the condition for the Pixel and for sending ad signals with an order. */
export function metaAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production' || publicEnv.NEXT_PUBLIC_APP_ENV !== 'production') return false;
  return !privacySignalOn();
}

/** Installs the standard Pixel loader once. Returns false when the Pixel must not run. */
export function ensureMetaPixel(): boolean {
  const pixelId = publicEnv.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId || !metaAllowed()) return false;
  if (window.fbq) return true;

  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq ??= fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = META_PIXEL_SRC;
  script.dataset.stimpyMetaPixel = 'true';
  document.head.appendChild(script);

  fbq('set', 'autoConfig', false, pixelId);
  fbq('init', pixelId);
  return true;
}

/** Sends one standard event. A no-op when the Pixel is not allowed; never throws. */
export function metaTrack(event: MetaEvent, params?: MetaParams, eventId?: string): void {
  try {
    if (!ensureMetaPixel()) return;
    if (eventId) window.fbq!('track', event, params ?? {}, { eventID: eventId });
    else window.fbq!('track', event, params ?? {});
  } catch {
    /* tracking must never break the page */
  }
}

/** Keeps the landing `fbclid` for this tab, so the order can carry the ad click even if the Pixel is blocked. */
export function captureFbclid(search: string, now: number = Date.now()): void {
  if (privacySignalOn()) return;
  const value = new URLSearchParams(search).get('fbclid');
  if (value && FBCLID.test(value)) writeStored('session', FBCLID_STORAGE_KEY, JSON.stringify({ value, at: now }));
}

function readCookie(name: string): string | undefined {
  const entry = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function storedFbc(): string | undefined {
  const raw = readStored('session', FBCLID_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const { value, at } = JSON.parse(raw) as { value?: unknown; at?: unknown };
    if (typeof value !== 'string' || typeof at !== 'number') return undefined;
    const fbc = `fb.1.${Math.floor(at)}.${value}`;
    return META_COOKIE.test(fbc) ? fbc : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The `metaAds` object for `POST /orders`, or undefined when Meta must not receive this order. An empty object still
 * lets the API send the Conversions API event (with the hashed contact details only).
 */
export function getMetaAdSignals(): { fbp?: string; fbc?: string } | undefined {
  if (!metaAllowed()) return undefined;
  const out: { fbp?: string; fbc?: string } = {};
  const fbp = readCookie('_fbp');
  if (fbp && META_COOKIE.test(fbp)) out.fbp = fbp;
  const fbc = readCookie('_fbc');
  if (fbc && META_COOKIE.test(fbc)) out.fbc = fbc;
  else {
    const fallback = storedFbc();
    if (fallback) out.fbc = fallback;
  }
  return out;
}
