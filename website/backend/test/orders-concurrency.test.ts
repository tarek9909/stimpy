import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createStimpie } from './helpers/fixtures';
import { assertStockInvariants, hoodieItem, orderBody, packItem, phoneN, placeInput, stimpieItem, variantOf } from './helpers/orders';
import { AppError } from '../src/lib/errors';
import { placeOrder } from '../src/services/orders';
import type { CartItemInput } from '../src/services/pricing';

const t = useTestApp();

const numberOf = (n: string): number => Number(n.split('-')[1]);

async function settle(promises: Promise<{ number: string; created: boolean }>[]) {
  const results = await Promise.allSettled(promises);
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as AppError] : []));
  // anything other than SOLD_OUT would be a bug (deadlock, timeout, ...)
  for (const f of failed) expect([f.code, f.message].join(': ')).toMatch(/^SOLD_OUT/);
  return { ok, failed };
}

describe('oversell is impossible under concurrency', () => {
  it('50 simultaneous orders for a limited Stimpie with 5 units: exactly 5 orders, 45 SOLD_OUT', async () => {
    const w = await buildWorld(t.prisma);
    const s = await createStimpie(t.prisma, { dropId: w.drop.id, quantity: 5 });
    const { ok, failed } = await settle(Array.from({ length: 50 }, (_, i) => placeOrder(t.ctx, placeInput(w, [stimpieItem(s.id)], { i }))));
    expect(ok).toHaveLength(5);
    expect(failed).toHaveLength(45);
    for (const f of failed) expect(f.details!.items).toEqual([{ kind: 'STIMPIE', stimpieId: s.id, itemIndex: 0, name: s.name, requested: 1, available: expect.any(Number) }]);
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ quantity: 5, reserved: 5 });
    expect(await t.prisma.order.count()).toBe(5);
    // numbers: 5 distinct, no gap, no number consumed by a failed attempt
    expect(ok.map((r) => numberOf(r.number)).sort((a, b) => a - b)).toEqual([1001, 1002, 1003, 1004, 1005]);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1005);
    expect(await t.prisma.stockMovement.count({ where: { stimpieId: s.id } })).toBe(5);
    await assertStockInvariants(t.prisma);
  });

  it('the same through HTTP (POST /orders from 50 clients)', async () => {
    const w = await buildWorld(t.prisma);
    const s = await createStimpie(t.prisma, { dropId: w.drop.id, quantity: 5 });
    const res = await Promise.all(Array.from({ length: 50 }, (_, i) => t.client.post('/orders', orderBody(w, [stimpieItem(s.id)], { i }), { ip: `10.9.${Math.floor(i / 200)}.${i + 1}` })));
    expect(res.filter((r) => r.status === 201)).toHaveLength(5);
    const rejected = res.filter((r) => r.status !== 201);
    expect(rejected).toHaveLength(45);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      expect(r.json().error.code).toBe('SOLD_OUT');
    }
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ quantity: 5, reserved: 5 });
    await assertStockInvariants(t.prisma);
  });

  it('50 simultaneous orders for one hoodie variant with 5 units: exactly 5 orders', async () => {
    const w = await buildWorld(t.prisma);
    const v = await variantOf(t.prisma, w, 'black', 'l');
    await t.prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity: 5 } });
    const { ok, failed } = await settle(Array.from({ length: 50 }, (_, i) => placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 'l')], { i }))));
    expect(ok).toHaveLength(5);
    expect(failed).toHaveLength(45);
    expect(await variantOf(t.prisma, w, 'black', 'l')).toMatchObject({ quantity: 5, reserved: 5 });
    await assertStockInvariants(t.prisma);
  });

  it('orders with qty > 1: units, not orders, are what runs out (7 units, 20 buyers of 2 => 3 orders, 6 reserved)', async () => {
    const w = await buildWorld(t.prisma);
    const s = await createStimpie(t.prisma, { quantity: 7 });
    const { ok } = await settle(Array.from({ length: 20 }, (_, i) => placeOrder(t.ctx, placeInput(w, [stimpieItem(s.id, 2)], { i }))));
    expect(ok).toHaveLength(3);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s.id } })).reserved).toBe(6);
    await assertStockInvariants(t.prisma);
  });

  it('mixed carts are all-or-nothing under contention: a failing line never leaves another line reserved', async () => {
    const w = await buildWorld(t.prisma);
    const scarce = await createStimpie(t.prisma, { dropId: w.drop.id, quantity: 3 });
    const v = await variantOf(t.prisma, w, 'black', 'm');
    await t.prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity: 10 } });
    // every order = one hoodie + the scarce Stimpie; only 3 can succeed, so only 3 hoodies may be reserved
    const { ok } = await settle(
      Array.from({ length: 30 }, (_, i) => placeOrder(t.ctx, placeInput(w, [hoodieItem(w), stimpieItem(scarce.id)], { i }))),
    );
    expect(ok).toHaveLength(3);
    expect(await variantOf(t.prisma, w, 'black', 'm')).toMatchObject({ quantity: 10, reserved: 3 });
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: scarce.id } })).toMatchObject({ quantity: 3, reserved: 3 });
    await assertStockInvariants(t.prisma);
  });

  it('carts listing the same things in opposite order do not deadlock (fixed lock order)', async () => {
    const w = await buildWorld(t.prisma);
    const scarce = await createStimpie(t.prisma, { quantity: 6 });
    const v = await variantOf(t.prisma, w, 'cream', 'm');
    await t.prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity: 8 } });
    const a: CartItemInput[] = [hoodieItem(w, 1, 'cream', 'm'), stimpieItem(scarce.id)];
    const b: CartItemInput[] = [stimpieItem(scarce.id), hoodieItem(w, 1, 'cream', 'm')];
    const { ok } = await settle(Array.from({ length: 40 }, (_, i) => placeOrder(t.ctx, placeInput(w, i % 2 ? a : b, { i }))));
    expect(ok).toHaveLength(6);
    expect(await variantOf(t.prisma, w, 'cream', 'm')).toMatchObject({ reserved: 6 });
    await assertStockInvariants(t.prisma);
  });

  it('a pack that needs a scarce limited Stimpie reserves nothing when it loses the race', async () => {
    const w = await buildWorld(t.prisma);
    const scarce = await createStimpie(t.prisma, { dropId: w.drop.id, quantity: 2 });
    const { ok } = await settle(Array.from({ length: 15 }, (_, i) => placeOrder(t.ctx, placeInput(w, [packItem(w, [scarce.id, w.core[0]!.id])], { i }))));
    expect(ok).toHaveLength(2);
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.core[0]!.id } })).reserved).toBe(2);
    expect(await variantOf(t.prisma, w)).toMatchObject({ reserved: 2 });
    await assertStockInvariants(t.prisma);
  });
});

