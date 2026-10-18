import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { useTestApp, type TestClient } from './helpers/app';
import { buildWorld, createColor, createDrop, createHoodie, createPack, createSize, createStimpie } from './helpers/fixtures';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: { field?: string } | null } };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
type AHoodie = { id: number; name: string; slug: string; description: string; details: string[]; priceCents: number; costCents: number; images: string[]; active: boolean; position: number; available: number; reserved: number };
type AStimpie = { id: number; name: string; slug: string; type: string; dropId: number | null; priceCents: number; costCents: number; story: string; images: string[]; artworkUrl: string; artworkWidth: number | null; artworkHeight: number | null; active: boolean; position: number; quantity: number; available: number; reserved: number };
type APack = { id: number; name: string; slug: string; description: string; stimpieCount: number; priceCents: number; badge: string | null; active: boolean; position: number };

const admin = async (): Promise<TestClient> => (await t.adminClient()).client;
const ART = 'http://localhost:4000/uploads/2026/10/aaaaaaaaaaaaaaaa.webp';

/** Writes the rows an order would leave behind so that deleting a variant / Stimpie must be refused. */
async function referenceInOrder(prisma: PrismaClient, ref: { variantId: number } | { stimpieId: number }): Promise<void> {
  const customer = await prisma.customer.create({ data: { phone: `+9613${Math.floor(100000 + Math.random() * 899999)}`, whatsapp: '+96103123456', name: 'C' } });
  const order = await prisma.order.create({
    data: {
      number: `STP-${Math.floor(Math.random() * 1e9)}`, customerId: customer.id, status: 'NEW', source: 'WEBSITE', customerName: 'C',
      contactPhone: customer.phone, contactWhatsapp: customer.whatsapp, areaName: 'Beirut', address: 'Somewhere 1',
      subtotalCents: 1000, deliveryFeeCents: 0, totalCents: 1000, costCents: 600,
    },
  });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, kind: 'STIMPIE', name: 'x', qty: 1, unitPriceCents: 1000, unitCostCents: 600, detail: {} } });
  await prisma.orderStockLine.create({
    data: { orderId: order.id, orderItemId: item.id, itemType: 'variantId' in ref ? 'HOODIE_VARIANT' : 'STIMPIE', qty: 1, ...ref },
  });
}

// ================================================================ hoodies

