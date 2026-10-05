import type { Hoodie, Pack, Prisma, Stimpie } from '@prisma/client';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { isUniqueViolation, jsonStringArray, type Db } from '../../lib/db';
import { now } from '../../lib/clock';
import { AppError } from '../../lib/errors';
import { parseSort, toPage, toSkipTake, type Page } from '../../lib/http';
import { applyOrder } from '../../lib/reorder';
import { uniqueSlug } from '../../lib/slug';
import { escapeLike } from '../../lib/sql-like';
import { availableUnits, variantAvailability } from '../../services/drops';
import { ensureVariants } from '../../services/variants';
import { toColorDto, toSizeDto } from '../options/service';
import { toAdminHoodie, toAdminPack, toAdminStimpie, toPublicPack, toPublicStimpie } from './mappers';
import type {
  HoodieListQuery,
  PackListQuery,
  PublicStimpieQuery,
  StimpieListQuery,
  hoodieCreateBody,
  hoodieUpdateBody,
  packCreateBody,
  packUpdateBody,
  stimpieCreateBody,
  stimpieUpdateBody,
} from './schemas';

const USED_BY_ORDERS = 'Used by past orders. Hide it instead.';
const slugTaken = (): AppError => AppError.conflict('That slug is taken.', 'slug');

// ================================================================ public: hoodies

async function publicVariants(db: Db, hoodieIds: number[]) {
  return db.hoodieVariant.findMany({
    where: { hoodieId: { in: hoodieIds }, color: { active: true }, size: { active: true } },
    include: { color: true, size: true },
  });
}

export async function listPublicHoodies(ctx: AppContext) {
  const hoodies = await ctx.prisma.hoodie.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  const variants = await publicVariants(ctx.prisma, hoodies.map((h) => h.id));
  return hoodies.map((h) => {
    const inStock = variants.filter((v) => v.hoodieId === h.id && availableUnits(v) > 0);
    const colors = new Map<number, { position: number; id: number; name: string; hex: string }>();
    for (const v of inStock) colors.set(v.colorId, { position: v.color.position, id: v.color.id, name: v.color.name, hex: v.color.hex });
    return {
      id: h.id,
      slug: h.slug,
      name: h.name,
      description: h.description,
      priceCents: h.priceCents,
      images: jsonStringArray(h.images),
      colors: [...colors.values()].sort((a, b) => a.position - b.position || a.id - b.id).map(({ id, name, hex }) => ({ id, name, hex })),
      inStock: inStock.length > 0,
    };
  });
}

export async function getPublicHoodie(ctx: AppContext, slug: string) {
  const h = await ctx.prisma.hoodie.findFirst({ where: { slug, active: true } });
  if (!h) throw AppError.notFound('Hoodie not found.');
  const threshold = (await ctx.settings.get('orders')).lowStockThreshold;
  const variants = await publicVariants(ctx.prisma, [h.id]);
  const colors = new Map(variants.map((v) => [v.colorId, v.color]));
  const sizes = new Map(variants.map((v) => [v.sizeId, v.size]));
  const byPos = <T extends { position: number; id: number }>(a: T, b: T): number => a.position - b.position || a.id - b.id;
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    description: h.description,
    priceCents: h.priceCents,
    images: jsonStringArray(h.images),
    inStock: variants.some((v) => availableUnits(v) > 0),
    details: jsonStringArray(h.details),
    colors: [...colors.values()].sort(byPos).map(toColorDto),
    sizes: [...sizes.values()].sort(byPos).map(toSizeDto),
    variants: variants
      .slice()
      .sort((a, b) => byPos(a.color, b.color) || byPos(a.size, b.size))
      .map((v) => ({ colorId: v.colorId, sizeId: v.sizeId, ...variantAvailability(v, threshold) })),
  };
}

// ================================================================ public: stimpies and packs

