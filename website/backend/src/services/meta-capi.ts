import { createHash } from 'node:crypto';
import type { MetaCapiConfig } from '../config';
import { logger } from '../lib/log';

/**
 * Meta Conversions API: the server-side copy of the website Pixel's `Purchase`, so orders placed inside Instagram's
 * in-app browser (or with the Pixel blocked) still reach Meta. Both copies carry the order number as the event id, so
 * Meta counts each order once. Sent after the order is committed and never awaited by the request: tracking must
 * never block or fail an order. Retries live in memory (a restart drops a pending send; the Pixel copy still counts).
 */

const log = logger('meta-capi');

/** What the storefront passes when the visitor has no Do Not Track / Global Privacy Control signal. */
export type MetaAdSignals = { fbp?: string; fbc?: string };

export type PurchaseEventInput = {
  orderNumber: string;
  /** Products only, without the delivery fee (the same value the Pixel sends). */
  subtotalCents: number;
  numItems: number;
  email: string | null;
  /** E.164, as stored on the order ("+96171123456"). */
  phoneE164: string | null;
  clientIp: string;
  userAgent: string | undefined;
  signals: MetaAdSignals;
  /** The page the order was placed on. */
  eventSourceUrl: string;
  eventTime: Date;
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The request body for `POST /{pixel}/events`. Personal data is normalised and SHA-256 hashed as Meta requires. */
export function buildPurchasePayload(config: MetaCapiConfig, input: PurchaseEventInput): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    country: [sha256('lb')],
    client_ip_address: input.clientIp,
  };
  const email = input.email?.trim().toLowerCase();
  if (email) userData.em = [sha256(email)];
  const phoneDigits = input.phoneE164?.replace(/\D/g, '');
  if (phoneDigits) userData.ph = [sha256(phoneDigits)];
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.signals.fbp) userData.fbp = input.signals.fbp;
  if (input.signals.fbc) userData.fbc = input.signals.fbc;

  return {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.orderNumber,
        action_source: 'website',
        event_source_url: input.eventSourceUrl,
        user_data: userData,
        custom_data: {
          currency: 'USD',
          value: input.subtotalCents / 100,
          num_items: input.numItems,
          order_id: input.orderNumber,
        },
      },
    ],
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    access_token: config.accessToken,
  };
}

export type SendDeps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void> };

const defaultDeps: SendDeps = { fetch: (...args) => fetch(...args), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Waits before attempts 2 and 3. Only network errors, 429 and 5xx are retried; other answers are final. */
export const RETRY_DELAYS_MS = [2_000, 10_000];

/** Sends one payload. Resolves to true when Meta accepted it. Never throws. */
export async function sendMetaEvents(config: MetaCapiConfig, payload: Record<string, unknown>, deps: SendDeps = defaultDeps): Promise<boolean> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.pixelId}/events`;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]!);
    let status: number | null = null;
    try {
      const res = await deps.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
      status = res.status;
      const text = (await res.text().catch(() => '')).slice(0, 300);
      if (status !== 429 && status < 500) {
        log.warn({ status, body: text }, 'Meta rejected a Conversions API event');
        return false;
      }
    } catch (err) {
      log.warn({ attempt: attempt + 1, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'Conversions API request failed');
    }
    if (attempt === RETRY_DELAYS_MS.length) {
      log.warn({ status }, 'Conversions API event dropped after retries');
    }
  }
  return false;
}

/** Fire and forget: called after a new website order is committed. No-op when the Conversions API is not configured. */
export function queuePurchaseEvent(config: MetaCapiConfig | null, input: PurchaseEventInput, deps?: SendDeps): void {
  if (!config) return;
  void sendMetaEvents(config, buildPurchasePayload(config, input), deps);
}
