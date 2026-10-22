import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { useTestApp, type TestClient } from './helpers/app';
import { buildWorld, createDrop, createStimpie } from './helpers/fixtures';
import { advanceTime, freezeTime } from './helpers/clock';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: { field?: string } | null } };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
type ADrop = {
  id: number; slug: string; name: string; story: string; accentColor: string; accentHex: string; startsAt: string; endsAt: string | null; endedAt: string | null;
  state: string; teaserImage: string | null; teaserVideo: string | null; unitsTotal: number; unitsSold: number; unitsRemaining: number; revenueCents: number; sellOutAt: string | null;
  stimpies: { id: number; slug: string; name: string; type: string; status: string; purchasable: boolean; active: boolean; quantity: number; sold: number; remaining: number }[];
};

const ADMIN_DROP_KEYS = ['accentColor', 'accentHex', 'endedAt', 'endsAt', 'id', 'name', 'revenueCents', 'sellOutAt', 'slug', 'startsAt', 'state', 'stimpies', 'story', 'teaserImage', 'teaserVideo', 'unitsRemaining', 'unitsSold', 'unitsTotal'];
const T0 = new Date('2026-10-14T10:00:00Z');
const at = (min: number): Date => new Date(T0.getTime() + min * 60_000);
const admin = async (): Promise<TestClient> => (await t.adminClient()).client;

async function orderLine(prisma: PrismaClient, stimpieId: number, o: { qty: number; state: 'RESERVED' | 'SOLD' | 'RELEASED'; kind?: 'STIMPIE' | 'PACK'; unit?: number }): Promise<void> {
  const customer = await prisma.customer.create({ data: { phone: `+9613${Math.floor(100000 + Math.random() * 899999)}`, whatsapp: '+96103123456', name: 'C' } });
  const order = await prisma.order.create({
    data: {
      number: `STP-${Math.floor(Math.random() * 1e9)}`, customerId: customer.id, status: 'NEW', source: 'WEBSITE', customerName: 'C', contactPhone: customer.phone,
      contactWhatsapp: customer.whatsapp, areaName: 'Beirut', address: 'Somewhere', subtotalCents: 1, deliveryFeeCents: 0, totalCents: 1, costCents: 1,
    },
  });
  const item = await prisma.orderItem.create({ data: { orderId: order.id, kind: o.kind ?? 'STIMPIE', name: 'x', qty: o.qty, unitPriceCents: o.unit ?? 1200, unitCostCents: 600, detail: {} } });
  await prisma.orderStockLine.create({ data: { orderId: order.id, orderItemId: item.id, itemType: 'STIMPIE', stimpieId, qty: o.qty, state: o.state } });
}

