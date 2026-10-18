import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createColor, createDrop, createHoodie, createPack, createSize, createStimpie, setVariantStock } from './helpers/fixtures';
import { advanceTime, freezeTime } from './helpers/clock';

const t = useTestApp();

type Stimpie = {
  id: number; slug: string; name: string; type: string; priceCents: number; story: string; images: string[]; artworkUrl: string;
  artworkWidth: number | null; artworkHeight: number | null; status: string; remaining: number | null; purchasable: boolean;
  drop: { id: number; slug: string; name: string; accentColor: string; accentHex: string; startsAt: string; endsAt: string | null } | null;
};
type HoodieSummary = {
  id: number; slug: string; name: string; description: string; priceCents: number; images: string[];
  colors: { id: number; name: string; hex: string }[]; inStock: boolean;
};
type HoodieDetail = HoodieSummary & {
  details: string[]; colors: { id: number; name: string; hex: string; position: number; active: boolean; images: string[] }[];
  sizes: { id: number; label: string; position: number; active: boolean }[];
  variants: { colorId: number; sizeId: number; inStock: boolean; remaining: number | null }[];
};
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

const STIMPIE_KEYS = ['artworkHeight', 'artworkUrl', 'artworkWidth', 'drop', 'id', 'images', 'name', 'priceCents', 'purchasable', 'remaining', 'slug', 'status', 'story', 'type'];
const DROP_SUMMARY_KEYS = ['accentColor', 'accentHex', 'endsAt', 'id', 'name', 'slug', 'startsAt'];

/** Deep key scan: none of these may appear anywhere in a public response. */
const FORBIDDEN = ['costCents', 'cost', 'quantity', 'reserved', 'available', 'position', 'sku', 'createdAt', 'updatedAt', 'active'];
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}

describe('GET /products/hoodies', () => {
  it('returns active hoodies in position order with exactly the HoodieSummary keys and a 30 s public cache', async () => {
    const w = await buildWorld(t.prisma);
    const second = await createHoodie(t.prisma, { name: 'Second', slug: 'second', stock: 5 });
    await createHoodie(t.prisma, { name: 'Hidden', slug: 'hidden', active: false, stock: 5 });
    const res = await t.client.get('/products/hoodies');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const list = res.json<Page<HoodieSummary>>().items;
    expect(list.map((h) => h.slug)).toEqual([w.hoodie.slug, second.slug]);
    expect(Object.keys(list[0]!).sort()).toEqual(['colors', 'description', 'id', 'images', 'inStock', 'name', 'priceCents', 'slug']);
    expect(list[0]).toMatchObject({ priceCents: 2500, inStock: true });
    expect(list[0]!.colors.map((c) => c.name)).toEqual(['Black', 'Cream']);
    expect(Object.keys(list[0]!.colors[0]!).sort()).toEqual(['hex', 'id', 'name']);
    const leaked = [...keysDeep(list)].filter((k) => FORBIDDEN.includes(k));
    expect(leaked).toEqual([]);
  });

  it('swatches list only colours that have stock; inStock is false when every variant is sold out', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 0 });
    const base = { hoodieId: w.hoodie.id, colorId: w.colors.cream.id };
    await setVariantStock(t.prisma, { ...base, sizeId: w.sizes.m.id }, 3);
    let list = (await t.client.get('/products/hoodies')).json<Page<HoodieSummary>>().items;
    expect(list[0]!.colors.map((c) => c.name)).toEqual(['Cream']);
    expect(list[0]!.inStock).toBe(true);

    await setVariantStock(t.prisma, { ...base, sizeId: w.sizes.m.id }, 3, 3); // all reserved
    list = (await t.client.get('/products/hoodies')).json<Page<HoodieSummary>>().items;
    expect(list[0]!.colors).toEqual([]);
    expect(list[0]!.inStock).toBe(false);
  });

  it('stock in a hidden colour or hidden size does not count', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 0 });
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.s.id }, 9);
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { active: false } });
    expect((await t.client.get('/products/hoodies')).json<Page<HoodieSummary>>().items[0]!.inStock).toBe(false);
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { active: true } });
    await t.prisma.size.update({ where: { id: w.sizes.s.id }, data: { active: false } });
    expect((await t.client.get('/products/hoodies')).json<Page<HoodieSummary>>().items[0]!.inStock).toBe(false);
  });

  it('is an empty array when there are no hoodies', async () => {
    const res = await t.client.get('/products/hoodies');
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ items: [], page: 1, pageSize: 25, total: 0 });
  });
});

