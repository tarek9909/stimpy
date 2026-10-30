import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createPack } from './helpers/fixtures';
import { stimpieItem } from './helpers/orders';
import { priceCart } from '../src/services/pricing';
import { makeOrder } from './helpers/wpc-fixtures';
import { productInsights } from '../src/services/insights';
import { AppError } from '../src/lib/errors';

const t = useTestApp();

describe('Stimpie-only offer pricing', () => {
  it('uses the cheapest active eligible single offer on product, drop, and checkout surfaces without stacking promotions', async () => {
    const world = await buildWorld(t.prisma);
    const single = await createPack(t.prisma, {
      type: 'STIMPIE_ONLY', name: 'One Stimpie', slug: 'one-stimpie', stimpieCount: 1,
      eligibleStimpieIds: [world.core[0]!.id, world.limited[0]!.id], priceCents: 1200,
    });
    await createPack(t.prisma, {
      type: 'STIMPIE_ONLY', name: 'Cheaper Single', slug: 'cheaper-single', stimpieCount: 1,
      eligibleStimpieIds: [world.core[0]!.id], priceCents: 1100,
    });
    await t.prisma.promotion.create({
      data: {
        name: 'Product markdown', discountType: 'FIXED', discountValue: 500, allProducts: false, enabled: true,
        items: { create: [{ productType: 'STIMPIE', productId: world.core[0]!.id }, { productType: 'PACK', productId: single.id }] },
      },
    });

    const publicOffers = (await t.client.get('/packs')).json<{ items: { id: number; type: string; eligibleStimpieIds: number[] | null }[] }>().items;
    expect(publicOffers.find((row) => row.id === single.id)).toMatchObject({
      type: 'STIMPIE_ONLY',
      eligibleStimpieIds: [world.core[0]!.id, world.limited[0]!.id],
    });
    const list = (await t.client.get('/products/stimpies')).json<{ items: { slug: string; priceCents: number; compareAtPriceCents: number | null }[] }>().items;
    expect(list.find((row) => row.slug === world.core[0]!.slug)).toMatchObject({ priceCents: 1100, compareAtPriceCents: null });
    expect((await t.client.get(`/products/stimpies/${world.core[0]!.slug}`)).json<{ priceCents: number; compareAtPriceCents: number | null }>()).toMatchObject({ priceCents: 1100, compareAtPriceCents: null });
    const drop = await t.client.get(`/drops/${world.drop.slug}`);
    const dropStimpies = drop.json<{ stimpies: { slug: string; priceCents: number; compareAtPriceCents: number | null }[] }>().stimpies;
    expect(dropStimpies.find((row) => row.slug === world.limited[0]!.slug)).toMatchObject({ priceCents: 1200, compareAtPriceCents: null });

    const one = await priceCart(t.ctx, t.prisma, { items: [stimpieItem(world.core[0]!.id, 1)] });
    const limited = await priceCart(t.ctx, t.prisma, { items: [stimpieItem(world.limited[0]!.id, 1)] });
    expect(one.lines[0]!.unitPriceCents).toBe(1100);
    expect(limited.lines[0]!.unitPriceCents).toBe(1200);
  });

  it('does not apply product promotions to Stimpie-only bundle prices', async () => {
    const world = await buildWorld(t.prisma);
    const offer = await createPack(t.prisma, {
      type: 'STIMPIE_ONLY', name: 'Three Stimpies', slug: 'three-stimpies', stimpieCount: 3,
      eligibleStimpieIds: [world.core[0]!.id], priceCents: 2700,
    });
    await t.prisma.promotion.create({
      data: {
        name: 'Bundle markdown', discountType: 'FIXED', discountValue: 1000, allProducts: false, enabled: true,
        items: { create: { productType: 'PACK', productId: offer.id } },
      },
    });
    const priced = await priceCart(t.ctx, t.prisma, {
      items: [{ kind: 'stimpie_pack', packId: offer.id, stimpies: [{ stimpieId: world.core[0]!.id, qty: 3 }], qty: 1 }],
    });
    expect(priced.lines[0]!.unitPriceCents).toBe(2700);
    expect(priced.lines[0]!.unitCostCents).toBe(1800);
    const invalid = await t.client.post('/cart/validate', {
      items: [{ kind: 'stimpie_pack', packId: offer.id, stimpies: [{ stimpieId: world.core[0]!.id, qty: 3 }], qty: 1, hoodieId: world.hoodie.id }],
    });
    expect(invalid.status).toBe(400);
    const nonPositive = await t.client.post('/cart/validate', {
      items: [{ kind: 'stimpie_pack', packId: offer.id, stimpies: [{ stimpieId: world.core[0]!.id, qty: 0 }], qty: 1 }],
    });
    expect(nonPositive.status).toBe(400);
  });

  it('counts Stimpie-only orders as Stimpie sales, not hoodie units or attachments', async () => {
    const world = await buildWorld(t.prisma);
    await makeOrder(t.prisma, {
      status: 'DELIVERED',
      deliveredAt: new Date(),
      items: [{
        kind: 'STIMPIE_PACK', name: 'Three Stimpies', qty: 1, unitPriceCents: 2700, unitCostCents: 1800,
        stimpieQuantities: [{ stimpieId: world.core[0]!.id, qty: 3 }],
        stimpieIds: [world.core[0]!.id],
        detail: { hoodie: null, color: null, size: null, stimpies: [world.core[0]!.name], stimpieQuantities: [{ name: world.core[0]!.name, qty: 3 }] },
      }],
    });
    const insights = await productInsights(t.ctx, { from: null, to: null, start: null, end: null, timezone: 'Asia/Beirut' });
    expect(insights.stimpies).toContainEqual({ name: world.core[0]!.name, unitsSold: 3, revenueCents: 2700 });
    expect(insights.packMix).toContainEqual({ packName: 'Three Stimpies', orders: 1 });
    expect(insights.extraStimpieAttachRate).toBe(0);
    expect(insights.sizes).toEqual([]);
    expect(insights.colors).toEqual([]);
  });

  it('returns validation errors before database integer overflow on extreme total cost or subtotal', async () => {
    const world = await buildWorld(t.prisma);
    const highCost = await t.prisma.stimpie.update({ where: { id: world.core[0]!.id }, data: { costCents: 100_000_000 } });
    const costOffer = await createPack(t.prisma, { type: 'STIMPIE_ONLY', stimpieCount: 30, priceCents: 2700 });
    const tooCostly = priceCart(t.ctx, t.prisma, {
      items: [{ kind: 'stimpie_pack', packId: costOffer.id, stimpies: [{ stimpieId: highCost.id, qty: 30 }], qty: 1 }],
    });
    await expect(tooCostly).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fields: { 'items.0.stimpies': expect.any(String) } satisfies AppError['fields'] });

    const expensive = await createPack(t.prisma, { type: 'STIMPIE_ONLY', stimpieCount: 1, priceCents: 100_000_000 });
    const tooLarge = priceCart(t.ctx, t.prisma, {
      items: Array.from({ length: 3 }, () => ({ kind: 'stimpie_pack' as const, packId: expensive.id, stimpies: [{ stimpieId: world.core[1]!.id, qty: 1 }], qty: 10 })),
    });
    await expect(tooLarge).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fields: { items: expect.any(String) } satisfies AppError['fields'] });
  });
});
