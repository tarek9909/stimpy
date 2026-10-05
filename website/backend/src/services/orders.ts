import { createHash, randomBytes } from 'node:crypto';
import type { OrderStatus, Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { addMs, HOUR, now } from '../lib/clock';
import type { Db, Tx } from '../lib/db';
import { isUniqueViolation } from '../lib/db';
import { AppError, ERROR_STATUS } from '../lib/errors';
import { logger } from '../lib/log';
import { formatOrderNumber, parseOrderLookup } from '../lib/order-number';
import { orderTxGate } from '../lib/semaphore';
import { normalizePhone } from '../lib/phone';
import { enqueueFounderNewOrderAlert, enqueueOrderEmail, type OrderEmailTemplate } from './email-queue';
import { priceCart, type CartItemInput, type PricedLine } from './pricing';
import {
  createStockLines,
  queueLowStockAlert,
  releaseStockForOrder,
  reserveStock,
  returnStockForOrder,
  sellStockForOrder,
  type LowStockCrossing,
  type StockRef,
} from './stock';

/**
 * ORDERS SERVICE (work package B). Owns the status machine, `placeOrder`, delivery numbers and order lookups.
 * Routes (public and admin) only call these functions. The order-number counter increment (raw SQL) lives here.
 * Edits that are not status changes (contact, notes, cash, hold, e-mail, WhatsApp) are in services/order-admin.ts.
 */

export type OrderStatusName = OrderStatus;

const log = logger('orders');

// ---------------------------------------------------------------- the status machine (business-rules section 7)

export const TRANSITIONS: Record<OrderStatusName, OrderStatusName[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};
export const ALL_STATUSES = Object.keys(TRANSITIONS) as OrderStatusName[];
export const allowedTransitions = (from: OrderStatusName): OrderStatusName[] => [...TRANSITIONS[from]];

/** The customer e-mail each transition queues (none for PACKED and RETURNED). */
const STATUS_EMAIL: Partial<Record<OrderStatusName, OrderEmailTemplate>> = {
  CONFIRMED: 'order_confirmed',
  OUT_FOR_DELIVERY: 'order_out_for_delivery',
  DELIVERED: 'order_delivered',
  CANCELLED: 'order_cancelled',
};

export type DeliveryWarning = { code: 'DUPLICATE_DELIVERY_NUMBER'; deliveryNumber: string; orderIds: number[] };

// ---------------------------------------------------------------- input

export type PlaceOrderInput = {
  customer: { name: string; email: string | null; phone: string; whatsapp: string | null; whatsappSameAsPhone: boolean };
  delivery: { areaId: number | null; areaName: string; address: string; notes: string | null };
  items: CartItemInput[];
  expectedTotalCents?: number;
  attribution?: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string; referrer?: string } | null;
  firstTouch?: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string; referrer?: string } | null;
  source?: 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL';
  initialStatus?: 'NEW' | 'CONFIRMED';
  /** Manual orders: queue the customer e-mail (default true; needs an e-mail address). */
  sendEmail?: boolean;
  idempotencyKey?: string;
  /** Hash of IP + user agent (never shown). */
  requestFingerprint?: string;
  /** The dashboard user creating a manual order (recorded on the events). */
  userId?: number | null;
  /** Demo only: pretend the order was placed at this time (seed-demo uses it to spread dates). */
  placedAt?: Date;
};

export type PlaceOrderResult = { orderId: number; number: string; created: boolean; timings?: Record<string, number> };

