import type { OrderSource } from '@prisma/client';
import type { AppContext } from '../context';
import { weekdayInTz, ymdInTz } from '../lib/dates';
import { addDaysYmd, dateColumnFilter, instantFilter, type DateRange } from '../lib/range';
import { deliveredWhere } from './finance';

/**
 * Insights (api-reference 5.10, business-rules 11). Same status rule as finance: figures are about DELIVERED orders whose
 * `delivered_at` is in range (current statuses), in the business timezone. Ratios are fractions 0..1 (never percentages).
 * Weekday 0 = Sunday. The funnel figures (`deliverySuccessRate`, `returnRate`) also look at RETURNED and
 * cancelled-after-dispatch orders; a returned order is dated by its RETURNED event (fallbacks: delivered, dispatched, placed).
 */
const SOURCES: OrderSource[] = ['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MANUAL'];
const MAX_ZERO_FILL_DAYS = 3660;

const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);

type StimpieLine = { orderItemId: number; qty: number; stimpieId: number | null; stimpie: { name: string; dropId: number | null; drop: { name: string } | null } | null };
type RevenueShare = { stimpieId: number; name: string; dropId: number | null; dropName: string | null; units: number; revenueCents: number };

/**
 * A pack's (or single Stimpie's) revenue is split equally per Stimpie UNIT it contains (integer cents; the remainder goes
 * to the first units in stimpie-id order), so a drop's revenue is the share of sales that came from its Stimpies.
 */
export function allocateStimpieRevenue(items: { id: number; qty: number; unitPriceCents: number }[], lines: StimpieLine[]): RevenueShare[] {
  const out = new Map<number, RevenueShare>();
  for (const item of items) {
    const itemLines = lines.filter((l) => l.orderItemId === item.id && l.stimpie && l.stimpieId !== null).sort((a, b) => a.stimpieId! - b.stimpieId!);
    const units = itemLines.reduce((s, l) => s + l.qty, 0);
    if (units === 0) continue;
    const total = item.unitPriceCents * item.qty;
    const base = Math.floor(total / units);
    let rem = total - base * units;
    for (const l of itemLines) {
      const extra = Math.min(rem, l.qty);
      rem -= extra;
      const share = out.get(l.stimpieId!) ?? { stimpieId: l.stimpieId!, name: l.stimpie!.name, dropId: l.stimpie!.dropId, dropName: l.stimpie!.drop?.name ?? null, units: 0, revenueCents: 0 };
      share.units += l.qty;
      share.revenueCents += base * l.qty + extra;
      out.set(l.stimpieId!, share);
    }
  }
  return [...out.values()];
}

const deliveredOrderArgs = {
  select: {
    id: true,
    customerId: true,
    deliveredAt: true,
    placedAt: true,
    subtotalCents: true,
    source: true,
    utmSource: true,
    utmCampaign: true,
    areaName: true,
    area: { select: { name: true } },
    items: { select: { id: true, kind: true, name: true, qty: true, unitPriceCents: true, detail: true }, orderBy: { id: 'asc' as const } },
    stockLines: {
      where: { itemType: 'STIMPIE' as const },
      select: { orderItemId: true, qty: true, stimpieId: true, stimpie: { select: { name: true, dropId: true, drop: { select: { name: true } } } } },
      orderBy: { id: 'asc' as const },
    },
  },
};

// ---------------------------------------------------------------- sales

export type SalesInsights = {
  series: { date: string; orders: number; revenueCents: number }[];
  byDrop: { dropName: string; orders: number; revenueCents: number }[];
  bySource: { source: OrderSource; orders: number; revenueCents: number }[];
  byCampaign: { utmSource: string | null; utmCampaign: string | null; orders: number; revenueCents: number }[];
  byWeekday: { weekday: number; orders: number }[];
};

/** Days from `start` to `end` inclusive as YYYY-MM-DD (bounded). */
export function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let d = start; d <= end && days.length <= MAX_ZERO_FILL_DAYS; d = addDaysYmd(d, 1)) days.push(d);
  return days;
}