describe('GET /products/hoodies/:slug', () => {
  it('returns HoodieDetail with details, colours (with images), sizes and a variant per colour x size', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.hoodie.update({ where: { id: w.hoodie.id }, data: { details: ['Heavy fleece', 'Zip back'], images: ['http://x/a.webp'], description: 'Desc' } });
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { images: ['http://x/b.webp'] } });
    const res = await t.client.get(`/products/hoodies/${w.hoodie.slug}`);
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const h = res.json<HoodieDetail>();
    expect(Object.keys(h).sort()).toEqual(['colors', 'description', 'details', 'id', 'images', 'inStock', 'name', 'priceCents', 'sizes', 'slug', 'variants']);
    expect(h.details).toEqual(['Heavy fleece', 'Zip back']);
    expect(h.colors.map((c) => c.name)).toEqual(['Black', 'Cream']);
    expect(h.colors[0]!.images).toEqual(['http://x/b.webp']);
    expect(Object.keys(h.colors[0]!).sort()).toEqual(['active', 'builderTexture', 'builderTint', 'hex', 'id', 'images', 'name', 'position']);
    expect(h.sizes.map((s) => s.label)).toEqual(['S', 'M', 'L']);
    expect(h.variants).toHaveLength(6);
    expect(Object.keys(h.variants[0]!).sort()).toEqual(['colorId', 'inStock', 'remaining', 'sizeId']);
    expect(h.variants.every((v) => v.inStock && v.remaining === null)).toBe(true); // 20 units: above the threshold of 10
    expect([...keysDeep({ ...h, colors: [], sizes: [] })].filter((k) => ['costCents', 'quantity', 'reserved', 'available', 'sku'].includes(k))).toEqual([]);
  });

  it('derives inStock / remaining per variant: hidden above the threshold, exact at or below it, no "0 left"', async () => {
    const w = await buildWorld(t.prisma);
    const v = (sizeId: number, quantity: number, reserved = 0) => setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId }, quantity, reserved);
    await v(w.sizes.s.id, 11); // above threshold -> hidden
    await v(w.sizes.m.id, 10); // at threshold -> 10
    await v(w.sizes.l.id, 4, 3); // 1 left
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.cream.id, sizeId: w.sizes.s.id }, 5, 5); // sold out
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.cream.id, sizeId: w.sizes.m.id }, 0);
    const h = (await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).json<HoodieDetail>();
    const at = (c: number, s: number) => h.variants.find((x) => x.colorId === c && x.sizeId === s)!;
    expect(at(w.colors.black.id, w.sizes.s.id)).toMatchObject({ inStock: true, remaining: null });
    expect(at(w.colors.black.id, w.sizes.m.id)).toMatchObject({ inStock: true, remaining: 10 });
    expect(at(w.colors.black.id, w.sizes.l.id)).toMatchObject({ inStock: true, remaining: 1 });
    expect(at(w.colors.cream.id, w.sizes.s.id)).toMatchObject({ inStock: false, remaining: null });
    expect(at(w.colors.cream.id, w.sizes.m.id)).toMatchObject({ inStock: false, remaining: null });
  });

  it('follows the low-stock threshold setting', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ orders: { lowStockThreshold: 25 } });
    const h = (await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).json<HoodieDetail>();
    expect(h.variants.every((v) => v.remaining === 20)).toBe(true);
  });

  it('only lists active colours and sizes; the variants of hidden ones are not offered', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.color.update({ where: { id: w.colors.cream.id }, data: { active: false } });
    await t.prisma.size.update({ where: { id: w.sizes.l.id }, data: { active: false } });
    const h = (await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).json<HoodieDetail>();
    expect(h.colors.map((c) => c.name)).toEqual(['Black']);
    expect(h.sizes.map((s) => s.label)).toEqual(['S', 'M']);
    expect(h.variants).toHaveLength(2);
  });

  it('colours with zero variants are left out (a colour added after the hoodie without variants)', async () => {
    const w = await buildWorld(t.prisma);
    await createColor(t.prisma, { name: 'Orphan' }); // no variants created (fixture writes straight to the db)
    const h = (await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).json<HoodieDetail>();
    expect(h.colors.map((c) => c.name)).toEqual(['Black', 'Cream']);
  });

  it('404 NOT_FOUND for an unknown slug and for a hidden hoodie', async () => {
    const w = await buildWorld(t.prisma);
    await createHoodie(t.prisma, { slug: 'secret', active: false });
    expect((await t.client.get('/products/hoodies/nope')).status).toBe(404);
    const hidden = await t.client.get('/products/hoodies/secret');
    expect(hidden.status).toBe(404);
    expect(hidden.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    expect((await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).status).toBe(200);
  });
});