describe('order numbers', () => {
  it('50 simultaneous successful orders get 50 distinct, increasing numbers with no gaps', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 100 });
    const { ok } = await settle(Array.from({ length: 50 }, (_, i) => placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 's')], { i }))));
    const nums = ok.map((r) => numberOf(r.number)).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(50);
    expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => 1001 + i));
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1050);
    // increasing in creation order too: ids and numbers agree
    const rows = await t.prisma.order.findMany({ orderBy: { id: 'asc' }, select: { number: true } });
    expect(rows.map((r) => numberOf(r.number))).toEqual(nums);
  });

  it('rolled-back attempts (sold out) consume no number even when mixed with successes', async () => {
    const w = await buildWorld(t.prisma);
    const s = await createStimpie(t.prisma, { quantity: 10 });
    const results = await settle(Array.from({ length: 30 }, (_, i) => placeOrder(t.ctx, placeInput(w, [stimpieItem(s.id)], { i }))));
    expect(results.ok).toHaveLength(10);
    expect(results.ok.map((r) => numberOf(r.number)).sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, i) => 1001 + i));
    // the next order continues right after
    const next = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 99 }));
    expect(next.number).toBe('STP-1011');
  });

  it('numbers are never reused: the number of a cancelled order stays taken', async () => {
    const w = await buildWorld(t.prisma);
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 1 }));
    const { changeStatus } = await import('../src/services/orders');
    await changeStatus(t.ctx, { orderId: a.orderId, to: 'CANCELLED', userId: null });
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 2 }));
    expect([a.number, b.number]).toEqual(['STP-1001', 'STP-1002']);
    void phoneN;
  });
});