describe('/admin/hoodies', () => {
  it('requires a session (401) and the dashboard Origin on writes (403)', async () => {
    expect((await t.client.get('/admin/hoodies')).status).toBe(401);
    const { client } = await t.adminClient();
    expect((await client.post('/admin/hoodies', { name: 'x', priceCents: 1 }, { origin: 'http://evil.example' })).status).toBe(403);
  });

  it('POST creates the hoodie with an auto slug and zero-stock variants for every active colour x active size', async () => {
    await buildWorld(t.prisma);
    await createColor(t.prisma, { name: 'Hidden colour', active: false });
    await createSize(t.prisma, { label: 'Hidden size', active: false });
    const c = await admin();
    const res = await c.post('/admin/hoodies', { name: 'Winter Hoodie!', priceCents: 3000, details: ['Fleece'], images: [ART] });
    expect(res.status).toBe(201);
    const h = res.json<AHoodie>();
    expect(Object.keys(h).sort()).toEqual(['active', 'available', 'costCents', 'description', 'details', 'id', 'images', 'name', 'position', 'priceCents', 'reserved', 'slug']);
    expect(h).toMatchObject({ name: 'Winter Hoodie!', slug: 'winter-hoodie', priceCents: 3000, costCents: 1000, description: '', details: ['Fleece'], images: [ART], active: true, available: 0, reserved: 0 });
    const variants = await t.prisma.hoodieVariant.findMany({ where: { hoodieId: h.id } });
    expect(variants).toHaveLength(6); // 2 active colours x 3 active sizes
    expect(variants.every((v) => v.quantity === 0 && v.reserved === 0)).toBe(true);
    expect(variants.map((v) => v.sku).every((s) => /^HOOD-\d+-C\d+-S\d+$/.test(s))).toBe(true);
  });

  it('slug: generated from the name, made unique (-2, -3), explicit duplicate is 409 CONFLICT on slug', async () => {
    const c = await admin();
    const a = (await c.post('/admin/hoodies', { name: 'Same Name', priceCents: 1 })).json<AHoodie>();
    const b = (await c.post('/admin/hoodies', { name: 'Same Name', priceCents: 1 })).json<AHoodie>();
    const d = (await c.post('/admin/hoodies', { name: 'Same Name', priceCents: 1 })).json<AHoodie>();
    expect([a.slug, b.slug, d.slug]).toEqual(['same-name', 'same-name-2', 'same-name-3']);
    const dup = await c.post('/admin/hoodies', { name: 'Other', slug: 'same-name', priceCents: 1 });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error).toMatchObject({ code: 'CONFLICT', details: { field: 'slug' } });
    const patchDup = await c.patch(`/admin/hoodies/${b.id}`, { slug: 'same-name' });
    expect(patchDup.status).toBe(409);
    expect(patchDup.json<Err>().error.details).toEqual({ field: 'slug' });
    expect((await c.patch(`/admin/hoodies/${b.id}`, { slug: 'same-name-2' })).status).toBe(200); // own slug is fine
  });

  it('validates fields: names, slugs, prices, URLs, text limits, unknown fields', async () => {
    const c = await admin();
    const bad = await c.post('/admin/hoodies', {
      name: '   ', slug: 'Not A Slug', priceCents: -5, costCents: 1.5, images: ['javascript:alert(1)'],
      description: 'x'.repeat(2001), details: [''], extra: true,
    });
    expect(bad.status).toBe(400);
    const f = bad.json<Err>().error.fields!;
    expect(Object.keys(f).sort()).toEqual(['costCents', 'description', 'details.0', 'extra', 'images.0', 'name', 'priceCents', 'slug']);
    const tooLong = await c.post('/admin/hoodies', { name: 'n'.repeat(121), slug: 'a'.repeat(141), priceCents: 1 });
    expect(Object.keys(tooLong.json<Err>().error.fields!).sort()).toEqual(['name', 'slug']);
    const missing = await c.post('/admin/hoodies', {});
    expect(Object.keys(missing.json<Err>().error.fields!).sort()).toEqual(['name', 'priceCents']);
  });

  it('GET list includes inactive rows, filters ?active=, searches ?q=, pages, and reports stock', async () => {
    const w = await buildWorld(t.prisma); // 6 variants x 20
    await t.prisma.hoodieVariant.updateMany({ where: { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.s.id }, data: { reserved: 4 } });
    await createHoodie(t.prisma, { name: 'Ghost', slug: 'ghost', active: false });
    const c = await admin();
    const all = (await c.get('/admin/hoodies')).json<Page<AHoodie>>();
    expect(all.total).toBe(2);
    expect(all.items.map((h) => h.slug)).toEqual(['stimpy-hoodie', 'ghost']);
    expect(all.items[0]).toMatchObject({ available: 116, reserved: 4 });
    expect((await c.get('/admin/hoodies', { query: { active: 'false' } })).json<Page<AHoodie>>().items.map((h) => h.slug)).toEqual(['ghost']);
    expect((await c.get('/admin/hoodies', { query: { active: 'true' } })).json<Page<AHoodie>>().items.map((h) => h.slug)).toEqual(['stimpy-hoodie']);
    expect((await c.get('/admin/hoodies', { query: { q: 'gho' } })).json<Page<AHoodie>>().total).toBe(1);
    const p2 = (await c.get('/admin/hoodies', { query: { pageSize: 1, page: 2 } })).json<Page<AHoodie>>();
    expect(p2).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(p2.items.map((h) => h.slug)).toEqual(['ghost']);
    expect((await c.get('/admin/hoodies', { query: { sort: '-name' } })).json<Page<AHoodie>>().items[0]!.slug).toBe('stimpy-hoodie');
    expect((await c.get('/admin/hoodies', { query: { active: 'maybe' } })).status).toBe(400);
    for (const wild of ['%', '_', 'g_o', '%o%']) expect((await c.get('/admin/hoodies', { query: { q: wild } })).json<Page<AHoodie>>().total, wild).toBe(0); // LIKE wildcards are plain text
  });

  it('GET /:id, 404 for unknown, PATCH updates only what is sent (cost included on admin)', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    expect((await c.get(`/admin/hoodies/${w.hoodie.id}`)).json<AHoodie>()).toMatchObject({ costCents: 1000, priceCents: 2500 });
    expect((await c.get('/admin/hoodies/999999')).status).toBe(404);
    expect((await c.patch('/admin/hoodies/999999', { name: 'x' })).status).toBe(404);
    const upd = await c.patch(`/admin/hoodies/${w.hoodie.id}`, { priceCents: 2800, costCents: 1100, active: false, details: ['a', 'b'] });
    expect(upd.status).toBe(200);
    expect(upd.json<AHoodie>()).toMatchObject({ priceCents: 2800, costCents: 1100, active: false, details: ['a', 'b'], name: 'Stimpy Hoodie', slug: 'stimpy-hoodie' });
    expect((await t.client.get('/products/hoodies/stimpy-hoodie')).status).toBe(404); // hidden now
    expect((await c.get('/admin/hoodies/abc')).status).toBe(400);
  });

  it('PUT /order reorders; rejects duplicates, unknown ids and incomplete lists', async () => {
    const a = await createHoodie(t.prisma, { slug: 'a' });
    const b = await createHoodie(t.prisma, { slug: 'b' });
    const d = await createHoodie(t.prisma, { slug: 'd' });
    const c = await admin();
    const ok = await c.put('/admin/hoodies/order', { ids: [d.id, a.id, b.id] });
    expect(ok.status).toBe(204);
    expect(ok.body).toBe('');
    expect((await c.get('/admin/hoodies')).json<Page<AHoodie>>().items.map((h) => h.slug)).toEqual(['d', 'a', 'b']);
    expect((await t.client.get('/products/hoodies')).json<{ items: { slug: string }[] }>().items.map((h) => h.slug)).toEqual(['d', 'a', 'b']);
    for (const ids of [[a.id, a.id, b.id], [a.id, b.id], [a.id, b.id, d.id, 99999], []]) {
      const r = await c.put('/admin/hoodies/order', { ids });
      expect(r.status).toBe(400);
      expect(Object.keys(r.json<Err>().error.fields!)).toEqual(['ids']);
    }
  });

  it('PUT /faqs/order accepts a complete list above 500 rows', async () => {
    await t.prisma.faq.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ question: `FAQ ${i}`, answer: 'Answer', position: i + 1 })) });
    const ids = (await t.prisma.faq.findMany({ orderBy: { position: 'asc' }, select: { id: true } })).map((row) => row.id);
    const reversed = ids.reverse();
    const { client } = await t.adminClient();
    const result = await client.put('/admin/faqs/order', { ids: reversed });
    expect(result.status, result.body).toBe(204);
    expect((await t.prisma.faq.findFirstOrThrow({ orderBy: { position: 'asc' } })).id).toBe(reversed[0]);
  });

  it('DELETE removes an unused hoodie with its variants and movements; 409 when orders reference it', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const used = await createHoodie(t.prisma, { slug: 'used', stock: 3 });
    const v = await t.prisma.hoodieVariant.findFirstOrThrow({ where: { hoodieId: used.id } });
    await referenceInOrder(t.prisma, { variantId: v.id });
    const refused = await c.delete(`/admin/hoodies/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.json<Err>().error.code).toBe('CONFLICT');
    expect(await t.prisma.hoodie.count({ where: { id: used.id } })).toBe(1);

    await t.prisma.stockMovement.create({ data: { itemType: 'HOODIE_VARIANT', variantId: (await t.prisma.hoodieVariant.findFirstOrThrow({ where: { hoodieId: w.hoodie.id } })).id, field: 'QUANTITY', delta: 20, reason: 'INITIAL' } });
    const ok = await c.delete(`/admin/hoodies/${w.hoodie.id}`);
    expect(ok.status).toBe(204);
    expect(await t.prisma.hoodieVariant.count({ where: { hoodieId: w.hoodie.id } })).toBe(0);
    expect(await t.prisma.stockMovement.count({ where: { variant: { hoodieId: w.hoodie.id } } })).toBe(0);
    expect((await c.delete(`/admin/hoodies/${w.hoodie.id}`)).status).toBe(404);
  });
});

// ================================================================ stimpies

describe('/admin/stimpies', () => {
  it('POST creates a Stimpie, writes an INITIAL movement for the initial quantity and copies artwork size from the upload', async () => {
    const w = await buildWorld(t.prisma);
    const { client: c, admin: adm } = await t.adminClient();
    const up = await t.prisma.upload.create({ data: { path: '2026/10/aaaaaaaaaaaaaaaa.webp', url: ART, mime: 'image/webp', sizeBytes: 1000, width: 800, height: 1250, originalName: 'a.png' } });
    const res = await c.post('/admin/stimpies', { name: 'THE MAZE', priceCents: 1000, artworkUrl: ART, quantity: 25, story: 'Lost', images: [ART], dropId: w.drop.id });
    expect(res.status).toBe(201);
    const s = res.json<AStimpie>();
    expect(Object.keys(s).sort()).toEqual(['active', 'artworkHeight', 'artworkUrl', 'artworkWidth', 'available', 'costCents', 'dropId', 'id', 'images', 'name', 'position', 'priceCents', 'quantity', 'reserved', 'slug', 'story', 'type']);
    expect(s).toMatchObject({ slug: 'the-maze', type: 'LIMITED', costCents: 600, quantity: 25, available: 25, reserved: 0, artworkWidth: up.width, artworkHeight: up.height, dropId: w.drop.id, active: true });
    const mv = await t.prisma.stockMovement.findMany({ where: { stimpieId: s.id } });
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ itemType: 'STIMPIE', field: 'QUANTITY', delta: 25, reason: 'INITIAL', userId: adm.user.id });
  });

  it('quantity 0 or omitted writes no movement; unknown artwork keeps dimensions null; type defaults to CORE without a drop', async () => {
    const c = await admin();
    const s = (await c.post('/admin/stimpies', { name: 'Plain', priceCents: 1000, artworkUrl: 'https://cdn.example/x.png' })).json<AStimpie>();
    expect(s).toMatchObject({ type: 'CORE', quantity: 0, artworkWidth: null, artworkHeight: null, dropId: null });
    expect(await t.prisma.stockMovement.count({ where: { stimpieId: s.id } })).toBe(0);
    const z = (await c.post('/admin/stimpies', { name: 'Zero', priceCents: 1000, artworkUrl: ART, quantity: 0 })).json<AStimpie>();
    expect(await t.prisma.stockMovement.count({ where: { stimpieId: z.id } })).toBe(0);
  });

  it('validation: required artwork and price, negative quantity, unknown drop, core in a drop, bad slug', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const missing = await c.post('/admin/stimpies', { name: 'X' });
    expect(Object.keys(missing.json<Err>().error.fields!).sort()).toEqual(['artworkUrl', 'priceCents']);
    const bad = await c.post('/admin/stimpies', { name: 'X', priceCents: 1000, artworkUrl: ART, quantity: -1, slug: 'Bad Slug', type: 'EPIC' });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['quantity', 'slug', 'type']);
    const noDrop = await c.post('/admin/stimpies', { name: 'X', priceCents: 1000, artworkUrl: ART, dropId: 999999 });
    expect(noDrop.status).toBe(400);
    expect(Object.keys(noDrop.json<Err>().error.fields!)).toEqual(['dropId']);
    const core = await c.post('/admin/stimpies', { name: 'X', priceCents: 1000, artworkUrl: ART, type: 'CORE', dropId: w.drop.id });
    expect(core.status).toBe(400);
    expect(Object.keys(core.json<Err>().error.fields!)).toEqual(['dropId']);
    expect(await t.prisma.stimpie.count({ where: { name: 'X' } })).toBe(0);
  });

  it('slug collisions behave as for hoodies', async () => {
    const c = await admin();
    const mk = (extra: object = {}) => c.post('/admin/stimpies', { name: 'THE VOID', priceCents: 1000, artworkUrl: ART, ...extra });
    expect((await mk()).json<AStimpie>().slug).toBe('the-void');
    expect((await mk()).json<AStimpie>().slug).toBe('the-void-2');
    const dup = await mk({ slug: 'the-void' });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error.details).toEqual({ field: 'slug' });
  });

  it('PATCH: updates fields, refuses quantity (stock goes through adjustments), recomputes artwork size, validates type/drop', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const s = w.core[0]!;
    expect((await c.patch(`/admin/stimpies/${s.id}`, { quantity: 99 })).json<Err>().error.fields).toEqual({ quantity: expect.any(String) });
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).quantity).toBe(20);

    const up = await t.prisma.upload.create({ data: { path: '2026/10/bbbbbbbbbbbbbbbb.webp', url: 'http://localhost:4000/uploads/2026/10/bbbbbbbbbbbbbbbb.webp', mime: 'image/webp', sizeBytes: 1, width: 640, height: 1000, originalName: 'b' } });
    const upd = await c.patch(`/admin/stimpies/${s.id}`, { artworkUrl: up.url, priceCents: 1500, costCents: 700, story: 'New', active: false });
    expect(upd.status).toBe(200);
    expect(upd.json<AStimpie>()).toMatchObject({ artworkWidth: 640, artworkHeight: 1000, priceCents: 1500, costCents: 700, story: 'New', active: false, quantity: 20 });
    const elsewhere = await c.patch(`/admin/stimpies/${s.id}`, { artworkUrl: 'https://cdn.example/other.png' });
    expect(elsewhere.json<AStimpie>()).toMatchObject({ artworkWidth: null, artworkHeight: null });

    expect((await c.patch(`/admin/stimpies/${s.id}`, { dropId: w.drop.id })).status).toBe(400); // CORE cannot join a drop
    const moved = await c.patch(`/admin/stimpies/${s.id}`, { type: 'LIMITED', dropId: w.drop.id });
    expect(moved.json<AStimpie>()).toMatchObject({ type: 'LIMITED', dropId: w.drop.id });
    expect((await c.patch(`/admin/stimpies/${s.id}`, { type: 'CORE' })).status).toBe(400); // still in a drop
    expect((await c.patch(`/admin/stimpies/${s.id}`, { type: 'CORE', dropId: null })).json<AStimpie>()).toMatchObject({ type: 'CORE', dropId: null });
    expect((await c.patch('/admin/stimpies/999999', { name: 'x' })).status).toBe(404);
  });

  it('list: includes inactive, ?active=, ?type=, ?dropId=, ?q=, stock summary', async () => {
    const w = await buildWorld(t.prisma);
    await createStimpie(t.prisma, { name: 'Hidden', slug: 'hid', active: false, quantity: 5, reserved: 2 });
    const c = await admin();
    const all = (await c.get('/admin/stimpies')).json<Page<AStimpie>>();
    expect(all.total).toBe(6);
    expect(all.items.find((s) => s.slug === 'hid')).toMatchObject({ active: false, quantity: 5, reserved: 2, available: 3 });
    expect((await c.get('/admin/stimpies', { query: { active: 'false' } })).json<Page<AStimpie>>().items.map((s) => s.slug)).toEqual(['hid']);
    expect((await c.get('/admin/stimpies', { query: { type: 'LIMITED' } })).json<Page<AStimpie>>().total).toBe(2);
    expect((await c.get('/admin/stimpies', { query: { dropId: w.drop.id } })).json<Page<AStimpie>>().total).toBe(2);
    expect((await c.get('/admin/stimpies', { query: { q: 'void' } })).json<Page<AStimpie>>().total).toBe(1);
    expect((await c.get('/admin/stimpies', { query: { type: 'WRONG' } })).status).toBe(400);
  });

  it('GET /:id and DELETE (204; 409 when used by orders, 404 afterwards)', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    expect((await c.get(`/admin/stimpies/${w.core[0]!.id}`)).json<AStimpie>().slug).toBe('the-void');
    expect((await c.get('/admin/stimpies/999999')).status).toBe(404);
    await referenceInOrder(t.prisma, { stimpieId: w.core[1]!.id });
    expect((await c.delete(`/admin/stimpies/${w.core[1]!.id}`)).status).toBe(409);
    await t.prisma.stockMovement.create({ data: { itemType: 'STIMPIE', stimpieId: w.core[0]!.id, field: 'QUANTITY', delta: 20, reason: 'INITIAL' } });
    expect((await c.delete(`/admin/stimpies/${w.core[0]!.id}`)).status).toBe(204);
    expect(await t.prisma.stockMovement.count({ where: { stimpieId: w.core[0]!.id } })).toBe(0);
    expect((await c.delete(`/admin/stimpies/${w.core[0]!.id}`)).status).toBe(404);
  });
});

// ================================================================ packs

describe('/admin/packs', () => {
  it('CRUD with auto slug, badge, position, validation', async () => {
    const c = await admin();
    const res = await c.post('/admin/packs', { name: 'Hoodie + 3 Stimpies', stimpieCount: 3, priceCents: 5500, badge: 'Best value' });
    expect(res.status).toBe(201);
    const p = res.json<APack>();
    expect(Object.keys(p).sort()).toEqual(['active', 'badge', 'description', 'id', 'name', 'position', 'priceCents', 'slug', 'stimpieCount']);
    expect(p).toMatchObject({ slug: 'hoodie-3-stimpies', stimpieCount: 3, priceCents: 5500, badge: 'Best value', active: true, description: '' });
    const second = (await c.post('/admin/packs', { name: 'Two', stimpieCount: 2, priceCents: 4500, position: 7 })).json<APack>();
    expect(second.position).toBe(7);
    expect(second.badge).toBeNull();

    const bad = await c.post('/admin/packs', { name: '', stimpieCount: 6, priceCents: -1, badge: 'b'.repeat(41) });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['badge', 'name', 'priceCents', 'stimpieCount']);
    expect((await c.post('/admin/packs', { name: 'Zero', stimpieCount: 0, priceCents: 1 })).status).toBe(400);

    const upd = await c.patch(`/admin/packs/${p.id}`, { priceCents: 6000, badge: null, active: false });
    expect(upd.json<APack>()).toMatchObject({ priceCents: 6000, badge: null, active: false });
    expect((await c.get(`/admin/packs/${p.id}`)).json<APack>().priceCents).toBe(6000);
    expect((await c.get('/admin/packs/999999')).status).toBe(404);
    expect((await c.patch('/admin/packs/999999', { name: 'x' })).status).toBe(404);

    const dup = await c.post('/admin/packs', { name: 'Other', slug: second.slug, stimpieCount: 1, priceCents: 1 });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error.details).toEqual({ field: 'slug' });

    expect((await c.delete(`/admin/packs/${p.id}`)).status).toBe(204);
    expect((await c.delete(`/admin/packs/${p.id}`)).status).toBe(404);
  });

  it('list includes inactive and filters ?active=; inactive packs are not public', async () => {
    const a = await createPack(t.prisma, { slug: 'a' });
    await createPack(t.prisma, { slug: 'b', active: false });
    const c = await admin();
    expect((await c.get('/admin/packs')).json<Page<APack>>().total).toBe(2);
    expect((await c.get('/admin/packs', { query: { active: 'true' } })).json<Page<APack>>().items.map((p) => p.id)).toEqual([a.id]);
    expect((await c.get('/admin/packs', { query: { active: 'false' } })).json<Page<APack>>().total).toBe(1);
    expect((await t.client.get('/packs')).json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it('PUT /order reorders and validates', async () => {
    const a = await createPack(t.prisma, { slug: 'a' });
    const b = await createPack(t.prisma, { slug: 'b' });
    const c = await admin();
    expect((await c.put('/admin/packs/order', { ids: [b.id, a.id] })).status).toBe(204);
    expect((await t.client.get('/packs')).json<{ items: { slug: string }[] }>().items.map((p) => p.slug)).toEqual(['b', 'a']);
    expect((await c.put('/admin/packs/order', { ids: [b.id] })).status).toBe(400);
    expect((await c.put('/admin/packs/order', { ids: [b.id, b.id] })).status).toBe(400);
    expect((await c.put('/admin/packs/order', { ids: [b.id, 12345] })).status).toBe(400);
    expect((await c.put('/admin/packs/order', {})).status).toBe(400);
  });
});

// ================================================================ interplay with the rest of the shop

describe('catalog and options interplay', () => {
  it('a colour created after a hoodie gets variants (options module) and shows up in the public detail', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const col = await c.post('/admin/colors', { name: 'Sage', hex: '#99AA88' });
    expect(col.status).toBe(201);
    const detail = (await t.client.get(`/products/hoodies/${w.hoodie.slug}`)).json<{ colors: { name: string }[]; variants: { inStock: boolean }[] }>();
    expect(detail.colors.map((x) => x.name)).toContain('Sage');
    expect(detail.variants).toHaveLength(9);
  });
});
