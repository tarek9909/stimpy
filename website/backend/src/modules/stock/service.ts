import type { Prisma } from '@prisma/client';
import type { AppContext } from '../../context';
import { iso, startOfDayInTz } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { toPage, toSkipTake, type PageQuery } from '../../lib/http';
import { toColorDto, toSizeDto } from '../options/service';

/** Read side of the admin stock API (api-reference 5.5). Writes go through services/stock.ts. */

export async function stockHoodies(ctx: AppContext, q: PageQuery) {
  const where = {};
  const [colors, sizes, hoodies, total] = await Promise.all([
    ctx.prisma.color.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.size.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.hoodie.findMany({
      where,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      ...toSkipTake(q),
      include: { variants: { where: { active: true, color: { active: true }, size: { active: true } }, include: { color: true, size: true }, orderBy: { id: 'asc' } } },
    }),
    ctx.prisma.hoodie.count({ where }),
  ]);
  const byPos = <T extends { position: number; id: number }>(a: T, b: T) => a.position - b.position || a.id - b.id;
  const items = hoodies.map((h) => {
    const hColors = new Map(h.variants.map((variant) => [variant.colorId, variant.color]));
    const hSizes = new Map(h.variants.map((variant) => [variant.sizeId, variant.size]));
    return {
      hoodieId: h.id,
      name: h.name,
      colors: [...hColors.values()].sort(byPos).map(toColorDto),
      sizes: [...hSizes.values()].sort(byPos).map(toSizeDto),
      cells: h.variants
        .slice()
        .sort((a, b) => byPos(a.color, b.color) || byPos(a.size, b.size))
        .map((v) => ({ variantId: v.id, colorId: v.colorId, sizeId: v.sizeId, quantity: v.quantity, reserved: v.reserved, available: v.quantity - v.reserved })),
    };
  });
  return {
    colors: colors.map(toColorDto),
    sizes: sizes.map(toSizeDto),
    ...toPage(items, total, q),
  };
}

export async function stockStimpies(ctx: AppContext, q: PageQuery) {
  const where = {};
  const [{ lowStockThreshold }, rows, total] = await Promise.all([
    ctx.settings.get('orders'),
    ctx.prisma.stimpie.findMany({ where, orderBy: [{ position: 'asc' }, { id: 'asc' }], ...toSkipTake(q), include: { drop: { select: { name: true } } } }),
    ctx.prisma.stimpie.count({ where }),
  ]);
  const items = rows.map((s) => {
    const available = s.quantity - s.reserved;
    const images = Array.isArray(s.images) ? (s.images as string[]) : [];
    return {
      stimpieId: s.id,
      name: s.name,
      type: s.type,
      dropName: s.drop?.name ?? null,
      quantity: s.quantity,
      reserved: s.reserved,
      available,
      low: available <= lowStockThreshold,
      artworkUrl: s.artworkUrl,
      imageUrl: images[0] ?? s.artworkUrl ?? null,
    };
  });
  return toPage(items, total, q);
}

export type MovementQuery = PageQuery & {
  itemType?: 'HOODIE_VARIANT' | 'STIMPIE';
  itemId?: number;
  reason?: string;
  orderId?: number;
  from?: string;
  to?: string;
};

function dayStart(ymd: string, tz: string, field: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw AppError.validation({ [field]: 'Enter a real date like 2026-10-14.' });
  return startOfDayInTz(ymd, tz);
}

export async function stockMovements(ctx: AppContext, q: MovementQuery) {
  const { timezone } = await ctx.settings.get('business');
  const where: Prisma.StockMovementWhereInput = {};
  if (q.itemType) where.itemType = q.itemType;
  if (q.itemId !== undefined) {
    if (q.itemType === 'STIMPIE') where.stimpieId = q.itemId;
    else if (q.itemType === 'HOODIE_VARIANT') where.variantId = q.itemId;
    else throw AppError.validation({ itemType: 'Send itemType together with itemId.' });
  }
  if (q.reason) where.reason = q.reason as never;
  if (q.orderId !== undefined) where.orderId = q.orderId;
  if (q.from || q.to) {
    const range: { gte?: Date; lt?: Date } = {};
    if (q.from) range.gte = dayStart(q.from, timezone, 'from');
    if (q.to) {
      const [y, m, d] = q.to.split('-').map(Number) as [number, number, number];
      dayStart(q.to, timezone, 'to');
      range.lt = startOfDayInTz(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10), timezone);
    }
    where.createdAt = range;
  }

  const [rows, total] = await Promise.all([
    ctx.prisma.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(q),
      include: { user: { select: { name: true } }, order: { select: { number: true } } },
    }),
    ctx.prisma.stockMovement.count({ where }),
  ]);

  const variantIds = [...new Set(rows.map((r) => r.variantId).filter((x): x is number => x !== null))];
  const stimpieIds = [...new Set(rows.map((r) => r.stimpieId).filter((x): x is number => x !== null))];
  const [variants, stimpies] = await Promise.all([
    variantIds.length ? ctx.prisma.hoodieVariant.findMany({ where: { id: { in: variantIds } }, include: { hoodie: true, color: true, size: true } }) : [],
    stimpieIds.length ? ctx.prisma.stimpie.findMany({ where: { id: { in: stimpieIds } }, select: { id: true, name: true } }) : [],
  ]);
  const variantName = new Map(variants.map((v) => [v.id, `${v.hoodie.name}, ${v.color.name}, ${v.size.label}`]));
  const stimpieName = new Map(stimpies.map((s) => [s.id, s.name]));

  return toPage(
    rows.map((r) => ({
      id: r.id,
      at: iso(r.createdAt),
      itemType: r.itemType,
      itemId: (r.itemType === 'HOODIE_VARIANT' ? r.variantId : r.stimpieId) as number,
      itemName: (r.itemType === 'HOODIE_VARIANT' ? variantName.get(r.variantId as number) : stimpieName.get(r.stimpieId as number)) ?? 'Unknown item',
      field: r.field,
      delta: r.delta,
      reason: r.reason,
      orderNumber: r.order?.number ?? null,
      note: r.note,
      by: r.user?.name ?? null,
    })),
    total,
    q,
  );
}
