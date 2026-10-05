import { describe, expect, it } from 'vitest';
import { allocateStimpieRevenue } from '../src/services/insights';
import { useTestApp } from './helpers/app';
import { buildWorld, createDrop, createStimpie } from './helpers/fixtures';
import { makeCustomer, makeOrder, type FixtureItem } from './helpers/wpc-fixtures';

const t = useTestApp();
const RANGE = { from: '2026-10-01', to: '2026-10-31' };

/**
 * Hand-computed fixture, business timezone Asia/Beirut (UTC+3 on these dates). Delivered orders in range:
 *  #1 WEBSITE   instagram/drop-1  Thu 1 Oct   pack1 3500  Black M  [SIGNAL]            customer C1, Beirut
 *  #2 INSTAGRAM instagram/drop-1  Sat 3 Oct   pack2 4500 + 2x VOID 1000  Cream L [SIGNAL, STATIC]  C2, Beirut   (22:30Z on 2 Oct = 01:30 on 3 Oct)
 *  #3 WEBSITE   -                 Fri 2 Oct   hoodie 2500 Black S                         C1, Mount Lebanon
 *  #4 WHATSAPP  -                 Sun 4 Oct   pack1 3500  Black M  [MOTH]              C3, "Jounieh"
 *  #5 MANUAL    newsletter/-      Mon 5 Oct   2x pack1 7000 Cream M [CEDAR x2]         C4, "jounieh " (00:30 local)
 *  #6 INSTAGRAM instagram/drop-1  Sat 10 Oct  pack1 3500  Black M  [SIGNAL]            C1, Beirut
 * Not counted: delivered 3 Nov, NEW, CANCELLED before dispatch, RETURNED on 20 Nov (out of range).
 * Funnel: RETURNED on 12 Oct (in range) and CANCELLED after dispatch on 15 Oct.
 */
