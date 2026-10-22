import type { AppContext } from '../context';
import type { Db } from '../lib/db';
import { AppError } from '../lib/errors';
import { addMs, MINUTE, now } from '../lib/clock';
import { stripCrLf } from '../lib/email-transport';
import { renderEmailLayout } from '../lib/email-layout';
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_KEYS } from '../lib/templates-catalog';
import { extractPlaceholders, renderTemplate } from '../lib/template';
import { formatUsd } from '../lib/money';
import { formatOrderListLine, loadOrderTemplateValues, sampleValues, trackingUrl, type TemplateValues } from './template-values';
import { splitEmails } from './settings';
import { syncCampaignEmail } from '../modules/customers/campaigns-email';

/**
 * EMAIL QUEUE SERVICE (integrations.md section 2). `enqueueEmail` renders the template, stores the rendered subject/body on an
 * `email_log` row (PENDING) and returns; `processDueEmails` is what the email-worker job calls.
 *
 * Callers inside a transaction pass their `tx` as `db` so the row commits (or rolls back) together with the order.
 * Every function here is safe to call inside a transaction and never sends anything itself.
 */
export type EnqueueInput = {
  orderId?: number | null;
  to: string;
  /** A key from lib/templates-catalog.ts, or `custom` with subject + body. */
  template: string;
  values?: Record<string, string | undefined>;
  custom?: { subject: string; body: string };
  /** Ignore the master switch and the per-template switch (used by the test-send endpoint and manual resends). */
  force?: boolean;
};

/** Customer e-mails that follow a status change (the keys of `order_*` templates). */
export type OrderEmailTemplate = 'order_received' | 'order_confirmed' | 'order_out_for_delivery' | 'order_delivered' | 'order_cancelled';

export const SUBJECT_MAX = 250; // email_log.subject column
/** Address suffix written over `email_log.to_email` by the customer personal-data erasure. */
export const ERASED_EMAIL_SUFFIX = '@privacy.invalid';
const EMAIL_SHAPE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export const MAX_ATTEMPTS = 4;
/** Delay before attempt 2, 3, 4 after attempt 1, 2, 3 failed (integrations 2). */
export const RETRY_DELAYS_MS = [1 * MINUTE, 5 * MINUTE, 30 * MINUTE] as const;
/** While a worker sends a row, its `next_attempt_at` is pushed this far so a second worker cannot claim it. */
const LEASE_MS = 2 * MINUTE;
const BATCH = 20;

export type RenderedEmail = { subject: string; text: string; html: string };

/** Puts already-final subject and body text through the fixed layout (no placeholder processing). */
export async function renderPlainEmail(
  ctx: AppContext,
  input: { subject: string; body: string; button?: { label: string; url: string } | null; linkUrls?: string[] },
): Promise<RenderedEmail> {
  const [email, business] = await Promise.all([ctx.settings.get('email'), ctx.settings.get('business')]);
  const subject = stripCrLf(input.subject).slice(0, SUBJECT_MAX);
  const { text, html } = renderEmailLayout({
    subject,
    body: input.body,
    footerText: email.footerText,
    supportEmail: business.supportEmail,
    button: input.button ?? null,
    linkUrls: input.linkUrls,
  });
  return { subject, text, html };
}

/** Renders a template (subject + body with `{placeholders}`) through the fixed layout. Unknown placeholders render empty; values are escaped in the HTML. */
export async function renderEmail(ctx: AppContext, input: { subject: string; body: string; values: Record<string, string | undefined> }): Promise<RenderedEmail> {
  const url = input.values.tracking_url;
  const shopUrl = input.values.shop_url;
  // Marketing mail (CRM bulk sends and campaigns) carries a server-built unsubscribe link; it must be clickable in the HTML part.
  const unsubscribeUrl = input.values.unsubscribe_url;
  // The tracking link becomes a button when the author used {tracking_url}; only server-built URLs are ever linkified.
  const usesTracking = Boolean(url) && extractPlaceholders(input.body).includes('tracking_url');
  return renderPlainEmail(ctx, {
    subject: renderTemplate(input.subject, input.values),
    body: renderTemplate(input.body, input.values),
    button: usesTracking ? { label: 'Track your order', url: url! } : null,
    linkUrls: [url, shopUrl, unsubscribeUrl].filter((value): value is string => Boolean(value)),
  });
}

