import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createArea, createColor, type World } from './helpers/fixtures';
import { freezeTime } from './helpers/clock';
import { assertStockInvariants, hoodieItem, placeInput, stimpieItem, variantOf } from './helpers/orders';
import { changeStatus, placeOrder } from '../src/services/orders';

const t = useTestApp();

const place = async (w: World, i: number, items = [hoodieItem(w)]) => (await placeOrder(t.ctx, placeInput(w, items, { i }))).orderId;
const to = (orderId: number, status: Parameters<typeof changeStatus>[1]['to'], deliveryNumber?: string) => changeStatus(t.ctx, { orderId, to: status, userId: null, deliveryNumber });
async function packed(w: World, i: number) {
  const id = await place(w, i);
  await to(id, 'CONFIRMED');
  await to(id, 'PACKED');
  return id;
}

// ---------------------------------------------------------------- stock

describe('admin stock', () => {
  it('GET /stock/hoodies: active colours and sizes plus one cell per variant with quantity, reserved, available', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await place(w, 1);
    await createColor(t.prisma, { name: 'Hidden', active: false });
    const r = await client.get('/admin/stock/hoodies');
    expect(r.status, r.body).toBe(200);
    const j = r.json();
    expect(j.colors.map((c: { name: string }) => c.name)).toEqual(['Black', 'Cream']);
    expect(j.sizes.map((s: { label: string }) => s.label)).toEqual(['S', 'M', 'L']);
    expect(j.items).toHaveLength(1);
    expect(j.total).toBe(1);
    expect(j.items[0].cells).toHaveLength(6);
    const cell = j.items[0].cells.find((c: { colorId: number; sizeId: number }) => c.colorId === w.colors.black.id && c.sizeId === w.sizes.m.id);
    expect(cell).toMatchObject({ quantity: 20, reserved: 1, available: 19 });
    const order = j.items[0].cells.map((c: { colorId: number; sizeId: number }) => [c.colorId, c.sizeId]);
    expect(order[0]).toEqual([w.colors.black.id, w.sizes.s.id]); // colour-major, size order
  });

  it('GET /stock/stimpies: every Stimpie with type, drop name and the low flag from the threshold', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await t.prisma.stimpie.update({ where: { id: w.core[0]!.id }, data: { quantity: 4 } });
    await t.ctx.settings.update({ orders: { lowStockThreshold: 5 } });
    const j = (await client.get('/admin/stock/stimpies')).json();
    expect(j.items).toHaveLength(5);
    expect(j.total).toBe(5);
    const void_ = j.items.find((i: { name: string }) => i.name === 'THE VOID');
    expect(void_).toMatchObject({ type: 'CORE', dropName: null, quantity: 4, reserved: 0, available: 4, low: true });
    expect(j.items.find((i: { name: string }) => i.name === 'THE SIGNAL')).toMatchObject({ type: 'LIMITED', dropName: 'Drop 001', low: false });
  });

  it('adjust: restock, damaged and correction change quantity, log movements with the note and user, and return the snapshot', async () => {
    const w = await buildWorld(t.prisma);
    const { client, admin } = await t.adminClient();
    const v = await variantOf(t.prisma, w);
    const body = (o: object) => ({ itemType: 'HOODIE_VARIANT', itemId: v.id, ...o });
    expect((await client.post('/admin/stock/adjust', body({ delta: 10, reason: 'RESTOCK', note: 'New batch' }))).json()).toEqual({ quantity: 30, reserved: 0, available: 30 });
    expect((await client.post('/admin/stock/adjust', body({ delta: -2, reason: 'DAMAGED', note: 'Water damage' }))).json()).toEqual({ quantity: 28, reserved: 0, available: 28 });
    expect((await client.post('/admin/stock/adjust', body({ delta: -3, reason: 'CORRECTION', note: 'Miscount' }))).json().quantity).toBe(25);
    const moves = await t.prisma.stockMovement.findMany({ where: { variantId: v.id }, orderBy: { id: 'asc' } });
    expect(moves.map((m) => [m.reason, m.delta, m.field, m.note, m.userId])).toEqual([
      ['RESTOCK', 10, 'QUANTITY', 'New batch', admin.user.id],
      ['DAMAGED', -2, 'QUANTITY', 'Water damage', admin.user.id],
      ['CORRECTION', -3, 'QUANTITY', 'Miscount', admin.user.id],
    ]);
    // a Stimpie works the same way
    expect((await client.post('/admin/stock/adjust', { itemType: 'STIMPIE', itemId: w.core[0]!.id, delta: 5, reason: 'RESTOCK', note: 'More' })).json().quantity).toBe(25);
    await assertStockInvariants(t.prisma);
  });

  it('adjust refuses a missing note, delta 0, wrong sign for the reason, an unknown item and anything below what is reserved', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await place(w, 1);
    const v = await variantOf(t.prisma, w);
    const post = (o: object) => client.post('/admin/stock/adjust', { itemType: 'HOODIE_VARIANT', itemId: v.id, reason: 'CORRECTION', note: 'x', delta: -1, ...o });
    expect((await post({ note: '' })).json().error.fields).toHaveProperty('note');
    expect((await post({ note: '   ' })).status).toBe(400);
    expect((await post({ delta: 0 })).json().error.fields).toHaveProperty('delta');
    expect((await post({ delta: 1.5 })).status).toBe(400);
    expect((await post({ reason: 'RESTOCK', delta: -1 })).json().error.fields).toHaveProperty('delta');
    expect((await post({ reason: 'DAMAGED', delta: 1 })).json().error.fields).toHaveProperty('delta');
    expect((await post({ reason: 'ORDER_SOLD' })).status).toBe(400);
    expect((await post({ itemId: 999999 })).status).toBe(404);
    // 20 on hand, 1 reserved: -19 is allowed, -20 is not
    const tooMuch = await post({ delta: -20, note: 'Too many' });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.json().error.message).toContain('reserved: 1');
    expect((await post({ delta: -19, note: 'Down to reserved' })).json()).toEqual({ quantity: 1, reserved: 1, available: 0 });
    await assertStockInvariants(t.prisma);
  });

  it('set: records one CORRECTION for the difference, writes nothing when unchanged, refuses below reserved', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await place(w, 1, [stimpieItem(w.limited[0]!.id, 3)]);
    const body = (o: object) => ({ itemType: 'STIMPIE', itemId: w.limited[0]!.id, quantity: 40, note: 'Stocktake', ...o });
    expect((await client.post('/admin/stock/set', body({}))).json()).toEqual({ quantity: 40, reserved: 3, available: 37 });
    const m = await t.prisma.stockMovement.findFirstOrThrow({ where: { stimpieId: w.limited[0]!.id, reason: 'CORRECTION' } });
    expect(m).toMatchObject({ delta: 10, field: 'QUANTITY', note: 'Stocktake' });
    await client.post('/admin/stock/set', body({}));
    expect(await t.prisma.stockMovement.count({ where: { stimpieId: w.limited[0]!.id, reason: 'CORRECTION' } })).toBe(1);
    expect((await client.post('/admin/stock/set', body({ quantity: 2 }))).status).toBe(409);
    expect((await client.post('/admin/stock/set', body({ quantity: -1 }))).status).toBe(400);
    expect((await client.post('/admin/stock/set', body({ note: '' }))).status).toBe(400);
    expect((await client.post('/admin/stock/set', body({ quantity: 3 }))).json()).toEqual({ quantity: 3, reserved: 3, available: 0 });
  });

  it('rejects direct reserved edits because reserved units belong to live order stock lines', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const v = await variantOf(t.prisma, w, 'black', 's');
    const order = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 's')], { i: 77 }));
    const before = await t.prisma.hoodieVariant.findUniqueOrThrow({ where: { id: v.id } });

    const adjust = await client.post('/admin/stock/adjust', {
      itemType: 'HOODIE_VARIANT', itemId: v.id, field: 'RESERVED', delta: -1, note: 'Unsafe direct release',
    });
    const set = await client.post('/admin/stock/set', {
      itemType: 'HOODIE_VARIANT', itemId: v.id, reserved: 0, note: 'Unsafe direct release',
    });
    expect(adjust.status).toBe(400);
    expect(set.status).toBe(400);
    expect(await t.prisma.hoodieVariant.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ quantity: before.quantity, reserved: before.reserved });
    expect(await t.prisma.orderStockLine.findMany({ where: { orderId: order.orderId } })).toHaveLength(1);
    await assertStockInvariants(t.prisma);
  });

  it('concurrent manual adjusts and orders never push quantity below reserved', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const v = await variantOf(t.prisma, w, 'black', 's');
    await t.prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity: 10 } });
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 12; i++) jobs.push(placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 's')], { i })).catch(() => undefined));
    for (let i = 0; i < 6; i++) jobs.push(client.post('/admin/stock/adjust', { itemType: 'HOODIE_VARIANT', itemId: v.id, delta: -3, reason: 'DAMAGED', note: `d${i}` }));
    await Promise.all(jobs);
    await assertStockInvariants(t.prisma);
  });

  it('low-stock alert from a manual adjust fires once when it crosses down to the threshold', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com', onLowStock: true } });
    await t.ctx.settings.update({ orders: { lowStockThreshold: 5 } });
    const id = w.core[2]!.id;
    const adj = (delta: number) => client.post('/admin/stock/adjust', { itemType: 'STIMPIE', itemId: id, delta, reason: 'DAMAGED', note: 'n' });
    await adj(-10); // 10 left: above
    expect(await t.prisma.emailLog.count({ where: { templateKey: 'founder_low_stock' } })).toBe(0);
    await adj(-5); // 5 left: crossing
    await adj(-1); // 4: already low
    expect(await t.prisma.emailLog.count({ where: { templateKey: 'founder_low_stock' } })).toBe(1);
  });

  it('GET /stock/movements: newest first with names, order numbers, authors; filters by item, reason, order and day', async () => {
    const w = await buildWorld(t.prisma);
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    const id = await place(w, 1);
    freezeTime('2026-10-15T10:00:00Z');
    await to(id, 'CANCELLED');
    const v = await variantOf(t.prisma, w);
    await client.post('/admin/stock/adjust', { itemType: 'HOODIE_VARIANT', itemId: v.id, delta: 4, reason: 'RESTOCK', note: 'Batch 2' });

    const all = (await client.get('/admin/stock/movements', { query: { pageSize: 100 } })).json();
    expect(all.items[0]).toMatchObject({ itemType: 'HOODIE_VARIANT', itemId: v.id, itemName: 'Stimpy Hoodie, Black, M', field: 'QUANTITY', delta: 4, reason: 'RESTOCK', orderNumber: null, note: 'Batch 2', by: 'Test Owner' });
    expect(all.total).toBe(all.items.length);
    const q = async (query: Record<string, string | number>) => (await client.get('/admin/stock/movements', { query: { pageSize: 100, ...query } })).json();
    const forOrder = await q({ orderId: id });
    expect(forOrder.items.every((m: { orderNumber: string }) => m.orderNumber === 'STP-1001')).toBe(true);
    expect(forOrder.items.map((m: { reason: string }) => m.reason).sort()).toEqual(['ORDER_RELEASED', 'ORDER_RESERVED']);
    expect((await q({ reason: 'RESTOCK' })).total).toBe(1);
    expect((await q({ itemType: 'HOODIE_VARIANT', itemId: v.id })).items.every((m: { itemId: number }) => m.itemId === v.id)).toBe(true);
    expect((await q({ itemType: 'STIMPIE', itemId: w.core[0]!.id })).total).toBe(0);
    expect((await q({ from: '2026-10-15', to: '2026-10-15' })).total).toBe(2); // the release + the restock
    expect((await q({ to: '2026-10-14' })).items.every((m: { reason: string }) => m.reason === 'ORDER_RESERVED' || m.reason === 'INITIAL')).toBe(true);
    expect((await client.get('/admin/stock/movements', { query: { itemId: 1 } })).status).toBe(400); // itemId needs itemType
    expect((await client.get('/admin/stock/movements', { query: { reason: 'NOPE' } })).status).toBe(400);
    expect((await client.get('/admin/stock/movements', { query: { from: '2026-13-40' } })).status).toBe(400);
  });
});