async function seed() {
  const w = await buildWorld(t.prisma);
  const p = t.prisma;
  const drop2 = await createDrop(p, { name: 'Drop 002', slug: 'drop-002' });
  const moth = await createStimpie(p, { name: 'THE MOTH', slug: 'the-moth', dropId: drop2.id });
  const [signal, stat] = w.limited;
  const [voidS, , cedar] = w.core;
  const [beirut, ml] = w.areas;

  const pack1 = (stimpieIds: number[], stimpies: string[], color: string, size: string, qty = 1): FixtureItem => ({
    kind: 'PACK', name: 'Hoodie + 1 Stimpie', qty, unitPriceCents: 3500, unitCostCents: 1700, stimpieIds, detail: { hoodie: 'Stimpy Hoodie', color, size, stimpies },
  });
  const c1 = '+96171000001';
  await makeOrder(p, { number: 'STP-1', status: 'DELIVERED', source: 'WEBSITE', phone: c1, customerName: 'C1', areaId: beirut!.id, areaName: 'Beirut', utmSource: 'instagram', utmCampaign: 'drop-1', items: [pack1([signal!.id], ['THE SIGNAL'], 'Black', 'M')], placedAt: '2026-10-01T08:00:00Z', deliveredAt: '2026-10-01T10:00:00Z' });
  await makeOrder(p, {
    number: 'STP-2', status: 'DELIVERED', source: 'INSTAGRAM', phone: '+96171000002', customerName: 'C2', areaId: beirut!.id, areaName: 'Beirut', utmSource: 'instagram', utmCampaign: 'drop-1',
    items: [
      { kind: 'PACK', name: 'Hoodie + 2 Stimpies', qty: 1, unitPriceCents: 4500, unitCostCents: 2300, stimpieIds: [signal!.id, stat!.id], detail: { hoodie: 'Stimpy Hoodie', color: 'Cream', size: 'L', stimpies: ['THE SIGNAL', 'THE STATIC'] } },
      { kind: 'STIMPIE', name: 'THE VOID', qty: 2, unitPriceCents: 1000, unitCostCents: 600, stimpieIds: [voidS!.id], detail: { stimpies: ['THE VOID'] } },
    ],
    placedAt: '2026-10-02T09:00:00Z', deliveredAt: '2026-10-02T22:30:00Z',
  });
  await makeOrder(p, { number: 'STP-3', status: 'DELIVERED', source: 'WEBSITE', phone: c1, customerName: 'C1', areaId: ml!.id, areaName: 'Mount Lebanon', items: [{ kind: 'HOODIE', name: 'Stimpy Hoodie', unitPriceCents: 2500, unitCostCents: 1100, detail: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'S' } }], placedAt: '2026-10-02T06:00:00Z', deliveredAt: '2026-10-02T10:00:00Z' });
  await makeOrder(p, { number: 'STP-4', status: 'DELIVERED', source: 'WHATSAPP', phone: '+96171000003', customerName: 'C3', areaName: 'Jounieh', items: [pack1([moth.id], ['THE MOTH'], 'Black', 'M')], placedAt: '2026-10-03T08:00:00Z', deliveredAt: '2026-10-04T09:00:00Z' });
  await makeOrder(p, { number: 'STP-5', status: 'DELIVERED', source: 'MANUAL', phone: '+96171000004', customerName: 'C4', areaName: 'jounieh ', utmSource: 'newsletter', items: [pack1([cedar!.id], ['THE CEDAR'], 'Cream', 'M', 2)], placedAt: '2026-10-04T08:00:00Z', deliveredAt: '2026-10-04T21:30:00Z' });
  await makeOrder(p, { number: 'STP-6', status: 'DELIVERED', source: 'INSTAGRAM', phone: c1, customerName: 'C1', areaId: beirut!.id, areaName: 'Beirut', utmSource: 'instagram', utmCampaign: 'drop-1', items: [pack1([signal!.id], ['THE SIGNAL'], 'Black', 'M')], placedAt: '2026-10-09T08:00:00Z', deliveredAt: '2026-10-10T10:00:00Z' });

  // outside the figures
  await makeOrder(p, { number: 'STP-7', status: 'DELIVERED', items: [pack1([signal!.id], ['THE SIGNAL'], 'Black', 'M')], deliveredAt: '2026-11-03T10:00:00Z' });
  await makeOrder(p, { number: 'STP-8', status: 'RETURNED', items: [pack1([signal!.id], ['THE SIGNAL'], 'Black', 'M')], deliveredAt: '2026-10-08T10:00:00Z', returnedAt: '2026-10-12T10:00:00Z' });
  await makeOrder(p, { number: 'STP-9', status: 'RETURNED', items: [pack1([signal!.id], ['THE SIGNAL'], 'Black', 'M')], deliveredAt: '2026-10-08T10:00:00Z', returnedAt: '2026-11-20T10:00:00Z' });
  await makeOrder(p, { number: 'STP-10', status: 'CANCELLED', items: [pack1([], [], 'Black', 'M')], outForDeliveryAt: '2026-10-14T10:00:00Z', cancelledAt: '2026-10-15T10:00:00Z' });
  await makeOrder(p, { number: 'STP-11', status: 'CANCELLED', items: [pack1([], [], 'Black', 'M')], cancelledAt: '2026-10-15T10:00:00Z' });
  await makeOrder(p, { number: 'STP-12', status: 'NEW', items: [pack1([], [], 'Black', 'M')], placedAt: '2026-10-15T10:00:00Z' });
}