// ---------------------------------------------------------------- helpers

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** SHA-256 of the canonical request body (idempotency, duplicate detection). */
export function bodyHash(input: PlaceOrderInput): string {
  return createHash('sha256')
    .update(
      stableStringify({
        customer: input.customer,
        delivery: input.delivery,
        items: input.items,
        expectedTotalCents: input.expectedTotalCents ?? null,
        attribution: input.attribution ?? null,
        firstTouch: input.firstTouch ?? null,
      }),
    )
    .digest('hex');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTM_RE = /^[A-Za-z0-9\-_.]{1,80}$/;

type Normalized = {
  name: string;
  email: string | null;
  phone: string;
  whatsapp: string;
  areaName: string;
  address: string;
  notes: string | null;
};

/** Phone/WhatsApp normalisation and the rules the routes' schemas also state (the service is called directly by scripts). */
function normalizeInput(input: PlaceOrderInput): Normalized {
  const fields: Record<string, string> = {};
  const c = input.customer;
  const name = c.name.trim();
  if (name.length < 2 || name.length > 80) fields['customer.name'] = 'Enter your full name (2 to 80 characters).';
  const phone = normalizePhone(c.phone);
  if (!phone) fields['customer.phone'] = 'Enter a Lebanese phone number, like 03 123 456.';
  let whatsapp = phone;
  if (!c.whatsappSameAsPhone) {
    whatsapp = c.whatsapp ? normalizePhone(c.whatsapp) : null;
    if (!whatsapp) fields['customer.whatsapp'] = c.whatsapp ? 'Enter a Lebanese WhatsApp number, like 03 123 456.' : 'Enter your WhatsApp number.';
  }
  const email = c.email?.trim() ? c.email.trim() : null;
  const isWebsite = (input.source ?? 'WEBSITE') === 'WEBSITE';
  if (email === null && isWebsite) fields['customer.email'] = 'Enter a valid email address.';
  if (email !== null && (!EMAIL_RE.test(email) || email.length > 190)) fields['customer.email'] = 'Enter a valid email address.';
  const areaName = input.delivery.areaName.trim();
  if (!areaName || areaName.length > 120) fields['delivery.areaName'] = 'Type your area or town (at most 120 characters).';
  const address = input.delivery.address.trim();
  if (address.length < 5 || address.length > 300) fields['delivery.address'] = 'Enter your delivery address: street, building, floor (5 to 300 characters).';
  const notes = input.delivery.notes?.trim() ? input.delivery.notes.trim() : null;
  if (notes && notes.length > 300) fields['delivery.notes'] = 'Must be at most 300 characters.';
  for (const [field, touch] of [['attribution', input.attribution], ['firstTouch', input.firstTouch]] as const) {
    if (!touch) continue;
    for (const key of ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'] as const) {
      const value = touch[key];
      if (value !== undefined && !UTM_RE.test(value)) fields[`${field}.${key}`] = 'Use at most 80 letters, digits, dashes, underscores or dots.';
    }
    if (touch.referrer !== undefined) {
      try {
        const url = new URL(touch.referrer);
        if (!['http:', 'https:'].includes(url.protocol) || touch.referrer.length > 500) throw new Error('invalid referrer');
      } catch {
        fields[`${field}.referrer`] = 'Enter a valid http(s) referrer URL up to 500 characters.';
      }
    }
  }
  if (Object.keys(fields).length) throw AppError.validation(fields);
  return { name, email, phone: phone as string, whatsapp: whatsapp as string, areaName, address, notes };
}

/**
 * Queues a customer e-mail for an order inside the caller's transaction (WP-C's `enqueueOrderEmail`: at most one automatic
 * e-mail per (order, template); skipped when there is no address, the master switch is off or the template is disabled).
 * Never throws: a problem with e-mail must not fail an order or a status change ("emails never block orders").
 */
export async function queueOrderEmail(ctx: AppContext, db: Db, orderId: number, template: OrderEmailTemplate): Promise<void> {
  try {
    await enqueueOrderEmail(ctx, db, { orderId, template });
  } catch (err) {
    log.warn({ orderId, template, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'order e-mail could not be queued');
  }
}

/** Founder alert "new order" (independent of the customer e-mail master switch). Never throws. */
async function queueFounderNewOrder(ctx: AppContext, db: Db, orderId: number): Promise<void> {
  try {
    await enqueueFounderNewOrderAlert(ctx, db, { orderId });
  } catch (err) {
    log.warn({ orderId, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'founder alert could not be queued');
  }
}

// ---------------------------------------------------------------- lookups

/**
 * "stp-1042" -> that order; "1042" -> the current prefix first, then any order whose number ends in "-1042" (when more than
 * one matches the caller must use the full number: null). Returns the order id, or null when nothing (or too much) matches.
 */
export async function findOrderIdByNumber(ctx: AppContext, db: Db, input: string): Promise<number | null> {
  const look = parseOrderLookup(input);
  if (!look) return null;
  if (look.kind === 'full') return (await db.order.findUnique({ where: { number: look.number }, select: { id: true } }))?.id ?? null;
  const { numberPrefix } = await ctx.settings.get('orders');
  const preferred = await db.order.findUnique({ where: { number: formatOrderNumber(numberPrefix, Number(look.digits)) }, select: { id: true } });
  if (preferred) return preferred.id;
  const matches = await db.order.findMany({ where: { number: { endsWith: `-${look.digits}` } }, select: { id: true }, take: 2 });
  return matches.length === 1 ? matches[0].id : null;
}

// ---------------------------------------------------------------- placeOrder

class IdempotentReplay extends Error {
  constructor(readonly order: { id: number; number: string }) {
    super('replay');
  }
}

async function nextOrderNumber(tx: Tx, firstNumber: number): Promise<number> {
  let changed = await tx.$executeRaw`UPDATE counters SET value = value + 1 WHERE name = 'order_number'`;
  if (changed === 0) {
    await tx.$executeRaw`INSERT IGNORE INTO counters (name, value) VALUES ('order_number', ${firstNumber - 1})`;
    changed = await tx.$executeRaw`UPDATE counters SET value = value + 1 WHERE name = 'order_number'`;
  }
  const rows = await tx.$queryRaw<{ value: number }[]>`SELECT value FROM counters WHERE name = 'order_number'`;
  return Number(rows[0]?.value);
}

/** Returns the order a repeated request refers to (same key, or an identical order within 60 s), or throws CONFLICT. */
async function findReplay(db: Db, input: PlaceOrderInput, phone: string, hash: string): Promise<{ id: number; number: string } | null> {
  if (input.idempotencyKey) {
    const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, number: true, idempotencyHash: true } });
    if (!existing) return null;
    if (existing.idempotencyHash === hash) return existing;
    throw AppError.conflict('This Idempotency-Key was already used for a different order. Use a new key.', 'Idempotency-Key');
  }
  if ((input.source ?? 'WEBSITE') !== 'WEBSITE') return null;
  const since = addMs(now(), -60_000);
  return db.order.findFirst({
    where: { contactPhone: phone, idempotencyHash: hash, placedAt: { gte: since }, status: { not: 'CANCELLED' } },
    orderBy: { id: 'desc' },
    select: { id: true, number: true },
  });
}

