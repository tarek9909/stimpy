import type { Customer, Order, OrderSource, OrderStatus, PrismaClient } from '@prisma/client';

/**
 * Order fixtures written straight to the database (NOT through the orders service, which another engineer is building).
 * Totals are derived from the items so tests can hand-compute expected figures.
 */
export type FixtureItem = {
  kind?: 'PACK' | 'HOODIE' | 'STIMPIE';
  name: string;
  qty?: number;
  unitPriceCents: number;
  unitCostCents: number;
  detail?: { hoodie?: string | null; color?: string | null; size?: string | null; stimpies?: string[] };
  /** Stimpie ids this item holds (one stock line per id, qty = item qty), state SOLD for delivered orders. */
  stimpieIds?: number[];
};

export type FixtureOrder = {
  number?: string;
  status?: OrderStatus;
  source?: OrderSource;
  customerName?: string;
  phone?: string;
  email?: string | null;
  whatsapp?: string;
  areaId?: number | null;
  areaName?: string;
  placedAt?: Date | string;
  confirmedAt?: Date | string | null;
  outForDeliveryAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  holdExpiresAt?: Date | string | null;
  cancelReason?: string | null;
  items?: FixtureItem[];
  deliveryFeeCents?: number;
  cashCollected?: boolean;
  cashSettled?: boolean;
  deliveryNumber?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** Writes an order event `<from> -> RETURNED` at this time (the date a return is recorded). */
  returnedAt?: Date | string;
};

let seq = 5000;
const d = (v: Date | string | null | undefined): Date | null | undefined => (v === null ? null : v === undefined ? undefined : new Date(v));

export async function makeCustomer(prisma: PrismaClient, o: { phone?: string; name?: string; email?: string | null; whatsapp?: string; notes?: string | null } = {}): Promise<Customer> {
  const n = ++seq;
  const phone = o.phone ?? `+9617${String(n).padStart(7, '0')}`;
  return prisma.customer.upsert({
    where: { phone },
    create: { phone, whatsapp: o.whatsapp ?? phone, name: o.name ?? `Customer ${n}`, email: o.email ?? null, notes: o.notes ?? null },
    update: {},
  });
}

export async function makeOrder(prisma: PrismaClient, o: FixtureOrder = {}): Promise<Order & { customerId: number }> {
  const n = ++seq;
  const phone = o.phone ?? `+9617${String(n).padStart(7, '0')}`;
  const customer = await prisma.customer.upsert({
    where: { phone },
    create: { phone, whatsapp: o.whatsapp ?? phone, name: o.customerName ?? `Customer ${n}`, email: o.email ?? null },
    update: {},
  });
  const items = o.items ?? [{ kind: 'PACK', name: 'Hoodie + 1 Stimpie', qty: 1, unitPriceCents: 3500, unitCostCents: 1700, detail: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: ['THE VOID'] } }];
  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * (i.qty ?? 1), 0);
  const cost = items.reduce((s, i) => s + i.unitCostCents * (i.qty ?? 1), 0);
  const fee = o.deliveryFeeCents ?? 300;
  const order = await prisma.order.create({
    data: {
      number: o.number ?? `STP-${n}`,
      customerId: customer.id,
      status: o.status ?? 'NEW',
      source: o.source ?? 'WEBSITE',
      customerName: o.customerName ?? customer.name,
      contactEmail: o.email === undefined ? null : o.email,
      contactPhone: phone,
      contactWhatsapp: o.whatsapp ?? phone,
      areaId: o.areaId ?? null,
      areaName: o.areaName ?? 'Beirut',
      address: 'Main street, building 5',
      subtotalCents: subtotal,
      deliveryFeeCents: fee,
      totalCents: subtotal + fee,
      costCents: cost,
      cashCollected: o.cashCollected ?? false,
      cashSettled: o.cashSettled ?? false,
      deliveryNumber: o.deliveryNumber ?? null,
      placedAt: d(o.placedAt) ?? new Date(),
      confirmedAt: d(o.confirmedAt),
      outForDeliveryAt: d(o.outForDeliveryAt),
      deliveredAt: d(o.deliveredAt),
      cancelledAt: d(o.cancelledAt),
      holdExpiresAt: d(o.holdExpiresAt),
      cancelReason: o.cancelReason ?? null,
      utmSource: o.utmSource ?? null,
      utmMedium: o.utmMedium ?? null,
      utmCampaign: o.utmCampaign ?? null,
      items: {
        create: items.map((i) => ({
          kind: i.kind ?? 'PACK',
          name: i.name,
          qty: i.qty ?? 1,
          unitPriceCents: i.unitPriceCents,
          unitCostCents: i.unitCostCents,
          detail: { hoodie: null, color: null, size: null, stimpies: [], ...(i.detail ?? {}) },
        })),
      },
    },
    include: { items: { orderBy: { id: 'asc' } } },
  });
  const state = o.status === 'DELIVERED' ? 'SOLD' : o.status === 'CANCELLED' ? 'RELEASED' : 'RESERVED';
  for (const [idx, item] of items.entries()) {
    for (const stimpieId of item.stimpieIds ?? []) {
      await prisma.orderStockLine.create({
        data: { orderId: order.id, orderItemId: order.items[idx]!.id, itemType: 'STIMPIE', stimpieId, qty: item.qty ?? 1, state },
      });
    }
  }
  if (o.returnedAt) {
    await prisma.orderEvent.create({ data: { orderId: order.id, fromStatus: 'DELIVERED', toStatus: 'RETURNED', createdAt: new Date(o.returnedAt) } });
  }
  return order;
}