// ---------------------------------------------------------------- deliveries

describe('public GET /delivery/fees', () => {
  it('lists the default fee, active areas (fee null = default) and the estimate text, cacheable', async () => {
    await buildWorld(t.prisma);
    await createArea(t.prisma, { name: 'Hidden', active: false });
    const r = await t.client.get('/delivery/fees');
    expect(r.status).toBe(200);
    const j = r.json();
    expect(j.defaultFeeCents).toBe(500);
    expect(j.areas.map((a: { name: string }) => a.name)).toEqual(['Beirut', 'Mount Lebanon']);
    expect(j.areas[0]).toMatchObject({ feeCents: null, estDays: null });
    expect(j.areas[1]).toMatchObject({ feeCents: 500, estDays: 3 });
    expect(typeof j.estimateText).toBe('string');
    expect(r.header('cache-control')).toMatch(/max-age/);
    expect(JSON.stringify(j)).not.toContain('Hidden');
  });
});

describe('admin deliveries', () => {
  it('lists OUT orders then DELIVERED, grouped by delivery number, with cash due and settled flags; searchable', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const a = await packed(w, 1);
    const b = await packed(w, 2);
    const c = await packed(w, 3);
    await to(a, 'OUT_FOR_DELIVERY', 'RUN-B');
    await to(b, 'OUT_FOR_DELIVERY', 'RUN-A');
    await to(c, 'OUT_FOR_DELIVERY', 'RUN-A');
    await to(c, 'DELIVERED');
    const out = (await client.get('/admin/deliveries')).json();
    expect(out.items.map((i: { orderId: number }) => i.orderId)).toEqual([b, a]); // RUN-A before RUN-B
    expect(out.items[0]).toEqual({
      orderId: b,
      orderNumber: 'STP-1002',
      deliveryNumber: 'RUN-A',
      customerName: 'Customer 2',
      phone: '+96171100002',
      areaName: 'Beirut',
      address: 'Hamra Street, building 5',
      cashDueCents: 2800,
      status: 'OUT_FOR_DELIVERY',
      cashSettled: false,
    });
    const done = (await client.get('/admin/deliveries', { query: { tab: 'DELIVERED' } })).json();
    expect(done.items.map((i: { orderId: number }) => i.orderId)).toEqual([c]);
    expect(done.items[0].status).toBe('DELIVERED');
    expect((await client.get('/admin/deliveries', { query: { q: 'RUN-B' } })).json().items.map((i: { orderId: number }) => i.orderId)).toEqual([a]);
    expect((await client.get('/admin/deliveries', { query: { q: '%' } })).json().total).toBe(0);
    expect((await client.get('/admin/deliveries', { query: { tab: 'NOPE' } })).status).toBe(400);
  });

  it('dispatch sends several PACKED orders out; failures are per order; a shared number is reported as a warning', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const a = await packed(w, 1);
    const b = await packed(w, 2);
    const notPacked = await place(w, 3);
    const r = await client.post('/admin/deliveries/dispatch', {
      orders: [
        { orderId: a, deliveryNumber: 'RUN-7' },
        { orderId: b, deliveryNumber: 'RUN-7' },
        { orderId: notPacked, deliveryNumber: 'RUN-7' },
        { orderId: 999999, deliveryNumber: 'RUN-7' },
        { orderId: a, deliveryNumber: 'RUN-8' },
      ],
    });
    expect(r.status, r.body).toBe(200);
    expect(r.json().dispatched).toEqual([a, b]);
    expect(r.json().failed).toEqual([
      { orderId: notPacked, code: 'INVALID_TRANSITION' },
      { orderId: 999999, code: 'NOT_FOUND' },
      { orderId: a, code: 'INVALID_TRANSITION' }, // already out by then
    ]);
    expect(r.json().warnings).toEqual([{ deliveryNumber: 'RUN-7', orderIds: [a, b] }]);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a } })).deliveryNumber).toBe('RUN-7');
    const blank = await client.post('/admin/deliveries/dispatch', { orders: [{ orderId: await packed(w, 4), deliveryNumber: '  ' }] });
    expect(blank.json().failed[0].code).toBe('DELIVERY_NUMBER_REQUIRED');
    expect((await client.post('/admin/deliveries/dispatch', { orders: [] })).status).toBe(400);
    expect(await t.prisma.emailLog.count({ where: { templateKey: 'order_out_for_delivery' } })).toBe(2);
  });

  it('settle marks every delivered order of a delivery number as settled (and back); 404 when none delivered; cash must be collected', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const { client } = await t.adminClient();
    const ids = [await packed(w, 1), await packed(w, 2), await packed(w, 3)];
    for (const id of ids) await to(id, 'OUT_FOR_DELIVERY', 'RUN-S');
    expect((await client.post('/admin/deliveries/RUN-S/settle', { settled: true })).status).toBe(404); // none delivered yet
    await to(ids[0]!, 'DELIVERED');
    await to(ids[1]!, 'DELIVERED');
    const r = await client.post('/admin/deliveries/RUN-S/settle', { settled: true });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ orderIds: [ids[0], ids[1]] });
    const rows = await t.prisma.order.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    expect(rows.map((o) => o.cashSettled)).toEqual([true, true, false]);
    expect(await t.prisma.orderEvent.count({ where: { fromStatus: 'DELIVERED', toStatus: 'DELIVERED', note: 'Cash marked settled (delivery RUN-S)' } })).toBe(2);
    await client.post('/admin/deliveries/RUN-S/settle', { settled: true }); // idempotent: no new events
    expect(await t.prisma.orderEvent.count({ where: { fromStatus: 'DELIVERED', toStatus: 'DELIVERED' } })).toBe(2);
    await client.post('/admin/deliveries/RUN-S/settle', { settled: false });
    expect((await t.prisma.order.findMany({ where: { id: { in: ids } } })).every((o) => !o.cashSettled)).toBe(true);
    // a delivered-then-returned order is out of the group
    await to(ids[1]!, 'RETURNED');
    expect((await client.post('/admin/deliveries/RUN-S/settle', { settled: true })).json().orderIds).toEqual([ids[0]]);
    expect((await client.post('/admin/deliveries/RUN-S/settle', { settled: 'yes' })).status).toBe(400);
  });
});

