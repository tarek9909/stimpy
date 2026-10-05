import type { AppContext } from '../context';
import { addMs, HOUR, now } from '../lib/clock';
import { AppError } from '../lib/errors';
import { normalizePhone } from '../lib/phone';
import { EMAIL_TEMPLATE_KEYS } from '../lib/templates-catalog';
import { enqueueOrderEmail, type OrderEmailTemplate } from './email-queue';
import { buildOrderWhatsapp } from './whatsapp';

/**
 * Admin edits of an order that are not status changes (api-reference 5.3): delivery details, contact, cash flags, notes,
 * stock-hold extension, e-mail sends and the WhatsApp link. Every audit-worthy edit writes an `order_events` row with
 * `from_status = to_status` (data-model: "also used for non-status audit entries").
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOrder(ctx: AppContext, orderId: number) {
  const order = await ctx.prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw AppError.notFound('Order not found.');
  return order;
}

// ---------------------------------------------------------------- delivery details

export type DeliveryPatch = { areaId?: number | null; areaName?: string; address?: string; notes?: string | null };

/** `PATCH /admin/orders/:id`. Totals are never recomputed: changing the area does not change the fee already agreed. */
export async function updateDelivery(ctx: AppContext, input: { orderId: number; delivery: DeliveryPatch; userId: number | null }): Promise<void> {
  const order = await requireOrder(ctx, input.orderId);
  if (order.status === 'DELIVERED' || order.status === 'RETURNED' || order.status === 'CANCELLED') {
    throw AppError.conflict(`Delivery details can't be edited once an order is ${order.status.toLowerCase()}.`, 'status');
  }
  const d = input.delivery;
  const data: { areaId?: number | null; areaName?: string; address?: string; notes?: string | null } = {};
  const fields: Record<string, string> = {};
  const changed: string[] = [];

  if (d.areaId !== undefined) {
    if (d.areaId === null) data.areaId = null;
    else {
      const area = await ctx.prisma.area.findUnique({ where: { id: d.areaId } });
      if (!area || !area.active) fields['delivery.areaId'] = 'That delivery area is not available.';
      else {
        data.areaId = area.id;
        if (d.areaName === undefined) data.areaName = area.name;
      }
    }
    changed.push('area');
  }
  if (d.areaName !== undefined) {
    const n = d.areaName.trim();
    if (!n || n.length > 120) fields['delivery.areaName'] = 'Enter the area (at most 120 characters).';
    else data.areaName = n;
    if (!changed.includes('area')) changed.push('area');
  }
  if (d.address !== undefined) {
    const a = d.address.trim();
    if (a.length < 5 || a.length > 300) fields['delivery.address'] = 'Enter the address (5 to 300 characters).';
    else data.address = a;
    changed.push('address');
  }
  if (d.notes !== undefined) {
    const n = d.notes?.trim() ? d.notes.trim() : null;
    if (n && n.length > 300) fields['delivery.notes'] = 'Must be at most 300 characters.';
    else data.notes = n;
    changed.push('notes');
  }
  if (Object.keys(fields).length) throw AppError.validation(fields);
  if (!changed.length) return;

  await ctx.prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, userId: input.userId, note: `Delivery details updated (${changed.join(', ')})` } });
  });
}

// ---------------------------------------------------------------- contact snapshot

/** `PATCH /admin/orders/:id/contact`: edits the order's snapshot only, never the customer. Allowed in every status; logged. */
export async function updateContact(
  ctx: AppContext,
  input: { orderId: number; email?: string | null; phone?: string; whatsapp?: string; userId: number | null },
): Promise<void> {
  const order = await requireOrder(ctx, input.orderId);
  const data: { contactEmail?: string | null; contactPhone?: string; contactWhatsapp?: string } = {};
  const fields: Record<string, string> = {};
  const changed: string[] = [];

  if (input.email !== undefined) {
    const e = input.email === null ? null : input.email.trim() || null;
    if (e !== null && (!EMAIL_RE.test(e) || e.length > 190)) fields.email = 'Enter a valid email address.';
    else if (e !== order.contactEmail) {
      data.contactEmail = e;
      changed.push('email');
    }
  }
  if (input.phone !== undefined) {
    const p = normalizePhone(input.phone);
    if (!p) fields.phone = 'Enter a Lebanese phone number, like 03 123 456.';
    else if (p !== order.contactPhone) {
      data.contactPhone = p;
      changed.push('phone');
    }
  }
  if (input.whatsapp !== undefined) {
    const w = normalizePhone(input.whatsapp);
    if (!w) fields.whatsapp = 'Enter a Lebanese WhatsApp number, like 03 123 456.';
    else if (w !== order.contactWhatsapp) {
      data.contactWhatsapp = w;
      changed.push('whatsapp');
    }
  }
  if (Object.keys(fields).length) throw AppError.validation(fields);
  if (!changed.length) return;

  await ctx.prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, userId: input.userId, note: `Contact updated (${changed.join(', ')})` } });
  });
}

// ---------------------------------------------------------------- cash

/**
 * `POST /admin/orders/:id/cash`. `collected` can only change on a DELIVERED order (delivering sets it automatically);
 * `settled` needs the cash to be collected; un-collecting also un-settles. Every change is logged on the timeline.
 */
