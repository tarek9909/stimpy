import type { AppContext } from '../context';
import { dayRangeInTz, isoOrNull, ymdInTz } from '../lib/dates';
import { HOUR, now } from '../lib/clock';
import { AppError } from '../lib/errors';
import { addDaysYmd } from '../lib/range';
import { deriveDropState, isDropEnded } from './drops';
import { outstandingCashCents } from './finance';
import { dailySeries } from './insights';
import { orderSummaryArgs, toOrderSummary, type AdminOrderSummaryDto } from './order-summary';

/**
 * Dashboard overview (api-reference 5.2). Day boundaries use the business timezone.
 * Definitions are recorded in DECISIONS.md ("overview"): `newOrders`/`toPack`/`outForDelivery` are CURRENT counts of orders in
 * NEW / CONFIRMED / OUT_FOR_DELIVERY (the cards link to those tabs); `cashToCollectCents` equals the finance "cash outstanding";
 * `revenueCents` and `sales7d` use the finance rule (delivered orders by `delivered_at`, item revenue).
 */
export const NEW_TOO_LONG_MS = 2 * HOUR;
export const OUT_TOO_LONG_MS = 48 * HOUR;
const MAX_ORDER_ATTENTION = 20;
const MAX_EMAIL_ATTENTION = 10;

export type AttentionType = 'NEW_TOO_LONG' | 'OUT_TOO_LONG' | 'LOW_STOCK' | 'HOLD_EXPIRED' | 'EMAIL_FAILED';
export type AttentionItem = {
  type: AttentionType;
  label: string;
  orderId: number | null;
  itemType: 'HOODIE_VARIANT' | 'STIMPIE' | null;
  itemId: number | null;
};
export type SetupItem = { key: string; label: string; hint: string; kind: 'AUTO' | 'REVIEW'; required: boolean; status: 'TODO' | 'DONE'; link: string };
export type Overview = {
  today: { newOrders: number; toPack: number; outForDelivery: number; cashToCollectCents: number; revenueCents: number };
  attention: AttentionItem[];
  liveDrop: { id: number; name: string; unitsTotal: number; unitsSold: number; endsAt: string | null } | null;
  sales7d: { date: string; orders: number; revenueCents: number }[];
  recentOrders: AdminOrderSummaryDto[];
  setup: { complete: boolean; items: SetupItem[] };
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
function ago(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  return hours >= 48 ? plural(Math.floor(hours / 24), 'day', 'days') : plural(Math.max(1, hours), 'hour', 'hours');
}

// ---------------------------------------------------------------- attention

async function orderAttention(ctx: AppContext, t: Date): Promise<AttentionItem[]> {
  const [newOrders, outOrders] = await Promise.all([
    ctx.prisma.order.findMany({ where: { status: 'NEW' }, orderBy: { placedAt: 'asc' }, select: { id: true, number: true, placedAt: true, holdExpiresAt: true } }),
    ctx.prisma.order.findMany({ where: { status: 'OUT_FOR_DELIVERY' }, orderBy: { outForDeliveryAt: 'asc' }, select: { id: true, number: true, placedAt: true, outForDeliveryAt: true } }),
  ]);
  const hold: AttentionItem[] = [];
  const newLong: AttentionItem[] = [];
  for (const o of newOrders) {
    const expired = o.holdExpiresAt !== null && o.holdExpiresAt.getTime() < t.getTime();
    if (expired) hold.push({ type: 'HOLD_EXPIRED', label: `Order ${o.number}: the stock hold has expired. Confirm, cancel or extend it.`, orderId: o.id, itemType: null, itemId: null });
    else if (t.getTime() - o.placedAt.getTime() > NEW_TOO_LONG_MS) {
      newLong.push({ type: 'NEW_TOO_LONG', label: `Order ${o.number} has been waiting for confirmation for ${ago(t.getTime() - o.placedAt.getTime())}.`, orderId: o.id, itemType: null, itemId: null });
    }
  }
  const outLong: AttentionItem[] = [];
  for (const o of outOrders) {
    const since = (o.outForDeliveryAt ?? o.placedAt).getTime();
    if (t.getTime() - since > OUT_TOO_LONG_MS) {
      outLong.push({ type: 'OUT_TOO_LONG', label: `Order ${o.number} has been out for delivery for ${ago(t.getTime() - since)}.`, orderId: o.id, itemType: null, itemId: null });
    }
  }
  return [...hold.slice(0, MAX_ORDER_ATTENTION), ...newLong.slice(0, MAX_ORDER_ATTENTION), ...outLong.slice(0, MAX_ORDER_ATTENTION)];
}

async function emailAttention(ctx: AppContext): Promise<AttentionItem[]> {
  const failed = await ctx.prisma.emailLog.findMany({
    where: { status: 'FAILED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_EMAIL_ATTENTION,
    select: { templateKey: true, toEmail: true, orderId: true, order: { select: { number: true } } },
  });
  return failed.map((e) => ({
    type: 'EMAIL_FAILED' as const,
    label: e.order ? `Email "${e.templateKey}" for order ${e.order.number} could not be sent.` : `Email "${e.templateKey}" to ${e.toEmail} could not be sent.`,
    orderId: e.orderId,
    itemType: null,
    itemId: null,
  }));
}

/**
 * Items at or below the low-stock threshold. Zero-stock variants that were never stocked (auto-created for a new colour or
 * size) are not alerts; an item with zero available is listed only if it ever held stock.
 */
async function lowStockAttention(ctx: AppContext, t: Date): Promise<AttentionItem[]> {
  const threshold = (await ctx.settings.get('orders')).lowStockThreshold;
  const [variants, stimpies, stocked] = await Promise.all([
    ctx.prisma.hoodieVariant.findMany({
      where: { hoodie: { active: true }, color: { active: true }, size: { active: true } },
      select: { id: true, quantity: true, reserved: true, hoodie: { select: { name: true } }, color: { select: { name: true, position: true } }, size: { select: { label: true, position: true } } },
    }),
    ctx.prisma.stimpie.findMany({
      where: { active: true },
      select: { id: true, name: true, quantity: true, reserved: true, position: true, drop: { select: { startsAt: true, endsAt: true, endedAt: true } } },
    }),
    ctx.prisma.stockMovement.findMany({ where: { field: 'QUANTITY', delta: { gt: 0 } }, distinct: ['variantId', 'stimpieId'], select: { variantId: true, stimpieId: true } }),
  ]);
  const stockedVariants = new Set(stocked.map((s) => s.variantId).filter((v): v is number => v !== null));
  const stockedStimpies = new Set(stocked.map((s) => s.stimpieId).filter((v): v is number => v !== null));
  const left = (n: number): string => (n <= 0 ? 'sold out' : `${n} left`);
  const items: (AttentionItem & { sort: [number, string] })[] = [];

  for (const v of variants) {
    const available = v.quantity - v.reserved;
    if (available > threshold || (available <= 0 && v.quantity === 0 && !stockedVariants.has(v.id))) continue;
    items.push({
      type: 'LOW_STOCK',
      label: `${v.hoodie.name}, ${v.color.name}, ${v.size.label}: ${left(available)}`,
      orderId: null,
      itemType: 'HOODIE_VARIANT',
      itemId: v.id,
      sort: [available, `${v.color.position}-${v.size.position}`],
    });
  }
  for (const s of stimpies) {
    const available = s.quantity - s.reserved;
    if (available > threshold) continue;
    if (available <= 0 && s.quantity === 0 && !stockedStimpies.has(s.id)) continue;
    if (s.drop && isDropEnded(s.drop, t)) continue; // an ended drop is never restocked
    items.push({ type: 'LOW_STOCK', label: `${s.name}: ${left(available)}`, orderId: null, itemType: 'STIMPIE', itemId: s.id, sort: [available, String(s.position).padStart(6, '0')] });
  }
  items.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1].localeCompare(b.sort[1]));
  return items.map(({ sort: _sort, ...rest }) => rest);
}

