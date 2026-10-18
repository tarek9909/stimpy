import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { freezeTime } from './helpers/clock';
import { makeOrder, type FixtureItem } from './helpers/wpc-fixtures';

const t = useTestApp();

const PACK1: FixtureItem = { kind: 'PACK', name: 'Hoodie + 1 Stimpie', unitPriceCents: 3500, unitCostCents: 1700 }; // cost = 1000 hoodie + 600 stimpie + 100 hardware
const PACK2: FixtureItem = { kind: 'PACK', name: 'Hoodie + 2 Stimpies', unitPriceCents: 4500, unitCostCents: 2300 };
const STIMPIE: FixtureItem = { kind: 'STIMPIE', name: 'THE VOID', unitPriceCents: 1000, unitCostCents: 600 };
const HOODIE: FixtureItem = { kind: 'HOODIE', name: 'Stimpy Hoodie', unitPriceCents: 2500, unitCostCents: 1100 };

/**
 * The fixture. Business timezone Asia/Beirut: UTC+3 until the clocks go back at 2026-10-25 00:00 local, UTC+2 after.
 * Range 2026-10-01 .. 2026-10-31 covers [2026-09-30T21:00:00Z, 2026-10-31T22:00:00Z).
 *   A STP-A pack1            fee 300  delivered 2026-09-30T21:00:00Z  = 1 Oct 00:00 local  IN  (first instant)
 *   B STP-B pack2 + 2 stimpie fee 500  delivered 2026-10-31T21:59:59Z  = 31 Oct 23:59:59    IN  (last second, UTC+2)
 *   C STP-C hoodie           fee 300  delivered 2026-10-31T22:00:00Z  = 1 Nov 00:00 local  OUT
 *   D STP-D pack1            fee 300  delivered 2026-09-30T20:59:59Z  = 30 Sep 23:59:59    OUT
 *   E STP-E hoodie           fee 300  delivered 2026-10-15T12:00:00Z                      IN
 *   F cancelled, G returned (had been delivered in range), H out for delivery, I new      OUT (status)
 */
async function seedFinance(): Promise<void> {
  await buildWorld(t.prisma);
  const p = t.prisma;
  await makeOrder(p, { number: 'STP-A', status: 'DELIVERED', items: [PACK1], deliveryFeeCents: 300, placedAt: '2026-09-29T10:00:00Z', deliveredAt: '2026-09-30T21:00:00Z' });
  await makeOrder(p, { number: 'STP-B', status: 'DELIVERED', items: [PACK2, { ...STIMPIE, qty: 2 }], deliveryFeeCents: 500, placedAt: '2026-10-20T10:00:00Z', deliveredAt: '2026-10-31T21:59:59Z' });
  await makeOrder(p, { number: 'STP-C', status: 'DELIVERED', items: [HOODIE], deliveryFeeCents: 300, placedAt: '2026-10-29T10:00:00Z', deliveredAt: '2026-10-31T22:00:00Z' });
  await makeOrder(p, { number: 'STP-D', status: 'DELIVERED', items: [PACK1], deliveryFeeCents: 300, placedAt: '2026-09-20T10:00:00Z', deliveredAt: '2026-09-30T20:59:59Z' });
  await makeOrder(p, { number: 'STP-E', status: 'DELIVERED', items: [HOODIE], deliveryFeeCents: 300, placedAt: '2026-10-10T10:00:00Z', deliveredAt: '2026-10-15T12:00:00Z' });
  await makeOrder(p, { number: 'STP-F', status: 'CANCELLED', items: [PACK2], placedAt: '2026-10-05T10:00:00Z', cancelledAt: '2026-10-05T12:00:00Z' });
  await makeOrder(p, { number: 'STP-G', status: 'RETURNED', items: [PACK2], placedAt: '2026-10-06T10:00:00Z', deliveredAt: '2026-10-07T10:00:00Z' });
  await makeOrder(p, { number: 'STP-H', status: 'OUT_FOR_DELIVERY', items: [PACK1], placedAt: '2026-10-08T10:00:00Z', outForDeliveryAt: '2026-10-09T10:00:00Z', deliveryNumber: 'D-9' });
  await makeOrder(p, { number: 'STP-I', status: 'NEW', items: [PACK1], placedAt: '2026-10-09T10:00:00Z' });

  const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
  await p.expense.createMany({
    data: [
      { category: 'Printing', amountCents: 2000, spentOn: d('2026-10-01') }, // IN (first day)
      { category: 'Packaging', amountCents: 1500, spentOn: d('2026-10-31') }, // IN (last day)
      { category: 'Other', amountCents: 700, spentOn: d('2026-09-30') }, // OUT
      { category: 'Other', amountCents: 800, spentOn: d('2026-11-01') }, // OUT
    ],
  });
  await p.adSpend.createMany({
    data: [
      { channel: 'Meta Ads', amountCents: 2500, spentOn: d('2026-10-10') },
      { channel: 'Meta Ads', amountCents: 1000, spentOn: d('2026-10-12') }, // days between have no spend: that is a gap, not zero rows
      { channel: 'TikTok', amountCents: 999, spentOn: d('2026-11-02') }, // OUT
    ],
  });
}

