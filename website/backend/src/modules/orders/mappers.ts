import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { now } from '../../lib/clock';
import { iso, isoOrNull } from '../../lib/dates';
import { allowedTransitions, type DeliveryWarning } from '../../services/orders';
import { itemDetail, itemsSummary } from '../../services/order-text';
import type { adminOrderSchema, adminOrderSummarySchema, orderItemSchema } from './schemas';

/**
 * Explicit response mappers (never `return row`): internal columns such as costs, fingerprints and idempotency hashes
 * cannot leak because every public/admin shape is built field by field here.
 */

export const summaryInclude = { items: { orderBy: { id: 'asc' } } } satisfies Prisma.OrderInclude;
export const detailInclude = {
  items: { orderBy: { id: 'asc' } },
  customer: true,
  events: { include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
  notesList: { include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
  emails: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof summaryInclude }>;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;
type ItemRow = OrderWithItems['items'][number];

export type OrderItemDto = z.infer<typeof orderItemSchema>;
export type AdminOrderSummaryDto = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrderDto = z.infer<typeof adminOrderSchema>;

export function toOrderItem(i: ItemRow): OrderItemDto {
  const d = itemDetail(i.detail);
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    qty: i.qty,
    unitPriceCents: i.unitPriceCents,
    lineTotalCents: i.unitPriceCents * i.qty,
    details: { hoodie: d.hoodie, color: d.color, size: d.size, stimpies: d.stimpies },
  };
}

/** `holdExpired`: a NEW order past its stock hold (evaluated on the injectable server clock). */
export const isHoldExpired = (o: { status: string; holdExpiresAt: Date | null }, at: Date = now()): boolean =>
  o.status === 'NEW' && o.holdExpiresAt !== null && o.holdExpiresAt.getTime() < at.getTime();

/** AdminOrderSummary (api 5.1). Exported for the global search (`GET /admin/search`). */
export function toAdminOrderSummary(o: OrderWithItems, at: Date = now()): AdminOrderSummaryDto {
  return {
    id: o.id,
    number: o.number,
    placedAt: iso(o.placedAt),
    status: o.status,
    source: o.source,
    customerName: o.customerName,
    contactPhone: o.contactPhone,
    areaName: o.areaName,
    itemsSummary: itemsSummary(o.items.map((i) => ({ name: i.name, kind: i.kind, qty: i.qty, detail: i.detail }))),
    totalCents: o.totalCents,
    deliveryNumber: o.deliveryNumber,
    cashCollected: o.cashCollected,
    cashSettled: o.cashSettled,
    holdExpired: isHoldExpired(o, at),
  };
}

/** AdminOrder (api 5.1): events, notes and e-mails newest first. */
export function toAdminOrder(o: OrderDetailRow, warnings: DeliveryWarning[] = [], at: Date = now()): AdminOrderDto {
  return {
    ...toAdminOrderSummary(o, at),
    customer: { id: o.customer.id, name: o.customer.name, email: o.customer.email, phone: o.customer.phone, whatsapp: o.customer.whatsapp },
    contact: { email: o.contactEmail, phone: o.contactPhone, whatsapp: o.contactWhatsapp },
    delivery: { areaId: o.areaId, areaName: o.areaName, address: o.address, notes: o.notes },
    items: o.items.map(toOrderItem),
    subtotalCents: o.subtotalCents,
    deliveryFeeCents: o.deliveryFeeCents,
    costCents: o.costCents,
    holdExpiresAt: isoOrNull(o.holdExpiresAt),
    outForDeliveryAt: isoOrNull(o.outForDeliveryAt),
    deliveredAt: isoOrNull(o.deliveredAt),
    cancelledAt: isoOrNull(o.cancelledAt),
    cancelReason: o.cancelReason,
    events: o.events.map((e) => ({ id: e.id, from: e.fromStatus, to: e.toStatus, at: iso(e.createdAt), by: e.user?.name ?? null, note: e.note })),
    notes: o.notesList.map((n) => ({ id: n.id, body: n.body, at: iso(n.createdAt), by: n.user.name })),
    emails: o.emails.map((m) => ({ id: m.id, template: m.templateKey, to: m.toEmail, status: m.status, at: iso(m.createdAt) })),
    allowedTransitions: allowedTransitions(o.status),
    warnings,
  };
}