/** Looks a template up in the database, falling back to the catalog default (a missing row behaves like the seeded one). */
export async function loadEmailTemplate(db: Db, key: string): Promise<{ key: string; name: string; subject: string; body: string; enabled: boolean } | null> {
  const row = await db.emailTemplate.findUnique({ where: { key } });
  if (row) return { key: row.key, name: row.name, subject: row.subject, body: row.body, enabled: row.enabled };
  const def = EMAIL_TEMPLATES.find((t) => t.key === key);
  return def ? { key: def.key, name: def.name, subject: def.subject, body: def.body, enabled: true } : null;
}

async function insertRow(db: Db, o: { orderId: number | null; to: string; template: string; rendered: RenderedEmail }): Promise<{ id: number }> {
  const at = now();
  const row = await db.emailLog.create({
    data: {
      orderId: o.orderId,
      toEmail: stripCrLf(o.to).slice(0, 190),
      templateKey: o.template,
      subject: o.rendered.subject,
      bodyText: o.rendered.text,
      bodyHtml: o.rendered.html,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: at,
      createdAt: at,
    },
    select: { id: true },
  });
  return row;
}

/** One queued row per founder address, so each delivery succeeds or retries on its own. Returns the first row. */
async function insertToFounders(db: Db, list: string, o: { orderId: number | null; template: string; rendered: RenderedEmail }): Promise<{ id: number } | null> {
  let first: { id: number } | null = null;
  for (const to of new Set(splitEmails(list).map((a) => a.toLowerCase()))) {
    if (!EMAIL_SHAPE.test(to)) continue;
    const row = await insertRow(db, { ...o, to });
    first ??= row;
  }
  return first;
}

/**
 * Generic enqueue. Returns the new row id, or `null` when the e-mail is skipped (no address, master switch off, template
 * disabled): skipping is not an error and creates no row.
 */
export async function enqueueEmail(ctx: AppContext, db: Db, input: EnqueueInput): Promise<{ id: number } | null> {
  const to = input.to?.trim() ?? '';
  if (!to || !EMAIL_SHAPE.test(to) || to.length > 190) return null;
  if (!input.force && !(await ctx.settings.get('email')).enabled) return null;

  let subject: string;
  let body: string;
  if (input.template === 'custom') {
    if (!input.custom) throw new Error('enqueueEmail: template "custom" needs { subject, body }');
    ({ subject, body } = input.custom);
  } else {
    const tpl = await loadEmailTemplate(db, input.template);
    if (!tpl) throw new Error(`enqueueEmail: unknown template "${input.template}"`);
    if (!input.force && !tpl.enabled) return null;
    ({ subject, body } = tpl);
  }
  const rendered = await renderEmail(ctx, { subject, body, values: input.values ?? {} });
  return insertRow(db, { orderId: input.orderId ?? null, to, template: input.template, rendered });
}

export type EnqueueOrderEmailInput = {
  orderId: number;
  template: OrderEmailTemplate | 'custom';
  /** Free-form message (`template: 'custom'`); placeholders in it are filled from the order. */
  custom?: { subject: string; body: string };
  /**
   * A manual "Resend" by the founder: skips the one-per-(order, template) rule AND ignores the switches
   * (the founder asked for it explicitly). Still returns null when the order has no e-mail address.
   */
  resend?: boolean;
  /** Send to these addresses instead of the order's `contact_email` (a free-form message to several people). */
  recipients?: string[];
};

/**
 * Queues a customer e-mail about an order, to the order's `contact_email`. Call it inside the same transaction as the
 * status change: `enqueueOrderEmail(ctx, tx, { orderId, template: 'order_confirmed' })`.
 *
 * Idempotent: at most ONE row per (order, template) is queued automatically (integrations 2), so repeating a status
 * change or correcting a delivery number never sends a second mail. Returns `null` when skipped (no contact_email,
 * master switch off, template disabled, already queued).
 */
export async function enqueueOrderEmail(ctx: AppContext, db: Db, input: EnqueueOrderEmailInput): Promise<{ id: number } | null> {
  const { values, order } = await loadOrderTemplateValues(ctx, db, input.orderId);
  if (input.recipients?.length) {
    // One queued row per address, so each delivery succeeds or fails (and retries) on its own. Returns the first row.
    let first: { id: number } | null = null;
    for (const to of input.recipients) {
      const row = await enqueueEmail(ctx, db, { orderId: input.orderId, to, template: input.template, values, custom: input.custom, force: true });
      first ??= row;
    }
    return first;
  }
  if (!order.contactEmail) return null;
  if (!input.resend && input.template !== 'custom') {
    const existing = await db.emailLog.findFirst({ where: { orderId: input.orderId, templateKey: input.template }, select: { id: true } });
    if (existing) return null;
  }
  return enqueueEmail(ctx, db, {
    orderId: input.orderId,
    to: order.contactEmail,
    template: input.template,
    values,
    custom: input.custom,
    force: input.resend === true || input.template === 'custom',
  });
}