/** Daily orders and revenue for the range, zero-filled between the first and last day (open bounds use the data's own first/last day). */
export function dailySeries(rows: { at: Date; revenueCents: number }[], range: DateRange): { date: string; orders: number; revenueCents: number }[] {
  const byDay = new Map<string, { orders: number; revenueCents: number }>();
  for (const r of rows) {
    const day = ymdInTz(r.at, range.timezone);
    const e = byDay.get(day) ?? { orders: 0, revenueCents: 0 };
    e.orders += 1;
    e.revenueCents += r.revenueCents;
    byDay.set(day, e);
  }
  const keys = [...byDay.keys()].sort();
  const start = range.from ?? keys[0];
  const end = range.to ?? keys[keys.length - 1];
  if (!start || !end || end < start) return [];
  const span = daysBetween(start, end);
  const days = span.length > MAX_ZERO_FILL_DAYS ? keys : span;
  return days.map((date) => ({ date, ...(byDay.get(date) ?? { orders: 0, revenueCents: 0 }) }));
}

export async function salesInsights(ctx: AppContext, range: DateRange): Promise<SalesInsights> {
  const orders = await ctx.prisma.order.findMany({ where: deliveredWhere(range), ...deliveredOrderArgs, orderBy: { id: 'asc' } });
  const at = (o: { deliveredAt: Date | null; placedAt: Date }): Date => o.deliveredAt ?? o.placedAt;

  const series = dailySeries(orders.map((o) => ({ at: at(o), revenueCents: o.subtotalCents })), range);

  const sourceAgg = new Map<OrderSource, { orders: number; revenueCents: number }>(SOURCES.map((s) => [s, { orders: 0, revenueCents: 0 }]));
  const campaigns = new Map<string, { utmSource: string | null; utmCampaign: string | null; orders: number; revenueCents: number }>();
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0 }));
  const drops = new Map<string, { dropName: string; orderIds: Set<number>; revenueCents: number }>();

  for (const o of orders) {
    const s = sourceAgg.get(o.source)!;
    s.orders += 1;
    s.revenueCents += o.subtotalCents;

    const key = JSON.stringify([o.utmSource, o.utmCampaign]);
    const c = campaigns.get(key) ?? { utmSource: o.utmSource, utmCampaign: o.utmCampaign, orders: 0, revenueCents: 0 };
    c.orders += 1;
    c.revenueCents += o.subtotalCents;
    campaigns.set(key, c);

    weekdays[weekdayInTz(at(o), range.timezone)]!.orders += 1;

    for (const share of allocateStimpieRevenue(o.items, o.stockLines)) {
      if (!share.dropName || share.dropId === null) continue;
      const d = drops.get(String(share.dropId)) ?? { dropName: share.dropName, orderIds: new Set<number>(), revenueCents: 0 };
      d.orderIds.add(o.id);
      d.revenueCents += share.revenueCents;
      drops.set(String(share.dropId), d);
    }
  }

  return {
    series,
    byDrop: [...drops.values()]
      .map((d) => ({ dropName: d.dropName, orders: d.orderIds.size, revenueCents: d.revenueCents }))
      .sort((a, b) => b.revenueCents - a.revenueCents || b.orders - a.orders || a.dropName.localeCompare(b.dropName)),
    bySource: SOURCES.map((source) => ({ source, ...sourceAgg.get(source)! })),
    byCampaign: [...campaigns.values()].sort(
      (a, b) =>
        b.revenueCents - a.revenueCents ||
        b.orders - a.orders ||
        (a.utmSource ?? '').localeCompare(b.utmSource ?? '') ||
        (a.utmCampaign ?? '').localeCompare(b.utmCampaign ?? ''),
    ),
    byWeekday: weekdays,
  };
}

// ---------------------------------------------------------------- products

export type ProductInsights = {
  stimpies: { name: string; unitsSold: number; revenueCents: number }[];
  packMix: { packName: string; orders: number }[];
  extraStimpieAttachRate: number;
  sizes: { label: string; units: number }[];
  colors: { name: string; units: number }[];
};

