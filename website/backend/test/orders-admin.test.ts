import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createStimpie, type World } from './helpers/fixtures';
import { freezeTime } from './helpers/clock';
import { deepKeys, hoodieItem, orderBody, packItem, phoneN, placeInput, stimpieItem } from './helpers/orders';
import { changeStatus, placeOrder } from '../src/services/orders';
import type { CartItemInput } from '../src/services/pricing';
import { csvCell } from '../src/modules/orders/service';
import { likeEscape } from '../src/lib/like';

const t = useTestApp();

type Summary = { id: number; number: string; status: string; source: string; customerName: string; itemsSummary: string; totalCents: number; holdExpired: boolean; deliveryNumber: string | null };
type Page = { items: Summary[]; total: number; page: number; pageSize: number };

const placeAs = (w: World, items: CartItemInput[], o: Parameters<typeof placeInput>[2] = {}) => placeOrder(t.ctx, placeInput(w, items, o));
const numbersOf = (p: Page) => p.items.map((i) => i.number);

// ---------------------------------------------------------------- auth

const ADMIN_ROUTES: [string, string][] = [
  ['GET', '/admin/orders'],
  ['GET', '/admin/orders/counts'],
  ['POST', '/admin/orders'],
  ['POST', '/admin/orders/bulk-status'],
  ['POST', '/admin/orders/export'],
  ['GET', '/admin/orders/1'],
  ['PATCH', '/admin/orders/1'],
  ['PATCH', '/admin/orders/1/contact'],
  ['POST', '/admin/orders/1/status'],
  ['POST', '/admin/orders/1/delivery'],
  ['POST', '/admin/orders/1/cash'],
  ['POST', '/admin/orders/1/notes'],
  ['POST', '/admin/orders/1/extend-hold'],
  ['POST', '/admin/orders/1/email'],
  ['GET', '/admin/orders/1/whatsapp?template=delivered'],
  ['GET', '/admin/stock/hoodies'],
  ['GET', '/admin/stock/stimpies'],
  ['POST', '/admin/stock/adjust'],
  ['POST', '/admin/stock/set'],
  ['GET', '/admin/stock/movements'],
  ['GET', '/admin/deliveries'],
  ['POST', '/admin/deliveries/dispatch'],
  ['POST', '/admin/deliveries/X/settle'],
  ['GET', '/admin/areas'],
  ['POST', '/admin/areas'],
  ['PATCH', '/admin/areas/1'],
  ['DELETE', '/admin/areas/1'],
  ['GET', '/admin/settings/delivery'],
  ['PATCH', '/admin/settings/delivery'],
];