describe('/admin/drops access', () => {
  it('401 without a session; 403 for a wrong Origin on writes', async () => {
    expect((await t.client.get('/admin/drops')).status).toBe(401);
    expect((await t.client.get('/admin/subscribers')).status).toBe(401);
    const { client } = await t.adminClient();
    expect((await client.post('/admin/drops', {}, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await client.post('/admin/drops/1/end', undefined, { origin: 'http://evil.example' })).status).toBe(403);
  });
});

describe('POST /admin/drops', () => {
  it('creates a drop with an auto slug, brand accent hex, and assigns Limited Stimpies', async () => {
    freezeTime(T0);
    const c = await admin();
    const a = await createStimpie(t.prisma, { slug: 'lim-a', type: 'LIMITED', quantity: 10 });
    const b = await createStimpie(t.prisma, { slug: 'lim-b', type: 'LIMITED', quantity: 5 });
    const res = await c.post('/admin/drops', {
      name: 'Drop 002', accentColor: 'SKY', startsAt: at(60 * 24).toISOString(), endsAt: at(60 * 48).toISOString(), story: 'Sky story',
      teaserImage: 'http://x/t.webp', teaserVideo: 'http://x/t.mp4', stimpieIds: [a.id, b.id],
    });
    expect(res.status).toBe(201);
    const d = res.json<ADrop>();
    expect(Object.keys(d).sort()).toEqual(ADMIN_DROP_KEYS);
    expect(d).toMatchObject({
      slug: 'drop-002', name: 'Drop 002', accentColor: 'SKY', accentHex: '#5CC8FF', state: 'UPCOMING', story: 'Sky story', endedAt: null,
      startsAt: at(60 * 24).toISOString(), endsAt: at(60 * 48).toISOString(), unitsTotal: 15, unitsSold: 0, unitsRemaining: 15, revenueCents: 0, sellOutAt: null,
    });
    expect(d.stimpies.map((s) => [s.slug, s.status, s.purchasable, s.quantity, s.sold, s.remaining])).toEqual([
      ['lim-a', 'UPCOMING', false, 10, 0, 10],
      ['lim-b', 'UPCOMING', false, 5, 0, 5],
    ]);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: a.id } })).dropId).toBe(d.id);
  });

  it('minimal create: story defaults to empty, teasers null, no end', async () => {
    const c = await admin();
    const d = (await c.post('/admin/drops', { name: 'Min', accentColor: 'BUTTER', startsAt: at(5).toISOString() })).json<ADrop>();
    expect(d).toMatchObject({ story: '', teaserImage: null, teaserVideo: null, endsAt: null, stimpies: [], unitsTotal: 0 });
  });

  it('slug: unique suffix when generated, 409 CONFLICT on slug when explicit', async () => {
    const c = await admin();
    const body = { name: 'Same', accentColor: 'LILAC', startsAt: at(5).toISOString() };
    expect((await c.post('/admin/drops', body)).json<ADrop>().slug).toBe('same');
    expect((await c.post('/admin/drops', body)).json<ADrop>().slug).toBe('same-2');
    const dup = await c.post('/admin/drops', { ...body, slug: 'same' });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error).toMatchObject({ code: 'CONFLICT', details: { field: 'slug' } });
  });

  it('validation: required fields, accent enum, dates, end after start, URLs, text limits, slug format', async () => {
    const c = await admin();
    const missing = await c.post('/admin/drops', {});
    expect(Object.keys(missing.json<Err>().error.fields!).sort()).toEqual(['accentColor', 'name', 'startsAt']);
    const bad = await c.post('/admin/drops', {
      name: 'x', accentColor: 'RED', startsAt: 'tomorrow', slug: 'No Good', story: 'x'.repeat(2001), teaserImage: 'javascript:alert(1)', extra: 1,
    });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['accentColor', 'extra', 'slug', 'startsAt', 'story', 'teaserImage']);
    const order = await c.post('/admin/drops', { name: 'x', accentColor: 'SKY', startsAt: at(60).toISOString(), endsAt: at(30).toISOString() });
    expect(order.status).toBe(400);
    expect(order.json<Err>().error.fields).toEqual({ endsAt: expect.any(String) });
    const equal = await c.post('/admin/drops', { name: 'x', accentColor: 'SKY', startsAt: at(60).toISOString(), endsAt: at(60).toISOString() });
    expect(equal.status).toBe(400);
    expect(await t.prisma.drop.count()).toBe(0);
  });

  it('accepts a start with a UTC offset and stores the instant', async () => {
    const c = await admin();
    const d = (await c.post('/admin/drops', { name: 'Tz', accentColor: 'SKY', startsAt: '2026-11-01T18:00:00+02:00' })).json<ADrop>();
    expect(d.startsAt).toBe('2026-11-01T16:00:00.000Z');
  });

  it('stimpieIds validation: unknown, duplicate, Core, already in another drop; nothing is created on failure', async () => {
    const w = await buildWorld(t.prisma);
    const free = await createStimpie(t.prisma, { slug: 'free', type: 'LIMITED' });
    const c = await admin();
    const mk = (stimpieIds: number[]) => c.post('/admin/drops', { name: 'Y', accentColor: 'SKY', startsAt: at(60).toISOString(), stimpieIds });
    const r = await mk([free.id, free.id, 999999, w.core[0]!.id, w.limited[0]!.id]);
    expect(r.status).toBe(400);
    expect(Object.keys(r.json<Err>().error.fields!).sort()).toEqual(['stimpieIds.1', 'stimpieIds.2', 'stimpieIds.3', 'stimpieIds.4']);
    expect(await t.prisma.drop.count()).toBe(1); // only the world's drop
  });
});