const isRetryable = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code;
  return code === 'P2034' || (e instanceof Error && /deadlock|write conflict/i.test(e.message));
};

/** One transaction: counter, order, reserve stock, customer upsert, items + lines + events + movements, email rows. */
export async function placeOrder(ctx: AppContext, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const profile = process.env.E2E_API_SERVER_TIMING === '1';
  const timings: Record<string, number> = {};
  const mark = (name: string, started: number): void => {
    if (profile) timings[name] = Math.round((performance.now() - started) * 10) / 10;
  };
  const withTimings = (result: Omit<PlaceOrderResult, 'timings'>): PlaceOrderResult => profile ? { ...result, timings: { ...timings } } : result;
  let phase = performance.now();
  const norm = normalizeInput(input);
  const hash = bodyHash(input);
  const source = input.source ?? 'WEBSITE';
  mark('normalize', phase);

  phase = performance.now();
  const replay = await findReplay(ctx.prisma, input, norm.phone, hash);
  mark('initial_replay', phase);
  if (replay) return withTimings({ orderId: replay.id, number: replay.number, created: false });

  // Steps 3-4: load, validate and price. Nothing is reserved yet.
  phase = performance.now();
  const priced = await priceCart(ctx, ctx.prisma, { items: input.items, areaId: input.delivery.areaId });
  mark('price_cart', phase);
  if (priced.purchaseProblems.length) {
    throw new AppError('NOT_PURCHASABLE', ERROR_STATUS.NOT_PURCHASABLE, 'Some items can\'t be ordered right now.', { items: priced.purchaseProblems });
  }
  if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== priced.totalCents) {
    throw new AppError('PRICE_CHANGED', ERROR_STATUS.PRICE_CHANGED, 'The total changed. Please review your order.', { totalCents: priced.totalCents });
  }
  phase = performance.now();
  const orders = await ctx.settings.get('orders');
  mark('order_settings', phase);
  const placedAt = input.placedAt ?? now();
  // Only dashboard-created orders may start CONFIRMED; a website order is always NEW.
  const status: OrderStatusName = source !== 'WEBSITE' && input.initialStatus === 'CONFIRMED' ? 'CONFIRMED' : 'NEW';
  const userId = input.userId ?? null;

  let attempt = 0;
  for (;;) {
    try {
      const queuedAt = performance.now();
      const out = await orderTxGate.run(() => {
        mark('semaphore_wait', queuedAt);
        const transactionStarted = performance.now();
        return ctx.prisma.$transaction(
        async (tx) => {
          phase = performance.now();
          const customer = await upsertCustomer(tx, norm, input.delivery.areaId, input.firstTouch ?? null, source);
          mark('customer_upsert', phase);
          // Serialize same-phone submissions on the customer row before taking the global number lock. A concurrent
          // insert for a new phone can lose its unique-key race; the outer retry rechecks replay and adopts the winner.
          phase = performance.now();
          const customerReplay = await findReplay(tx, input, norm.phone, hash);
          if (customerReplay) throw new IdempotentReplay(customerReplay);
          mark('customer_replay_check', phase);

          phase = performance.now();
          const n = await nextOrderNumber(tx, orders.firstNumber);
          // Keep this check for the same Idempotency-Key submitted concurrently with a different phone.
          const again = await findReplay(tx, input, norm.phone, hash);
          if (again) throw new IdempotentReplay(again);
          mark('counter_and_replay', phase);

          const number = formatOrderNumber(orders.numberPrefix, n);
          phase = performance.now();
          const order = await tx.order.create({
            data: {
              number,
              customerId: customer.id,
              status,
              source,
              customerName: norm.name,
              contactEmail: norm.email,
              contactPhone: norm.phone,
              contactWhatsapp: norm.whatsapp,
              areaId: input.delivery.areaId,
              areaName: norm.areaName,
              address: norm.address,
              notes: norm.notes,
              subtotalCents: priced.subtotalCents,
              deliveryFeeCents: priced.deliveryFeeCents,
              totalCents: priced.totalCents,
              costCents: priced.lines.reduce((s, l) => s + l.unitCostCents * l.qty, 0),
              placedAt,
              holdExpiresAt: status === 'NEW' ? addMs(placedAt, orders.stockHoldHours * HOUR) : null,
              confirmedAt: status === 'CONFIRMED' ? placedAt : null,
              idempotencyKey: input.idempotencyKey ?? null,
              idempotencyHash: hash,
              requestFingerprint: input.requestFingerprint ?? null,
              utmSource: input.attribution?.utmSource ?? null,
              utmMedium: input.attribution?.utmMedium ?? null,
              utmCampaign: input.attribution?.utmCampaign ?? null,
              utmContent: input.attribution?.utmContent ?? null,
              utmTerm: input.attribution?.utmTerm ?? null,
              referrer: input.attribution?.referrer ?? null,
            },
          });
          mark('order_insert', phase);

          // Reserve stock (SOLD_OUT here rolls everything back: no order, no number, nothing reserved).
          phase = performance.now();
          const crossings = await reserveStock(tx, priced.needs, order.id, { lowStockThreshold: orders.lowStockThreshold, at: placedAt });
          mark('stock_reserve', phase);

          phase = performance.now();
          const stockLines: { orderItemId: number; ref: StockRef; qty: number }[] = [];
          for (const line of priced.lines) {
            const item = await tx.orderItem.create({
              data: {
                orderId: order.id,
                kind: line.kind,
                name: line.name,
                qty: line.qty,
                unitPriceCents: line.unitPriceCents,
                unitCostCents: line.unitCostCents,
                detail: line.detail as unknown as Prisma.InputJsonValue,
              },
            });
            for (const need of line.needs) stockLines.push({ orderItemId: item.id, ref: need, qty: need.qty });
          }
          await createStockLines(tx, order.id, stockLines);
          mark('line_writes', phase);

          phase = performance.now();
          await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: null, toStatus: 'NEW', userId, note: null, createdAt: placedAt } });
          if (status === 'CONFIRMED') {
            await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: 'NEW', toStatus: 'CONFIRMED', userId, note: 'Created as confirmed', createdAt: placedAt } });
          }
          mark('event_writes', phase);

          // E-mail rows (sending is the worker's job). Manual orders may opt out; the founder is told about website orders only.
          phase = performance.now();
          if (input.sendEmail !== false) await queueOrderEmail(ctx, tx, order.id, status === 'CONFIRMED' ? 'order_confirmed' : 'order_received');
          if (source === 'WEBSITE') await queueFounderNewOrder(ctx, tx, order.id);
          mark('email_queue', phase);
          return { id: order.id, number, crossings };
        },
        { maxWait: 30_000, timeout: 30_000 },
        ).finally(() => mark('transaction_total', transactionStarted));
      });
      phase = performance.now();
      await alertLowStock(ctx, out.crossings, orders.lowStockThreshold);
      mark('low_stock_alert', phase);
      return withTimings({ orderId: out.id, number: out.number, created: true });
    } catch (e) {
      if (e instanceof IdempotentReplay) return withTimings({ orderId: e.order.id, number: e.order.number, created: false });
      if (isUniqueViolation(e)) {
        // A concurrent first order for this phone may win the customer unique-key race before either order has a row.
        // Recheck idempotency after the failed transaction; retry a non-duplicate request against the now-existing customer.
        const won = await findReplay(ctx.prisma, input, norm.phone, hash);
        if (won) return withTimings({ orderId: won.id, number: won.number, created: false });
        if (attempt < 3) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
          continue;
        }
      }
      if (isRetryable(e) && attempt < 3) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
        continue;
      }
      throw e;
    }
  }
}