describe('GET /products/stimpies', () => {
  async function shop() {
    const w = await buildWorld(t.prisma);
    const now = new Date();
    const future = await createDrop(t.prisma, { name: 'Upcoming', slug: 'upcoming', accentColor: 'SKY', startsAt: new Date(now.getTime() + 86_400_000) });
    const ended = await createDrop(t.prisma, { name: 'Old', slug: 'old', accentColor: 'LILAC', startsAt: new Date(now.getTime() - 5 * 86_400_000), endedAt: new Date(now.getTime() - 86_400_000) });
    const upcoming = await createStimpie(t.prisma, { name: 'THE MOTH', slug: 'the-moth', dropId: future.id, quantity: 30 });
    const old = await createStimpie(t.prisma, { name: 'THE ROSE', slug: 'the-rose', dropId: ended.id, quantity: 0 });
    const soldOutCore = await createStimpie(t.prisma, { name: 'THE DREAMER', slug: 'the-dreamer', quantity: 0 });
    const lowCore = await createStimpie(t.prisma, { name: 'THE EYE', slug: 'the-eye', quantity: 8, reserved: 2 });
    await createStimpie(t.prisma, { name: 'HIDDEN ONE', slug: 'hidden-one', active: false });
    return { w, future, ended, upcoming, old, soldOutCore, lowCore };
  }

  it('default: AVAILABLE, LOW and SOLD_OUT only (no UPCOMING, ENDED or hidden), in position order, exact keys', async () => {
    await shop();
    const res = await t.client.get('/products/stimpies');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const list = res.json<Page<Stimpie>>().items;
    expect(list.map((s) => s.slug)).toEqual(['the-void', 'after-dark', 'the-cedar', 'the-signal', 'the-static', 'the-dreamer', 'the-eye']);
    for (const s of list) expect(Object.keys(s).sort()).toEqual(STIMPIE_KEYS);
    const dreamer = list.find((s) => s.slug === 'the-dreamer')!;
    expect(dreamer).toMatchObject({ status: 'SOLD_OUT', purchasable: false, remaining: null });
    const eye = list.find((s) => s.slug === 'the-eye')!;
    expect(eye).toMatchObject({ status: 'LOW', purchasable: true, remaining: 6 });
    const core = list.find((s) => s.slug === 'the-void')!;
    expect(core).toMatchObject({ status: 'AVAILABLE', purchasable: true, remaining: null, drop: null, type: 'CORE', artworkWidth: 800, artworkHeight: 1250 });
    expect([...keysDeep(list)].filter((k) => FORBIDDEN.includes(k) && k !== 'active')).toEqual([]);
  });

  it('exposes the drop summary with startsAt / endsAt / accentHex, and never exact stock above the threshold', async () => {
    await shop();
    const list = (await t.client.get('/products/stimpies')).json<Page<Stimpie>>().items;
    const sig = list.find((s) => s.slug === 'the-signal')!;
    expect(sig.type).toBe('LIMITED');
    expect(Object.keys(sig.drop!).sort()).toEqual(DROP_SUMMARY_KEYS);
    expect(sig.drop).toMatchObject({ slug: 'drop-001', name: 'Drop 001', accentColor: 'BUTTER', accentHex: '#FFE45C', endsAt: null });
    expect(new Date(sig.drop!.startsAt).toISOString()).toBe(sig.drop!.startsAt);
    expect(sig.remaining).toBeNull(); // 30 units, threshold 10
    expect(sig.status).toBe('AVAILABLE');
  });

  it('includeSoldOut=false hides sold-out Stimpies', async () => {
    await shop();
    const list = (await t.client.get('/products/stimpies', { query: { includeSoldOut: 'false' } })).json<Page<Stimpie>>().items;
    expect(list.map((s) => s.slug)).not.toContain('the-dreamer');
    expect(list.every((s) => s.status === 'AVAILABLE' || s.status === 'LOW')).toBe(true);
  });

  it('includeUpcoming=true adds UPCOMING; includeEnded=true adds ENDED', async () => {
    await shop();
    const up = (await t.client.get('/products/stimpies', { query: { includeUpcoming: 'true' } })).json<Page<Stimpie>>().items;
    const moth = up.find((s) => s.slug === 'the-moth')!;
    expect(moth).toMatchObject({ status: 'UPCOMING', purchasable: false, remaining: null });
    expect(moth.drop).toMatchObject({ accentHex: '#5CC8FF', slug: 'upcoming' });
    expect(up.find((s) => s.slug === 'the-rose')).toBeUndefined();

    const en = (await t.client.get('/products/stimpies', { query: { includeEnded: 'true' } })).json<Page<Stimpie>>().items;
    expect(en.find((s) => s.slug === 'the-rose')).toMatchObject({ status: 'ENDED', purchasable: false });
    expect(en.find((s) => s.slug === 'the-moth')).toBeUndefined();

    const all = (await t.client.get('/products/stimpies', { query: { includeUpcoming: 'true', includeEnded: 'true', includeSoldOut: 'false' } })).json<Page<Stimpie>>().items;
    expect(all.map((s) => s.status).sort()).toEqual(expect.arrayContaining(['UPCOMING', 'ENDED']));
    expect(all.find((s) => s.status === 'SOLD_OUT')).toBeUndefined();
  });

  it('filters by type and by drop slug', async () => {
    await shop();
    const limited = (await t.client.get('/products/stimpies', { query: { type: 'LIMITED' } })).json<Page<Stimpie>>().items;
    expect(limited.map((s) => s.slug)).toEqual(['the-signal', 'the-static']);
    const core = (await t.client.get('/products/stimpies', { query: { type: 'CORE' } })).json<Page<Stimpie>>().items;
    expect(core.every((s) => s.type === 'CORE')).toBe(true);
    const inDrop = (await t.client.get('/products/stimpies', { query: { drop: 'drop-001' } })).json<Page<Stimpie>>().items;
    expect(inDrop.map((s) => s.slug)).toEqual(['the-signal', 'the-static']);
    // the drop filter does not bypass the upcoming default
    expect((await t.client.get('/products/stimpies', { query: { drop: 'upcoming' } })).json()).toMatchObject({ items: [], total: 0 });
    expect((await t.client.get('/products/stimpies', { query: { drop: 'upcoming', includeUpcoming: 'true' } })).json<Page<Stimpie>>().items).toHaveLength(1);
    expect((await t.client.get('/products/stimpies', { query: { drop: 'no-such-drop' } })).json()).toMatchObject({ items: [], total: 0 });
  });

  it('rejects invalid query values with VALIDATION_ERROR', async () => {
    const bad = await t.client.get('/products/stimpies', { query: { type: 'EPIC', includeSoldOut: 'maybe' } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json<{ error: { fields: Record<string, string> } }>().error.fields).sort()).toEqual(['includeSoldOut', 'type']);
  });

  it('a drop starting later flips UPCOMING to purchasable once the (fake) clock passes startsAt', async () => {
    const start = freezeTime('2026-10-14T10:00:00Z');
    const drop = await createDrop(t.prisma, { slug: 'soon', startsAt: new Date(start.getTime() + 60_000) });
    await createStimpie(t.prisma, { slug: 'soon-1', dropId: drop.id, quantity: 12 });
    const get = async () => (await t.client.get('/products/stimpies/soon-1')).json<Stimpie>();
    expect(await get()).toMatchObject({ status: 'UPCOMING', purchasable: false });
    advanceTime(60_000);
    expect(await get()).toMatchObject({ status: 'AVAILABLE', purchasable: true });
    await t.prisma.drop.update({ where: { id: drop.id }, data: { endsAt: new Date(start.getTime() + 120_000) } });
    advanceTime(60_000);
    expect(await get()).toMatchObject({ status: 'ENDED', purchasable: false });
  });
});