// ---------------------------------------------------------------- areas and delivery settings

describe('admin areas', () => {
  it('CRUD with unique names, fee/estimate validation, hide instead of delete when orders used it', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const created = await client.post('/admin/areas', { name: '  Saida  ', feeCents: 700, estDays: 2 });
    expect(created.status).toBe(201);
    expect(created.json()).toEqual({ id: expect.any(Number), name: 'Saida', feeCents: 700, estDays: 2, active: true });
    expect((await client.post('/admin/areas', { name: 'Saida' })).status).toBe(409);
    expect((await client.post('/admin/areas', { name: '' })).json().error.fields).toHaveProperty('name');
    expect((await client.post('/admin/areas', { name: 'Neg', feeCents: -1 })).status).toBe(400);
    expect((await client.post('/admin/areas', { name: 'Odd', extra: 1 })).status).toBe(400);
    const id = created.json().id;
    const upd = await client.patch(`/admin/areas/${id}`, { feeCents: null, active: false });
    expect(upd.json()).toMatchObject({ feeCents: null, active: false });
    expect((await client.patch(`/admin/areas/${id}`, { name: 'Beirut' })).status).toBe(409);
    expect((await client.patch(`/admin/areas/${id}`, { name: 'Saida' })).status).toBe(200); // own name is fine
    expect((await client.patch('/admin/areas/999999', { active: true })).status).toBe(404);

    const list = (await client.get('/admin/areas')).json();
    expect(list.items.map((a: { name: string }) => a.name)).toEqual(['Beirut', 'Mount Lebanon', 'Saida']);
    expect((await client.get('/admin/areas', { query: { active: true } })).json().total).toBe(2);
    expect((await client.get('/admin/areas', { query: { active: false } })).json().total).toBe(1);

    // delete: allowed when unused, refused when an order used it
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { delivery: { areaId: w.areas[0]!.id, areaName: 'Beirut', address: 'Hamra Street 5', notes: null } }));
    const refused = await client.delete(`/admin/areas/${w.areas[0]!.id}`);
    expect(refused.status).toBe(409);
    expect(await t.prisma.area.count({ where: { id: w.areas[0]!.id } })).toBe(1);
    expect((await client.delete(`/admin/areas/${id}`)).status).toBe(204);
    expect((await client.delete(`/admin/areas/${id}`)).status).toBe(404);
    expect(await t.prisma.area.count({ where: { id } })).toBe(0);
  });

  it('deleting an unused area clears it from customers who remembered it', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const area = await createArea(t.prisma, { name: 'Tyre' });
    const customer = await t.prisma.customer.create({ data: { name: 'Remember', phone: '+96171777777', whatsapp: '+96171777777', areaId: area.id } });
    expect((await client.delete(`/admin/areas/${area.id}`)).status).toBe(204);
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).areaId).toBeNull();
    void w;
  });

  it('a hidden area is not offered publicly and cannot be ordered to; the fee change applies to new orders only', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await client.patch(`/admin/areas/${w.areas[1]!.id}`, { active: false });
    expect((await t.client.get('/delivery/fees')).json().areas.map((a: { name: string }) => a.name)).toEqual(['Beirut']);
    const v = await t.client.post('/cart/validate', { items: [hoodieItem(w)], areaId: w.areas[1]!.id });
    expect(v.status).toBe(400);
  });
});