async function alertLowStock(ctx: AppContext, crossings: LowStockCrossing[], threshold: number): Promise<void> {
  if (crossings.length) await queueLowStockAlert(ctx, ctx.prisma, crossings, threshold);
}

async function upsertCustomer(
  tx: Tx,
  n: Normalized,
  areaId: number | null,
  firstTouch: PlaceOrderInput['firstTouch'],
  source: 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL',
): Promise<{ id: number }> {
  const existing = await tx.customer.findUnique({ where: { phone: n.phone } });
  let customer: { id: number };
  if (existing) {
    // latest wins; a missing e-mail (manual order) never erases the one we have
    customer = await tx.customer.update({
      where: { id: existing.id },
      data: { name: n.name, whatsapp: n.whatsapp, email: n.email ?? existing.email, areaId: areaId ?? existing.areaId },
      select: { id: true },
    });
    if (firstTouch && !existing.firstTouchAt) {
      await tx.customer.updateMany({
        where: { id: existing.id, firstTouchAt: null },
        data: {
          firstUtmSource: firstTouch.utmSource ?? null,
          firstUtmMedium: firstTouch.utmMedium ?? null,
          firstUtmCampaign: firstTouch.utmCampaign ?? null,
          firstUtmContent: firstTouch.utmContent ?? null,
          firstUtmTerm: firstTouch.utmTerm ?? null,
          firstReferrer: firstTouch.referrer ?? null,
          firstTouchAt: now(),
        },
      });
    }
  } else {
    customer = await tx.customer.create({
      data: {
        phone: n.phone,
        whatsapp: n.whatsapp,
        name: n.name,
        email: n.email,
        areaId,
        unsubscribeToken: randomBytes(32).toString('hex'),
        firstSource: source,
        firstUtmSource: firstTouch?.utmSource ?? null,
        firstUtmMedium: firstTouch?.utmMedium ?? null,
        firstUtmCampaign: firstTouch?.utmCampaign ?? null,
        firstUtmContent: firstTouch?.utmContent ?? null,
        firstUtmTerm: firstTouch?.utmTerm ?? null,
        firstReferrer: firstTouch?.referrer ?? null,
        firstTouchAt: firstTouch ? now() : null,
      },
      select: { id: true },
    });
  }
  const matching = await tx.subscriber.findMany({
    where: {
      customerId: null,
      OR: [
        ...(n.email ? [{ type: 'EMAIL' as const, contact: n.email }] : []),
        { type: 'WHATSAPP', contact: n.phone },
      ],
    },
    select: { id: true, type: true },
  });
  if (matching.length) {
    const emailConsent = matching.some((subscriber) => subscriber.type === 'EMAIL');
    const whatsappConsent = matching.some((subscriber) => subscriber.type === 'WHATSAPP');
    await tx.subscriber.updateMany({ where: { id: { in: matching.map((subscriber) => subscriber.id) } }, data: { customerId: customer.id } });
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        ...(emailConsent ? { emailConsent: true } : {}),
        ...(whatsappConsent ? { whatsappConsent: true } : {}),
        consentUpdatedAt: now(),
      },
    });
  }
  return customer;
}