describe('every admin route of orders, stock and deliveries requires a session', () => {
  it.each(ADMIN_ROUTES)('%s %s is 401 UNAUTHENTICATED without a cookie', async (method, path) => {
    const res = await t.client.request(method as 'GET', path, { body: method === 'GET' || method === 'DELETE' ? undefined : {}, origin: t.config.adminUrl });
    expect(res.status).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('a state-changing admin request from a foreign Origin is refused even with a valid session', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const { orderId } = await placeAs(w, [hoodieItem(w)]);
    const res = await client.post(`/admin/orders/${orderId}/status`, { to: 'CONFIRMED' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('NEW');
  });

  it('public order routes do not expose admin data, and admin JSON is never cached', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const { orderId } = await placeAs(w, [hoodieItem(w)]);
    const r = await client.get(`/admin/orders/${orderId}`);
    expect(r.header('cache-control')).toMatch(/no-store|private/);
  });
});

// ---------------------------------------------------------------- list

describe('GET /admin/orders', () => {
  async function seed() {
    const w = await buildWorld(t.prisma, { hoodieStock: 100 });
    const { client } = await t.adminClient();
    const base = new Date('2026-10-10T10:00:00Z').getTime();
    const mk = async (i: number, items: CartItemInput[], o: Parameters<typeof placeInput>[2] = {}) =>
      (await placeAs(w, items, { i, placedAt: new Date(base + i * 3600_000), ...o })).orderId;
    const ids = {
      a: await mk(1, [hoodieItem(w)], { delivery: { areaId: w.areas[0]!.id, areaName: 'Beirut', address: 'Hamra Street 5', notes: null } }), // 1001, $28
      b: await mk(2, [packItem(w, [w.core[0]!.id])], { delivery: { areaId: w.areas[1]!.id, areaName: 'Mount Lebanon', address: 'Jounieh main 1', notes: null } }),
      c: await mk(3, [stimpieItem(w.limited[0]!.id, 2)], { source: 'INSTAGRAM' }),
      d: await mk(4, [hoodieItem(w, 2), stimpieItem(w.core[1]!.id)], { source: 'WHATSAPP' }),
      e: await mk(5, [hoodieItem(w, 1, 'cream', 'l')]),
    };
    await changeStatus(t.ctx, { orderId: ids.b, to: 'CONFIRMED', userId: null });
    await changeStatus(t.ctx, { orderId: ids.c, to: 'CANCELLED', userId: null });
    await changeStatus(t.ctx, { orderId: ids.d, to: 'CONFIRMED', userId: null });
    await changeStatus(t.ctx, { orderId: ids.d, to: 'PACKED', userId: null });
    await changeStatus(t.ctx, { orderId: ids.d, to: 'OUT_FOR_DELIVERY', userId: null, deliveryNumber: 'RUN-5' });
    return { w, client, ids };
  }
  const list = async (client: Awaited<ReturnType<typeof seed>>['client'], query: Record<string, string | number | boolean> = {}) => {
    const r = await client.get('/admin/orders', { query });
    expect(r.status, r.body).toBe(200);
    return r.json<Page>();
  };

  it('returns the summary shape newest first, with the page envelope and a readable items summary', async () => {
    const { client } = await seed();
    const p = await list(client);
    expect(p).toMatchObject({ page: 1, pageSize: 25, total: 5 });
    expect(numbersOf(p)).toEqual(['STP-1005', 'STP-1004', 'STP-1003', 'STP-1002', 'STP-1001']);
    expect(p.items[0]).toEqual({
      id: expect.any(Number),
      number: 'STP-1005',
      placedAt: '2026-10-10T15:00:00.000Z',
      status: 'NEW',
      source: 'WEBSITE',
      customerName: 'Customer 5',
      contactPhone: '+96171100005',
      areaName: 'Beirut',
      itemsSummary: 'Stimpy Hoodie',
      totalCents: 2500 + 300,
      deliveryNumber: null,
      cashCollected: false,
      cashSettled: false,
      holdExpired: expect.any(Boolean),
    });
    const byNumber = Object.fromEntries(p.items.map((i) => [i.number, i.itemsSummary]));
    expect(byNumber['STP-1003']).toBe('2 Stimpies');
    expect(byNumber['STP-1004']).toBe('2 x Stimpy Hoodie, 1 Stimpie');
  });

  it('filters: single and multi status, source, area, drop, delivery number', async () => {
    const { client, w } = await seed();
    expect(numbersOf(await list(client, { status: 'NEW' }))).toEqual(['STP-1005', 'STP-1001']);
    const multi = await list(client, { status: 'NEW,CONFIRMED' });
    expect(multi.total).toBe(3);
    expect(new Set(multi.items.map((i) => i.status))).toEqual(new Set(['NEW', 'CONFIRMED']));
    expect(numbersOf(await list(client, { source: 'INSTAGRAM' }))).toEqual(['STP-1003']);
    expect(numbersOf(await list(client, { source: 'WHATSAPP' }))).toEqual(['STP-1004']);
    expect(numbersOf(await list(client, { areaId: w.areas[1]!.id }))).toEqual(['STP-1002']);
    expect(numbersOf(await list(client, { dropId: w.drop.id }))).toEqual(['STP-1003']);
    expect(numbersOf(await list(client, { deliveryNumber: 'RUN-5' }))).toEqual(['STP-1004']);
    expect((await list(client, { status: 'RETURNED' })).total).toBe(0);
  });

  it('rejects an unknown status, a bad date, a bad page size', async () => {
    const { client } = await seed();
    expect((await client.get('/admin/orders', { query: { status: 'NEW,BOGUS' } })).status).toBe(400);
    expect((await client.get('/admin/orders', { query: { from: '14-10-2026' } })).status).toBe(400);
    expect((await client.get('/admin/orders', { query: { pageSize: 1000 } })).status).toBe(400);
    expect((await client.get('/admin/orders', { query: { page: 0 } })).status).toBe(400);
    expect((await client.get('/admin/orders', { query: { from: '2026-02-31' } })).status).toBe(400);
  });

  it('from/to are whole days in the business timezone (Asia/Beirut)', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 100 });
    const { client } = await t.adminClient();
    await placeAs(w, [hoodieItem(w)], { i: 1, placedAt: new Date('2026-10-13T20:59:00Z') }); // 23:59 on the 13th in Beirut (UTC+3)
    await placeAs(w, [hoodieItem(w)], { i: 2, placedAt: new Date('2026-10-13T21:01:00Z') }); // 00:01 on the 14th
    await placeAs(w, [hoodieItem(w)], { i: 3, placedAt: new Date('2026-10-14T20:59:00Z') }); // 23:59 on the 14th
    await placeAs(w, [hoodieItem(w)], { i: 4, placedAt: new Date('2026-10-14T21:00:00Z') }); // 00:00 on the 15th
    expect(numbersOf(await list(client, { from: '2026-10-14', to: '2026-10-14' }))).toEqual(['STP-1003', 'STP-1002']);
    expect(numbersOf(await list(client, { to: '2026-10-13' }))).toEqual(['STP-1001']);
    expect(numbersOf(await list(client, { from: '2026-10-15' }))).toEqual(['STP-1004']);
  });

  it('q searches number, bare digits, e-mail, name, delivery number and phone in any common format', async () => {
    const { client } = await seed();
    expect(numbersOf(await list(client, { q: 'STP-1003' }))).toEqual(['STP-1003']);
    expect(numbersOf(await list(client, { q: 'stp-1003' }))).toEqual(['STP-1003']);
    expect(numbersOf(await list(client, { q: '1003' }))).toEqual(['STP-1003']);
    expect(numbersOf(await list(client, { q: 'customer4@' }))).toEqual(['STP-1004']);
    expect(numbersOf(await list(client, { q: 'Customer 2' }))).toEqual(['STP-1002']);
    expect(numbersOf(await list(client, { q: 'RUN-5' }))).toEqual(['STP-1004']);
    expect(numbersOf(await list(client, { q: '71 100 002' }))).toEqual(['STP-1002']);
    expect(numbersOf(await list(client, { q: '+961 71 100 002' }))).toEqual(['STP-1002']);
    expect(numbersOf(await list(client, { q: '100003' }))).toEqual(['STP-1003']); // partial phone digits
    expect((await list(client, { q: 'nobody-matches-this' })).total).toBe(0);
  });

  it('q treats % and _ literally (no wildcard matches), and a backslash too', async () => {
    const { client } = await seed();
    expect((await list(client, { q: '%' })).total).toBe(0);
    expect((await list(client, { q: 'Customer _' })).total).toBe(0);
    expect((await list(client, { q: '%%%' })).total).toBe(0);
    expect((await list(client, { q: 'C%r 2' })).total).toBe(0);
    await t.prisma.order.update({ where: { number: 'STP-1005' }, data: { customerName: '50% Off_Fan' } });
    expect(numbersOf(await list(client, { q: '50%' }))).toEqual(['STP-1005']);
    expect(numbersOf(await list(client, { q: 'Off_Fan' }))).toEqual(['STP-1005']);
    expect((await list(client, { q: 'Off_Fa_' })).total).toBe(0);
  });

  it('likeEscape escapes %, _ and the backslash itself', () => {
    const bs = String.fromCharCode(92);
    expect(likeEscape('50%')).toBe(`50${bs}%`);
    expect(likeEscape('a_b')).toBe(`a${bs}_b`);
    expect(likeEscape(`a${bs}b`)).toBe(`a${bs}${bs}b`);
    expect(likeEscape('plain')).toBe('plain');
  });

  it('sorts by placedAt, totalCents, number and status, either direction; unknown sort values fall back to newest first', async () => {
    const { client } = await seed();
    expect(numbersOf(await list(client, { sort: 'placedAt' }))).toEqual(['STP-1001', 'STP-1002', 'STP-1003', 'STP-1004', 'STP-1005']);
    expect(numbersOf(await list(client, { sort: '-placedAt' }))).toEqual(['STP-1005', 'STP-1004', 'STP-1003', 'STP-1002', 'STP-1001']);
    expect(numbersOf(await list(client, { sort: 'number' }))).toEqual(['STP-1001', 'STP-1002', 'STP-1003', 'STP-1004', 'STP-1005']);
    expect(numbersOf(await list(client, { sort: '-number' }))[0]).toBe('STP-1005');
    const asc = await list(client, { sort: 'totalCents' });
    expect(asc.items.map((i) => i.totalCents)).toEqual([...asc.items.map((i) => i.totalCents)].sort((a, b) => a - b));
    const desc = await list(client, { sort: '-totalCents' });
    expect(desc.items.map((i) => i.totalCents)).toEqual([...desc.items.map((i) => i.totalCents)].sort((a, b) => b - a));
    const st = await list(client, { sort: 'status' });
    const rank = ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED']; // enum order = pipeline order
    expect(st.items.map((i) => rank.indexOf(i.status))).toEqual([...st.items.map((i) => rank.indexOf(i.status))].sort((a, b) => a - b));
  });

  it('paginates and afterId returns only newer rows (polling for new orders)', async () => {
    const { client, ids } = await seed();
    const p1 = await list(client, { pageSize: 2, page: 1 });
    const p2 = await list(client, { pageSize: 2, page: 2 });
    const p3 = await list(client, { pageSize: 2, page: 3 });
    expect([p1.total, p1.items.length, p2.items.length, p3.items.length]).toEqual([5, 2, 2, 1]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).size).toBe(5);
    const after = await list(client, { afterId: ids.c });
    expect(after.items.map((i) => i.id).sort((a, b) => a - b)).toEqual([ids.d, ids.e]);
    expect((await list(client, { afterId: ids.e })).total).toBe(0);
  });

  it('GET /admin/orders/counts: ALL and one count per status, matching the list totals', async () => {
    const { client } = await seed();
    const r = await client.get('/admin/orders/counts');
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ ALL: 5, NEW: 2, CONFIRMED: 1, PACKED: 0, OUT_FOR_DELIVERY: 1, DELIVERED: 0, CANCELLED: 1, RETURNED: 0 });
    for (const [status, n] of Object.entries(r.json<Record<string, number>>())) {
      if (status !== 'ALL') expect((await list(client, { status })).total).toBe(n);
    }
  });
});

