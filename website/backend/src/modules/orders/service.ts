import { createHash, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { now } from '../../lib/clock';
import { iso, startOfDayInTz, ymdInTz } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import type { PageQuery } from '../../lib/http';
import { toPage, toSkipTake } from '../../lib/http';
import { logger } from '../../lib/log';
import { likeEscape } from '../../lib/like';
import { normalizePhone } from '../../lib/phone';
import { enqueueOrdersLookupEmail } from '../../services/email-queue';
import { customerConfirmationWhatsappUrl } from '../../services/whatsapp';
import { formatItemsText, trackingUrl } from '../../services/template-values';
import { checkAvailability, type StockProblem } from '../../services/stock';
import { allowedTransitions, changeStatus, findOrderIdByNumber, ALL_STATUSES, type OrderStatusName } from '../../services/orders';
import { priceCart, resolveDelivery, type CartItemInput } from '../../services/pricing';
import { detailInclude, summaryInclude, toAdminOrder, toAdminOrderSummary, toOrderItem } from './mappers';
import type { cartValidateBody, trackResponse } from './schemas';

const log = logger('orders-http');

// ---------------------------------------------------------------- admin: list, counts, detail

export type OrderFilters = {
  status?: string[];
  source?: 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL';
  areaId?: number;
  dropId?: number;
  from?: string;
  to?: string;
  deliveryNumber?: string;
  q?: string;
  holdExpired?: boolean;
  afterId?: number;
  ids?: number[];
};

function validDate(ymd: string, field: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw AppError.validation({ [field]: 'Enter a real date like 2026-10-14.' });
  return ymd;
}

/** The Prisma `where` for every filter of the orders list and the export. `from`/`to` are dates in the business timezone. */
export async function buildOrderWhere(ctx: AppContext, f: OrderFilters): Promise<Prisma.OrderWhereInput> {
  const and: Prisma.OrderWhereInput[] = [];
  if (f.ids?.length) and.push({ id: { in: f.ids } });
  if (f.status?.length) {
    const bad = f.status.filter((s) => !(ALL_STATUSES as string[]).includes(s));
    if (bad.length) throw AppError.validation({ status: `Unknown status: ${bad.join(', ')}.` });
    and.push({ status: { in: f.status as OrderStatusName[] } });
  }
  if (f.source) and.push({ source: f.source });
  if (f.areaId) and.push({ areaId: f.areaId });
  if (f.dropId) and.push({ stockLines: { some: { stimpie: { dropId: f.dropId } } } });
  if (f.from || f.to) {
    const { timezone } = await ctx.settings.get('business');
    const range: { gte?: Date; lt?: Date } = {};
    if (f.from) range.gte = startOfDayInTz(validDate(f.from, 'from'), timezone);
    if (f.to) {
      const [y, m, d] = validDate(f.to, 'to').split('-').map(Number) as [number, number, number];
      range.lt = startOfDayInTz(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), timezone);
    }
    and.push({ placedAt: range });
  }
  if (f.deliveryNumber) and.push({ deliveryNumber: f.deliveryNumber });
  if (f.holdExpired) and.push({ status: 'NEW', holdExpiresAt: { lt: now() } });
  if (f.afterId !== undefined) and.push({ id: { gt: f.afterId } });
  if (f.q) {
    const q = f.q.trim();
    const lq = likeEscape(q);
    const or: Prisma.OrderWhereInput[] = [
      { number: { contains: lq } },
      { deliveryNumber: { contains: lq } },
      { contactEmail: { contains: lq } },
      { customerName: { contains: lq } },
    ];
    if (/^\d+$/.test(q)) or.push({ number: { endsWith: `-${Number(q)}` } });
    const phone = normalizePhone(q);
    const digits = q.replace(/[^\d]/g, '');
    if (phone) or.push({ contactPhone: phone }, { contactWhatsapp: phone });
    else if (digits.length >= 3) or.push({ contactPhone: { contains: likeEscape(digits) } });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

const SORTABLE = ['placedAt', 'totalCents', 'number', 'status'] as const;

function orderBy(raw: string | undefined): Prisma.OrderOrderByWithRelationInput[] {
  const desc = raw ? raw.startsWith('-') : true;
  const field = raw ? raw.replace(/^-/, '') : 'placedAt';
  const f = (SORTABLE as readonly string[]).includes(field) ? field : 'placedAt';
  const dir = (SORTABLE as readonly string[]).includes(field) ? (desc ? 'desc' : 'asc') : 'desc';
  // order numbers grow with the counter, so sorting by id sorts by number numerically ("STP-999" < "STP-1000")
  const key = f === 'number' ? 'id' : (f as 'placedAt' | 'totalCents' | 'status');
  return [{ [key]: dir }, { id: 'desc' }];
}

export async function listOrders(ctx: AppContext, q: PageQuery & OrderFilters & { sort?: string }) {
  const where = await buildOrderWhere(ctx, q);
  const [rows, total] = await Promise.all([
    ctx.prisma.order.findMany({ where, include: summaryInclude, orderBy: orderBy(q.sort), ...toSkipTake(q) }),
    ctx.prisma.order.count({ where }),
  ]);
  const at = now();
  return toPage(rows.map((o) => toAdminOrderSummary(o, at)), total, q);
}

export async function orderCounts(ctx: AppContext) {
  const groups = await ctx.prisma.order.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = { ALL: 0, NEW: 0, CONFIRMED: 0, PACKED: 0, OUT_FOR_DELIVERY: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0 };
  for (const g of groups) {
    counts[g.status] = g._count._all;
    counts.ALL += g._count._all;
  }
  return counts;
}

export async function getAdminOrder(ctx: AppContext, id: number, warnings: Parameters<typeof toAdminOrder>[1] = []) {
  const row = await ctx.prisma.order.findUnique({ where: { id }, include: detailInclude });
  if (!row) throw AppError.notFound('Order not found.');
  return toAdminOrder(row, warnings);
}

// ---------------------------------------------------------------- admin: bulk status

export async function bulkStatus(ctx: AppContext, input: { ids: number[]; to: 'CONFIRMED' | 'PACKED' | 'DELIVERED'; userId: number }) {
  const updated: number[] = [];
  const failed: { id: number; code: string }[] = [];
  for (const id of [...new Set(input.ids)]) {
    try {
      await changeStatus(ctx, { orderId: id, to: input.to, userId: input.userId });
      updated.push(id);
    } catch (err) {
      failed.push({ id, code: err instanceof AppError ? err.code : 'INTERNAL' });
      if (!(err instanceof AppError)) log.error({ orderId: id, err: String((err as Error)?.message ?? err).slice(0, 200) }, 'bulk status failed');
    }
  }
  return { updated, failed };
}

// ---------------------------------------------------------------- admin: CSV export

/** A cell is quoted when needed, and prefixed with `'` when it starts with = + - @ (or a tab / CR) so spreadsheets don't run it. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  'Order number', 'Placed at', 'Status', 'Source', 'Customer', 'Phone', 'WhatsApp', 'Email', 'Area', 'Address', 'Delivery notes', 'Items',
  'Subtotal (USD)', 'Delivery fee (USD)', 'Total (USD)', 'Delivery number', 'Cash collected', 'Cash settled', 'Delivered at', 'Cancel reason',
];
const usd = (c: number): string => (c / 100).toFixed(2);
export const EXPORT_LIMIT = 5000;

export async function exportOrdersCsv(ctx: AppContext, filters: OrderFilters): Promise<{ csv: string; filename: string; rows: number }> {
  const where = await buildOrderWhere(ctx, filters);
  const rows = await ctx.prisma.order.findMany({ where, include: summaryInclude, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: EXPORT_LIMIT });
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const o of rows) {
    lines.push(
      [
        o.number, iso(o.placedAt), o.status, o.source, o.customerName, o.contactPhone, o.contactWhatsapp, o.contactEmail, o.areaName, o.address, o.notes,
        o.items.map((i) => formatItemsText([{ name: i.name, qty: i.qty, detail: i.detail }]).replace(/^- /, '')).join(' | '),
        usd(o.subtotalCents), usd(o.deliveryFeeCents), usd(o.totalCents), o.deliveryNumber, o.cashCollected ? 'yes' : 'no', o.cashSettled ? 'yes' : 'no',
        o.deliveredAt ? iso(o.deliveredAt) : '', o.cancelReason,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  const { timezone } = await ctx.settings.get('business');
  // BOM so Excel reads the UTF-8 names correctly
  return { csv: `﻿${lines.join('\r\n')}\r\n`, filename: `orders-${ymdInTz(now(), timezone)}.csv`, rows: rows.length };
}

// ---------------------------------------------------------------- public: cart validation

export async function validateCart(ctx: AppContext, body: z.infer<typeof cartValidateBody>) {
  const priced = await priceCart(ctx, ctx.prisma, { items: body.items as CartItemInput[], areaId: body.areaId ?? null, areaPath: 'areaId' });
  const stockProblems = await checkAvailability(ctx.prisma, priced.needs);
  const byLine = new Map<number, StockProblem[]>();
  for (const p of stockProblems) byLine.set(p.itemIndex, [...(byLine.get(p.itemIndex) ?? []), p]);

  const lines = priced.lines.map((l) => {
    const problems = [...l.problems, ...(byLine.get(l.itemIndex) ?? [])];
    return { itemIndex: l.itemIndex, ok: problems.length === 0, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents, problems };
  });
  const subtotalCents = lines.filter((l) => l.ok).reduce((s, l) => s + l.lineTotalCents, 0);
  return {
    ok: lines.every((l) => l.ok),
    lines,
    subtotalCents,
    deliveryFeeCents: priced.deliveryFeeCents,
    totalCents: subtotalCents + priced.deliveryFeeCents,
    estimateText: priced.estimateText,
  };
}

// ---------------------------------------------------------------- public: placed order, track, find

export async function placedOrderResponse(ctx: AppContext, orderId: number) {
  const o = await ctx.prisma.order.findUnique({ where: { id: orderId }, include: summaryInclude });
  if (!o) throw AppError.notFound('Order not found.');
  const { estimateText } = await resolveDelivery(ctx, ctx.prisma, o.areaId).catch(async () => ({ estimateText: (await ctx.settings.get('delivery')).estimateText }));
  return {
    order: {
      number: o.number,
      status: o.status,
      placedAt: iso(o.placedAt),
      customerName: o.customerName,
      contactEmail: o.contactEmail,
      items: o.items.map(toOrderItem),
      subtotalCents: o.subtotalCents,
      deliveryFeeCents: o.deliveryFeeCents,
      totalCents: o.totalCents,
      estimateText,
    },
    whatsappUrl: await customerConfirmationWhatsappUrl(ctx, { orderNumber: o.number, customerName: o.customerName, totalCents: o.totalCents, items: o.items.map((i) => ({ name: i.name, qty: i.qty, detail: i.detail })) }),
    trackUrl: trackingUrl(ctx.config.webUrl, o.number),
  };
}

const sha = (s: string): Buffer => createHash('sha256').update(s).digest();
const NOT_FOUND_MESSAGE = "We couldn't find an order with those details. Check the order number and use the phone number you ordered with.";
const DUMMY_PHONE = '+96100000000';

/**
 * `POST /orders/track`. Unknown number and wrong phone are indistinguishable: same 404, same message, and the same work
 * (the lookups and the constant-time phone comparison always run).
 */
export async function trackOrder(ctx: AppContext, input: { orderNumber: string; phone: string }): Promise<z.infer<typeof trackResponse>> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw AppError.validation({ phone: 'Enter the phone number you ordered with, like 03 123 456.' });

  const id = await findOrderIdByNumber(ctx, ctx.prisma, input.orderNumber);
  const order = await ctx.prisma.order.findUnique({
    where: { id: id ?? 0 },
    include: { ...summaryInclude, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
  const matches = timingSafeEqual(sha(phone), sha(order?.contactPhone ?? DUMMY_PHONE)) && order !== null;
  if (!matches || !order) throw AppError.notFound(NOT_FOUND_MESSAGE);

  const timeline: { status: OrderStatusName; at: string }[] = [];
  const seen = new Set<string>();
  for (const e of order.events) {
    if (e.fromStatus === e.toStatus || seen.has(e.toStatus)) continue; // audit entries (contact edits, ...) are not steps
    seen.add(e.toStatus);
    timeline.push({ status: e.toStatus, at: iso(e.createdAt) });
  }
  const { estimateText } = await resolveDelivery(ctx, ctx.prisma, order.areaId).catch(async () => ({ estimateText: (await ctx.settings.get('delivery')).estimateText }));
  const showDelivery = order.status === 'OUT_FOR_DELIVERY' || order.status === 'DELIVERED' || order.outForDeliveryAt !== null;
  return {
    number: order.number,
    status: order.status,
    placedAt: iso(order.placedAt),
    customerName: order.customerName,
    items: order.items.map(toOrderItem),
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    deliveryNumber: showDelivery ? order.deliveryNumber : null,
    timeline,
    estimateText,
    whatsappNumber: (await ctx.settings.get('business')).whatsappNumber,
  };
}

export const FIND_MESSAGE = "If we found orders for this email, we've emailed you the order numbers.";

/** `POST /orders/find`: queues one `orders_lookup` e-mail listing up to 10 recent orders; the caller always answers 202. */
export async function findOrdersByEmail(ctx: AppContext, email: string): Promise<void> {
  const orders = await ctx.prisma.order.findMany({
    where: { contactEmail: email },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: 10,
    select: { number: true, placedAt: true, status: true, totalCents: true, contactEmail: true },
  });
  if (!orders.length) return;
  try {
    await enqueueOrdersLookupEmail(ctx, ctx.prisma, { to: orders[0]!.contactEmail ?? email, orders });
  } catch (err) {
    log.error({ err: String((err as Error)?.message ?? err).slice(0, 200) }, 'lookup e-mail could not be queued');
  }
}

export { allowedTransitions };