// ---------------------------------------------------------------- changeStatus

export type ChangeStatusInput = {
  orderId: number;
  to: OrderStatusName;
  userId: number | null;
  note?: string;
  cancelReason?: string;
  deliveryNumber?: string;
  restock?: boolean;
  /** Demo only: the instant to record for this change (seed-demo spreads timestamps). Defaults to now. */
  at?: Date;
  /** Internal guard used by the hold-expiry worker so a concurrent extension wins over an old due-list snapshot. */
  holdExpiredBefore?: Date;
};
export type ChangeStatusResult = { orderId: number; warnings: DeliveryWarning[] };

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t ? t : undefined;
};

export function normalizeDeliveryNumber(raw: string | undefined): string {
  const dn = raw?.trim() ?? '';
  if (!dn) throw new AppError('DELIVERY_NUMBER_REQUIRED', ERROR_STATUS.DELIVERY_NUMBER_REQUIRED, 'Enter the delivery number from the delivery slip.');
  if (dn.length > 60) throw AppError.validation({ deliveryNumber: 'Must be at most 60 characters.' });
  return dn;
}

/** Other orders (not this one) already carrying this delivery number and still out or delivered. */
export async function duplicateDeliveryOrderIds(db: Db, deliveryNumber: string, exceptOrderId: number): Promise<number[]> {
  const rows = await db.order.findMany({
    where: { deliveryNumber, id: { not: exceptOrderId }, status: { in: ['OUT_FOR_DELIVERY', 'DELIVERED'] } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => r.id);
}

/**
 * The transition itself, inside the caller's transaction: validates against the machine, updates the order (conditionally,
 * so two simultaneous changes cannot both win), applies the stock and cash effects, writes the event.
 * E-mail is queued by the caller after this returns (so the row can reference the final order).
 */
async function applyTransition(tx: Tx, input: ChangeStatusInput): Promise<{ warnings: DeliveryWarning[]; template: OrderEmailTemplate | undefined }> {
  const order = await tx.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw AppError.notFound('Order not found.');
  const from = order.status;
  const { to } = input;
  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError('INVALID_TRANSITION', ERROR_STATUS.INVALID_TRANSITION, `That status change isn't allowed from ${from}.`, { from, to, allowed: allowedTransitions(from) });
  }
  const note = clean(input.note);
  if (note && note.length > 500) throw AppError.validation({ note: 'Must be at most 500 characters.' });
  const cancelReason = clean(input.cancelReason);
  if (cancelReason && cancelReason.length > 255) throw AppError.validation({ cancelReason: 'Must be at most 255 characters.' });

  const at = input.at ?? now();
  const data: Prisma.OrderUncheckedUpdateManyInput = { status: to };
  const warnings: DeliveryWarning[] = [];

  switch (to) {
    case 'CONFIRMED':
      data.confirmedAt = at;
      data.holdExpiresAt = null;
      break;
    case 'PACKED':
      break;
    case 'OUT_FOR_DELIVERY': {
      const dn = normalizeDeliveryNumber(input.deliveryNumber);
      data.deliveryNumber = dn;
      data.outForDeliveryAt = at;
      const dups = await duplicateDeliveryOrderIds(tx, dn, order.id);
      if (dups.length) warnings.push({ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: dn, orderIds: dups });
      break;
    }
    case 'DELIVERED':
      data.deliveredAt = at;
      data.cashCollected = true;
      break;
    case 'CANCELLED':
      data.cancelledAt = at;
      data.cancelReason = cancelReason ?? null;
      data.holdExpiresAt = null;
      break;
    case 'RETURNED':
      data.cashCollected = false;
      data.cashSettled = false;
      if (cancelReason) data.cancelReason = cancelReason;
      break;
    default:
      break;
  }

  const res = await tx.order.updateMany({
    where: {
      id: order.id,
      status: from,
      ...(input.holdExpiredBefore ? { holdExpiresAt: { not: null, lt: input.holdExpiredBefore } } : {}),
    },
    data,
  });
  if (res.count !== 1) {
    // someone else changed it between our read and our write
    const now2 = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
    const cur = now2?.status ?? from;
    throw new AppError('INVALID_TRANSITION', ERROR_STATUS.INVALID_TRANSITION, `That status change isn't allowed from ${cur}.`, { from: cur, to, allowed: allowedTransitions(cur) });
  }

  if (to === 'CANCELLED') await releaseStockForOrder(tx, order.id, input.userId, at);
  else if (to === 'DELIVERED') await sellStockForOrder(tx, order.id, input.userId, at);
  else if (to === 'RETURNED') await returnStockForOrder(tx, order.id, { restock: input.restock ?? true, userId: input.userId, at });

  await tx.orderEvent.create({
    data: { orderId: order.id, fromStatus: from, toStatus: to, userId: input.userId, note: note ?? (to === 'CANCELLED' ? cancelReason : undefined) ?? null, createdAt: at },
  });
  return { warnings, template: STATUS_EMAIL[to] };
}

/** Changes an order's status in one transaction (machine, stock, cash flags, event, queued e-mail). */
export async function changeStatus(ctx: AppContext, input: ChangeStatusInput): Promise<ChangeStatusResult> {
  let attempt = 0;
  for (;;) {
    try {
      return await orderTxGate.run(() => ctx.prisma.$transaction(
        async (tx) => {
          const { warnings, template } = await applyTransition(tx, input);
          if (template) await queueOrderEmail(ctx, tx, input.orderId, template);
          return { orderId: input.orderId, warnings };
        },
        { maxWait: 15_000, timeout: 15_000 },
      ));
    } catch (e) {
      if (isRetryable(e) && attempt < 3) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
        continue;
      }
      throw e;
    }
  }
}