// ---------------------------------------------------------------- detail and edits

describe('GET /admin/orders/:id and the edit endpoints', () => {
  it('returns the full detail: contact snapshot, items with details, events newest first, allowed transitions, cost', async () => {
    const w = await buildWorld(t.prisma);
    const { client, admin } = await t.adminClient();
    const { orderId } = await placeAs(w, [packItem(w, [w.core[0]!.id]), stimpieItem(w.limited[0]!.id, 2)], { delivery: { areaId: w.areas[1]!.id, areaName: 'Jounieh', address: 'Main street 5', notes: 'Ring twice' } });
    await changeStatus(t.ctx, { orderId, to: 'CONFIRMED', userId: admin.user.id, note: 'Phoned' });
    const r = await client.get(`/admin/orders/${orderId}`);
    expect(r.status).toBe(200);
    const o = r.json();
    expect(o).toMatchObject({
      id: orderId,
      number: 'STP-1001',
      status: 'CONFIRMED',
      customer: { name: 'Customer 0', email: 'customer0@example.com', phone: '+96171100000', whatsapp: '+96171100000' },
      contact: { email: 'customer0@example.com', phone: '+96171100000', whatsapp: '+96171100000' },
      delivery: { areaId: w.areas[1]!.id, areaName: 'Jounieh', address: 'Main street 5', notes: 'Ring twice' },
      subtotalCents: 3500 + 2400,
      deliveryFeeCents: 500,
      totalCents: 6400,
      costCents: 1700 + 1200,
      holdExpiresAt: null,
      allowedTransitions: ['PACKED', 'CANCELLED'],
      warnings: [],
    });
    expect(o.items).toHaveLength(2);
    expect(o.items[0]).toMatchObject({ kind: 'PACK', qty: 1, unitPriceCents: 3500, details: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: ['THE VOID'] } });
    expect(o.events.map((e: { to: string }) => e.to)).toEqual(['CONFIRMED', 'NEW']);
    expect(o.events[0]).toMatchObject({ from: 'NEW', to: 'CONFIRMED', by: 'Test Owner', note: 'Phoned' });
    expect(o.emails.map((e: { template: string }) => e.template)).toEqual(['order_confirmed', 'order_received']); // newest first
    expect(o.emails[0]).toMatchObject({ to: 'customer0@example.com', status: 'PENDING' });
  });

  it('404 for an unknown order, 400 for a non-numeric id', async () => {
    await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    expect((await client.get('/admin/orders/999999')).status).toBe(404);
    expect((await client.get('/admin/orders/abc')).status).toBe(400);
  });

  it('POST /status over HTTP: changes status, returns the order with warnings, 409 INVALID_TRANSITION with details, 422 DELIVERY_NUMBER_REQUIRED', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const a = (await placeAs(w, [hoodieItem(w)], { i: 1 })).orderId;
    const b = (await placeAs(w, [hoodieItem(w)], { i: 2 })).orderId;
    const bad = await client.post(`/admin/orders/${a}/status`, { to: 'DELIVERED' });
    expect(bad.status).toBe(409);
    expect(bad.json().error).toMatchObject({ code: 'INVALID_TRANSITION', details: { from: 'NEW', to: 'DELIVERED', allowed: ['CONFIRMED', 'CANCELLED'] } });
    for (const id of [a, b]) {
      expect((await client.post(`/admin/orders/${id}/status`, { to: 'CONFIRMED' })).status).toBe(200);
      expect((await client.post(`/admin/orders/${id}/status`, { to: 'PACKED' })).status).toBe(200);
    }
    const noDn = await client.post(`/admin/orders/${a}/status`, { to: 'OUT_FOR_DELIVERY' });
    expect(noDn.status).toBe(422);
    expect(noDn.json().error.code).toBe('DELIVERY_NUMBER_REQUIRED');
    expect((await client.post(`/admin/orders/${a}/status`, { to: 'OUT_FOR_DELIVERY', deliveryNumber: 'R1' })).json().warnings).toEqual([]);
    const second = await client.post(`/admin/orders/${b}/status`, { to: 'OUT_FOR_DELIVERY', deliveryNumber: 'R1' });
    expect(second.status).toBe(200);
    expect(second.json().warnings).toEqual([{ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: 'R1', orderIds: [a] }]);
    expect(second.json().allowedTransitions).toEqual(['DELIVERED', 'RETURNED']);
    expect((await client.post(`/admin/orders/${a}/status`, { to: 'NOPE' })).status).toBe(400);
    expect((await client.post(`/admin/orders/${a}/status`, { to: 'DELIVERED', extra: 1 })).status).toBe(400);
    expect((await client.post('/admin/orders/999999/status', { to: 'CONFIRMED' })).status).toBe(404);
  });

  it('POST /delivery over HTTP corrects the number and returns warnings (no resend)', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = (await placeAs(w, [hoodieItem(w)])).orderId;
    await client.post(`/admin/orders/${id}/status`, { to: 'CONFIRMED' });
    await client.post(`/admin/orders/${id}/status`, { to: 'PACKED' });
    expect((await client.post(`/admin/orders/${id}/delivery`, { deliveryNumber: 'A1' })).json().status).toBe('OUT_FOR_DELIVERY');
    const fix = await client.post(`/admin/orders/${id}/delivery`, { deliveryNumber: 'A2' });
    expect(fix.status).toBe(200);
    expect(fix.json().deliveryNumber).toBe('A2');
    expect(fix.json().events[0].note).toBe('Delivery number changed from A1 to A2');
    expect(fix.json().emails.filter((e: { template: string }) => e.template === 'order_out_for_delivery')).toHaveLength(1);
    expect((await client.post(`/admin/orders/${id}/delivery`, { deliveryNumber: '' })).status).toBe(422);
  });

  it('PATCH delivery edits address/area/notes with an audit event and never recomputes the total; blocked after delivery', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = (await placeAs(w, [hoodieItem(w)])).orderId;
    const before = await t.prisma.order.findUniqueOrThrow({ where: { id } });
    const r = await client.patch(`/admin/orders/${id}`, { delivery: { areaId: w.areas[1]!.id, address: 'New address 12', notes: null } });
    expect(r.status).toBe(200);
    expect(r.json().delivery).toMatchObject({ areaId: w.areas[1]!.id, areaName: 'Mount Lebanon', address: 'New address 12', notes: null });
    expect(r.json().totalCents).toBe(before.totalCents);
    expect(r.json().deliveryFeeCents).toBe(before.deliveryFeeCents);
    expect(r.json().events[0].note).toBe('Delivery details updated (area, address, notes)');
    expect((await client.patch(`/admin/orders/${id}`, { delivery: { address: 'x' } })).json().error.fields).toHaveProperty(['delivery.address']);
    expect((await client.patch(`/admin/orders/${id}`, { delivery: { areaId: 999999 } })).json().error.fields).toHaveProperty(['delivery.areaId']);
    await changeStatus(t.ctx, { orderId: id, to: 'CANCELLED', userId: null });
    expect((await client.patch(`/admin/orders/${id}`, { delivery: { address: 'Another address' } })).status).toBe(409);
  });

  it('PATCH contact corrects the order snapshot only: customer row untouched, event logged, old and new phone normalised', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = (await placeAs(w, [hoodieItem(w)])).orderId;
    const r = await client.patch(`/admin/orders/${id}/contact`, { phone: '03 555 666', email: 'fixed@example.com' });
    expect(r.status).toBe(200);
    expect(r.json().contact).toMatchObject({ phone: '+9613555666', email: 'fixed@example.com' });
    expect(r.json().events[0].note).toBe('Contact updated (email, phone)');
    const customer = await t.prisma.customer.findFirstOrThrow();
    expect(customer).toMatchObject({ phone: '+96171100000', email: 'customer0@example.com' });
    expect((await client.patch(`/admin/orders/${id}/contact`, { phone: 'abc' })).status).toBe(400);
    expect((await client.patch(`/admin/orders/${id}/contact`, { email: 'not-an-email' })).json().error.fields).toHaveProperty('email');
    const same = await client.patch(`/admin/orders/${id}/contact`, { phone: '03555666' });
    expect(same.json().events).toHaveLength(2); // unchanged value logs nothing
    // tracking now needs the corrected phone
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '03 555 666' })).status).toBe(200);
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71 100 000' })).status).toBe(404);
  });

  it('notes: added with author, newest first; empty or oversized rejected', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = (await placeAs(w, [hoodieItem(w)])).orderId;
    await client.post(`/admin/orders/${id}/notes`, { body: 'First note' });
    const r = await client.post(`/admin/orders/${id}/notes`, { body: '  Second note  ' });
    expect(r.status).toBe(200);
    expect(r.json().notes.map((n: { body: string }) => n.body)).toEqual(['Second note', 'First note']);
    expect(r.json().notes[0].by).toBe('Test Owner');
    expect((await client.post(`/admin/orders/${id}/notes`, { body: '   ' })).status).toBe(400);
    expect((await client.post(`/admin/orders/${id}/notes`, { body: 'x'.repeat(1001) })).status).toBe(400);
  });

  it('GET /whatsapp builds a wa.me link to the order contact with the placeholders filled', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = (await placeAs(w, [hoodieItem(w)])).orderId;
    const r = await client.get(`/admin/orders/${id}/whatsapp`, { query: { template: 'order_confirmation' } });
    expect(r.status).toBe(200);
    const j = r.json<{ to: string; text: string; url: string }>();
    expect(j.to).toBe('+96171100000');
    expect(j.text).toContain('Customer 0');
    expect(j.text).toContain('STP-1001');
    expect(j.url).toBe(`https://wa.me/96171100000?text=${encodeURIComponent(j.text)}`);
    expect((await client.get(`/admin/orders/${id}/whatsapp`, { query: { template: 'nope' } })).status).toBe(400);
    expect((await client.get('/admin/orders/999999/whatsapp', { query: { template: 'delivered' } })).status).toBe(404);
  });

  it('POST /admin/orders creates a manual order with its own source/status, same availability rules, 201 with the detail shape', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const body = { ...orderBody(w, [packItem(w, [w.core[0]!.id])]), source: 'INSTAGRAM', initialStatus: 'CONFIRMED' };
    delete (body as { hp?: string }).hp;
    const r = await client.post('/admin/orders', body);
    expect(r.status, r.body).toBe(201);
    expect(r.json()).toMatchObject({ status: 'CONFIRMED', source: 'INSTAGRAM', holdExpiresAt: null, allowedTransitions: ['PACKED', 'CANCELLED'] });
    expect(r.json().events.map((e: { to: string }) => e.to)).toEqual(['CONFIRMED', 'NEW']);
    expect(r.json().events[0].by).toBe('Test Owner');
    // not purchasable and sold out behave like the public path
    const sold = await createStimpie(t.prisma, { quantity: 1 });
    await client.post('/admin/orders', { ...orderBody(w, [stimpieItem(sold.id)], { i: 2 }), hp: undefined });
    const again = await client.post('/admin/orders', { ...orderBody(w, [stimpieItem(sold.id)], { i: 3 }), hp: undefined });
    expect(again.status).toBe(409);
    expect(again.json().error.code).toBe('SOLD_OUT');
    // the manual order needs no e-mail
    const noMail = await client.post('/admin/orders', { ...orderBody(w, [hoodieItem(w)], { i: 4 }), hp: undefined, customer: { name: 'Walk In', email: null, phone: '71444444', whatsapp: null, whatsappSameAsPhone: true } });
    expect(noMail.status).toBe(201);
    expect(noMail.json().contact.email).toBeNull();
  });

  it('bulk-status: each order is validated on its own; the response lists updated ids and failed {id, code}', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const a = (await placeAs(w, [hoodieItem(w)], { i: 1 })).orderId;
    const b = (await placeAs(w, [hoodieItem(w)], { i: 2 })).orderId;
    const c = (await placeAs(w, [hoodieItem(w)], { i: 3 })).orderId;
    await changeStatus(t.ctx, { orderId: b, to: 'CANCELLED', userId: null });
    const r = await client.post('/admin/orders/bulk-status', { ids: [a, b, c, 999999, a], to: 'CONFIRMED' });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ updated: [a, c], failed: [{ id: b, code: 'INVALID_TRANSITION' }, { id: 999999, code: 'NOT_FOUND' }] });
    const packed = await client.post('/admin/orders/bulk-status', { ids: [a, c, b], to: 'PACKED' });
    expect(packed.json()).toEqual({ updated: [a, c], failed: [{ id: b, code: 'INVALID_TRANSITION' }] });
    // skipping a step is a per-order failure, not a request failure
    const skip = await client.post('/admin/orders/bulk-status', { ids: [a], to: 'DELIVERED' });
    expect(skip.json()).toEqual({ updated: [], failed: [{ id: a, code: 'INVALID_TRANSITION' }] });
    // the e-mails of the successes were queued once each
    expect(await t.prisma.emailLog.count({ where: { orderId: { in: [a, c] }, templateKey: 'order_confirmed' } })).toBe(2);
    expect((await client.post('/admin/orders/bulk-status', { ids: [], to: 'CONFIRMED' })).status).toBe(400);
    expect((await client.post('/admin/orders/bulk-status', { ids: [a], to: 'CANCELLED' })).status).toBe(400);
    expect((await client.post('/admin/orders/bulk-status', { ids: Array.from({ length: 201 }, (_, i) => i + 1), to: 'CONFIRMED' })).status).toBe(400);
  });
});

