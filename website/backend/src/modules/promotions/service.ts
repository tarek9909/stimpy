import type { Prisma, Promotion, PromotionItem } from '@prisma/client';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { AppError } from '../../lib/errors';
import { iso, isoOrNull } from '../../lib/dates';
import { now } from '../../lib/clock';
import { toPage, toSkipTake, type PageQuery } from '../../lib/http';
import type { promotionCreateBody, promotionUpdateBody } from './schemas';

type PromotionWithItems = Promotion & { items: PromotionItem[] };
type Target = { productType: 'HOODIE' | 'STIMPIE' | 'PACK'; productId: number };

function stateOf(promotion: Promotion, at: Date): 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'PAUSED' {
  if (promotion.endsAt && promotion.endsAt <= at) return 'ENDED';
  if (!promotion.enabled) return 'PAUSED';
  if (promotion.startsAt && promotion.startsAt > at) return 'SCHEDULED';
  return 'ACTIVE';
}

function toDto(promotion: PromotionWithItems, at = now()) {
  return {
    id: promotion.id,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    allProducts: promotion.allProducts,
    targets: promotion.items.map(({ productType, productId }) => ({ productType, productId })),
    enabled: promotion.enabled,
    startsAt: isoOrNull(promotion.startsAt),
    endsAt: isoOrNull(promotion.endsAt),
    state: stateOf(promotion, at),
    createdAt: iso(promotion.createdAt),
    updatedAt: iso(promotion.updatedAt),
  };
}

async function validateTargets(ctx: AppContext, targets: Target[]) {
  const grouped = {
    HOODIE: targets.filter((target) => target.productType === 'HOODIE').map((target) => target.productId),
    STIMPIE: targets.filter((target) => target.productType === 'STIMPIE').map((target) => target.productId),
    PACK: targets.filter((target) => target.productType === 'PACK').map((target) => target.productId),
  };
  const [hoodies, stimpies, packs] = await Promise.all([
    grouped.HOODIE.length ? ctx.prisma.hoodie.count({ where: { id: { in: grouped.HOODIE } } }) : 0,
    grouped.STIMPIE.length ? ctx.prisma.stimpie.count({ where: { id: { in: grouped.STIMPIE } } }) : 0,
    grouped.PACK.length ? ctx.prisma.pack.count({ where: { id: { in: grouped.PACK } } }) : 0,
  ]);
  if (hoodies !== grouped.HOODIE.length || stimpies !== grouped.STIMPIE.length || packs !== grouped.PACK.length) {
    throw AppError.validation({ targets: 'One or more selected products no longer exist. Refresh the list and try again.' });
  }
}

function validateDates(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw AppError.validation({ endsAt: 'The end must be after the start.' });
  }
}

export async function listPromotions(ctx: AppContext, query: PageQuery) {
  const [total, rows] = await Promise.all([
    ctx.prisma.promotion.count(),
    ctx.prisma.promotion.findMany({
      include: { items: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query),
    }),
  ]);
  const at = now();
  return toPage(rows.map((row) => toDto(row, at)), total, query);
}

/** Public, currently active promotions for the storefront landing page. */
export async function listPublicPromotions(ctx: AppContext) {
  const at = now();
  const rows = await ctx.prisma.promotion.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
      ],
    },
    include: { items: { select: { productType: true, productId: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    allProducts: promotion.allProducts,
    targets: promotion.items.map(({ productType, productId }) => ({ productType, productId })),
  }));
}

export async function getPromotion(ctx: AppContext, id: number) {
  const promotion = await ctx.prisma.promotion.findUnique({ where: { id }, include: { items: true } });
  if (!promotion) throw AppError.notFound('Promotion not found.');
  return toDto(promotion);
}

export async function createPromotion(ctx: AppContext, input: z.infer<typeof promotionCreateBody>) {
  if (!input.allProducts) await validateTargets(ctx, input.targets);
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  validateDates(startsAt, endsAt);
  const targets = input.allProducts ? [] : input.targets;
  const promotion = await ctx.prisma.promotion.create({
    data: {
      name: input.name,
      discountType: input.discountType,
      discountValue: input.discountValue,
      allProducts: input.allProducts,
      enabled: input.enabled ?? true,
      startsAt,
      endsAt,
      items: { create: targets.map((target) => ({ productType: target.productType, productId: target.productId })) },
    },
    include: { items: true },
  });
  return toDto(promotion);
}

export async function updatePromotion(ctx: AppContext, id: number, input: z.infer<typeof promotionUpdateBody>) {
  const current = await ctx.prisma.promotion.findUnique({ where: { id }, include: { items: true } });
  if (!current) throw AppError.notFound('Promotion not found.');
  const allProducts = input.allProducts ?? current.allProducts;
  const targets = input.targets ?? current.items.map(({ productType, productId }) => ({ productType, productId }));
  if (!allProducts && targets.length === 0) throw AppError.validation({ targets: 'Choose at least one product or pack.' });
  if (!allProducts && (input.targets !== undefined || input.allProducts === false)) await validateTargets(ctx, targets);
  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt ? new Date(input.endsAt) : null;
  validateDates(startsAt, endsAt);
  const replaceTargets = input.targets !== undefined || input.allProducts !== undefined;

  const saved = await ctx.prisma.$transaction(async (tx) => {
    const data: Prisma.PromotionUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
      ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
      ...(input.allProducts !== undefined ? { allProducts } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.startsAt !== undefined ? { startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt } : {}),
    };
    await tx.promotion.update({ where: { id }, data });
    if (replaceTargets) {
      await tx.promotionItem.deleteMany({ where: { promotionId: id } });
      if (!allProducts && targets.length) {
        await tx.promotionItem.createMany({ data: targets.map((target) => ({ promotionId: id, ...target })) });
      }
    }
    return tx.promotion.findUniqueOrThrow({ where: { id }, include: { items: true } });
  });
  return toDto(saved);
}

export async function deletePromotion(ctx: AppContext, id: number) {
  const exists = await ctx.prisma.promotion.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw AppError.notFound('Promotion not found.');
  await ctx.prisma.promotion.delete({ where: { id } });
}