describe('GET /admin/drops', () => {
  async function seedStates() {
    freezeTime(T0);
    const mk = async (slug: string, start: number, o: { endsAt?: number; endedAt?: number; stock?: number; reserved?: number } = {}) => {
      const d = await createDrop(t.prisma, { slug, name: slug.toUpperCase(), startsAt: at(start), endsAt: o.endsAt === undefined ? null : at(o.endsAt), endedAt: o.endedAt === undefined ? null : at(o.endedAt) });
      await createStimpie(t.prisma, { slug: `${slug}-s`, dropId: d.id, quantity: o.stock ?? 10, reserved: o.reserved ?? 0 });
      return d;
    };
    await mk('up-b', 200);
    await mk('up-a', 100);
    await mk('live-old', -300);
    await mk('live-new', -30);
    await mk('sold', -400, { stock: 4, reserved: 4 });
    await mk('ended', -600, { endedAt: -10 });
    await mk('past', -900, { endsAt: -800 });
  }

  it('?state filters by the derived state; ARCHIVE holds SOLD_OUT and ENDED; every item has the full admin shape', async () => {
    await seedStates();
    const c = await admin();
    const get = async (state?: string) => (await c.get('/admin/drops', state ? { query: { state } } : undefined)).json<Page<ADrop>>();
    expect((await get('UPCOMING')).items.map((d) => d.slug)).toEqual(['up-a', 'up-b']); // soonest first
    expect((await get('LIVE')).items.map((d) => d.slug)).toEqual(['live-new', 'live-old']);
    const archive = await get('ARCHIVE');
    expect(archive.items.map((d) => [d.slug, d.state])).toEqual([['sold', 'SOLD_OUT'], ['ended', 'ENDED'], ['past', 'ENDED']]); // newest first
    const all = await get();
    expect(all.total).toBe(7);
    expect(all.items[0]!.slug).toBe('up-b'); // default: newest start first
    for (const d of all.items) expect(Object.keys(d).sort()).toEqual(ADMIN_DROP_KEYS);
    expect((await c.get('/admin/drops', { query: { state: 'NOPE' } })).status).toBe(400);
  });

  it('paginates, searches with q and sorts', async () => {
    await seedStates();
    const c = await admin();
    const p = (await c.get('/admin/drops', { query: { pageSize: 3, page: 2 } })).json<Page<ADrop>>();
    expect(p).toMatchObject({ page: 2, pageSize: 3, total: 7 });
    expect(p.items).toHaveLength(3);
    expect((await c.get('/admin/drops', { query: { q: 'live' } })).json<Page<ADrop>>().total).toBe(2);
    expect((await c.get('/admin/drops', { query: { sort: 'name' } })).json<Page<ADrop>>().items[0]!.slug).toBe('ended');
    expect((await c.get('/admin/drops', { query: { sort: '-name' } })).json<Page<ADrop>>().items[0]!.slug).toBe('up-b');
  });

  it('GET /:id returns one drop, 404 for an unknown id', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const d = (await c.get(`/admin/drops/${w.drop.id}`)).json<ADrop>();
    expect(d.slug).toBe('drop-001');
    expect(d.stimpies.map((s) => s.slug)).toEqual(['the-signal', 'the-static']);
    expect((await c.get('/admin/drops/999999')).status).toBe(404);
    expect((await c.get('/admin/drops/abc')).status).toBe(400);
  });
});