// ---------------------------------------------------------------- live drop

async function liveDrop(ctx: AppContext, t: Date): Promise<Overview['liveDrop']> {
  const drops = await ctx.prisma.drop.findMany({
    where: { startsAt: { lte: t }, endedAt: null },
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    include: { stimpies: { select: { id: true, active: true, quantity: true, reserved: true } } },
  });
  const live = drops.find((d) => deriveDropState(d, d.stimpies, t) === 'LIVE');
  if (!live) return null;
  const ids = live.stimpies.map((s) => s.id);
  const committed = await ctx.prisma.orderStockLine.aggregate({
    where: { stimpieId: { in: ids }, state: { in: ['RESERVED', 'SOLD'] } },
    _sum: { qty: true },
  });
  const sold = await ctx.prisma.orderStockLine.aggregate({ where: { stimpieId: { in: ids }, state: 'SOLD' }, _sum: { qty: true } });
  const active = live.stimpies.filter((s) => s.active);
  const onHand = active.reduce((sum, s) => sum + s.quantity, 0);
  // unitsTotal = units still on hand + units already sold; unitsSold = sold + reserved (promised to orders); remaining = total - sold.
  const unitsSold = committed._sum.qty ?? 0;
  return { id: live.id, name: live.name, unitsTotal: onHand + (sold._sum.qty ?? 0), unitsSold, endsAt: isoOrNull(live.endsAt) };
}

// ---------------------------------------------------------------- setup checklist