/**
 * Founder alert for a new order (integrations 2, "Founder alerts"): only when `notifications.onNewOrder` and
 * `notifications.founderEmail` (one or several addresses) are set. Independent of the customer master switch. At most one per order
 * (one queued row per address).
 */
export async function enqueueFounderNewOrderAlert(ctx: AppContext, db: Db, input: { orderId: number }): Promise<{ id: number } | null> {
  const n = await ctx.settings.get('notifications');
  if (!n.onNewOrder || !n.founderEmail) return null;
  const existing = await db.emailLog.findFirst({ where: { orderId: input.orderId, templateKey: FOUNDER_NEW_ORDER }, select: { id: true } });
  if (existing) return null;
  const { values, order } = await loadOrderTemplateValues(ctx, db, input.orderId);
  const orderUrl = `${ctx.config.adminUrl}/orders/${order.id}`;
  const lines = [
    `New order ${order.number}`,
    '',
    `Customer: ${order.customerName}`,
    `Phone: ${order.contactPhone}`,
    `Area: ${order.areaName}`,
    `Source: ${order.source}`,
    '',
    'Items:',
    values.items,
    '',
    `Subtotal: ${formatUsd(order.subtotalCents)}`,
    `Delivery: ${formatUsd(order.deliveryFeeCents)}`,
    `Total to collect: ${formatUsd(order.totalCents)} (cash on delivery)`,
    '',
    `Open the order: ${orderUrl}`,
  ].join('\n');
  const rendered = await renderPlainEmail(ctx, {
    subject: `New order ${order.number}: ${order.customerName} (${formatUsd(order.totalCents)})`,
    body: lines,
    button: { label: 'Open order', url: orderUrl },
    linkUrls: [orderUrl],
  });
  return insertToFounders(db, n.founderEmail, { orderId: order.id, template: FOUNDER_NEW_ORDER, rendered });
}

/**
 * Low-stock alert to the founder (`notifications.onLowStock`). The CALLER decides when an item "first drops to the
 * threshold after being above it" (stock service) and calls this once for that crossing.
 */
export async function enqueueLowStockAlert(
  ctx: AppContext,
  db: Db,
  input: { itemType: 'HOODIE_VARIANT' | 'STIMPIE'; itemId: number; name: string; available: number; threshold: number },
): Promise<{ id: number } | null> {
  const n = await ctx.settings.get('notifications');
  if (!n.onLowStock || !n.founderEmail) return null;
  const stockUrl = input.itemType === 'STIMPIE' ? `${ctx.config.adminUrl}/stock?tab=stimpies&highlight=${input.itemId}` : `${ctx.config.adminUrl}/stock?highlight=${input.itemId}`;
  const left = input.available <= 0 ? 'sold out' : `${input.available} left`;
  const body = [`Low stock: ${input.name} is ${left} (alert level ${input.threshold}).`, '', `Open stock: ${stockUrl}`].join('\n');
  const rendered = await renderPlainEmail(ctx, { subject: `Low stock: ${input.name} (${left})`, body, button: { label: 'Open stock', url: stockUrl }, linkUrls: [stockUrl] });
  return insertToFounders(db, n.founderEmail, { orderId: null, template: FOUNDER_LOW_STOCK, rendered });
}

/** "Lost order number" e-mail (`POST /orders/find`): lists up to 10 most recent orders. Respects the master switch and template switch. */
export async function enqueueOrdersLookupEmail(
  ctx: AppContext,
  db: Db,
  input: { to: string; orders: { number: string; placedAt: Date; status: string; totalCents: number }[] },
): Promise<{ id: number } | null> {
  if (input.orders.length === 0) return null;
  const tz = (await ctx.settings.get('business')).timezone;
  const recent = [...input.orders].sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime()).slice(0, 10);
  return enqueueEmail(ctx, db, {
    to: input.to,
    template: 'orders_lookup',
    values: { order_list: recent.map((o) => formatOrderListLine(o, tz)).join('\n'), tracking_url: trackingUrl(ctx.config.webUrl) },
  });
}