describe('drop statistics', () => {
  it('quantity = sold + remaining; sold = reserved + delivered; revenue from direct Stimpie lines; totals count active Stimpies', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'stats', startsAt: at(-60) });
    const a = await createStimpie(t.prisma, { slug: 'a', dropId: d.id, quantity: 20, reserved: 5 }); // 15 free
    const b = await createStimpie(t.prisma, { slug: 'b', dropId: d.id, quantity: 7, reserved: 7 }); // sold out
    const hidden = await createStimpie(t.prisma, { slug: 'h', dropId: d.id, quantity: 100, active: false });
    await orderLine(t.prisma, a.id, { qty: 5, state: 'RESERVED', unit: 1200 }); // 5 reserved
    await orderLine(t.prisma, a.id, { qty: 3, state: 'SOLD', unit: 1000 }); // 3 delivered (already out of `quantity`)
    await orderLine(t.prisma, a.id, { qty: 9, state: 'RELEASED' }); // cancelled: not counted
    await orderLine(t.prisma, b.id, { qty: 7, state: 'RESERVED', unit: 1200 });
    await orderLine(t.prisma, b.id, { qty: 2, state: 'RESERVED', kind: 'PACK', unit: 4500 }); // pack line: units, but no direct revenue
    const c = await admin();
    const res = (await c.get(`/admin/drops/${d.id}`)).json<ADrop>();
    const sa = res.stimpies.find((s) => s.id === a.id)!;
    const sb = res.stimpies.find((s) => s.id === b.id)!;
    expect(sa).toMatchObject({ quantity: 23, sold: 8, remaining: 15, status: 'AVAILABLE', active: true });
    expect(sb).toMatchObject({ quantity: 7, sold: 7, remaining: 0, status: 'SOLD_OUT' });
    expect(res.stimpies.find((s) => s.id === hidden.id)).toMatchObject({ active: false, remaining: 100 });
    expect(sa.quantity).toBe(sa.sold + sa.remaining);
    expect(res.unitsTotal).toBe(30); // 23 + 7 (hidden Stimpie excluded)
    expect(res.unitsSold).toBe(15);
    expect(res.unitsRemaining).toBe(15);
    expect(res.revenueCents).toBe(5 * 1200 + 3 * 1000 + 7 * 1200);
    expect(res.state).toBe('LIVE');
    expect(res.sellOutAt).toBeNull();
  });

  it('sellOutAt is the time of the last availability-decreasing movement once every active Stimpie is at zero', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'so', startsAt: at(-60) });
    const a = await createStimpie(t.prisma, { slug: 'so-a', dropId: d.id, quantity: 3, reserved: 3 });
    const b = await createStimpie(t.prisma, { slug: 'so-b', dropId: d.id, quantity: 2, reserved: 2 });
    const early = new Date('2026-10-14T08:00:00Z');
    const late = new Date('2026-10-14T09:30:00Z');
    await t.prisma.stockMovement.create({ data: { itemType: 'STIMPIE', stimpieId: a.id, field: 'RESERVED', delta: 3, reason: 'ORDER_RESERVED', createdAt: early } });
    await t.prisma.stockMovement.create({ data: { itemType: 'STIMPIE', stimpieId: b.id, field: 'RESERVED', delta: 2, reason: 'ORDER_RESERVED', createdAt: late } });
    await t.prisma.stockMovement.create({ data: { itemType: 'STIMPIE', stimpieId: b.id, field: 'QUANTITY', delta: -2, reason: 'ORDER_SOLD', createdAt: at(30) } }); // does not change availability
    const c = await admin();
    const res = (await c.get(`/admin/drops/${d.id}`)).json<ADrop>();
    expect(res.state).toBe('SOLD_OUT');
    expect(res.sellOutAt).toBe(late.toISOString());
    expect(res.unitsRemaining).toBe(0);
    await t.prisma.stimpie.update({ where: { id: a.id }, data: { quantity: 4 } });
    expect((await c.get(`/admin/drops/${d.id}`)).json<ADrop>().sellOutAt).toBeNull();
  });
});