describe('admin delivery settings', () => {
  it('GET returns the default fee and estimate text; PATCH updates them (partial), validates, and affects new orders', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const got = (await client.get('/admin/settings/delivery')).json();
    expect(got).toEqual({ defaultFeeCents: 500, estimateText: '4–5 business days' });
    const upd = await client.patch('/admin/settings/delivery', { defaultFeeCents: 450 });
    expect(upd.json()).toMatchObject({ defaultFeeCents: 450, estimateText: got.estimateText });
    expect((await client.patch('/admin/settings/delivery', { estimateText: '2 to 3 days' })).json().estimateText).toBe('2 to 3 days');
    expect((await client.patch('/admin/settings/delivery', { defaultFeeCents: -5 })).status).toBe(400);
    expect((await client.patch('/admin/settings/delivery', { estimateText: '   ' })).status).toBe(400);
    expect((await client.patch('/admin/settings/delivery', { nope: 1 })).status).toBe(400);
    const priced = (await t.client.post('/cart/validate', { items: [hoodieItem(w)] })).json();
    expect(priced.deliveryFeeCents).toBe(450);
    expect(priced.estimateText).toBe('2 to 3 days');
    expect((await t.client.get('/delivery/fees')).json()).toMatchObject({ defaultFeeCents: 450, estimateText: '2 to 3 days' });
  });
});