describe('GET /admin/finance/profit', () => {
  it('computes revenue, delivery fees, cost of goods, expenses, ad spend and profit for a range (hand-computed)', async () => {
    await seedFinance();
    const { client } = await t.adminClient();
    const res = await client.get('/admin/finance/profit', { query: { from: '2026-10-01', to: '2026-10-31' } });
    expect(res.status).toBe(200);
    const body = res.json();
    // IN: A (3500, cost 1700, fee 300), B (4500 + 2x1000 = 6500, cost 2300 + 2x600 = 3500, fee 500), E (2500, cost 1100, fee 300)
    expect(body).toMatchObject({
      range: { from: '2026-10-01', to: '2026-10-31' },
      revenueCents: 12500, // 3500 + 6500 + 2500
      deliveryFeesCents: 1100, // 300 + 500 + 300
      costOfGoodsCents: 6300, // 1700 + 3500 + 1100
      expensesCents: 3500, // 2000 + 1500
      adSpendCents: 3500, // 2500 + 1000
      profitCents: -800, // 12500 - 6300 - 3500 - 3500: a loss, delivery fees are NOT profit
      ordersCount: 3,
      planMargins: { pack35: 1800, pack45: 2200 },
    });
    expect(body.byOrder.items).toEqual([
      { orderNumber: 'STP-B', date: '2026-10-31', revenueCents: 6500, costCents: 3500, profitCents: 3000 },
      { orderNumber: 'STP-E', date: '2026-10-15', revenueCents: 2500, costCents: 1100, profitCents: 1400 },
      { orderNumber: 'STP-A', date: '2026-10-01', revenueCents: 3500, costCents: 1700, profitCents: 1800 },
    ]);
    expect(body.note).toMatch(/current order statuses/i);
  });

  it('only DELIVERED counts: cancelled, returned, out-for-delivery and new orders are excluded even when dated in range', async () => {
    await seedFinance();
    const { client } = await t.adminClient();
    const body = (await client.get('/admin/finance/profit', { query: { from: '2026-10-01', to: '2026-10-31' } })).json();
    const numbers = body.byOrder.items.map((o: { orderNumber: string }) => o.orderNumber);
    expect(numbers).not.toContain('STP-F');
    expect(numbers).not.toContain('STP-G');
    expect(numbers).not.toContain('STP-H');
    expect(numbers).not.toContain('STP-I');
  });

  it('range edges are inclusive at 00:00:00 and 23:59:59 Beirut time; one second outside is out', async () => {
    await seedFinance();
    const { client } = await t.adminClient();
    const one = async (from: string, to: string) => (await client.get('/admin/finance/profit', { query: { from, to } })).json();
    expect((await one('2026-10-01', '2026-10-01')).byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-A']);
    expect((await one('2026-10-31', '2026-10-31')).byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-B']);
    expect((await one('2026-11-01', '2026-11-01')).byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-C']);
    expect((await one('2026-09-30', '2026-09-30')).byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-D']);
  });

  it('without from/to it covers all time; one open bound works', async () => {
    await seedFinance();
    const { client } = await t.adminClient();
    const all = (await client.get('/admin/finance/profit')).json();
    // delivered: A 3500, B 6500, C 2500, D 3500, E 2500 = 18500; cost 1700 + 3500 + 1100 + 1700 + 1100 = 9100; expenses 5000; ad spend 4499
    expect(all).toMatchObject({ range: { from: null, to: null }, revenueCents: 18500, costOfGoodsCents: 9100, expensesCents: 5000, adSpendCents: 4499, profitCents: -99, ordersCount: 5 });
    const fromOnly = (await client.get('/admin/finance/profit', { query: { from: '2026-10-31' } })).json();
    expect(fromOnly).toMatchObject({ revenueCents: 9000, ordersCount: 2, expensesCents: 2300, adSpendCents: 999 }); // B + C ; 1500 + 800 ; 999
    const toOnly = (await client.get('/admin/finance/profit', { query: { to: '2026-09-30' } })).json();
    expect(toOnly).toMatchObject({ revenueCents: 3500, ordersCount: 1, expensesCents: 700, adSpendCents: 0 });
  });

  it('an empty range returns zeros and an empty list (not an error)', async () => {
    await seedFinance();
    const { client } = await t.adminClient();
    const body = (await client.get('/admin/finance/profit', { query: { from: '2025-01-01', to: '2025-01-31' } })).json();
    expect(body).toMatchObject({ revenueCents: 0, costOfGoodsCents: 0, expensesCents: 0, adSpendCents: 0, profitCents: 0, ordersCount: 0, byOrder: { items: [], page: 1, pageSize: 25, total: 0 } });
  });

  it('uses settings.business.timezone for the day boundaries (same data, UTC gives different orders)', async () => {
    await seedFinance();
    await t.ctx.settings.update({ business: { timezone: 'UTC' } });
    const { client } = await t.adminClient();
    const body = (await client.get('/admin/finance/profit', { query: { from: '2026-10-01', to: '2026-10-31' } })).json();
    // In UTC: A (2026-09-30T21:00Z) is OUT, C (2026-10-31T22:00Z) is IN. IN = B 6500 + C 2500 + E 2500
    expect(body.byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-C', 'STP-B', 'STP-E']);
    expect(body.revenueCents).toBe(11500);
    expect(body.costOfGoodsCents).toBe(3500 + 1100 + 1100);
    expect(body.byOrder.items[0].date).toBe('2026-10-31'); // 22:00Z is still 31 Oct in UTC
  });

  it('DST end (clocks go back at 2026-10-25 00:00 local): 24 Oct is a 25-hour day, 23:00-24:00 happens twice', async () => {
    await buildWorld(t.prisma);
    const p = t.prisma;
    // 23 Oct is UTC+3 all day; the shift to UTC+2 happens at 2026-10-24T21:00Z, so 24 Oct runs 2026-10-23T21:00Z .. 2026-10-24T22:00Z
    await makeOrder(p, { number: 'STP-1', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-10-23T20:59:59Z' }); // 23 Oct 23:59:59 local
    await makeOrder(p, { number: 'STP-2', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-10-23T21:00:00Z' }); // 24 Oct 00:00:00 local
    await makeOrder(p, { number: 'STP-3', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-10-24T21:30:00Z' }); // 23:30 local for the second time (+2)
    await makeOrder(p, { number: 'STP-4', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-10-24T21:59:59Z' }); // 24 Oct 23:59:59 local (+2)
    await makeOrder(p, { number: 'STP-5', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-10-24T22:00:00Z' }); // 25 Oct 00:00:00 local
    const { client } = await t.adminClient();
    const day = (await client.get('/admin/finance/profit', { query: { from: '2026-10-24', to: '2026-10-24' } })).json();
    expect(day.byOrder.items.map((o: { orderNumber: string }) => o.orderNumber).sort()).toEqual(['STP-2', 'STP-3', 'STP-4']);
    expect(day.revenueCents).toBe(7500);
    const next = (await client.get('/admin/finance/profit', { query: { from: '2026-10-25', to: '2026-10-25' } })).json();
    expect(next.byOrder.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['STP-5']);
  });

  it('DST start (clocks forward 2026-03-29 00:00 local): the 29 Mar day is 23 hours long', async () => {
    await buildWorld(t.prisma);
    const p = t.prisma;
    await makeOrder(p, { number: 'STP-1', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-03-28T21:59:59Z' }); // 28 Mar 23:59:59 (+2)
    await makeOrder(p, { number: 'STP-2', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-03-28T22:00:00Z' }); // 29 Mar 00:00 (+2)
    await makeOrder(p, { number: 'STP-3', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-03-29T20:59:59Z' }); // 29 Mar 23:59:59 (+3)
    await makeOrder(p, { number: 'STP-4', status: 'DELIVERED', items: [HOODIE], deliveredAt: '2026-03-29T21:00:00Z' }); // 30 Mar 00:00 (+3)
    const { client } = await t.adminClient();
    const day = (await client.get('/admin/finance/profit', { query: { from: '2026-03-29', to: '2026-03-29' } })).json();
    expect(day.byOrder.items.map((o: { orderNumber: string }) => o.orderNumber).sort()).toEqual(['STP-2', 'STP-3']);
  });

  it('validates the range: bad format, impossible date, end before start', async () => {
    const { client } = await t.adminClient();
    for (const q of [{ from: '2026-1-1' }, { from: '2026-02-30' }, { to: 'tomorrow' }, { from: '2026-10-31T00:00:00Z' }]) {
      const r = await client.get('/admin/finance/profit', { query: q });
      expect(r.status, JSON.stringify(q)).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
    const r = await client.get('/admin/finance/profit', { query: { from: '2026-10-31', to: '2026-10-01' } });
    expect(r.status).toBe(400);
    expect(r.json().error.fields.to).toBeTruthy();
  });

  it('a cost snapshot is used, not the current product cost', async () => {
    const w = await buildWorld(t.prisma);
    await makeOrder(t.prisma, { number: 'STP-1', status: 'DELIVERED', items: [PACK1], deliveredAt: '2026-10-10T10:00:00Z' });
    await t.prisma.hoodie.update({ where: { id: w.hoodie.id }, data: { costCents: 99999 } });
    const { client } = await t.adminClient();
    const body = (await client.get('/admin/finance/profit', { query: { from: '2026-10-01', to: '2026-10-31' } })).json();
    expect(body.costOfGoodsCents).toBe(1700);
  });
});

describe('GET /admin/finance/cash', () => {
  async function seedCash() {
    freezeTime('2026-11-05T10:00:00Z');
    await buildWorld(t.prisma);
    const p = t.prisma;
    const base = { status: 'DELIVERED' as const, cashCollected: true, deliveredAt: '2026-11-03T10:00:00Z' };
    await makeOrder(p, { ...base, number: 'STP-1', items: [PACK1], deliveryFeeCents: 300, deliveryNumber: 'D-1' }); // 3800 due
    await makeOrder(p, { ...base, number: 'STP-2', items: [PACK2, { ...STIMPIE, qty: 2 }], deliveryFeeCents: 500, deliveryNumber: 'D-1', cashSettled: true }); // 7000 settled
    await makeOrder(p, { ...base, number: 'STP-3', items: [HOODIE], deliveryFeeCents: 300, deliveryNumber: 'D-2' }); // 2800 due
    await makeOrder(p, { ...base, number: 'STP-4', items: [PACK1], deliveryFeeCents: 300, deliveryNumber: null }); // 3800 due, no number
    await makeOrder(p, { ...base, number: 'STP-5', items: [PACK1], deliveryFeeCents: 300, deliveryNumber: 'D-0', cashSettled: true, deliveredAt: '2026-08-01T10:00:00Z' }); // old and settled: hidden
    await makeOrder(p, { number: 'STP-6', status: 'RETURNED', items: [PACK1], deliveryNumber: 'D-2', deliveredAt: '2026-11-03T10:00:00Z' }); // returned: flags reset, excluded
    await makeOrder(p, { number: 'STP-7', status: 'OUT_FOR_DELIVERY', items: [PACK1], deliveryNumber: 'D-3' }); // not delivered yet
  }

  it('lists delivered orders grouped by delivery number with outstanding = unsettled delivered totals', async () => {
    await seedCash();
    const { client } = await t.adminClient();
    const body = (await client.get('/admin/finance/cash')).json();
    expect(body.outstandingCents).toBe(10400); // 3800 + 2800 + 3800
    const sum = (n: number) => n;
    expect(body.groups.items.map((g: { deliveryNumber: string | null }) => g.deliveryNumber)).toEqual(['D-1', 'D-2', null]);
    const [d1, d2, none] = body.groups.items;
    expect(d1.totalDueCents).toBe(sum(3800)); // the settled 7000 order is listed but not due
    expect(d1.orders.map((o: { orderNumber: string; cashDueCents: number; settled: boolean }) => [o.orderNumber, o.cashDueCents, o.settled])).toEqual([
      ['STP-1', 3800, false],
      ['STP-2', 7000, true],
    ]);
    expect(d1.orders[0]).toHaveProperty('orderId');
    expect(d2).toMatchObject({ totalDueCents: 2800, orders: [{ orderNumber: 'STP-3', cashDueCents: 2800, settled: false }] });
    expect(none).toMatchObject({ deliveryNumber: null, totalDueCents: 3800 });
    const all = body.groups.items.flatMap((g: { orders: { orderNumber: string }[] }) => g.orders.map((o) => o.orderNumber));
    expect(all).not.toContain('STP-5'); // old settled
    expect(all).not.toContain('STP-6');
    expect(all).not.toContain('STP-7');
  });

  it('partial settlement: settling one order lowers outstanding by exactly its total; settling a whole delivery empties its due', async () => {
    await seedCash();
    const { client } = await t.adminClient();
    await t.prisma.order.update({ where: { number: 'STP-1' }, data: { cashSettled: true } });
    let body = (await client.get('/admin/finance/cash')).json();
    expect(body.outstandingCents).toBe(6600);
    expect(body.groups.items[0]).toMatchObject({ deliveryNumber: 'D-1', totalDueCents: 0 });
    await t.prisma.order.updateMany({ where: { deliveryNumber: 'D-2', status: 'DELIVERED' }, data: { cashSettled: true } });
    body = (await client.get('/admin/finance/cash')).json();
    expect(body.outstandingCents).toBe(3800);
  });

  it('nothing to collect gives zero and no groups', async () => {
    const { client } = await t.adminClient();
    expect((await client.get('/admin/finance/cash')).json()).toEqual({ outstandingCents: 0, groups: { items: [], page: 1, pageSize: 25, total: 0 } });
  });
});

describe('expenses and ad spend CRUD', () => {
  const kinds = [
    { path: '/admin/expenses', label: 'category', value: 'Printing', other: 'Packaging' },
    { path: '/admin/ad-spend', label: 'channel', value: 'Meta Ads', other: 'TikTok' },
  ] as const;

  for (const k of kinds) {
    describe(k.path, () => {
      it('creates, lists with filters/sort/paging, edits and deletes; totalCents covers the whole filtered range', async () => {
        const { client } = await t.adminClient();
        const make = (label: string, amountCents: number, spentOn: string, note?: string) => client.post(k.path, { [k.label]: label, amountCents, spentOn, ...(note !== undefined ? { note } : {}) });
        const a = await make(k.value, 1000, '2026-10-01', 'first');
        expect(a.status).toBe(201);
        expect(a.json()).toEqual({ id: expect.any(Number), [k.label]: k.value, amountCents: 1000, note: 'first', spentOn: '2026-10-01' });
        await make(k.value, 2500, '2026-10-05');
        await make(k.other, 400, '2026-10-10');
        await make(k.value, 600, '2026-11-02');

        const all = (await client.get(k.path)).json();
        expect(all).toMatchObject({ total: 4, page: 1, pageSize: 25, totalCents: 4500 });
        expect(all.items.map((i: { spentOn: string }) => i.spentOn)).toEqual(['2026-11-02', '2026-10-10', '2026-10-05', '2026-10-01']); // newest first by default
        expect(all.items[1].note).toBeNull();

        const oct = (await client.get(k.path, { query: { from: '2026-10-01', to: '2026-10-31' } })).json();
        expect(oct).toMatchObject({ total: 3, totalCents: 3900 });
        const byLabel = (await client.get(k.path, { query: { [k.label]: k.value } })).json();
        expect(byLabel).toMatchObject({ total: 3, totalCents: 4100 });

        const page = (await client.get(k.path, { query: { pageSize: 2, page: 2, sort: 'amountCents' } })).json();
        expect(page.items.map((i: { amountCents: number }) => i.amountCents)).toEqual([1000, 2500]); // asc: 400, 600 | 1000, 2500
        expect(page.totalCents).toBe(4500); // whole range, not the page
        const desc = (await client.get(k.path, { query: { sort: '-amountCents' } })).json();
        expect(desc.items[0].amountCents).toBe(2500);

        const id = a.json().id;
        const patched = await client.patch(`${k.path}/${id}`, { amountCents: 1200, note: null, spentOn: '2026-10-02', [k.label]: 'Renamed' });
        expect(patched.status).toBe(200);
        expect(patched.json()).toEqual({ id, [k.label]: 'Renamed', amountCents: 1200, note: null, spentOn: '2026-10-02' });
        expect((await client.patch(`${k.path}/${id}`, {})).json().amountCents).toBe(1200); // empty patch changes nothing

        expect((await client.delete(`${k.path}/${id}`)).status).toBe(204);
        expect((await client.delete(`${k.path}/${id}`)).status).toBe(404);
        expect((await client.patch(`${k.path}/${id}`, { amountCents: 5 })).status).toBe(404);
        expect((await client.get(k.path)).json().total).toBe(3);
      });

      it('validates input', async () => {
        const { client } = await t.adminClient();
        const good = { [k.label]: k.value, amountCents: 100, spentOn: '2026-10-01' };
        const bad: Record<string, object> = {
          'zero amount': { ...good, amountCents: 0 },
          'negative amount': { ...good, amountCents: -5 },
          'decimal amount': { ...good, amountCents: 10.5 },
          'string amount': { ...good, amountCents: '100' },
          'missing date': { [k.label]: k.value, amountCents: 100 },
          'bad date': { ...good, spentOn: '01/10/2026' },
          'impossible date': { ...good, spentOn: '2026-02-30' },
          'empty label': { ...good, [k.label]: '  ' },
          'long label': { ...good, [k.label]: 'x'.repeat(61) },
          'long note': { ...good, note: 'x'.repeat(256) },
          'unknown field': { ...good, extra: 1 },
          'wrong label field': { [k.label === 'category' ? 'channel' : 'category']: 'x', amountCents: 100, spentOn: '2026-10-01' },
        };
        for (const [name, body] of Object.entries(bad)) {
          const r = await client.post(k.path, body);
          expect(r.status, name).toBe(400);
          expect(r.json().error.code, name).toBe('VALIDATION_ERROR');
        }
        expect((await client.post(k.path, good)).status).toBe(201);
        expect((await client.get(k.path, { query: { from: '2026-10-31', to: '2026-10-01' } })).status).toBe(400);
      });

      it('edits flow into profit', async () => {
        await buildWorld(t.prisma);
        await makeOrder(t.prisma, { number: 'STP-1', status: 'DELIVERED', items: [PACK1], deliveredAt: '2026-10-10T10:00:00Z' });
        const { client } = await t.adminClient();
        const profit = async () => (await client.get('/admin/finance/profit', { query: { from: '2026-10-01', to: '2026-10-31' } })).json().profitCents;
        expect(await profit()).toBe(1800);
        const created = (await client.post(k.path, { [k.label]: k.value, amountCents: 700, spentOn: '2026-10-31' })).json();
        expect(await profit()).toBe(1100);
        await client.patch(`${k.path}/${created.id}`, { spentOn: '2026-11-01' }); // moved out of range
        expect(await profit()).toBe(1800);
        await client.patch(`${k.path}/${created.id}`, { spentOn: '2026-10-15', amountCents: 300 });
        expect(await profit()).toBe(1500);
        await client.delete(`${k.path}/${created.id}`);
        expect(await profit()).toBe(1800);
      });
    });
  }
});