describe('PATCH /admin/drops/:id', () => {
  it('updates fields, assigns and unassigns Stimpies (full list), keeps unspecified fields', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = (await c.post('/admin/drops', { name: 'D', accentColor: 'SKY', startsAt: at(120).toISOString() })).json<ADrop>();
    const a = await createStimpie(t.prisma, { slug: 'pa', type: 'LIMITED' });
    const b = await createStimpie(t.prisma, { slug: 'pb', type: 'LIMITED' });
    let r = (await c.patch(`/admin/drops/${d.id}`, { name: 'Renamed', accentColor: 'LILAC', stimpieIds: [a.id, b.id], story: 'S', teaserImage: 'http://x/i.webp' })).json<ADrop>();
    expect(r).toMatchObject({ name: 'Renamed', slug: 'd', accentColor: 'LILAC', accentHex: '#C9B6FF', story: 'S', teaserImage: 'http://x/i.webp' });
    expect(r.stimpies.map((s) => s.slug)).toEqual(['pa', 'pb']);
    r = (await c.patch(`/admin/drops/${d.id}`, { stimpieIds: [b.id] })).json<ADrop>();
    expect(r.stimpies.map((s) => s.slug)).toEqual(['pb']);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: a.id } })).dropId).toBeNull();
    r = (await c.patch(`/admin/drops/${d.id}`, { name: 'Again' })).json<ADrop>(); // stimpieIds absent: assignment untouched
    expect(r.stimpies.map((s) => s.slug)).toEqual(['pb']);
    r = (await c.patch(`/admin/drops/${d.id}`, { stimpieIds: [] })).json<ADrop>();
    expect(r.stimpies).toEqual([]);
    r = (await c.patch(`/admin/drops/${d.id}`, { teaserImage: null })).json<ADrop>();
    expect(r.teaserImage).toBeNull();
  });

  it('a Stimpie taken out of an upcoming drop is hidden, so it does not become buyable before the launch', async () => {
    freezeTime(T0);
    const c = await admin();
    const a = await createStimpie(t.prisma, { slug: 'early-a', type: 'LIMITED', quantity: 5 });
    const b = await createStimpie(t.prisma, { slug: 'early-b', type: 'LIMITED', quantity: 5 });
    const d = (await c.post('/admin/drops', { name: 'Soon', accentColor: 'SKY', startsAt: at(24 * 60).toISOString(), stimpieIds: [a.id, b.id] })).json<ADrop>();
    expect((await c.patch(`/admin/drops/${d.id}`, { stimpieIds: [b.id] })).status).toBe(200);
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ dropId: null, active: false });
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ dropId: d.id, active: true });
    const v = await t.client.post('/cart/validate', { items: [{ kind: 'stimpie', stimpieId: a.id, qty: 1 }] }, { origin: 'http://localhost:3000' });
    expect(v.status).toBe(200);
    expect(v.json().lines[0].problems[0]).toMatchObject({ kind: 'STIMPIE', stimpieId: a.id, reason: 'INACTIVE' });
    expect((await t.client.get('/products/stimpies/early-a')).status).toBe(404);
  });

  it('validates the time window against the stored values and rejects a bad slug collision', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = (await c.post('/admin/drops', { name: 'D', accentColor: 'SKY', startsAt: at(120).toISOString(), endsAt: at(240).toISOString() })).json<ADrop>();
    const other = (await c.post('/admin/drops', { name: 'Other', accentColor: 'SKY', startsAt: at(120).toISOString() })).json<ADrop>();
    expect((await c.patch(`/admin/drops/${d.id}`, { endsAt: at(60).toISOString() })).json<Err>().error.fields).toEqual({ endsAt: expect.any(String) });
    expect((await c.patch(`/admin/drops/${d.id}`, { startsAt: at(300).toISOString() })).json<Err>().error.fields).toEqual({ endsAt: expect.any(String) });
    expect((await c.patch(`/admin/drops/${d.id}`, { startsAt: at(300).toISOString(), endsAt: null })).status).toBe(200);
    const dup = await c.patch(`/admin/drops/${d.id}`, { slug: other.slug });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error.details).toEqual({ field: 'slug' });
    expect((await c.patch('/admin/drops/999999', { name: 'x' })).status).toBe(404);
    expect((await c.patch(`/admin/drops/${d.id}`, { accentColor: 'RED' })).status).toBe(400);
  });

  it('a drop that already started cannot be moved to a later start, but can start earlier or change its end', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'running', startsAt: at(-60) });
    await createStimpie(t.prisma, { dropId: d.id, quantity: 5 });
    const later = await c.patch(`/admin/drops/${d.id}`, { startsAt: at(30).toISOString() });
    expect(later.status).toBe(400);
    expect(later.json<Err>().error.fields).toEqual({ startsAt: expect.any(String) });
    expect((await c.patch(`/admin/drops/${d.id}`, { startsAt: at(-120).toISOString(), endsAt: at(500).toISOString() })).status).toBe(200);
    expect((await c.get(`/admin/drops/${d.id}`)).json<ADrop>().state).toBe('LIVE');
  });

  it('relaunch: an early-ended drop goes live again when given an open or future end; a plain edit keeps it ended', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'rl', startsAt: at(-600) });
    await createStimpie(t.prisma, { dropId: d.id, quantity: 5 });
    expect((await c.post(`/admin/drops/${d.id}/end`)).json<ADrop>().state).toBe('ENDED');
    const edit = (await c.patch(`/admin/drops/${d.id}`, { name: 'Renamed' })).json<ADrop>();
    expect(edit.state).toBe('ENDED');
    expect(edit.endedAt).not.toBeNull();
    const past = await c.patch(`/admin/drops/${d.id}`, { endsAt: at(-5).toISOString() });
    expect(past.json<ADrop>().state).toBe('ENDED'); // still over
    expect(past.json<ADrop>().endedAt).not.toBeNull();
    const relaunch = (await c.patch(`/admin/drops/${d.id}`, { endsAt: at(120).toISOString() })).json<ADrop>();
    expect(relaunch).toMatchObject({ state: 'LIVE', endedAt: null });
    expect((await t.client.get('/drops')).json<{ live: { slug: string } }>().live.slug).toBe('rl');
    await c.post(`/admin/drops/${d.id}/end`);
    expect((await c.patch(`/admin/drops/${d.id}`, { endsAt: null })).json<ADrop>()).toMatchObject({ state: 'LIVE', endedAt: null });
  });

  it('a drop whose planned end passed is relaunched by moving the end into the future', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'pe', startsAt: at(-600), endsAt: at(-10) });
    await createStimpie(t.prisma, { dropId: d.id, quantity: 5 });
    expect((await c.get(`/admin/drops/${d.id}`)).json<ADrop>().state).toBe('ENDED');
    expect((await c.patch(`/admin/drops/${d.id}`, { endsAt: at(10).toISOString() })).json<ADrop>().state).toBe('LIVE');
    advanceTime(11 * 60_000);
    expect((await c.get(`/admin/drops/${d.id}`)).json<ADrop>().state).toBe('ENDED');
  });
});