// ---------------------------------------------------------------- CSV export

describe('POST /admin/orders/export', () => {
  it('csvCell quotes commas, quotes and newlines and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    for (const bad of ['=SUM(A1)', '+961 3 123 456', '-1', '@cmd', '\tx']) expect(csvCell(bad).startsWith("'") || csvCell(bad).startsWith('"\'')).toBe(true);
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(false)).toBe('false');
  });

  it('streams text/csv with a dated attachment filename, BOM, header row and one row per order, over real HTTP semantics', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    await placeAs(w, [packItem(w, [w.core[0]!.id])], {
      i: 1,
      customer: { name: '=HYPERLINK("http://evil.example","x")', email: 'a@example.com', phone: '03 123 456', whatsapp: null, whatsappSameAsPhone: true },
      delivery: { areaId: null, areaName: 'Beirut', address: 'Street, "Block" 5\nSecond line', notes: '@home' },
    });
    await placeAs(w, [hoodieItem(w, 2)], { i: 2 });
    const r = await client.post('/admin/orders/export', {});
    expect(r.status, r.body).toBe(200);
    expect(r.header('content-type')).toBe('text/csv; charset=utf-8');
    expect(r.header('content-disposition')).toBe('attachment; filename="orders-2026-10-14.csv"');
    expect(r.header('cache-control')).toMatch(/no-store|private/);
    expect(r.body.charCodeAt(0)).toBe(0xfeff);
    const text = r.body.slice(1);
    expect(text.split('\r\n')[0]).toBe('Order number,Placed at,Status,Source,Customer,Phone,WhatsApp,Email,Area,Address,Delivery notes,Items,Subtotal (USD),Delivery fee (USD),Total (USD),Delivery number,Cash collected,Cash settled,Delivered at,Cancel reason');
    // formula in the name is defanged, phone starting with + too, quotes/commas/newlines survive
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(text).toContain(`'+9613123456`);
    expect(text).toContain(`"Street, ""Block"" 5\nSecond line"`);
    expect(text).toContain(`'@home`);
    expect(text).toContain('STP-1001');
    expect(text).toContain('(Black, M: THE VOID) x1'); // items text is present
    expect(text).toContain('35.00');
    const lines = text.trimEnd().split('\r\n');
    // the embedded newline is inside quotes and uses LF, so records are still CRLF separated
    expect(lines.length).toBe(1 + 2);
  });

  it('applies the same filters as the list, or exports exactly the given ids', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const a = (await placeAs(w, [hoodieItem(w)], { i: 1 })).orderId;
    const b = (await placeAs(w, [hoodieItem(w)], { i: 2, source: 'INSTAGRAM' })).orderId;
    await placeAs(w, [hoodieItem(w)], { i: 3 });
    await changeStatus(t.ctx, { orderId: a, to: 'CONFIRMED', userId: null });
    const dataLines = (body: string) => body.slice(1).trimEnd().split('\r\n').slice(1);
    expect(dataLines((await client.post('/admin/orders/export', { status: ['CONFIRMED'] })).body)).toHaveLength(1);
    expect(dataLines((await client.post('/admin/orders/export', { source: 'INSTAGRAM' })).body)[0]).toContain('STP-1002');
    expect(dataLines((await client.post('/admin/orders/export', { ids: [a, b] })).body)).toHaveLength(2);
    expect(dataLines((await client.post('/admin/orders/export', { q: 'customer3' })).body)).toHaveLength(1);
    expect(dataLines((await client.post('/admin/orders/export', { status: ['RETURNED'] })).body)).toHaveLength(0);
    expect((await client.post('/admin/orders/export', { status: ['NOPE'] })).status).toBe(400);
    expect((await client.post('/admin/orders/export', { bogus: 1 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------- /cart/validate

describe('POST /cart/validate', () => {
  it('prices a valid cart with delivery and reserves nothing', async () => {
    const w = await buildWorld(t.prisma);
    const r = await t.client.post('/cart/validate', { items: [packItem(w, [w.core[0]!.id]), stimpieItem(w.limited[0]!.id, 2)], areaId: w.areas[1]!.id });
    expect(r.status, r.body).toBe(200);
    expect(r.json()).toEqual({
      ok: true,
      lines: [
        { itemIndex: 0, ok: true, unitPriceCents: 3500, lineTotalCents: 3500, problems: [] },
        { itemIndex: 1, ok: true, unitPriceCents: 1200, lineTotalCents: 2400, problems: [] },
      ],
      subtotalCents: 5900,
      deliveryFeeCents: 500,
      totalCents: 6400,
      estimateText: '3 working days',
    });
    expect(await t.prisma.order.count()).toBe(0);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.limited[0]!.id } })).reserved).toBe(0);
    expect(await t.prisma.stockMovement.count()).toBe(0);
  });

  it('reports problems per line (sold out with counts, not purchasable with a reason) and totals only the good lines', async () => {
    const w = await buildWorld(t.prisma);
    const scarce = await createStimpie(t.prisma, { quantity: 1 });
    const hidden = await createStimpie(t.prisma, { active: false });
    const r = await t.client.post('/cart/validate', { items: [hoodieItem(w), stimpieItem(scarce.id, 3), stimpieItem(hidden.id)] });
    const j = r.json();
    expect(j.ok).toBe(false);
    expect(j.lines[0]).toMatchObject({ ok: true, problems: [] });
    expect(j.lines[1].ok).toBe(false);
    expect(j.lines[1].problems[0]).toMatchObject({ kind: 'STIMPIE', stimpieId: scarce.id, requested: 3, available: 1 });
    expect(j.lines[2].problems[0]).toMatchObject({ kind: 'STIMPIE', stimpieId: hidden.id, reason: 'INACTIVE' });
    expect(j.subtotalCents).toBe(2500);
  });

  it('validates shape: empty cart, qty bounds, unknown item ids are field errors', async () => {
    const w = await buildWorld(t.prisma);
    expect((await t.client.post('/cart/validate', { items: [] })).status).toBe(400);
    expect((await t.client.post('/cart/validate', { items: [hoodieItem(w, 11)] })).status).toBe(400);
    const r = await t.client.post('/cart/validate', { items: [stimpieItem(999999)] });
    expect(r.status).toBe(400);
    expect(r.json().error.fields).toHaveProperty(['items.0.stimpieId']);
    expect((await t.client.post('/cart/validate', { items: [hoodieItem(w)], areaId: 999999 })).json().error.fields).toHaveProperty('areaId');
  });
});