export async function productInsights(ctx: AppContext, range: DateRange): Promise<ProductInsights> {
  const orders = await ctx.prisma.order.findMany({ where: deliveredWhere(range), ...deliveredOrderArgs, orderBy: { id: 'asc' } });
  const stimpies = new Map<number, RevenueShare>();
  const packOrders = new Map<string, Set<number>>();
  const sizes = new Map<string, number>();
  const colors = new Map<string, number>();
  let hoodieUnits = 0;
  let extraUnits = 0;

  for (const o of orders) {
    for (const share of allocateStimpieRevenue(o.items, o.stockLines)) {
      const e = stimpies.get(share.stimpieId);
      if (e) {
        e.units += share.units;
        e.revenueCents += share.revenueCents;
      } else stimpies.set(share.stimpieId, { ...share });
    }
    for (const it of o.items) {
      if (it.kind === 'STIMPIE') {
        extraUnits += it.qty;
        continue;
      }
      hoodieUnits += it.qty; // a pack and a hoodie-only line each carry exactly one hoodie
      if (it.kind === 'PACK') {
        const set = packOrders.get(it.name) ?? new Set<number>();
        set.add(o.id);
        packOrders.set(it.name, set);
      }
      const d = (it.detail && typeof it.detail === 'object' ? it.detail : {}) as { size?: unknown; color?: unknown };
      if (typeof d.size === 'string' && d.size) sizes.set(d.size, (sizes.get(d.size) ?? 0) + it.qty);
      if (typeof d.color === 'string' && d.color) colors.set(d.color, (colors.get(d.color) ?? 0) + it.qty);
    }
  }

  return {
    stimpies: [...stimpies.values()]
      .map((s) => ({ name: s.name, unitsSold: s.units, revenueCents: s.revenueCents }))
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenueCents - a.revenueCents || a.name.localeCompare(b.name)),
    packMix: [...packOrders.entries()].map(([packName, set]) => ({ packName, orders: set.size })).sort((a, b) => b.orders - a.orders || a.packName.localeCompare(b.packName)),
    extraStimpieAttachRate: ratio(extraUnits, hoodieUnits),
    sizes: [...sizes.entries()].map(([label, units]) => ({ label, units })).sort((a, b) => b.units - a.units || a.label.localeCompare(b.label)),
    colors: [...colors.entries()].map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------- customers

export type CustomerInsights = {
  repeatRate: number;
  byArea: { areaName: string; orders: number }[];
  deliverySuccessRate: number;
  returnRate: number;
};

function inRange(d: Date, r: DateRange): boolean {
  return (!r.start || d >= r.start) && (!r.end || d < r.end);
}

export async function customerInsights(ctx: AppContext, range: DateRange): Promise<CustomerInsights> {
  const delivered = await ctx.prisma.order.findMany({
    where: deliveredWhere(range),
    orderBy: { id: 'asc' },
    select: { customerId: true, areaName: true, area: { select: { name: true } } },
  });
  const perCustomer = new Map<number, number>();
  const areas = new Map<string, { areaName: string; orders: number }>();
  for (const o of delivered) {
    perCustomer.set(o.customerId, (perCustomer.get(o.customerId) ?? 0) + 1);
    const label = (o.area?.name ?? o.areaName).trim() || 'Unknown';
    const key = label.toLowerCase();
    const a = areas.get(key) ?? { areaName: label, orders: 0 };
    a.orders += 1;
    areas.set(key, a);
  }
  const repeat = [...perCustomer.values()].filter((n) => n >= 2).length;

  const [returned, cancelled] = await Promise.all([
    ctx.prisma.order.findMany({
      where: { status: 'RETURNED' },
      select: { deliveredAt: true, outForDeliveryAt: true, placedAt: true, events: { where: { toStatus: 'RETURNED' }, select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
    }),
    ctx.prisma.order.findMany({
      where: { status: 'CANCELLED', outForDeliveryAt: { not: null } },
      select: { cancelledAt: true, outForDeliveryAt: true },
    }),
  ]);
  const returnedCount = returned.filter((o) => inRange(o.events[0]?.createdAt ?? o.deliveredAt ?? o.outForDeliveryAt ?? o.placedAt, range)).length;
  const cancelledAfterDispatch = cancelled.filter((o) => inRange(o.cancelledAt ?? o.outForDeliveryAt!, range)).length;

  return {
    repeatRate: ratio(repeat, perCustomer.size),
    byArea: [...areas.values()].sort((a, b) => b.orders - a.orders || a.areaName.localeCompare(b.areaName)),
    deliverySuccessRate: ratio(delivered.length, delivered.length + returnedCount + cancelledAfterDispatch),
    returnRate: ratio(returnedCount, delivered.length + returnedCount),
  };
}

// ---------------------------------------------------------------- first-touch acquisition

export type AcquisitionInsights = {
  bySource: { source: string; customers: number; revenueCents: number; adSpendCents: number; costPerCustomerCents: number | null; roas: number | null }[];
  byCampaign: { source: string; campaign: string; customers: number; revenueCents: number }[];
  unmatchedAdSpendCents: number;
};

const acquisitionSource = (firstUtmSource: string | null, firstSource: string | null): string => firstUtmSource?.trim() || firstSource?.trim() || 'Unknown';
const acquisitionCampaign = (value: string | null): string => value?.trim() || 'Unknown';
const normalizedKey = (value: string): string => value.trim().toLocaleLowerCase();

/** New-customer counts use firstTouchAt; delivered revenue and ad spend use their own event dates in the selected range. */
export async function acquisitionInsights(ctx: AppContext, range: DateRange): Promise<AcquisitionInsights> {
  const customerDate = instantFilter(range);
  const spendDate = dateColumnFilter(range);
  const [newCustomers, deliveredOrders, spendRows] = await Promise.all([
    ctx.prisma.customer.findMany({ where: { firstTouchAt: customerDate ?? { not: null } }, select: { firstSource: true, firstUtmSource: true, firstUtmCampaign: true } }),
    ctx.prisma.order.findMany({ where: deliveredWhere(range), select: { subtotalCents: true, customer: { select: { firstSource: true, firstUtmSource: true, firstUtmCampaign: true } } } }),
    ctx.prisma.adSpend.groupBy({ by: ['channel'], where: spendDate ? { spentOn: spendDate } : {}, _sum: { amountCents: true } }),
  ]);

  const sourceRows = new Map<string, { source: string; customers: number; revenueCents: number; adSpendCents: number }>();
  const campaignRows = new Map<string, { source: string; campaign: string; customers: number; revenueCents: number }>();
  const sourceRow = (source: string) => {
    const key = normalizedKey(source);
    let row = sourceRows.get(key);
    if (!row) sourceRows.set(key, (row = { source, customers: 0, revenueCents: 0, adSpendCents: 0 }));
    return row;
  };
  const campaignRow = (source: string, campaign: string) => {
    const key = JSON.stringify([normalizedKey(source), normalizedKey(campaign)]);
    let row = campaignRows.get(key);
    if (!row) campaignRows.set(key, (row = { source, campaign, customers: 0, revenueCents: 0 }));
    return row;
  };
  for (const customer of newCustomers) {
    const source = acquisitionSource(customer.firstUtmSource, customer.firstSource);
    sourceRow(source).customers++;
    campaignRow(source, acquisitionCampaign(customer.firstUtmCampaign)).customers++;
  }
  for (const order of deliveredOrders) {
    const source = acquisitionSource(order.customer.firstUtmSource, order.customer.firstSource);
    const campaign = acquisitionCampaign(order.customer.firstUtmCampaign);
    sourceRow(source).revenueCents += order.subtotalCents;
    campaignRow(source, campaign).revenueCents += order.subtotalCents;
  }

  let unmatchedAdSpendCents = 0;
  for (const spend of spendRows) {
    const row = sourceRows.get(normalizedKey(spend.channel));
    const amount = spend._sum.amountCents ?? 0;
    if (row) row.adSpendCents += amount;
    else unmatchedAdSpendCents += amount;
  }

  const bySource = [...sourceRows.values()].map((row) => ({
    ...row,
    costPerCustomerCents: row.customers > 0 ? Math.round(row.adSpendCents / row.customers) : null,
    roas: row.adSpendCents > 0 ? row.revenueCents / row.adSpendCents : null,
  })).sort((a, b) => b.revenueCents - a.revenueCents || b.customers - a.customers || a.source.localeCompare(b.source));
  const byCampaign = [...campaignRows.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.customers - a.customers || a.source.localeCompare(b.source) || a.campaign.localeCompare(b.campaign));
  return { bySource, byCampaign, unmatchedAdSpendCents };
}
