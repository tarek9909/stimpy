import type { Prisma } from '@prisma/client';
import type { AppContext } from '../../context';
import { likeEscape } from '../../lib/like';
import { AppError } from '../../lib/errors';
import { toPage, toSkipTake, type PageQuery } from '../../lib/http';
import { duplicateDeliveryOrderIds, changeStatus } from '../../services/orders';

// ---------------------------------------------------------------- public: fees

/** `GET /delivery/fees`: active areas with their fee (null = use the default) and estimate. */
export async function publicDeliveryFees(ctx: AppContext) {
  const [delivery, areas] = await Promise.all([
    ctx.settings.get('delivery'),
    ctx.prisma.area.findMany({ where: { active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  ]);
  return {
    defaultFeeCents: delivery.defaultFeeCents,
    areas: areas.map((a) => ({ id: a.id, name: a.name, feeCents: a.feeCents, estDays: a.estDays })),
    estimateText: delivery.estimateText,
  };
}

// ---------------------------------------------------------------- admin: deliveries list

export async function listDeliveries(ctx: AppContext, q: PageQuery & { tab: 'OUT' | 'DELIVERED'; q?: string }) {
  const where: Prisma.OrderWhereInput = { status: q.tab === 'OUT' ? 'OUT_FOR_DELIVERY' : 'DELIVERED' };
  if (q.q) {
    const term = q.q.trim();
    const lt = likeEscape(term);
    const digits = term.replace(/[^\d]/g, '');
    where.OR = [
      { number: { contains: lt } },
      { deliveryNumber: { contains: lt } },
      { customerName: { contains: lt } },
      { areaName: { contains: lt } },
      { address: { contains: lt } },
      ...(digits.length >= 3 ? [{ contactPhone: { contains: digits } }] : []),
      ...(/^\d+$/.test(term) ? [{ number: { endsWith: `-${Number(term)}` } }] : []),
    ];
  }
  const [rows, total] = await Promise.all([
    // grouped by delivery number so a run's orders sit together on the page
    ctx.prisma.order.findMany({ where, orderBy: [{ deliveryNumber: 'asc' }, { id: 'asc' }], ...toSkipTake(q) }),
    ctx.prisma.order.count({ where }),
  ]);
  return toPage(
    rows.map((o) => ({
      orderId: o.id,
      orderNumber: o.number,
      deliveryNumber: o.deliveryNumber,
      customerName: o.customerName,
      phone: o.contactPhone,
      areaName: o.areaName,
      address: o.address,
      cashDueCents: o.totalCents,
      status: o.status as 'OUT_FOR_DELIVERY' | 'DELIVERED',
      cashSettled: o.cashSettled,
    })),
    total,
    q,
  );
}

// ---------------------------------------------------------------- admin: dispatch and settle

export type DispatchWarning = { deliveryNumber: string; orderIds: number[] };

/** Sends several PACKED orders out at once; each is its own transaction. Shared numbers are allowed and reported. */
export async function dispatchOrders(ctx: AppContext, input: { orders: { orderId: number; deliveryNumber: string }[]; userId: number }) {
  const dispatched: number[] = [];
  const failed: { orderId: number; code: string }[] = [];
  const numbers = new Map<string, number[]>();
  for (const o of input.orders) {
    try {
      await changeStatus(ctx, { orderId: o.orderId, to: 'OUT_FOR_DELIVERY', userId: input.userId, deliveryNumber: o.deliveryNumber });
      dispatched.push(o.orderId);
      const dn = o.deliveryNumber.trim();
      numbers.set(dn, [...(numbers.get(dn) ?? []), o.orderId]);
    } catch (err) {
      failed.push({ orderId: o.orderId, code: err instanceof AppError ? err.code : 'INTERNAL' });
      if (!(err instanceof AppError)) throw err;
    }
  }
  const warnings: DispatchWarning[] = [];
  for (const [deliveryNumber, ids] of numbers) {
    const others = await duplicateDeliveryOrderIds(ctx.prisma, deliveryNumber, 0);
    const all = [...new Set([...ids, ...others])].sort((a, b) => a - b);
    if (all.length > 1) warnings.push({ deliveryNumber, orderIds: all });
  }
  return { dispatched, failed, warnings };
}

/** Marks cash settled (or not) for every delivered order that carries this delivery number. */
export async function settleDelivery(ctx: AppContext, input: { deliveryNumber: string; settled: boolean; userId: number }): Promise<{ orderIds: number[] }> {
  const deliveryNumber = input.deliveryNumber.trim();
  const exists = await ctx.prisma.order.count({ where: { deliveryNumber, status: 'DELIVERED' } });
  if (!exists) throw AppError.notFound('No delivered orders have that delivery number.');
  await ctx.prisma.$transaction(async (tx) => {
    const candidates = await tx.order.findMany({
      where: { deliveryNumber, status: 'DELIVERED', cashCollected: true, cashSettled: !input.settled },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const order of candidates) {
      const changed = await tx.order.updateMany({
        where: { id: order.id, deliveryNumber, status: 'DELIVERED', cashCollected: true, cashSettled: !input.settled },
        data: { cashSettled: input.settled },
      });
      if (changed.count === 1) {
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            fromStatus: 'DELIVERED',
            toStatus: 'DELIVERED',
            userId: input.userId,
            note: input.settled ? `Cash marked settled (delivery ${deliveryNumber})` : `Cash marked not settled (delivery ${deliveryNumber})`,
          },
        });
      }
    }
  });
  const finalOrders = await ctx.prisma.order.findMany({
    where: { deliveryNumber, status: 'DELIVERED', cashCollected: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return { orderIds: finalOrders.map((o) => o.id) };
}

// ---------------------------------------------------------------- admin: areas

type AreaRow = { id: number; name: string; feeCents: number | null; estDays: number | null; active: boolean };
export const toAreaDto = (a: AreaRow) => ({ id: a.id, name: a.name, feeCents: a.feeCents, estDays: a.estDays, active: a.active });

export async function listAreas(ctx: AppContext, q: PageQuery & { active?: boolean }) {
  const where: Prisma.AreaWhereInput = q.active === undefined ? {} : { active: q.active };
  const [rows, total] = await Promise.all([
    ctx.prisma.area.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...toSkipTake(q) }),
    ctx.prisma.area.count({ where }),
  ]);
  return toPage(rows.map(toAreaDto), total, q);
}

async function ensureNameFree(ctx: AppContext, name: string, exceptId?: number): Promise<void> {
  const clash = await ctx.prisma.area.findFirst({ where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw AppError.conflict('There is already an area with that name.', 'name');
}

export async function createArea(ctx: AppContext, input: { name: string; feeCents?: number | null; estDays?: number | null; active?: boolean }) {
  const name = input.name.trim();
  await ensureNameFree(ctx, name);
  const row = await ctx.prisma.area.create({ data: { name, feeCents: input.feeCents ?? null, estDays: input.estDays ?? null, active: input.active ?? true } });
  return toAreaDto(row);
}

export async function getArea(ctx: AppContext, id: number) {
  const row = await ctx.prisma.area.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Area not found.');
  return toAreaDto(row);
}

export async function updateArea(ctx: AppContext, id: number, input: { name?: string; feeCents?: number | null; estDays?: number | null; active?: boolean }) {
  await getArea(ctx, id);
  const data: Prisma.AreaUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    await ensureNameFree(ctx, name, id);
    data.name = name;
  }
  if (input.feeCents !== undefined) data.feeCents = input.feeCents;
  if (input.estDays !== undefined) data.estDays = input.estDays;
  if (input.active !== undefined) data.active = input.active;
  return toAreaDto(await ctx.prisma.area.update({ where: { id }, data }));
}

/** Refused with CONFLICT when any order used the area (hide it instead); customers' remembered area is simply cleared. */
export async function deleteArea(ctx: AppContext, id: number): Promise<void> {
  await getArea(ctx, id);
  const used = await ctx.prisma.order.count({ where: { areaId: id } });
  if (used > 0) throw AppError.conflict('Used by past orders. Hide it instead.');
  await ctx.prisma.$transaction(async (tx) => {
    await tx.customer.updateMany({ where: { areaId: id }, data: { areaId: null } });
    await tx.area.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------- admin: delivery settings

export async function getDeliverySettings(ctx: AppContext) {
  const d = await ctx.settings.get('delivery');
  return { defaultFeeCents: d.defaultFeeCents, estimateText: d.estimateText };
}

export async function updateDeliverySettings(ctx: AppContext, patch: { defaultFeeCents?: number; estimateText?: string }) {
  const clean: { defaultFeeCents?: number; estimateText?: string } = {};
  if (patch.defaultFeeCents !== undefined) clean.defaultFeeCents = patch.defaultFeeCents;
  if (patch.estimateText !== undefined) clean.estimateText = patch.estimateText;
  const all = await ctx.settings.update({ delivery: clean });
  return { defaultFeeCents: all.delivery.defaultFeeCents, estimateText: all.delivery.estimateText };
}