export async function setCash(ctx: AppContext, input: { orderId: number; collected?: boolean; settled?: boolean; userId: number | null }): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw AppError.notFound('Order not found.');
    if (input.collected === undefined && input.settled === undefined) throw AppError.validation({ collected: 'Send collected and/or settled.' });
    if (order.status !== 'DELIVERED') throw AppError.conflict('Cash can only be updated on a delivered order.', 'status');

    const collected = input.collected ?? order.cashCollected;
    let settled = input.settled ?? order.cashSettled;
    if (!collected) {
      if (input.settled === true) throw AppError.conflict('Cash must be collected before it can be settled.', 'collected');
      settled = false; // un-collecting also un-settles
    }
    if (collected === order.cashCollected && settled === order.cashSettled) return;

    const notes: string[] = [];
    if (collected !== order.cashCollected) notes.push(collected ? 'Cash marked collected' : 'Cash marked not collected');
    if (settled !== order.cashSettled) notes.push(settled ? 'Cash marked settled' : 'Cash marked not settled');
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: 'DELIVERED', cashCollected: order.cashCollected, cashSettled: order.cashSettled },
      data: { cashCollected: collected, cashSettled: settled },
    });
    if (changed.count !== 1) throw AppError.conflict('The order cash state changed. Reload the order and try again.', 'status');
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: 'DELIVERED', toStatus: 'DELIVERED', userId: input.userId, note: notes.join('. ') } });
  });
}

// ---------------------------------------------------------------- notes and hold

export async function addNote(ctx: AppContext, input: { orderId: number; body: string; userId: number }): Promise<void> {
  await requireOrder(ctx, input.orderId);
  const body = input.body.trim();
  if (!body || body.length > 1000) throw AppError.validation({ body: 'Write a note of 1 to 1000 characters.' });
  await ctx.prisma.orderNote.create({ data: { orderId: input.orderId, userId: input.userId, body } });
}

/** `POST /admin/orders/:id/extend-hold`: only NEW orders have a hold; the hold becomes now + hours (1..168). */
export async function extendHold(ctx: AppContext, input: { orderId: number; hours: number; userId: number | null }): Promise<void> {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) throw AppError.validation({ hours: 'Choose between 1 and 168 hours.' });
  await ctx.prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw AppError.notFound('Order not found.');
    if (order.status !== 'NEW') throw AppError.conflict('Only new orders have a stock hold.', 'status');
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: 'NEW' },
      data: { holdExpiresAt: addMs(now(), input.hours * HOUR) },
    });
    if (changed.count !== 1) throw AppError.conflict('The order status changed. Reload the order and try again.', 'status');
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: 'NEW', toStatus: 'NEW', userId: input.userId, note: `Stock hold extended by ${input.hours} hours` } });
  });
}

// ---------------------------------------------------------------- e-mail

const CUSTOMER_TEMPLATES = EMAIL_TEMPLATE_KEYS.filter((k) => k !== 'orders_lookup') as OrderEmailTemplate[];

/** `POST /admin/orders/:id/email`: re-send a template (a manual Resend: ignores the switches), or send a free-form message. */
export async function sendOrderEmail(
  ctx: AppContext,
  input: { orderId: number; template?: string; subject?: string; body?: string; to?: string[] },
): Promise<void> {
  const order = await ctx.prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true, contactEmail: true } });
  if (!order) throw AppError.notFound('Order not found.');
  const extra = [...new Set((input.to ?? []).map((a) => a.trim()).filter(Boolean))];
  if (extra.length > 0 && input.template !== undefined) throw AppError.validation({ to: 'Extra recipients only apply to a written message.' });
  const bad = extra.filter((a) => !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(a) || a.length > 190);
  if (bad.length > 0) throw AppError.validation({ to: `Not a valid email address: ${bad[0]}` });
  if (extra.length > 20) throw AppError.validation({ to: 'Use at most 20 addresses.' });
  if (!order.contactEmail && extra.length === 0) throw AppError.conflict('This order has no email address.', 'contactEmail');

  let queued: { id: number } | null;
  if (input.template !== undefined) {
    if (!(CUSTOMER_TEMPLATES as string[]).includes(input.template)) throw AppError.validation({ template: 'Choose one of the order email templates.' });
    queued = await enqueueOrderEmail(ctx, ctx.prisma, { orderId: order.id, template: input.template as OrderEmailTemplate, resend: true });
  } else {
    const subject = (input.subject ?? '').trim();
    const body = (input.body ?? '').trim();
    const fields: Record<string, string> = {};
    if (!subject || subject.length > 200) fields.subject = 'Enter a subject (at most 200 characters).';
    if (!body || body.length > 5000) fields.body = 'Enter a message (at most 5000 characters).';
    if (Object.keys(fields).length) throw AppError.validation(fields);
    // The customer (when the order has an email) plus every extra address, each once.
    const lowered = new Set<string>();
    const recipients = [order.contactEmail, ...extra].filter((a): a is string => !!a).filter((a) => !lowered.has(a.toLowerCase()) && lowered.add(a.toLowerCase()));
    queued = await enqueueOrderEmail(ctx, ctx.prisma, { orderId: order.id, template: 'custom', custom: { subject, body }, recipients });
  }
  if (!queued) throw AppError.conflict('The email could not be queued.', 'template');
}

// ---------------------------------------------------------------- WhatsApp

/** `GET /admin/orders/:id/whatsapp`: the rendered message and `wa.me` link to the customer (WP-C's builder). */
export async function buildWhatsapp(ctx: AppContext, orderId: number, template: string): Promise<{ to: string; text: string; url: string }> {
  return buildOrderWhatsapp(ctx, ctx.prisma, { orderId, template });
}