export const FOUNDER_NEW_ORDER = 'founder_new_order';
export const FOUNDER_LOW_STOCK = 'founder_low_stock';

/** Sample data for previews and test sends. */
export async function sampleEmailValues(ctx: AppContext): Promise<TemplateValues> {
  return sampleValues(ctx.config.webUrl, (await ctx.settings.get('business')).timezone);
}

/** Template keys the dashboard can edit. */
export const isEmailTemplateKey = (k: string): boolean => (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(k);

// ------------------------------------------------------------------------------------------------ worker

/** `"Name" <address>` with quotes/CR/LF removed from the display name. */
export function formatSender(name: string, address: string): string {
  const clean = stripCrLf(name).replace(/["\\]/g, '');
  return `"${clean}" <${stripCrLf(address)}>`;
}

/** Sends up to 20 due PENDING rows, with retry backoff (1 min, 5 min, 30 min, FAILED after 4 attempts). Safe to run in two processes. */
export async function processDueEmails(ctx: AppContext): Promise<{ sent: number; failed: number; retried: number }> {
  const result = { sent: 0, failed: 0, retried: 0 };
  const t = now();
  const due = await ctx.prisma.emailLog.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: t } },
    orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
    take: BATCH,
  });
  if (due.length === 0) return result;
  const email = await ctx.settings.get('email');

  for (const row of due) {
    // Claim: conditional update on the exact `next_attempt_at` we read; a concurrent worker gets count 0 and skips it.
    const claim = await ctx.prisma.emailLog.updateMany({
      where: { id: row.id, status: 'PENDING', nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: addMs(now(), LEASE_MS) },
    });
    if (claim.count !== 1) continue;

    const campaignRecipient = await ctx.prisma.campaignRecipient.findUnique({
      where: { emailLogId: row.id },
      include: { customer: { select: { emailConsent: true, unsubscribedAt: true, marketingOptOutAt: true } } },
    });
    if (campaignRecipient && (!campaignRecipient.customer.emailConsent || campaignRecipient.customer.unsubscribedAt || campaignRecipient.customer.marketingOptOutAt)) {
      const reason = 'Customer consent was revoked before delivery.';
      await ctx.prisma.emailLog.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'FAILED', error: reason } });
      await syncCampaignEmail(ctx, row.id, 'SKIPPED', reason);
      continue;
    }

    const attempts = row.attempts + 1;
    try {
      await ctx.emailTransport.send({
        to: row.toEmail,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
        from: formatSender(email.senderName, email.senderAddress),
        replyTo: email.replyTo,
      });
      const sentAt = now();
      await ctx.prisma.emailLog.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'SENT', attempts, sentAt, error: null } });
      await syncCampaignEmail(ctx, row.id, 'SENT', null, sentAt);
      result.sent += 1;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 500);
      if (attempts >= MAX_ATTEMPTS) {
        await ctx.prisma.emailLog.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'FAILED', attempts, error: message } });
        await syncCampaignEmail(ctx, row.id, 'FAILED', message);
        result.failed += 1;
      } else {
        await ctx.prisma.emailLog.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { attempts, error: message, nextAttemptAt: addMs(now(), RETRY_DELAYS_MS[attempts - 1]!) },
        });
        result.retried += 1;
      }
    }
  }
  return result;
}

/** `POST /admin/email-log/:id/retry`: resets a FAILED row to PENDING (attempts restart, due immediately). */
export async function retryFailedEmail(ctx: AppContext, id: number): Promise<{ id: number; status: 'PENDING' }> {
  const res = await ctx.prisma.emailLog.updateMany({
    // Rows whose recipient was erased (customers personal-data erasure) only hold a placeholder body and a dead address.
    where: { id, status: 'FAILED', NOT: { toEmail: { endsWith: ERASED_EMAIL_SUFFIX } } },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: now(), error: null },
  });
  if (res.count === 1) return { id, status: 'PENDING' };
  const row = await ctx.prisma.emailLog.findUnique({ where: { id }, select: { status: true, toEmail: true } });
  if (!row) throw AppError.notFound('Email not found.');
  if (row.toEmail.endsWith(ERASED_EMAIL_SUFFIX)) throw AppError.conflict("This customer's personal data was erased; the email cannot be sent again.", 'status');
  throw AppError.conflict('Only failed emails can be retried.', 'status');
}
