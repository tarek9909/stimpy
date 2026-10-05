/**
 * First-touch UTM/referrer capture for checkout. The first attributable landing in a tab session is kept in
 * sessionStorage `stimpy.utm`; later campaign links do not overwrite it. Referrers are reduced to their origin
 * before storage so paths and query strings cannot carry personal data into checkout attribution.
 */
import { readStored, removeStored, writeStored } from './storage';

export const UTM_STORAGE_KEY = 'stimpy.utm';
export const FIRST_TOUCH_STORAGE_KEY = 'stimpy.firstTouch';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
type UtmKey = (typeof UTM_KEYS)[number];

export interface StoredUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landingPath: string;
  referrer: string;
  capturedAt: string;
}

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** Strip control characters and cap at 100 characters (storage rule). */
export function cleanStored(value: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 100);
}

/** Contract rule for `attribution.*`: trim to 80, keep only `A-Za-z0-9-_.`. */
export function cleanForApi(value: string): string {
  return value.trim().slice(0, 80).replace(/[^A-Za-z0-9\-_.]/g, '');
}

function safeReferrerOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.protocol}//${url.host}`.slice(0, 255);
  } catch {
    return undefined;
  }
}

/** Returns the stored record, or null when none was captured in this tab session. */
export function readUtm(): StoredUtm | null {
  return readStoredUtm(UTM_STORAGE_KEY);
}

export function readFirstTouch(): StoredUtm | null {
  return readStoredUtm(FIRST_TOUCH_STORAGE_KEY);
}

function readStoredUtm(key: string): StoredUtm | null {
  const raw = readStored('session', key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as StoredUtm;
  } catch {
    removeStored('session', key);
    return null;
  }
}

/**
 * Capture the latest tagged landing in `stimpy.utm`, while capturing the first attributable landing once in
 * `stimpy.firstTouch`. A later tagged visit can update order attribution without replacing customer first touch.
 */
export function captureUtm(search: string, ctx: { landingPath: string; referrer: string; now?: Date }): StoredUtm | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const found: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) {
      const cleaned = cleanStored(v);
      if (cleaned) found[key] = cleaned;
    }
  }
  const referrerOrigin = safeReferrerOrigin(ctx.referrer ?? '') ?? '';
  const hasUtm = Object.keys(found).length > 0;
  const existingLatest = readUtm();
  let latest = existingLatest;
  if (hasUtm) {
    latest = {
      ...found,
      landingPath: cleanStored(ctx.landingPath),
      referrer: cleanStored(referrerOrigin),
      capturedAt: (ctx.now ?? new Date()).toISOString(),
    };
    writeStored('session', UTM_STORAGE_KEY, JSON.stringify(latest));
  }

  if (!readFirstTouch() && (hasUtm || referrerOrigin)) {
    const firstTouch: StoredUtm = {
      ...found,
      landingPath: cleanStored(ctx.landingPath),
      referrer: cleanStored(referrerOrigin),
      capturedAt: (ctx.now ?? new Date()).toISOString(),
    };
    writeStored('session', FIRST_TOUCH_STORAGE_KEY, JSON.stringify(firstTouch));
  }

  // A referrer-only visit initializes customer attribution but does not replace a prior campaign's order touch.
  if (!hasUtm && !referrerOrigin) return latest;
  const record: StoredUtm = {
    ...found,
    landingPath: cleanStored(ctx.landingPath),
    referrer: cleanStored(referrerOrigin),
    capturedAt: (ctx.now ?? new Date()).toISOString(),
  };
  return latest ?? record;
}

function toApiAttribution(stored: StoredUtm | null): Attribution | undefined {
  if (!stored) return undefined;
  const out: Attribution = {};
  const map: Array<[keyof Attribution, UtmKey]> = [
    ['utmSource', 'utm_source'],
    ['utmMedium', 'utm_medium'],
    ['utmCampaign', 'utm_campaign'],
  ];
  for (const [apiKey, storeKey] of map) {
    const raw = stored[storeKey];
    if (typeof raw === 'string') {
      const cleaned = cleanForApi(raw);
      if (cleaned) out[apiKey] = cleaned;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Latest campaign touch for the Order; content, term and referrer remain local to the browser. */
export function getAttribution(): Attribution | undefined {
  return toApiAttribution(readUtm());
}

/** Immutable campaign touch for initializing the Customer's first-touch fields. */
export function getFirstTouchAttribution(): Attribution | undefined {
  return toApiAttribution(readFirstTouch());
}