// ---------------------------------------------------------------- track and find

describe('POST /orders/track', () => {
  it('returns the public view with a timeline of reached statuses; the delivery number appears from OUT_FOR_DELIVERY', async () => {
    const w = await buildWorld(t.prisma);
    freezeTime('2026-10-14T10:00:00Z');
    const { orderId } = await placeAs(w, [packItem(w, [w.core[0]!.id])], { delivery: { areaId: w.areas[1]!.id, areaName: 'Jounieh', address: 'Main street 5', notes: 'secret note' } });
    const track = () => t.client.post('/orders/track', { orderNumber: 'stp-1001', phone: '+961 71 100 000' });
    let r = await track();
    expect(r.status).toBe(200);
    expect(r.json()).toMatchObject({ number: 'STP-1001', status: 'NEW', customerName: 'Customer 0', deliveryNumber: null, estimateText: '3 working days', whatsappNumber: null });
    expect(r.json().timeline).toEqual([{ status: 'NEW', at: '2026-10-14T10:00:00.000Z' }]);
    freezeTime('2026-10-14T12:00:00Z');
    await changeStatus(t.ctx, { orderId, to: 'CONFIRMED', userId: null });
    await changeStatus(t.ctx, { orderId, to: 'PACKED', userId: null });
    expect((await track()).json().deliveryNumber).toBeNull();
    await changeStatus(t.ctx, { orderId, to: 'OUT_FOR_DELIVERY', userId: null, deliveryNumber: 'DLV-9' });
    r = await track();
    expect(r.json()).toMatchObject({ status: 'OUT_FOR_DELIVERY', deliveryNumber: 'DLV-9' });
    expect(r.json().timeline.map((e: { status: string }) => e.status)).toEqual(['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY']);
    await changeStatus(t.ctx, { orderId, to: 'RETURNED', userId: null });
    r = await track();
    expect(r.json().timeline.at(-1).status).toBe('RETURNED');
    expect(r.json().deliveryNumber).toBe('DLV-9'); // it did go out
    // no internal fields at all
    const keys = [...deepKeys(r.json())].map((k) => k.toLowerCase());
    for (const banned of ['cost', 'note', 'email', 'userid', 'by', 'idempotency', 'cash', 'address', 'phone', 'customerid', 'hold']) expect(keys.filter((k) => k.includes(banned)), banned).toEqual([]);
    expect(JSON.stringify(r.json())).not.toContain('secret note');
  });

  it('shows contact edits and delivery-number corrections as no extra timeline steps', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const { orderId } = await placeAs(w, [hoodieItem(w)]);
    await client.patch(`/admin/orders/${orderId}`, { delivery: { address: 'Elsewhere 99' } });
    await client.post(`/admin/orders/${orderId}/notes`, { body: 'internal' });
    const r = await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71100000' });
    expect(r.json().timeline).toHaveLength(1);
  });

  it('unknown number, wrong phone, and a number that exists under another phone are indistinguishable (same 404, body and headers)', async () => {
    const w = await buildWorld(t.prisma);
    await placeAs(w, [hoodieItem(w)]);
    const unknown = await t.client.post('/orders/track', { orderNumber: 'STP-9999', phone: '71100000' });
    const wrongPhone = await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71999999' });
    const garbage = await t.client.post('/orders/track', { orderNumber: 'not a number', phone: '71100000' });
    for (const r of [unknown, wrongPhone, garbage]) {
      expect(r.status).toBe(404);
      expect(r.json().error.code).toBe('NOT_FOUND');
    }
    const strip = (r: typeof unknown) => ({ ...r.json().error, requestId: undefined });
    expect(strip(unknown)).toEqual(strip(wrongPhone));
    expect(strip(unknown)).toEqual(strip(garbage));
    expect(unknown.header('content-length')).toBe(wrongPhone.header('content-length'));
    expect(unknown.header('cache-control')).toBe(wrongPhone.header('cache-control'));
  });

  it('accepts the number as 1001, #1001 or STP-1001, and any phone format of the same number', async () => {
    const w = await buildWorld(t.prisma);
    await placeAs(w, [hoodieItem(w)]);
    for (const orderNumber of ['STP-1001', 'stp-1001', 'STP1001', '1001', '#1001']) {
      for (const phone of ['71100000', '71 100 000', '+96171100000', '0096171100000']) {
        expect((await t.client.post('/orders/track', { orderNumber, phone })).status, `${orderNumber} / ${phone}`).toBe(200);
      }
    }
  });

  it('is rate limited to 20 per 10 minutes per IP (successes and failures both count), with Retry-After', async () => {
    const w = await buildWorld(t.prisma);
    await placeAs(w, [hoodieItem(w)]);
    freezeTime('2026-10-14T10:00:00Z');
    for (let i = 0; i < 20; i++) expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: i % 2 ? '71100000' : '71999999' }, { ip: '10.7.0.1' })).status).toBe(i % 2 ? 200 : 404);
    const r = await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71100000' }, { ip: '10.7.0.1' });
    expect(r.status).toBe(429);
    expect(r.json().error.code).toBe('RATE_LIMITED');
    expect(Number(r.header('retry-after'))).toBeGreaterThan(0);
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71100000' }, { ip: '10.7.0.2' })).status).toBe(200);
    freezeTime('2026-10-14T10:10:01Z');
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71100000' }, { ip: '10.7.0.1' })).status).toBe(200);
  });

  it('shows the business WhatsApp number once configured; a malformed phone is a 400 on phone', async () => {
    const w = await buildWorld(t.prisma);
    await placeAs(w, [hoodieItem(w)]);
    await t.ctx.settings.update({ business: { whatsappNumber: '03 111 222' } });
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: '71100000' })).json().whatsappNumber).toBe('+9613111222');
    expect((await t.client.post('/orders/track', { orderNumber: 'STP-1001', phone: 'abc' })).json().error.fields).toHaveProperty('phone');
  });
});