describe('POST /admin/drops/:id/end', () => {
  it('ends a live drop immediately: state ENDED, its Stimpies become ENDED / not purchasable, open orders are untouched', async () => {
    freezeTime(T0);
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'live', startsAt: at(-60) });
    const s = await createStimpie(t.prisma, { slug: 'live-s', dropId: d.id, quantity: 10, reserved: 2 });
    await orderLine(t.prisma, s.id, { qty: 2, state: 'RESERVED' });
    const res = await c.post(`/admin/drops/${d.id}/end`);
    expect(res.status).toBe(200);
    expect(res.json<ADrop>()).toMatchObject({ state: 'ENDED', endedAt: T0.toISOString() });
    expect(res.json<ADrop>().stimpies[0]).toMatchObject({ status: 'ENDED', purchasable: false });
    expect((await t.client.get('/products/stimpies/live-s')).json<{ status: string }>().status).toBe('ENDED');
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).reserved).toBe(2);
    expect(await t.prisma.orderStockLine.count({ where: { state: 'RESERVED' } })).toBe(1);
    expect((await t.client.get('/drops')).json<{ live: unknown; archive: unknown[] }>()).toMatchObject({ live: null, archive: [{ slug: 'live' }] });
  });

  it('a sold-out drop can be ended; 409 for an already ended drop and for one that has not started; 404 unknown', async () => {
    freezeTime(T0);
    const c = await admin();
    const sold = await createDrop(t.prisma, { slug: 'sold', startsAt: at(-60) });
    await createStimpie(t.prisma, { dropId: sold.id, quantity: 1, reserved: 1 });
    expect((await c.post(`/admin/drops/${sold.id}/end`)).json<ADrop>().state).toBe('ENDED');
    const again = await c.post(`/admin/drops/${sold.id}/end`);
    expect(again.status).toBe(409);
    expect(again.json<Err>().error.code).toBe('CONFLICT');
    const planned = await createDrop(t.prisma, { slug: 'planned', startsAt: at(-60), endsAt: at(-1) });
    expect((await c.post(`/admin/drops/${planned.id}/end`)).status).toBe(409);
    const up = await createDrop(t.prisma, { slug: 'up', startsAt: at(60) });
    expect((await c.post(`/admin/drops/${up.id}/end`)).status).toBe(409);
    expect((await c.post('/admin/drops/999999/end')).status).toBe(404);
  });
});