type Def = { key: string; kind: 'AUTO' | 'REVIEW'; required: boolean; label: string; hint: string; link: string };

export const SETUP_DEFS: Def[] = [
  { key: 'business_whatsapp', kind: 'AUTO', required: true, label: 'Add your WhatsApp number', hint: "Customers' WhatsApp confirmation opens a chat with this number.", link: '/settings?tab=business' },
  { key: 'contact_emails', kind: 'AUTO', required: true, label: 'Set your contact emails', hint: 'The support email, sender address and reply-to must be real addresses, not the placeholder ones ending in @stimpy.local.', link: '/settings?tab=business' },
  { key: 'founder_alerts', kind: 'AUTO', required: false, label: 'Turn on new-order alerts', hint: 'Add the email address that should get a message for every new order.', link: '/settings?tab=notifications' },
  { key: 'colors', kind: 'REVIEW', required: true, label: 'Review the hoodie colours', hint: 'The seeded colours are placeholders. Keep, rename or replace them.', link: '/products?tab=options' },
  { key: 'sizes', kind: 'REVIEW', required: true, label: 'Review the sizes', hint: 'Check the size list matches what you really sell.', link: '/products?tab=options' },
  { key: 'size_chart', kind: 'REVIEW', required: true, label: 'Review the size chart', hint: 'The measurements are placeholders. Enter the real numbers.', link: '/products?tab=size-chart' },
  { key: 'hoodie_price', kind: 'REVIEW', required: true, label: 'Review the hoodie price, cost and photos', hint: 'Check the price, your cost per hoodie and the product photos.', link: '/products?tab=hoodies' },
  { key: 'packs_prices', kind: 'REVIEW', required: true, label: 'Review the packs and Stimpie prices', hint: 'Check every pack price and the price and cost of each Stimpie.', link: '/products?tab=packs' },
  { key: 'delivery_fee', kind: 'REVIEW', required: true, label: 'Review the delivery fee and estimate text', hint: 'The default fee and the delivery estimate are placeholders.', link: '/deliveries?tab=fees' },
  { key: 'policies', kind: 'REVIEW', required: true, label: 'Review the policies', hint: 'Delivery and returns, care, terms and privacy texts are placeholders.', link: '/content?tab=policies' },
  { key: 'email_texts', kind: 'REVIEW', required: false, label: 'Review the email and WhatsApp texts', hint: 'Read the automatic messages your customers will receive and adjust the wording.', link: '/content?tab=emails' },
  { key: 'first_stock', kind: 'AUTO', required: true, label: 'Add your first stock', hint: 'At least one hoodie variant and one Stimpie need units in stock.', link: '/stock' },
  { key: 'builder_2d', kind: 'AUTO', required: false, label: 'Set up the 2D Builder', hint: 'Add a back-view hoodie image and placement for at least one colour.', link: '/content?tab=builder' },
  { key: 'builder_3d', kind: 'AUTO', required: false, label: 'Set up the 3D Builder', hint: 'Upload a 3D model and name its back-panel mesh.', link: '/content?tab=builder' },
];
export const REVIEW_KEYS = SETUP_DEFS.filter((d) => d.kind === 'REVIEW').map((d) => d.key);
const PLACEHOLDER_EMAIL = /@stimpy\.local$/i;

async function builderValue(ctx: AppContext, key: string): Promise<unknown> {
  return (await ctx.prisma.builderConfig.findUnique({ where: { key } }))?.value ?? null;
}

async function autoStatuses(ctx: AppContext): Promise<Record<string, boolean>> {
  const [business, email, notifications, variants, stimpies, colors, builderColors, model3d] = await Promise.all([
    ctx.settings.get('business'),
    ctx.settings.get('email'),
    ctx.settings.get('notifications'),
    ctx.prisma.hoodieVariant.findMany({ where: { quantity: { gt: 0 }, hoodie: { active: true } }, select: { quantity: true, reserved: true } }),
    ctx.prisma.stimpie.findMany({ where: { quantity: { gt: 0 }, active: true }, select: { quantity: true, reserved: true } }),
    ctx.prisma.color.findMany({ where: { active: true }, select: { id: true } }),
    builderValue(ctx, 'colors'),
    builderValue(ctx, 'model3d'),
  ]);
  const real = (v: string | null | undefined): boolean => Boolean(v && v.trim() && !PLACEHOLDER_EMAIL.test(v.trim()));
  const activeIds = new Set(colors.map((c) => c.id));
  const colorEntries = (Array.isArray(builderColors) ? builderColors : []) as { colorId?: unknown; hoodieImage2d?: unknown; placement2d?: unknown }[];
  const m = (model3d && typeof model3d === 'object' ? model3d : null) as { url?: unknown; backPanelMesh?: unknown } | null;
  return {
    business_whatsapp: Boolean(business.whatsappNumber),
    contact_emails: real(business.supportEmail) && real(email.senderAddress) && real(email.replyTo),
    founder_alerts: Boolean(notifications.founderEmail),
    first_stock: variants.some((v) => v.quantity - v.reserved > 0) && stimpies.some((s) => s.quantity - s.reserved > 0),
    builder_2d: colorEntries.some((c) => typeof c.colorId === 'number' && activeIds.has(c.colorId) && typeof c.hoodieImage2d === 'string' && c.hoodieImage2d !== '' && c.placement2d && typeof c.placement2d === 'object'),
    builder_3d: Boolean(m && typeof m.url === 'string' && m.url && typeof m.backPanelMesh === 'string' && m.backPanelMesh.trim()),
  };
}