/** Used by the hold-expiry job (jobs/hold-expiry.ts): cancels, releases stock and queues the cancellation e-mail. */
export async function cancelOrderInTx(ctx: AppContext, tx: Tx, input: { orderId: number; reason: string; userId: number | null; holdExpiredBefore?: Date }): Promise<void> {
  await applyTransition(tx, { orderId: input.orderId, to: 'CANCELLED', userId: input.userId, cancelReason: input.reason, holdExpiredBefore: input.holdExpiredBefore });
  await queueOrderEmail(ctx, tx, input.orderId, 'order_cancelled');
}

/**
 * Corrects the delivery number of an order already out for delivery (writes an event, does NOT resend the e-mail). From
 * PACKED it is the same as the status change. Any other status is INVALID_TRANSITION.
 */
export async function setDeliveryNumber(
  ctx: AppContext,
  input: { orderId: number; deliveryNumber: string; userId: number | null },
): Promise<{ warnings: DeliveryWarning[] }> {
  const order = await ctx.prisma.order.findUnique({ where: { id: input.orderId }, select: { status: true } });
  if (!order) throw AppError.notFound('Order not found.');
  if (order.status === 'PACKED') {
    const r = await changeStatus(ctx, { orderId: input.orderId, to: 'OUT_FOR_DELIVERY', userId: input.userId, deliveryNumber: input.deliveryNumber });
    return { warnings: r.warnings };
  }
  if (order.status !== 'OUT_FOR_DELIVERY') {
    throw new AppError('INVALID_TRANSITION', ERROR_STATUS.INVALID_TRANSITION, `The delivery number can't be changed from ${order.status}.`, {
      from: order.status,
      to: 'OUT_FOR_DELIVERY',
      allowed: allowedTransitions(order.status),
    });
  }
  const dn = normalizeDeliveryNumber(input.deliveryNumber);
  return ctx.prisma.$transaction(async (tx) => {
    const cur = await tx.order.findUnique({ where: { id: input.orderId }, select: { status: true, deliveryNumber: true } });
    if (!cur || cur.status !== 'OUT_FOR_DELIVERY') {
      const s = cur?.status ?? order.status;
      throw new AppError('INVALID_TRANSITION', ERROR_STATUS.INVALID_TRANSITION, `The delivery number can't be changed from ${s}.`, { from: s, to: 'OUT_FOR_DELIVERY', allowed: allowedTransitions(s) });
    }
    const dups = await duplicateDeliveryOrderIds(tx, dn, input.orderId);
    if (cur.deliveryNumber !== dn) {
      await tx.order.update({ where: { id: input.orderId }, data: { deliveryNumber: dn } });
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          fromStatus: 'OUT_FOR_DELIVERY',
          toStatus: 'OUT_FOR_DELIVERY',
          userId: input.userId,
          note: `Delivery number changed from ${cur.deliveryNumber ?? '(none)'} to ${dn}`,
        },
      });
    }
    return { warnings: dups.length ? [{ code: 'DUPLICATE_DELIVERY_NUMBER' as const, deliveryNumber: dn, orderIds: dups }] : [] };
  });
}

