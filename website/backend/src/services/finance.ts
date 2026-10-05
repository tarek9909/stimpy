import type { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import type { Db } from '../lib/db';
import { ymdInTz } from '../lib/dates';
import { addMs, DAY, now } from '../lib/clock';
import { dateColumnFilter, instantFilter, type DateRange } from '../lib/range';

/**
 * Finance calculations (business-rules section 11). All figures in cents; "in range" uses the business timezone.
 *  - Revenue         = sum of `subtotal_cents` of DELIVERED orders whose `delivered_at` is in range (item revenue only)
 *  - Delivery fees   = sum of `delivery_fee_cents` of those orders (shown separately, never counted as profit)
 *  - Cost of goods   = sum of `cost_cents` of those orders (snapshots taken at order time)
 *  - Expenses / ad spend = `spent_on` in range
 *  - Profit          = revenue - cost of goods - expenses - ad spend
 *  - Cash outstanding= sum of `total_cents` of DELIVERED orders with `cash_settled = false`
 * Statuses are the CURRENT statuses: an order that was delivered and later RETURNED no longer counts.
 */
export const PLAN_MARGINS = { pack35: 1800, pack45: 2200 } as const;
/** The cash view also lists orders settled within this many days so the dashboard can show (and undo) recent settlements. */
export const SETTLED_VISIBLE_DAYS = 30;

export function deliveredWhere(range: DateRange): Prisma.OrderWhereInput {
  const f = instantFilter(range);
  return { status: 'DELIVERED', ...(f ? { deliveredAt: f } : {}) };
}

export type ProfitReport = {
  range: { from: string | null; to: string | null };
  note: string;
  revenueCents: number;
  deliveryFeesCents: number;
  costOfGoodsCents: number;
  expensesCents: number;
  adSpendCents: number;
  profitCents: number;
  ordersCount: number;
  byOrder: { orderNumber: string; date: string; revenueCents: number; costCents: number; profitCents: number }[];
  planMargins: { pack35: number; pack45: number };
};

export async function sumExpenses(db: Db, range: Pick<DateRange, 'from' | 'to'>): Promise<number> {
  const f = dateColumnFilter(range);
  const r = await db.expense.aggregate({ where: f ? { spentOn: f } : {}, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}
export async function sumAdSpend(db: Db, range: Pick<DateRange, 'from' | 'to'>): Promise<number> {
  const f = dateColumnFilter(range);
  const r = await db.adSpend.aggregate({ where: f ? { spentOn: f } : {}, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}

export async function profitReport(ctx: AppContext, range: DateRange): Promise<ProfitReport> {
  const orders = await ctx.prisma.order.findMany({
    where: deliveredWhere(range),
    orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
    select: { number: true, subtotalCents: true, deliveryFeeCents: true, costCents: true, deliveredAt: true, placedAt: true },
  });
  const [expensesCents, adSpendCents] = await Promise.all([sumExpenses(ctx.prisma, range), sumAdSpend(ctx.prisma, range)]);
  let revenueCents = 0;
  let deliveryFeesCents = 0;
  let costOfGoodsCents = 0;
  for (const o of orders) {
    revenueCents += o.subtotalCents;
    deliveryFeesCents += o.deliveryFeeCents;
    costOfGoodsCents += o.costCents;
  }
  return {
    range: { from: range.from, to: range.to },
    note: 'Based on current order statuses. Revenue counts delivered orders in this range.',
    revenueCents,
    deliveryFeesCents,
    costOfGoodsCents,
    expensesCents,
    adSpendCents,
    profitCents: revenueCents - costOfGoodsCents - expensesCents - adSpendCents,
    ordersCount: orders.length,
    byOrder: orders.map((o) => ({
      orderNumber: o.number,
      date: ymdInTz(o.deliveredAt ?? o.placedAt, range.timezone),
      revenueCents: o.subtotalCents,
      costCents: o.costCents,
      profitCents: o.subtotalCents - o.costCents,
    })),
    planMargins: { ...PLAN_MARGINS },
  };
}

export type CashReport = {
  outstandingCents: number;
  groups: { deliveryNumber: string | null; orders: { orderId: number; orderNumber: string; cashDueCents: number; settled: boolean }[]; totalDueCents: number }[];
};

/** Cash outstanding = DELIVERED and not settled. `groups` also carries recently settled orders (`settled: true`) so settlements can be undone. */
export async function outstandingCashCents(db: Db): Promise<number> {
  const r = await db.order.aggregate({ where: { status: 'DELIVERED', cashSettled: false }, _sum: { totalCents: true } });
  return r._sum.totalCents ?? 0;
}

export async function cashReport(ctx: AppContext): Promise<CashReport> {
  const since = addMs(now(), -SETTLED_VISIBLE_DAYS * DAY);
  const orders = await ctx.prisma.order.findMany({
    where: { status: 'DELIVERED', OR: [{ cashSettled: false }, { deliveredAt: { gte: since } }] },
    orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }],
    select: { id: true, number: true, totalCents: true, cashSettled: true, deliveryNumber: true },
  });
  const groups = new Map<string | null, CashReport['groups'][number]>();
  for (const o of orders) {
    const key = o.deliveryNumber && o.deliveryNumber.trim() ? o.deliveryNumber : null;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { deliveryNumber: key, orders: [], totalDueCents: 0 }));
    g.orders.push({ orderId: o.id, orderNumber: o.number, cashDueCents: o.totalCents, settled: o.cashSettled });
    if (!o.cashSettled) g.totalDueCents += o.totalCents;
  }
  const list = [...groups.values()].sort((a, b) => {
    if (a.deliveryNumber === null || b.deliveryNumber === null) return a.deliveryNumber === null ? (b.deliveryNumber === null ? 0 : 1) : -1;
    return a.deliveryNumber.localeCompare(b.deliveryNumber, 'en', { numeric: true });
  });
  return { outstandingCents: await outstandingCashCents(ctx.prisma), groups: list };
}