describe('GET /products/stimpies/:slug', () => {
  it('returns the full Stimpie, including an UPCOMING one (the page needs drop.startsAt), with exact keys', async () => {
    const w = await buildWorld(t.prisma);
    const d = await createDrop(t.prisma, { slug: 'later', startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 2 * 86_400_000), accentColor: 'LILAC' });
    await createStimpie(t.prisma, { slug: 'later-1', dropId: d.id });
    const res = await t.client.get('/products/stimpies/later-1');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const s = res.json<Stimpie>();
    expect(Object.keys(s).sort()).toEqual(STIMPIE_KEYS);
    expect(s.status).toBe('UPCOMING');
    expect(s.drop).toMatchObject({ id: d.id, accentHex: '#C9B6FF' });
    expect(s.drop!.endsAt).not.toBeNull();
    expect(res.body).not.toContain('costCents');
    expect((await t.client.get(`/products/stimpies/${w.core[0]!.slug}`)).status).toBe(200);
  });

  it('404 for unknown and hidden Stimpies', async () => {
    await createStimpie(t.prisma, { slug: 'ghost', active: false });
    expect((await t.client.get('/products/stimpies/ghost')).status).toBe(404);
    expect((await t.client.get('/products/stimpies/none')).status).toBe(404);
  });

  it('LOW shows remaining, sold out does not', async () => {
    await createStimpie(t.prisma, { slug: 'few', quantity: 7, reserved: 2 });
    await createStimpie(t.prisma, { slug: 'zero', quantity: 2, reserved: 2 });
    expect((await t.client.get('/products/stimpies/few')).json<Stimpie>()).toMatchObject({ status: 'LOW', remaining: 5, purchasable: true });
    expect((await t.client.get('/products/stimpies/zero')).json<Stimpie>()).toMatchObject({ status: 'SOLD_OUT', remaining: null, purchasable: false });
  });
});

describe('GET /packs', () => {
  it('returns active packs in position order with exactly the Pack keys', async () => {
    const w = await buildWorld(t.prisma);
    await createPack(t.prisma, { name: 'Hidden', slug: 'hid', active: false });
    const res = await t.client.get('/packs');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const list = res.json<Page<{ id: number; slug: string; name: string; description: string; stimpieCount: number; priceCents: number; badge: string | null }>>().items;
    expect(list.map((p) => p.id)).toEqual([w.packs.one.id, w.packs.two.id]);
    expect(Object.keys(list[0]!).sort()).toEqual(['badge', 'description', 'id', 'name', 'priceCents', 'slug', 'stimpieCount']);
    expect(list[0]!.badge).toBeNull();
    expect(list[1]).toMatchObject({ badge: 'Most popular', stimpieCount: 2, priceCents: 4500 });
  });
});

describe('fixtures sanity for the catalog', () => {
  it('colours / sizes created after a hoodie (fixtures) are not part of this suite', async () => {
    await createSize(t.prisma, { label: 'Z' });
    expect((await t.client.get('/products/hoodies')).json()).toMatchObject({ items: [], total: 0 });
  });
});