export async function listPublicStimpies(ctx: AppContext, q: PublicStimpieQuery) {
  const threshold = (await ctx.settings.get('orders')).lowStockThreshold;
  const at = now();
  const rows = await ctx.prisma.stimpie.findMany({
    where: { active: true, ...(q.type ? { type: q.type } : {}), ...(q.drop ? { drop: { slug: q.drop } } : {}) },
    include: { drop: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  return rows
    .map((r) => toPublicStimpie(r, threshold, at))
    .filter((s) => {
      if (s.status === 'SOLD_OUT') return q.includeSoldOut;
      if (s.status === 'UPCOMING') return q.includeUpcoming;
      if (s.status === 'ENDED') return q.includeEnded;
      return true;
    });
}

export async function getPublicStimpie(ctx: AppContext, slug: string) {
  const row = await ctx.prisma.stimpie.findFirst({ where: { slug, active: true }, include: { drop: true } });
  if (!row) throw AppError.notFound('Stimpie not found.');
  return toPublicStimpie(row, (await ctx.settings.get('orders')).lowStockThreshold, now());
}

export async function listPublicPacks(ctx: AppContext) {
  const rows = await ctx.prisma.pack.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  return rows.map(toPublicPack);
}

// ================================================================ admin: hoodies

const HOODIE_SORT = ['position', 'name', 'priceCents', 'id'] as const;

async function hoodieStock(db: Db, ids: number[]): Promise<Map<number, { available: number; reserved: number }>> {
  const out = new Map<number, { available: number; reserved: number }>();
  if (!ids.length) return out;
  const rows = await db.hoodieVariant.groupBy({ by: ['hoodieId'], where: { hoodieId: { in: ids } }, _sum: { quantity: true, reserved: true } });
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    const res = r._sum.reserved ?? 0;
    out.set(r.hoodieId, { available: q - res, reserved: res });
  }
  return out;
}
const noStock = { available: 0, reserved: 0 };

export async function listHoodies(ctx: AppContext, q: HoodieListQuery) {
  const sort = parseSort(q.sort, HOODIE_SORT, { field: 'position', dir: 'asc' });
  const where: Prisma.HoodieWhereInput = {
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q ? { OR: [{ name: { contains: escapeLike(q.q) } }, { slug: { contains: escapeLike(q.q) } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.hoodie.count({ where }),
    ctx.prisma.hoodie.findMany({ where, orderBy: [{ [sort.field]: sort.dir }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  const stock = await hoodieStock(ctx.prisma, rows.map((r) => r.id));
  return toPage(rows.map((r) => toAdminHoodie(r, stock.get(r.id) ?? noStock)), total, q);
}

export async function getHoodie(ctx: AppContext, id: number) {
  const row = await ctx.prisma.hoodie.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Hoodie not found.');
  const stock = await hoodieStock(ctx.prisma, [id]);
  return toAdminHoodie(row, stock.get(id) ?? noStock);
}

export async function createHoodie(ctx: AppContext, input: z.infer<typeof hoodieCreateBody>) {
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const slug = input.slug ?? (await uniqueSlug(input.name, async (s) => (await tx.hoodie.count({ where: { slug: s } })) > 0));
      const position = ((await tx.hoodie.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
      const row = await tx.hoodie.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? '',
          details: input.details ?? [],
          priceCents: input.priceCents,
          costCents: input.costCents ?? 1000,
          images: input.images ?? [],
          active: input.active ?? true,
          position,
        },
      });
      // One zero-stock variant per active colour x active size.
      await ensureVariants(tx, { hoodieId: row.id });
      return row.id;
    });
    return await getHoodie(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function updateHoodie(ctx: AppContext, id: number, input: z.infer<typeof hoodieUpdateBody>) {
  try {
    await ctx.prisma.$transaction(async (tx) => {
      if (!(await tx.hoodie.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Hoodie not found.');
      await tx.hoodie.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.details !== undefined ? { details: input.details } : {}),
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
          ...(input.images !== undefined ? { images: input.images } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
    });
    return await getHoodie(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function deleteHoodie(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    if (!(await tx.hoodie.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Hoodie not found.');
    if ((await tx.orderStockLine.count({ where: { variant: { hoodieId: id } } })) > 0) throw AppError.conflict(USED_BY_ORDERS);
    await tx.stockMovement.deleteMany({ where: { variant: { hoodieId: id } } });
    await tx.hoodieVariant.deleteMany({ where: { hoodieId: id } });
    await tx.hoodie.delete({ where: { id } });
  });
}

export async function reorderHoodies(ctx: AppContext, ids: number[]): Promise<void> {
  const existing = (await ctx.prisma.hoodie.findMany({ select: { id: true } })).map((r) => r.id);
  await applyOrder(ctx.prisma, ids, existing, (id, position) => ctx.prisma.hoodie.update({ where: { id }, data: { position } }));
}

// ================================================================ admin: stimpies

const STIMPIE_SORT = ['position', 'name', 'priceCents', 'id'] as const;

export async function listStimpies(ctx: AppContext, q: StimpieListQuery): Promise<Page<ReturnType<typeof toAdminStimpie>>> {
  const sort = parseSort(q.sort, STIMPIE_SORT, { field: 'position', dir: 'asc' });
  const where: Prisma.StimpieWhereInput = {
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.dropId ? { dropId: q.dropId } : {}),
    ...(q.q ? { OR: [{ name: { contains: escapeLike(q.q) } }, { slug: { contains: escapeLike(q.q) } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.stimpie.count({ where }),
    ctx.prisma.stimpie.findMany({ where, orderBy: [{ [sort.field]: sort.dir }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map(toAdminStimpie), total, q);
}

export async function getStimpie(ctx: AppContext, id: number) {
  const row = await ctx.prisma.stimpie.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Stimpie not found.');
  return toAdminStimpie(row);
}

/** Dimensions of an uploaded artwork, copied onto the Stimpie so the Builder can check its aspect. */
async function artworkSize(db: Db, url: string): Promise<{ width: number | null; height: number | null } | null> {
  const up = await db.upload.findFirst({ where: { url }, select: { width: true, height: true } });
  return up ? { width: up.width, height: up.height } : null;
}

async function assertDropRules(db: Db, type: 'CORE' | 'LIMITED', dropId: number | null): Promise<void> {
  if (dropId === null) return;
  if (type === 'CORE') throw AppError.validation({ dropId: "Core Stimpies can't belong to a drop. Make it Limited first." });
  if (!(await db.drop.findUnique({ where: { id: dropId }, select: { id: true } }))) throw AppError.validation({ dropId: 'That drop does not exist.' });
}

export async function createStimpie(ctx: AppContext, input: z.infer<typeof stimpieCreateBody>, userId: number) {
  const dropId = input.dropId ?? null;
  const type = input.type ?? (dropId ? 'LIMITED' : 'CORE');
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      await assertDropRules(tx, type, dropId);
      const slug = input.slug ?? (await uniqueSlug(input.name, async (s) => (await tx.stimpie.count({ where: { slug: s } })) > 0));
      const position = ((await tx.stimpie.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
      const size = await artworkSize(tx, input.artworkUrl);
      const quantity = input.quantity ?? 0;
      const row = await tx.stimpie.create({
        data: {
          name: input.name,
          slug,
          type,
          dropId,
          priceCents: input.priceCents,
          costCents: input.costCents ?? 600,
          quantity,
          reserved: 0,
          story: input.story ?? '',
          images: input.images ?? [],
          artworkUrl: input.artworkUrl,
          artworkWidth: size?.width ?? null,
          artworkHeight: size?.height ?? null,
          active: input.active ?? true,
          position,
        },
      });
      if (quantity > 0) {
        await tx.stockMovement.create({
          data: { itemType: 'STIMPIE', stimpieId: row.id, field: 'QUANTITY', delta: quantity, reason: 'INITIAL', userId, note: 'Initial stock' },
        });
      }
      return row.id;
    });
    return await getStimpie(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function updateStimpie(ctx: AppContext, id: number, input: z.infer<typeof stimpieUpdateBody>) {
  if (input.quantity !== undefined) {
    throw AppError.validation({ quantity: 'Stock changes go through Stock adjustments.' });
  }
  try {
    await ctx.prisma.$transaction(async (tx) => {
      const existing = await tx.stimpie.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('Stimpie not found.');
      const type = input.type ?? existing.type;
      const dropId = input.dropId !== undefined ? input.dropId : existing.dropId;
      if (input.type !== undefined || input.dropId !== undefined) await assertDropRules(tx, type, dropId);
      let artwork: { artworkWidth?: number | null; artworkHeight?: number | null } = {};
      if (input.artworkUrl !== undefined) {
        const size = await artworkSize(tx, input.artworkUrl);
        if (size) artwork = { artworkWidth: size.width, artworkHeight: size.height };
        else if (input.artworkUrl !== existing.artworkUrl) artwork = { artworkWidth: null, artworkHeight: null };
      }
      await tx.stimpie.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.dropId !== undefined ? { dropId: input.dropId } : {}),
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
          ...(input.story !== undefined ? { story: input.story } : {}),
          ...(input.images !== undefined ? { images: input.images } : {}),
          ...(input.artworkUrl !== undefined ? { artworkUrl: input.artworkUrl, ...artwork } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
    });
    return await getStimpie(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function deleteStimpie(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    if (!(await tx.stimpie.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Stimpie not found.');
    if ((await tx.orderStockLine.count({ where: { stimpieId: id } })) > 0) throw AppError.conflict(USED_BY_ORDERS);
    await tx.stockMovement.deleteMany({ where: { stimpieId: id } });
    await tx.stimpie.delete({ where: { id } });
  });
}

// ================================================================ admin: packs

const PACK_SORT = ['position', 'name', 'priceCents', 'id'] as const;

export async function listPacks(ctx: AppContext, q: PackListQuery): Promise<Page<ReturnType<typeof toAdminPack>>> {
  const sort = parseSort(q.sort, PACK_SORT, { field: 'position', dir: 'asc' });
  const where: Prisma.PackWhereInput = {
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q ? { OR: [{ name: { contains: escapeLike(q.q) } }, { slug: { contains: escapeLike(q.q) } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.pack.count({ where }),
    ctx.prisma.pack.findMany({ where, orderBy: [{ [sort.field]: sort.dir }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map(toAdminPack), total, q);
}

export async function getPack(ctx: AppContext, id: number) {
  const row = await ctx.prisma.pack.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Pack not found.');
  return toAdminPack(row);
}

export async function createPack(ctx: AppContext, input: z.infer<typeof packCreateBody>) {
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const slug = input.slug ?? (await uniqueSlug(input.name, async (s) => (await tx.pack.count({ where: { slug: s } })) > 0));
      const position = input.position ?? ((await tx.pack.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
      const row = await tx.pack.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? '',
          stimpieCount: input.stimpieCount,
          priceCents: input.priceCents,
          badge: input.badge ?? null,
          active: input.active ?? true,
          position,
        },
      });
      return row.id;
    });
    return await getPack(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

export async function updatePack(ctx: AppContext, id: number, input: z.infer<typeof packUpdateBody>) {
  try {
    await ctx.prisma.$transaction(async (tx) => {
      if (!(await tx.pack.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Pack not found.');
      await tx.pack.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.stimpieCount !== undefined ? { stimpieCount: input.stimpieCount } : {}),
          ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
          ...(input.badge !== undefined ? { badge: input.badge } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
      });
    });
    return await getPack(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

/** Orders keep their own name/price snapshot and reference no pack row, so a pack can always be deleted. */
export async function deletePack(ctx: AppContext, id: number): Promise<void> {
  if (!(await ctx.prisma.pack.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Pack not found.');
  await ctx.prisma.pack.delete({ where: { id } });
}

export async function reorderPacks(ctx: AppContext, ids: number[]): Promise<void> {
  const existing = (await ctx.prisma.pack.findMany({ select: { id: true } })).map((r) => r.id);
  await applyOrder(ctx.prisma, ids, existing, (id, position) => ctx.prisma.pack.update({ where: { id }, data: { position } }));
}

// re-exported for other modules that need row types
export type { Hoodie, Pack, Stimpie };
