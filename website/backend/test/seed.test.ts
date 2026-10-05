import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from '../src/config';
import { verifyPassword } from '../src/services/auth';
import { runSeed } from '../prisma/seed';
import { useTestApp } from './helpers/app';

const t = useTestApp();
const hasGlb = existsSync(join(API_ROOT, 'seed-assets', 'models', 'hoodie.glb'));
const quiet = { log: () => undefined };

async function counts(): Promise<Record<string, number>> {
  const p = t.prisma;
  return {
    admins: await p.adminUser.count(), colors: await p.color.count(), sizes: await p.size.count(), columns: await p.sizeChartColumn.count(),
    values: await p.sizeChartValue.count(), hoodies: await p.hoodie.count(), variants: await p.hoodieVariant.count(), packs: await p.pack.count(),
    areas: await p.area.count(), emailTemplates: await p.emailTemplate.count(), waTemplates: await p.whatsappTemplate.count(), faqs: await p.faq.count(),
    content: await p.contentBlock.count(), settings: await p.setting.count(), builder: await p.builderConfig.count(), counters: await p.counter.count(),
    stimpies: await p.stimpie.count(), drops: await p.drop.count(), movements: await p.stockMovement.count(), uploads: await p.upload.count(),
  };
}

describe('seed (data-model section 8)', () => {
  it('minimal seed creates the documented configuration and is idempotent', async () => {
    await runSeed(t.ctx, { minimal: true, ...quiet });
    const first = await counts();
    expect(first).toMatchObject({
      admins: 1, colors: 4, sizes: 4, columns: 3, values: 12, hoodies: 1, variants: 16, packs: 2, areas: 6,
      emailTemplates: 7, waTemplates: 5, faqs: 8, settings: 6, counters: 1, stimpies: 0, drops: 0,
    });
    expect(first.content).toBe(6); // announcement, homepage, about, how_it_works, policies, size_chart_howto

    const s = await t.ctx.settings.getAll();
    expect(s.orders).toMatchObject({ numberPrefix: 'STP', firstNumber: 1001, stockHoldHours: 12, autoExpireUnconfirmed: false, lowStockThreshold: 10, hardwareCostCents: 100 });
    expect(s.delivery).toEqual({ defaultFeeCents: 300, estimateText: '2-3 working days' });
    expect(s.setup.reviewed).toEqual([]);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1000);

    const admin = await t.prisma.adminUser.findFirstOrThrow();
    expect(admin.email).toBe(t.config.adminEmail);
    expect(await verifyPassword(admin.passwordHash, t.config.adminPassword!)).toBe(true);
    expect((await t.prisma.pack.findUniqueOrThrow({ where: { slug: 'hoodie-2-stimpies' } })).priceCents).toBe(4500);
    expect((await t.prisma.pack.findUniqueOrThrow({ where: { slug: 'hoodie-1-stimpie' } })).priceCents).toBe(3500);
    const hoodie = await t.prisma.hoodie.findFirstOrThrow();
    expect(hoodie).toMatchObject({ priceCents: 2500, costCents: 1000 });
    expect((await t.prisma.size.findMany({ orderBy: { position: 'asc' } })).map((x) => x.label)).toEqual(['S', 'M', 'L', 'XL']);
    expect((await t.prisma.emailTemplate.findMany()).map((x) => x.key).sort()).toEqual(['marketing_update', 'order_cancelled', 'order_confirmed', 'order_delivered', 'order_out_for_delivery', 'order_received', 'orders_lookup']);
    expect((await t.prisma.whatsappTemplate.findMany()).map((x) => x.key).sort()).toEqual(['delivered', 'marketing_update', 'order_confirmation', 'out_for_delivery', 'ready_for_delivery']);

    // variant stock includes LOW and SOLD_OUT cases, every positive stock has an INITIAL movement
    const v = await t.prisma.hoodieVariant.findMany();
    expect(v.some((x) => x.quantity === 0)).toBe(true);
    expect(v.some((x) => x.quantity > 0 && x.quantity <= 10)).toBe(true);
    expect(await t.prisma.stockMovement.count({ where: { reason: 'INITIAL', variantId: { not: null } } })).toBe(v.filter((x) => x.quantity > 0).length);

    // the public endpoints work on the seeded database
    expect((await t.client.get('/options')).json<{ colors: unknown[]; sizes: unknown[] }>()).toMatchObject({ colors: expect.any(Array) });
    expect((await t.client.get('/size-chart')).json<{ rows: unknown[] }>().rows).toHaveLength(4);

    // idempotent: a second run changes nothing, and does not overwrite edits
    await t.prisma.setting.update({ where: { key: 'delivery' }, data: { value: { defaultFeeCents: 999, estimateText: 'edited' } } });
    await runSeed(t.ctx, { minimal: true, ...quiet });
    expect(await counts()).toEqual(first);
    expect((await t.prisma.setting.findUniqueOrThrow({ where: { key: 'delivery' } })).value).toMatchObject({ defaultFeeCents: 999 });
  });

  it('builder: 2D without a model file, BOTH with seed-assets/models/hoodie.glb', async () => {
    await runSeed(t.ctx, { minimal: true, ...quiet });
    const get = async (k: string) => (await t.prisma.builderConfig.findUniqueOrThrow({ where: { key: k } })).value as unknown;
    expect(await get('mode')).toBe(hasGlb ? 'BOTH' : '2D');
    if (hasGlb) {
      expect(await get('model3d')).toMatchObject({ backPanelMesh: 'back_panel', panelAspect: 0.64, lighting: 'STUDIO', sizeBytes: expect.any(Number) });
    } else {
      expect(await get('model3d')).toBeNull();
    }
    expect(await get('hoodieId')).toBe((await t.prisma.hoodie.findFirstOrThrow()).id);
  });

  it('--no-admin skips the admin user', async () => {
    await runSeed(t.ctx, { minimal: true, admin: false, ...quiet });
    expect(await t.prisma.adminUser.count()).toBe(0);
  });

  it('full demo seed: 17 real Stimpies (8 core), 3 drops, LOW / SOLD_OUT cases, processed artwork', async () => {
    await runSeed(t.ctx, quiet);
    const stim = await t.prisma.stimpie.findMany({ include: { drop: true } });
    expect(stim).toHaveLength(17);
    expect(stim.filter((s) => s.type === 'CORE')).toHaveLength(8);
    expect(stim.filter((s) => s.type === 'LIMITED')).toHaveLength(9);
    expect(stim.every((s) => s.artworkWidth === 800 && s.artworkHeight === 1250 && s.artworkUrl.startsWith('http://localhost:4000/uploads/seed/stimpies/'))).toBe(true);
    expect(stim.filter((s) => s.type === 'CORE').every((s) => s.dropId === null)).toBe(true);
    expect(stim.some((s) => s.quantity === 0)).toBe(true);
    expect(stim.some((s) => s.quantity > 0 && s.quantity <= 10)).toBe(true);

    const drops = await t.prisma.drop.findMany({ orderBy: { startsAt: 'asc' } });
    expect(drops.map((d) => d.accentColor)).toEqual(['LILAC', 'BUTTER', 'SKY']);
    const [archive, live, upcoming] = drops;
    expect(archive!.endedAt).not.toBeNull();
    expect(live!.startsAt.getTime()).toBeLessThan(Date.now());
    expect(live!.endedAt).toBeNull();
    expect(upcoming!.startsAt.getTime()).toBeGreaterThan(Date.now() + 10 * 86_400_000);
    // the ended drop is sold out; the live drop has stock left
    expect(stim.filter((s) => s.dropId === archive!.id).every((s) => s.quantity === 0)).toBe(true);
    expect(stim.filter((s) => s.dropId === live!.id).some((s) => s.quantity > 0)).toBe(true);

    // processed files exist and are served with CORS *
    const art = stim[0]!.artworkUrl.replace('http://localhost:4000', '');
    const res = await t.client.get(art, { origin: 'http://localhost:3000' });
    expect(res.status).toBe(200);
    expect(res.header('access-control-allow-origin')).toBe('*');
    expect(res.header('cache-control')).toContain('immutable');

    // product photos, colours and the 2D builder assets
    expect((await t.prisma.color.findMany()).every((c) => Array.isArray(c.images) && (c.images as unknown[]).length === 2)).toBe(true);
    const colorsCfg = (await t.prisma.builderConfig.findUniqueOrThrow({ where: { key: 'colors' } })).value as { hoodieImage2d: string; overlay2d: string; placement2d: { width: number } }[];
    expect(colorsCfg).toHaveLength(4);
    expect(colorsCfg[0]!.placement2d.width).toBe(0.36);
    const textures = (await t.prisma.builderConfig.findUniqueOrThrow({ where: { key: 'stimpieTextures' } })).value as unknown[];
    expect(textures).toHaveLength(17);

    const before = await counts();
    await runSeed(t.ctx, quiet); // idempotent
    expect(await counts()).toEqual(before);
  }, 180_000);
});