describe('DELETE /admin/drops/:id', () => {
  it('deletes a drop without orders: its Stimpies leave the drop and are hidden, subscribers stay as "any drop"', async () => {
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'del' });
    const s = await createStimpie(t.prisma, { slug: 'del-s', dropId: d.id });
    await t.prisma.subscriber.create({ data: { contact: 'f@y.com', type: 'EMAIL', dropId: d.id } });
    const res = await c.delete(`/admin/drops/${d.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(await t.prisma.drop.count()).toBe(0);
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ dropId: null, active: false });
    expect((await t.prisma.subscriber.findFirstOrThrow()).dropId).toBeNull();
    expect((await c.delete(`/admin/drops/${d.id}`)).status).toBe(404);
  });

  it('409 CONFLICT when any order references one of its Stimpies, and nothing is changed', async () => {
    const c = await admin();
    const d = await createDrop(t.prisma, { slug: 'busy' });
    const s = await createStimpie(t.prisma, { dropId: d.id });
    await orderLine(t.prisma, s.id, { qty: 1, state: 'RELEASED' }); // even a cancelled order counts
    const res = await c.delete(`/admin/drops/${d.id}`);
    expect(res.status).toBe(409);
    expect(res.json<Err>().error.code).toBe('CONFLICT');
    expect(await t.prisma.drop.count()).toBe(1);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).active).toBe(true);
  });
});

describe('GET /admin/subscribers', () => {
  async function seedSubs() {
    freezeTime('2026-10-14T10:00:00Z');
    const d1 = await createDrop(t.prisma, { slug: 's1', name: 'Drop One' });
    const d2 = await createDrop(t.prisma, { slug: 's2', name: 'Drop Two, "special"' });
    const row = (contact: string, type: 'EMAIL' | 'WHATSAPP', dropId: number | null, createdAt: string) =>
      t.prisma.subscriber.create({ data: { contact, type, dropId, createdAt: new Date(createdAt) } });
    await row('a@y.com', 'EMAIL', d1.id, '2026-10-01T10:00:00Z');
    await row('+9613123456', 'WHATSAPP', d1.id, '2026-10-02T10:00:00Z');
    await row('c@y.com', 'EMAIL', d2.id, '2026-10-03T10:00:00Z');
    await row('=cmd|calc@y.com', 'EMAIL', null, '2026-10-04T10:00:00Z');
    return { d1, d2 };
  }

  it('lists newest first with the documented keys, dropName (null for "any drop"), paging and filters', async () => {
    const { d1 } = await seedSubs();
    const c = await admin();
    const res = await c.get('/admin/subscribers');
    expect(res.status).toBe(200);
    const body = res.json<Page<{ id: number; contact: string; type: string; customerId: number | null; dropName: string | null; createdAt: string }>>();
    expect(body).toMatchObject({ page: 1, pageSize: 25, total: 4 });
    expect(Object.keys(body.items[0]!).sort()).toEqual(['contact', 'createdAt', 'customerId', 'dropName', 'id', 'type']);
    expect(body.items.every((row) => row.customerId === null)).toBe(true);
    expect(body.items.map((s) => s.contact)).toEqual(['=cmd|calc@y.com', 'c@y.com', '+9613123456', 'a@y.com']);
    expect(body.items[0]!.dropName).toBeNull();
    expect(body.items[1]!.dropName).toBe('Drop Two, "special"');
    expect(body.items[3]!.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect((await c.get('/admin/subscribers', { query: { pageSize: 2, page: 2 } })).json<Page<unknown>>().items).toHaveLength(2);
    expect((await c.get('/admin/subscribers', { query: { type: 'WHATSAPP' } })).json<Page<unknown>>().total).toBe(1);
    expect((await c.get('/admin/subscribers', { query: { dropId: d1.id } })).json<Page<unknown>>().total).toBe(2);
    expect((await c.get('/admin/subscribers', { query: { q: 'a@y.com' } })).json<Page<unknown>>().total).toBe(1);
    for (const wild of ['%', '_', 'a%y']) expect((await c.get('/admin/subscribers', { query: { q: wild } })).json<Page<unknown>>().total, wild).toBe(0);
  });

  it('?format=csv returns every row as text/csv with the file name subscribers-YYYY-MM-DD.csv and formula protection', async () => {
    await seedSubs();
    const c = await admin();
    const res = await c.get('/admin/subscribers', { query: { format: 'csv', pageSize: 1 } }); // paging is ignored for the export
    expect(res.status).toBe(200);
    expect(res.header('content-type')).toContain('text/csv');
    expect(res.header('content-disposition')).toBe('attachment; filename="subscribers-2026-10-14.csv"');
    expect(res.header('cache-control')).toBe('no-store');
    const lines = res.body.trim().split('\r\n');
    expect(lines).toEqual([
      'contact,type,drop,createdAt',
      "'=cmd|calc@y.com,EMAIL,,2026-10-04T10:00:00.000Z",
      'c@y.com,EMAIL,"Drop Two, ""special""",2026-10-03T10:00:00.000Z',
      '+9613123456,WHATSAPP,Drop One,2026-10-02T10:00:00.000Z',
      'a@y.com,EMAIL,Drop One,2026-10-01T10:00:00.000Z',
    ]);
  });

  it('the CSV file name uses the business timezone day (Asia/Beirut is ahead of UTC)', async () => {
    freezeTime('2026-10-14T22:30:00Z'); // 01:30 on the 15th in Beirut (UTC+3)
    const c = await admin();
    const res = await c.get('/admin/subscribers', { query: { format: 'csv' } });
    expect(res.header('content-disposition')).toBe('attachment; filename="subscribers-2026-10-15.csv"');
    expect(res.body).toBe('contact,type,drop,createdAt\r\n');
  });

  it('rejects an unknown format', async () => {
    const c = await admin();
    expect((await c.get('/admin/subscribers', { query: { format: 'xlsx' } })).status).toBe(400);
  });
});

describe('subscribe -> admin list round trip', () => {
  it('a public sign-up shows up in the dashboard with the drop name', async () => {
    const w = await buildWorld(t.prisma);
    await t.client.post(`/drops/${w.drop.id}/subscribe`, { contact: '71 123 456', type: 'WHATSAPP' });
    const c = await admin();
    const list = (await c.get('/admin/subscribers')).json<Page<{ contact: string; dropName: string }>>();
    expect(list.items).toEqual([expect.objectContaining({ contact: '+96171123456', dropName: 'Drop 001' })]);
  });
});