describe('GET /admin/insights/sales', () => {
  it('series is zero-filled per business-timezone day; every other aggregate matches the hand-computed numbers', async () => {
    await seed();
    const { client } = await t.adminClient();
    const res = await client.get('/admin/insights/sales', { query: RANGE });
    expect(res.status).toBe(200);
    const b = res.json();

    expect(b.series).toHaveLength(31);
    expect(b.series[0]).toEqual({ date: '2026-10-01', orders: 1, revenueCents: 3500 });
    expect(b.series.filter((d: { orders: number }) => d.orders > 0)).toEqual([
      { date: '2026-10-01', orders: 1, revenueCents: 3500 },
      { date: '2026-10-02', orders: 1, revenueCents: 2500 },
      { date: '2026-10-03', orders: 1, revenueCents: 6500 }, // 22:30Z on 2 Oct is 01:30 on 3 Oct in Beirut
      { date: '2026-10-04', orders: 1, revenueCents: 3500 },
      { date: '2026-10-05', orders: 1, revenueCents: 7000 }, // 21:30Z on 4 Oct is 00:30 on 5 Oct
      { date: '2026-10-10', orders: 1, revenueCents: 3500 },
    ]);
    expect(b.series[30]).toEqual({ date: '2026-10-31', orders: 0, revenueCents: 0 });
    expect(b.series.reduce((s: number, d: { revenueCents: number }) => s + d.revenueCents, 0)).toBe(26500);

    // Drop 001 sells SIGNAL (#1 3500, #2 half of the 4500 pack = 2250, #6 3500) and STATIC (#2 2250); Drop 002 sells MOTH (#4 3500).
    expect(b.byDrop).toEqual([
      { dropName: 'Drop 001', orders: 3, revenueCents: 11500 },
      { dropName: 'Drop 002', orders: 1, revenueCents: 3500 },
    ]);
    expect(b.bySource).toEqual([
      { source: 'WEBSITE', orders: 2, revenueCents: 6000 },
      { source: 'INSTAGRAM', orders: 2, revenueCents: 10000 },
      { source: 'WHATSAPP', orders: 1, revenueCents: 3500 },
      { source: 'MANUAL', orders: 1, revenueCents: 7000 },
    ]);
    expect(b.byCampaign).toEqual([
      { utmSource: 'instagram', utmCampaign: 'drop-1', orders: 3, revenueCents: 13500 },
      { utmSource: 'newsletter', utmCampaign: null, orders: 1, revenueCents: 7000 },
      { utmSource: null, utmCampaign: null, orders: 2, revenueCents: 6000 },
    ]);
    // Sunday = 0, in the business timezone: Thu 1, Fri 2 (#3), Sat 3 (#2), Sun 4 (#4), Mon 5 (#5), Sat 10 (#6)
    expect(b.byWeekday).toEqual([
      { weekday: 0, orders: 1 },
      { weekday: 1, orders: 1 },
      { weekday: 2, orders: 0 },
      { weekday: 3, orders: 0 },
      { weekday: 4, orders: 1 },
      { weekday: 5, orders: 1 },
      { weekday: 6, orders: 2 },
    ]);
  });

  it('an empty range still has the full shape: zero series days, 4 sources, 7 weekdays', async () => {
    await seed();
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/sales', { query: { from: '2025-03-01', to: '2025-03-03' } })).json();
    expect(b.series).toEqual([
      { date: '2025-03-01', orders: 0, revenueCents: 0 },
      { date: '2025-03-02', orders: 0, revenueCents: 0 },
      { date: '2025-03-03', orders: 0, revenueCents: 0 },
    ]);
    expect(b.byDrop).toEqual([]);
    expect(b.byCampaign).toEqual([]);
    expect(b.bySource).toHaveLength(4);
    expect(b.byWeekday).toHaveLength(7);
  });

  it('open bounds: the series runs from the first to the last day that has data', async () => {
    await seed();
    const { client } = await t.adminClient();
    const upTo = (await client.get('/admin/insights/sales', { query: { to: '2026-10-05' } })).json();
    expect(upTo.series.map((d: { date: string }) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    const all = (await client.get('/admin/insights/sales')).json();
    expect(all.series[0].date).toBe('2026-10-01');
    expect(all.series[all.series.length - 1].date).toBe('2026-11-03'); // the 3 Nov delivery
  });

  it('no data and no range gives an empty series, not an error', async () => {
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/sales')).json();
    expect(b.series).toEqual([]);
  });

  it('validates from/to', async () => {
    const { client } = await t.adminClient();
    expect((await client.get('/admin/insights/sales', { query: { from: 'x' } })).status).toBe(400);
    expect((await client.get('/admin/insights/sales', { query: { from: '2026-10-31', to: '2026-10-01' } })).status).toBe(400);
  });
});

describe('GET /admin/insights/products', () => {
  it('ranks Stimpies, mixes packs, attach rate as a fraction, sizes and colours (hand-computed)', async () => {
    await seed();
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/products', { query: RANGE })).json();
    expect(b.stimpies).toEqual([
      { name: 'THE SIGNAL', unitsSold: 3, revenueCents: 9250 }, // 3500 + 2250 + 3500
      { name: 'THE CEDAR', unitsSold: 2, revenueCents: 7000 }, // one line of 2 packs at 3500
      { name: 'THE VOID', unitsSold: 2, revenueCents: 2000 }, // 2 extra units at 1000
      { name: 'THE MOTH', unitsSold: 1, revenueCents: 3500 },
      { name: 'THE STATIC', unitsSold: 1, revenueCents: 2250 },
    ]);
    expect(b.packMix).toEqual([
      { packName: 'Hoodie + 1 Stimpie', orders: 4 }, // #1 #4 #5 #6
      { packName: 'Hoodie + 2 Stimpies', orders: 1 },
    ]);
    expect(b.extraStimpieAttachRate).toBeCloseTo(2 / 7, 10); // 2 extra units / 7 hoodie units (1+1+1+1+2+1)
    expect(b.extraStimpieAttachRate).toBeGreaterThanOrEqual(0);
    expect(b.extraStimpieAttachRate).toBeLessThanOrEqual(1);
    expect(b.sizes).toEqual([
      { label: 'M', units: 5 },
      { label: 'L', units: 1 },
      { label: 'S', units: 1 },
    ]);
    expect(b.colors).toEqual([
      { name: 'Black', units: 4 },
      { name: 'Cream', units: 3 },
    ]);
  });

  it('range limits the data (only #1 on 1 Oct)', async () => {
    await seed();
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/products', { query: { from: '2026-10-01', to: '2026-10-01' } })).json();
    expect(b.stimpies).toEqual([{ name: 'THE SIGNAL', unitsSold: 1, revenueCents: 3500 }]);
    expect(b.packMix).toEqual([{ packName: 'Hoodie + 1 Stimpie', orders: 1 }]);
    expect(b.extraStimpieAttachRate).toBe(0);
  });

  it('with no sales every ratio is 0 and lists are empty', async () => {
    const { client } = await t.adminClient();
    expect((await client.get('/admin/insights/products')).json()).toEqual({ stimpies: [], packMix: [], extraStimpieAttachRate: 0, sizes: [], colors: [] });
  });

  it('splits money into whole cents: the remainder goes to the first units', () => {
    const line = (stimpieId: number, qty = 1) => ({ orderItemId: 1, qty, stimpieId, stimpie: { name: `S${stimpieId}`, dropId: null, drop: null } });
    const split = (price: number, lines: ReturnType<typeof line>[]) => allocateStimpieRevenue([{ id: 1, qty: 1, unitPriceCents: price }], lines).map((s) => s.revenueCents);
    expect(split(4501, [line(1), line(2)])).toEqual([2251, 2250]);
    expect(split(1000, [line(1), line(2), line(3)])).toEqual([334, 333, 333]);
    expect(split(1000, [line(1, 3)])).toEqual([1000]);
    const total = split(3333, [line(5), line(6), line(7)]);
    expect(total.reduce((a, b) => a + b, 0)).toBe(3333);
  });
});

describe('GET /admin/insights/customers', () => {
  it('computes repeat, delivery success and return rates as fractions plus orders by area', async () => {
    await seed();
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/customers', { query: RANGE })).json();
    expect(b.repeatRate).toBe(0.25); // C1 has 3 delivered orders; C2, C3, C4 have 1 -> 1 of 4
    expect(b.deliverySuccessRate).toBe(0.75); // 6 delivered / (6 delivered + 1 returned + 1 cancelled after dispatch)
    expect(b.returnRate).toBeCloseTo(1 / 7, 10); // 1 returned / (6 delivered + 1 returned)
    // "Jounieh" and "jounieh " are the same place; area rows win over the typed name
    expect(b.byArea).toEqual([
      { areaName: 'Beirut', orders: 3 },
      { areaName: 'Jounieh', orders: 2 },
      { areaName: 'Mount Lebanon', orders: 1 },
    ]);
  });

  it('a return recorded after the range does not count, one recorded inside does', async () => {
    await seed();
    const { client } = await t.adminClient();
    const nov = (await client.get('/admin/insights/customers', { query: { from: '2026-11-01', to: '2026-11-30' } })).json();
    // delivered 3 Nov (#7) and returned 20 Nov (#9): success 1 / (1 + 1), return rate 1 / (1 + 1)
    expect(nov.deliverySuccessRate).toBe(0.5);
    expect(nov.returnRate).toBe(0.5);
    expect(nov.repeatRate).toBe(0);
  });

  it('returned orders without an event fall back to their delivery date', async () => {
    await buildWorld(t.prisma);
    await makeOrder(t.prisma, { number: 'STP-1', status: 'DELIVERED', deliveredAt: '2026-10-05T10:00:00Z' });
    await makeOrder(t.prisma, { number: 'STP-2', status: 'RETURNED', deliveredAt: '2026-10-06T10:00:00Z' });
    await makeOrder(t.prisma, { number: 'STP-3', status: 'RETURNED', outForDeliveryAt: '2026-10-07T10:00:00Z' }); // failed delivery, never delivered
    const { client } = await t.adminClient();
    const b = (await client.get('/admin/insights/customers', { query: RANGE })).json();
    expect(b.returnRate).toBeCloseTo(2 / 3, 10);
    expect(b.deliverySuccessRate).toBeCloseTo(1 / 3, 10);
  });

  it('with no orders every rate is 0 (never NaN)', async () => {
    const { client } = await t.adminClient();
    expect((await client.get('/admin/insights/customers', { query: RANGE })).json()).toEqual({ repeatRate: 0, byArea: [], deliverySuccessRate: 0, returnRate: 0 });
  });

  it('reports first-touch customers, delivered revenue and source-level cost per customer and ROAS', async () => {
    const customer = await makeCustomer(t.prisma, { phone: '+96171111001', email: 'acquisition@example.com' });
    await t.prisma.customer.update({ where: { id: customer.id }, data: { firstSource: 'WEBSITE', firstUtmSource: 'instagram', firstUtmCampaign: 'launch', firstTouchAt: new Date('2026-10-02T08:00:00.000Z') } });
    await makeOrder(t.prisma, { phone: customer.phone, status: 'DELIVERED', placedAt: '2026-10-02T08:00:00.000Z', deliveredAt: '2026-10-02T10:00:00.000Z' });
    await t.prisma.adSpend.create({ data: { channel: 'Instagram', amountCents: 3000, spentOn: new Date('2026-10-02T00:00:00.000Z') } });
    const { client } = await t.adminClient();
    const response = await client.get('/admin/insights/acquisition', { query: { from: '2026-10-02', to: '2026-10-02' } });
    expect(response.status).toBe(200);
    expect(response.json()).toMatchObject({
      bySource: [expect.objectContaining({ source: 'instagram', customers: 1, revenueCents: 3500, adSpendCents: 3000, costPerCustomerCents: 3000, roas: 3500 / 3000 })],
      byCampaign: [expect.objectContaining({ source: 'instagram', campaign: 'launch', customers: 1, revenueCents: 3500 })],
      unmatchedAdSpendCents: 0,
    });
  });

  it('keeps a date range with zero customers and zero ad spend finite and empty', async () => {
    const { client } = await t.adminClient();
    const response = await client.get('/admin/insights/acquisition', { query: { from: '2026-09-01', to: '2026-09-30' } });
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ bySource: [], byCampaign: [], unmatchedAdSpendCents: 0 });
  });
});
