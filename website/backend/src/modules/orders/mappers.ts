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

const itemsWithStockInclude = {
  orderBy: { id: 'asc' },
  include: {
    stockLines: {
      include: {
        stimpie: true,
        variant: {
          include: {
            hoodie: true,
            color: true,
          },
        },
      },
    },
  },
} as const;

export const summaryInclude = { items: itemsWithStockInclude } satisfies Prisma.OrderInclude;
export const detailInclude = {
  items: itemsWithStockInclude,
  customer: true,
  events: { include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
  notesList: { include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
  emails: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof summaryInclude }>;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;
export type ItemRow = Prisma.OrderItemGetPayload<{}> & { stockLines?: unknown };

export type OrderItemDto = z.infer<typeof orderItemSchema>;
export type AdminOrderSummaryDto = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrderDto = z.infer<typeof adminOrderSchema>;

function extractItemMedia(i: unknown) {
  const stockLines = (i as {
    stockLines?: Array<{
      itemType: string;
      stimpie?: { name: string; artworkUrl: string | null; images: string[] } | null;
      variant?: {
        hoodie?: { name: string; images: string[] } | null;
        color?: { name: string; images: string[] } | null;
      } | null;
    }>;
  })?.stockLines;

  let hoodieImage: string | null = null;
  const stimpieImages: Array<{ name: string; imageUrl: string | null }> = [];

  if (Array.isArray(stockLines)) {
    for (const line of stockLines) {
      if (line.itemType === 'HOODIE_VARIANT' && line.variant) {
        if (!hoodieImage) {
          hoodieImage = line.variant.color?.images?.[0] || line.variant.hoodie?.images?.[0] || null;
        }
      } else if (line.itemType === 'STIMPIE' && line.stimpie) {
        stimpieImages.push({
          name: line.stimpie.name,
          imageUrl: line.stimpie.artworkUrl || line.stimpie.images?.[0] || null,
        });
      }
    }
  }

  return { hoodieImage, stimpieImages };
}

export function toOrderItem(i: ItemRow): OrderItemDto {
  const d = itemDetail(i.detail);
  const media = extractItemMedia(i);
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    qty: i.qty,
    unitPriceCents: i.unitPriceCents,
    lineTotalCents: i.unitPriceCents * i.qty,
    details: {
      hoodie: d.hoodie,
      color: d.color,
      size: d.size,
      stimpies: d.stimpies,
      hoodieImage: media.hoodieImage,
      stimpieImages: media.stimpieImages.length > 0 ? media.stimpieImages : undefined,
    },
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