export async function setupChecklist(ctx: AppContext): Promise<Overview['setup']> {
  const [auto, setup] = await Promise.all([autoStatuses(ctx), ctx.settings.get('setup')]);
  const reviewed = new Set(setup.reviewed);
  const items: SetupItem[] = SETUP_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    hint: d.hint,
    kind: d.kind,
    required: d.required,
    status: (d.kind === 'AUTO' ? auto[d.key] : reviewed.has(d.key)) ? 'DONE' : 'TODO',
    link: d.link,
  }));
  return { complete: items.filter((i) => i.required).every((i) => i.status === 'DONE'), items };
}

/** `POST /admin/setup/:key/done`: only REVIEW items can be marked; AUTO keys are VALIDATION_ERROR, unknown keys NOT_FOUND. */
export async function markSetupReviewed(ctx: AppContext, key: string, done: boolean): Promise<void> {
  const def = SETUP_DEFS.find((d) => d.key === key);
  if (!def) throw AppError.notFound('Unknown setup item.');
  if (def.kind !== 'REVIEW') throw AppError.validation({ key: 'This item is checked automatically from your data.' });
  const current = new Set((await ctx.settings.get('setup')).reviewed);
  if (done) current.add(key);
  else current.delete(key);
  await ctx.settings.update({ setup: { reviewed: [...current] } });
}

// ---------------------------------------------------------------- overview

export async function getOverview(ctx: AppContext): Promise<Overview> {
  const t = now();
  const tz = (await ctx.settings.get('business')).timezone;
  const today = ymdInTz(t, tz);
  const todayRange = dayRangeInTz(today, tz);
  const firstDay = addDaysYmd(today, -6);
  const weekStart = dayRangeInTz(firstDay, tz).start;

  const [byStatus, revenueToday, cash, weekOrders, orderAtt, emailAtt, lowStock, drop, recent, setup] = await Promise.all([
    ctx.prisma.order.groupBy({ by: ['status'], where: { status: { in: ['NEW', 'CONFIRMED', 'OUT_FOR_DELIVERY'] } }, _count: { _all: true } }),
    ctx.prisma.order.aggregate({ where: { status: 'DELIVERED', deliveredAt: { gte: todayRange.start, lt: todayRange.end } }, _sum: { subtotalCents: true } }),
    outstandingCashCents(ctx.prisma),
    ctx.prisma.order.findMany({ where: { status: 'DELIVERED', deliveredAt: { gte: weekStart, lt: todayRange.end } }, select: { deliveredAt: true, subtotalCents: true } }),
    orderAttention(ctx, t),
    emailAttention(ctx),
    lowStockAttention(ctx, t),
    liveDrop(ctx, t),
    ctx.prisma.order.findMany({ orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: 10, ...orderSummaryArgs }),
    setupChecklist(ctx),
  ]);
  const count = (s: string): number => byStatus.find((r) => r.status === s)?._count._all ?? 0;

  // attention order: most urgent first (expired holds), stock last
  const attention = [...orderAtt.filter((a) => a.type === 'HOLD_EXPIRED'), ...orderAtt.filter((a) => a.type === 'NEW_TOO_LONG'), ...orderAtt.filter((a) => a.type === 'OUT_TOO_LONG'), ...emailAtt, ...lowStock];

  return {
    today: {
      newOrders: count('NEW'),
      toPack: count('CONFIRMED'),
      outForDelivery: count('OUT_FOR_DELIVERY'),
      cashToCollectCents: cash,
      revenueCents: revenueToday._sum.subtotalCents ?? 0,
    },
    attention,
    liveDrop: drop,
    sales7d: dailySeries(
      weekOrders.map((o) => ({ at: o.deliveredAt!, revenueCents: o.subtotalCents })),
      { from: firstDay, to: today, start: weekStart, end: todayRange.end, timezone: tz },
    ),
    recentOrders: recent.map((o) => toOrderSummary(o, t)),
    setup,
  };
}
