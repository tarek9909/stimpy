import type { AppContext } from '../context';
import type { OneSignalConfig } from '../config';
import { formatUsd } from '../lib/money';
import { logger } from '../lib/log';

/**
 * OneSignal push to the dashboard app (mobile). Devices are addressed by External ID: the app calls
 * `OneSignal.login(<admin user id>)` after sign-in, so a push goes to every device that user is signed in on.
 * No device table is needed. Sends are queued and never awaited by the request: a push must never block or fail
 * an order. Retries live in memory (a restart drops a pending push; the order is unaffected).
 */

const log = logger('onesignal');

export const ONESIGNAL_PUSH_URL = 'https://api.onesignal.com/notifications?c=push';

/**
 * The External ID a device is linked under. OneSignal rejects trivially guessable ids such as "1" ("external_id is
 * blocked"), so admin user ids are prefixed. The mobile app (core/push.dart) must use the same format.
 */
export const pushExternalId = (adminUserId: number | string): string => `admin-${adminUserId}`;

export type PushMessage = {
  /** Admin user ids as strings (the External ID the app logs in with). */
  externalIds: string[];
  title: string;
  body: string;
  /** Extra data the app reads when the notification is tapped, e.g. { orderId: "123" }. */
  data?: Record<string, string>;
};

/** The request body for `POST /notifications?c=push`. */
export function buildOneSignalPayload(config: OneSignalConfig, msg: PushMessage): Record<string, unknown> {
  return {
    app_id: config.appId,
    target_channel: 'push',
    include_aliases: { external_id: msg.externalIds },
    headings: { en: msg.title },
    contents: { en: msg.body },
    data: msg.data ?? {},
  };
}

export type PushDeps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void> };

const defaultDeps: PushDeps = { fetch: (...args) => fetch(...args), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Waits before attempts 2 and 3. Only network errors, 429 and 5xx are retried; other answers are final. */
export const PUSH_RETRY_DELAYS_MS = [2_000, 10_000];

export type PushResult = { sent: boolean; recipients: number | null; status: number | null };

/**
 * Sends one push. Resolves with whether OneSignal created the notification. OneSignal returns an id only when the
 * audience has at least one subscribed device, so `sent: false` with `recipients: 0` means "no device signed in".
 * Never throws.
 */
export async function sendPush(config: OneSignalConfig, msg: PushMessage, deps: PushDeps = defaultDeps): Promise<PushResult> {
  if (msg.externalIds.length === 0) return { sent: false, recipients: 0, status: null };
  let status: number | null = null;
  for (let attempt = 0; attempt <= PUSH_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(PUSH_RETRY_DELAYS_MS[attempt - 1]!);
    try {
      const res = await deps.fetch(ONESIGNAL_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Key ${config.restApiKey}` },
        body: JSON.stringify(buildOneSignalPayload(config, msg)),
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      const json = (await res.json().catch(() => null)) as { id?: string; recipients?: number; errors?: unknown } | null;
      if (res.ok && json?.id) {
        return { sent: true, recipients: json.recipients ?? null, status };
      }
      if (res.ok) {
        // Accepted but not created: nobody to deliver to.
        return { sent: false, recipients: json?.recipients ?? 0, status };
      }
      if (status !== 429 && status < 500) {
        log.warn({ status, errors: json?.errors }, 'OneSignal rejected a push');
        return { sent: false, recipients: null, status };
      }
    } catch (err) {
      log.warn({ attempt: attempt + 1, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'OneSignal request failed');
    }
  }
  log.warn({ status }, 'push dropped after retries');
  return { sent: false, recipients: null, status };
}

/** Fire and forget. No-op when OneSignal is not configured. */
export function queuePush(config: OneSignalConfig | null, msg: PushMessage, deps?: PushDeps): void {
  if (!config) return;
  void sendPush(config, msg, deps);
}

export type NewOrderForPush = {
  orderId: number;
  orderNumber: string;
  customerName: string;
  itemCount: number;
  totalCents: number;
};

/**
 * "New order" alert to every owner's signed-in devices. Called only for orders that were actually created
 * (not idempotent replays). Never throws.
 */
export async function notifyOwnersOfNewOrder(ctx: AppContext, order: NewOrderForPush): Promise<void> {
  const config = ctx.config.onesignal;
  if (!config) return;
  try {
    const owners = await ctx.prisma.adminUser.findMany({ where: { role: 'OWNER' }, select: { id: true } });
    queuePush(config, {
      externalIds: owners.map((o: { id: number }) => pushExternalId(o.id)),
      title: `New order ${order.orderNumber}`,
      body: `${order.customerName} · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'} · ${formatUsd(order.totalCents)}`,
      data: { kind: 'new_order', orderId: String(order.orderId) },
    });
  } catch (err) {
    log.warn({ err: String((err as Error)?.message ?? err).slice(0, 200) }, 'could not queue the new-order push');
  }
}