// ---------------------------------------------------------------- hold expiry (jobs/hold-expiry.ts)

/**
 * NEW orders past `holdExpiresAt`. Default (autoExpireUnconfirmed = false): changes nothing (the list flags them).
 * With auto-expire on: cancels each one ("Expired: not confirmed"), releases stock, queues the cancellation e-mail.
 * Each order is its own transaction, so one failure never blocks the rest.
 */
export async function autoExpireUnconfirmed(ctx: AppContext): Promise<{ cancelled: number }> {
  const { autoExpireUnconfirmed: enabled } = await ctx.settings.get('orders');
  if (!enabled) return { cancelled: 0 };
  const cutoff = now();
  const due = await ctx.prisma.order.findMany({
    where: { status: 'NEW', holdExpiresAt: { not: null, lt: cutoff } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 200,
  });
  let cancelled = 0;
  for (const o of due) {
    try {
      await orderTxGate.run(() =>
        ctx.prisma.$transaction(
          async (tx) => {
            await cancelOrderInTx(ctx, tx, { orderId: o.id, reason: 'Expired: not confirmed', userId: null, holdExpiredBefore: cutoff });
          },
          { maxWait: 15_000, timeout: 15_000 },
        ),
      );
      cancelled += 1;
    } catch (err) {
      // most likely the founder confirmed or cancelled it a moment ago (INVALID_TRANSITION): skip it
      if (!(err instanceof AppError && err.code === 'INVALID_TRANSITION')) log.error({ orderId: o.id, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'hold expiry failed for an order');
    }
  }
  return { cancelled };
}

export type { PricedLine };