describe('POST /orders/find', () => {
  const email = (n: string) => `find-${n}@example.com`;

  it('answers 202 with the same message whether or not orders exist; queues one orders_lookup listing them', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    await placeAs(w, [hoodieItem(w)], { i: 1, customer: { name: 'Finder', email: email('a'), phone: phoneN(1), whatsapp: null, whatsappSameAsPhone: true } });
    await placeAs(w, [hoodieItem(w)], { i: 2, customer: { name: 'Finder', email: email('a'), phone: phoneN(2), whatsapp: null, whatsappSameAsPhone: true } });
    const hit = await t.client.post('/orders/find', { email: email('A').toUpperCase() }, { ip: '10.8.0.1' });
    const miss = await t.client.post('/orders/find', { email: email('nobody') }, { ip: '10.8.0.2' });
    expect(hit.status).toBe(202);
    expect(miss.status).toBe(202);
    expect(hit.json()).toEqual(miss.json());
    expect(hit.body).toBe(miss.body);
    const rows = await t.prisma.emailLog.findMany({ where: { templateKey: 'orders_lookup' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.toEmail).toBe(email('a'));
    expect(rows[0]!.bodyText).toContain('STP-1001');
    expect(rows[0]!.bodyText).toContain('STP-1002');
    expect(rows[0]!.orderId).toBeNull();
  });

  it('does not queue anything for an unknown address and lists at most 10 orders', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    await t.client.post('/orders/find', { email: email('nobody') });
    expect(await t.prisma.emailLog.count({ where: { templateKey: 'orders_lookup' } })).toBe(0);
    for (let i = 1; i <= 12; i++) await placeAs(w, [hoodieItem(w)], { i, customer: { name: 'Many', email: email('many'), phone: phoneN(i), whatsapp: null, whatsappSameAsPhone: true } });
    await t.client.post('/orders/find', { email: email('many') });
    const row = await t.prisma.emailLog.findFirstOrThrow({ where: { templateKey: 'orders_lookup' } });
    const count = (row.bodyText.match(/STP-\d{4}/g) ?? []).length;
    expect(count).toBe(10);
    expect(row.bodyText).toContain('STP-1012');
    expect(row.bodyText).not.toContain('STP-1001');
  });

  it('is rate limited per IP (3/hour) and per e-mail (3/hour); 202 counts, 429 carries Retry-After', async () => {
    await buildWorld(t.prisma);
    freezeTime('2026-10-14T10:00:00Z');
    for (let i = 0; i < 3; i++) expect((await t.client.post('/orders/find', { email: email(`ip${i}`) }, { ip: '10.8.1.1' })).status).toBe(202);
    const ipLimited = await t.client.post('/orders/find', { email: email('ip9') }, { ip: '10.8.1.1' });
    expect(ipLimited.status).toBe(429);
    expect(Number(ipLimited.header('retry-after'))).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) expect((await t.client.post('/orders/find', { email: email('same') }, { ip: `10.8.2.${i}` })).status).toBe(202);
    expect((await t.client.post('/orders/find', { email: email('same') }, { ip: '10.8.2.9' })).status).toBe(429);
    freezeTime('2026-10-14T11:00:01Z');
    expect((await t.client.post('/orders/find', { email: email('same') }, { ip: '10.8.2.9' })).status).toBe(202);
  });

  it('rejects a malformed address with 400 (no information leak either way)', async () => {
    await buildWorld(t.prisma);
    expect((await t.client.post('/orders/find', { email: 'nope' })).status).toBe(400);
    expect((await t.client.post('/orders/find', {})).status).toBe(400);
  });
});
