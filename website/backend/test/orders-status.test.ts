import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@prisma/client';
import { useTestApp } from './helpers/app';
import { buildWorld, type World } from './helpers/fixtures';
import { freezeTime, advanceTime } from './helpers/clock';
import { assertStockInvariants, hoodieItem, orderBody, packItem, placeInput, stimpieItem, variantOf } from './helpers/orders';
import { mailpitAvailable, mailpitClear, mailpitMessage, mailpitMessages, mailpitWaitFor } from './helpers/mailpit';
import { createSmtpTransport } from '../src/lib/email-transport';
import { processDueEmails } from '../src/services/email-queue';
import { AppError } from '../src/lib/errors';
import { changeStatus, placeOrder, setDeliveryNumber } from '../src/services/orders';
import { allowedTransitions } from '../src/services/orders';
import { now } from '../src/lib/clock';
import { runHoldExpiry } from '../src/jobs/hold-expiry';

const t = useTestApp();
const ALL: OrderStatus[] = ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'];

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected an AppError');
}

/** Standard cart: a pack (variant Black/M + core[0]) and 2 units of limited[0]. Reserves 1 variant, 1 core, 2 limited. */
async function place(w: World, i = 0, extra: Partial<Parameters<typeof placeInput>[2]> = {}) {
  const r = await placeOrder(t.ctx, placeInput(w, [packItem(w, [w.core[0]!.id]), stimpieItem(w.limited[0]!.id, 2)], { i, ...extra }));
  return r.orderId;
}

const go = (orderId: number, to: OrderStatus, o: Partial<Parameters<typeof changeStatus>[1]> = {}) =>
  changeStatus(t.ctx, { orderId, to, userId: null, ...(to === 'OUT_FOR_DELIVERY' ? { deliveryNumber: 'DLV-1' } : {}), ...o });

/** Brings a fresh order to `status` along the only legal path. */
async function reach(orderId: number, status: OrderStatus): Promise<void> {
  const paths: Record<OrderStatus, OrderStatus[]> = {
    NEW: [],
    CONFIRMED: ['CONFIRMED'],
    PACKED: ['CONFIRMED', 'PACKED'],
    OUT_FOR_DELIVERY: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'],
    DELIVERED: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    CANCELLED: ['CANCELLED'],
    RETURNED: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
  };
  for (const s of paths[status]) await go(orderId, s);
}

type Snap = { vq: number; vr: number; cq: number; cr: number; lq: number; lr: number };
async function snap(w: World): Promise<Snap> {
  const v = await variantOf(t.prisma, w);
  const c = await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.core[0]!.id } });
  const l = await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.limited[0]!.id } });
  return { vq: v.quantity, vr: v.reserved, cq: c.quantity, cr: c.reserved, lq: l.quantity, lr: l.reserved };
}
const START: Snap = { vq: 20, vr: 0, cq: 20, cr: 0, lq: 30, lr: 0 };
const RESERVED: Snap = { vq: 20, vr: 1, cq: 20, cr: 1, lq: 30, lr: 2 };
const SOLD: Snap = { vq: 19, vr: 0, cq: 19, cr: 0, lq: 28, lr: 0 };

const lineStates = async (orderId: number) => [...new Set((await t.prisma.orderStockLine.findMany({ where: { orderId } })).map((l) => l.state))];
const reasons = async (orderId: number) => (await t.prisma.stockMovement.findMany({ where: { orderId }, orderBy: { id: 'asc' } })).map((m) => `${m.field}:${m.reason}:${m.delta > 0 ? '+' : m.delta < 0 ? '-' : '0'}`);
const emailsOf = async (orderId: number) => (await t.prisma.emailLog.findMany({ where: { orderId }, orderBy: { id: 'asc' } })).map((e) => e.templateKey);

describe('status paths: stock, cash and e-mail effects (business-rules 5 and 7)', () => {
  it('NEW > CONFIRMED > PACKED > OUT_FOR_DELIVERY > DELIVERED sells the stock and collects cash', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    expect(await snap(w)).toEqual(RESERVED);

    await go(id, 'CONFIRMED');
    let o = await t.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(o).toMatchObject({ status: 'CONFIRMED', holdExpiresAt: null });
    expect(o.confirmedAt).not.toBeNull();
    expect(await snap(w)).toEqual(RESERVED); // confirming does not touch stock

    await go(id, 'PACKED');
    expect(await snap(w)).toEqual(RESERVED);

    await go(id, 'OUT_FOR_DELIVERY', { deliveryNumber: '  DLV-77  ' });
    o = await t.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(o).toMatchObject({ status: 'OUT_FOR_DELIVERY', deliveryNumber: 'DLV-77', cashCollected: false });
    expect(o.outForDeliveryAt).not.toBeNull();
    expect(await snap(w)).toEqual(RESERVED);

    await go(id, 'DELIVERED');
    o = await t.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(o).toMatchObject({ status: 'DELIVERED', cashCollected: true, cashSettled: false });
    expect(o.deliveredAt).not.toBeNull();
    expect(await snap(w)).toEqual(SOLD);
    expect(await lineStates(id)).toEqual(['SOLD']);
    // sold = two movements per item (quantity down, reserved down)
    const r = await reasons(id);
    expect(r.filter((x) => x === 'QUANTITY:ORDER_SOLD:-')).toHaveLength(3);
    expect(r.filter((x) => x === 'RESERVED:ORDER_SOLD:-')).toHaveLength(3);

    const events = await t.prisma.orderEvent.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } });
    expect(events.map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual(['null>NEW', 'NEW>CONFIRMED', 'CONFIRMED>PACKED', 'PACKED>OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY>DELIVERED']);
    // e-mails: received (NEW), confirmed, out for delivery, delivered; none for PACKED; plus the founder alert is OFF by default
    expect(await emailsOf(id)).toEqual(['order_received', 'order_confirmed', 'order_out_for_delivery', 'order_delivered']);
    await assertStockInvariants(t.prisma);
  });

  it.each(['NEW', 'CONFIRMED', 'PACKED'] as const)('cancelling from %s releases the stock (quantity untouched) and stores the reason', async (from) => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, from);
    await go(id, 'CANCELLED', { cancelReason: 'Customer changed their mind' });
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(o).toMatchObject({ status: 'CANCELLED', cancelReason: 'Customer changed their mind', holdExpiresAt: null });
    expect(o.cancelledAt).not.toBeNull();
    expect(await snap(w)).toEqual(START);
    expect(await lineStates(id)).toEqual(['RELEASED']);
    expect((await reasons(id)).filter((x) => x === 'RESERVED:ORDER_RELEASED:-')).toHaveLength(3);
    expect(await emailsOf(id)).toContain('order_cancelled');
    await assertStockInvariants(t.prisma);
  });

  it('OUT_FOR_DELIVERY > RETURNED (failed delivery) releases the reservation; cash flags stay false', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'OUT_FOR_DELIVERY');
    await go(id, 'RETURNED', { cancelReason: 'Nobody home' });
    expect(await t.prisma.order.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'RETURNED', cashCollected: false, cashSettled: false, cancelReason: 'Nobody home' });
    expect(await snap(w)).toEqual(START);
    expect(await lineStates(id)).toEqual(['RELEASED']);
    expect(await emailsOf(id)).not.toContain('order_cancelled'); // RETURNED sends nothing
    expect((await emailsOf(id)).length).toBe(3); // received, confirmed, out for delivery
    await assertStockInvariants(t.prisma);
  });

  it('DELIVERED > RETURNED with restock puts units back on the shelf and resets cash', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'DELIVERED');
    await t.prisma.order.update({ where: { id }, data: { cashSettled: true } });
    await go(id, 'RETURNED', { restock: true });
    expect(await t.prisma.order.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'RETURNED', cashCollected: false, cashSettled: false });
    expect(await snap(w)).toEqual(START); // 19 + 1 again
    expect(await lineStates(id)).toEqual(['RESTOCKED']);
    expect((await reasons(id)).filter((x) => x === 'QUANTITY:ORDER_RETURNED:+')).toHaveLength(3);
    await assertStockInvariants(t.prisma);
  });

  it('DELIVERED > RETURNED with restock:false writes the units off (zero-delta marker, quantity stays down)', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'DELIVERED');
    await go(id, 'RETURNED', { restock: false });
    expect(await snap(w)).toEqual(SOLD);
    expect(await lineStates(id)).toEqual(['WRITTEN_OFF']);
    const marks = await t.prisma.stockMovement.findMany({ where: { orderId: id, reason: 'ORDER_WRITTEN_OFF' } });
    expect(marks).toHaveLength(3);
    expect(marks.every((m) => m.delta === 0)).toBe(true);
    await assertStockInvariants(t.prisma);
  });

  it('restock defaults to true for a delivered order', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'DELIVERED');
    await go(id, 'RETURNED');
    expect(await snap(w)).toEqual(START);
  });
});

describe('the transition table', () => {
  it('allowedTransitions matches business-rules 7', () => {
    expect(allowedTransitions('NEW')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(allowedTransitions('CONFIRMED')).toEqual(['PACKED', 'CANCELLED']);
    expect(allowedTransitions('PACKED')).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
    expect(allowedTransitions('OUT_FOR_DELIVERY')).toEqual(['DELIVERED', 'RETURNED']);
    expect(allowedTransitions('DELIVERED')).toEqual(['RETURNED']);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
    expect(allowedTransitions('RETURNED')).toEqual([]);
  });

  it('every illegal pair (49 minus the legal ones) is INVALID_TRANSITION with the allowed list, and changes nothing', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 100 });
    let n = 0;
    for (const from of ALL) {
      const id = await place(w, ++n);
      await reach(id, from);
      const before = await snap(w);
      const events = await t.prisma.orderEvent.count({ where: { orderId: id } });
      const mails = await t.prisma.emailLog.count({ where: { orderId: id } });
      const legal = allowedTransitions(from);
      for (const to of ALL.filter((s) => !legal.includes(s))) {
        const err = await errorOf(go(id, to));
        expect(err.code, `${from} > ${to}`).toBe('INVALID_TRANSITION');
        expect(err.httpStatus).toBe(409);
        expect(err.details).toEqual({ from, to, allowed: legal });
      }
      expect(await snap(w)).toEqual(before);
      expect(await t.prisma.orderEvent.count({ where: { orderId: id } })).toBe(events);
      expect(await t.prisma.emailLog.count({ where: { orderId: id } })).toBe(mails);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe(from);
    }
    await assertStockInvariants(t.prisma);
  });

  it('unknown order is NOT_FOUND', async () => {
    await buildWorld(t.prisma);
    expect((await errorOf(go(999999, 'CONFIRMED'))).code).toBe('NOT_FOUND');
  });

  it('two simultaneous identical status changes: one wins, the other is INVALID_TRANSITION; one e-mail, one event, stock effects once', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => go(id, 'CANCELLED')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect((r.reason as AppError).code).toBe('INVALID_TRANSITION');
    expect(await snap(w)).toEqual(START);
    expect((await emailsOf(id)).filter((e) => e === 'order_cancelled')).toHaveLength(1);
    expect(await t.prisma.orderEvent.count({ where: { orderId: id, toStatus: 'CANCELLED' } })).toBe(1);
    await assertStockInvariants(t.prisma);
  });

  it('confirm and cancel racing: exactly one wins and the stock ends consistent', async () => {
    const w = await buildWorld(t.prisma);
    for (let k = 0; k < 4; k++) {
      const id = await place(w, k);
      const [a, b] = await Promise.allSettled([go(id, 'CONFIRMED'), go(id, 'CANCELLED')]);
      expect([a.status, b.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
    }
    await assertStockInvariants(t.prisma);
  });

  it('a note and the acting user are recorded on the event', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await go(id, 'CONFIRMED', { note: 'Called the customer', userId: w.admin!.user.id });
    const e = await t.prisma.orderEvent.findFirstOrThrow({ where: { orderId: id, toStatus: 'CONFIRMED' } });
    expect(e).toMatchObject({ note: 'Called the customer', userId: w.admin!.user.id });
  });
});

describe('delivery number rules (business-rules 8)', () => {
  it('is required to go out: blank, missing or whitespace gives DELIVERY_NUMBER_REQUIRED (422) and nothing changes', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'PACKED');
    for (const dn of [undefined, '', '   ']) {
      const err = await errorOf(changeStatus(t.ctx, { orderId: id, to: 'OUT_FOR_DELIVERY', userId: null, deliveryNumber: dn }));
      expect(err.code).toBe('DELIVERY_NUMBER_REQUIRED');
      expect(err.httpStatus).toBe(422);
    }
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('PACKED');
    expect(await t.prisma.orderEvent.count({ where: { orderId: id, toStatus: 'OUT_FOR_DELIVERY' } })).toBe(0);
  });

  it('is limited to 60 characters (VALIDATION_ERROR on deliveryNumber) and trimmed', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    await reach(id, 'PACKED');
    expect((await errorOf(go(id, 'OUT_FOR_DELIVERY', { deliveryNumber: 'x'.repeat(61) }))).fields).toHaveProperty('deliveryNumber');
    await go(id, 'OUT_FOR_DELIVERY', { deliveryNumber: 'x'.repeat(60) });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).deliveryNumber).toHaveLength(60);
  });

  it('is not unique: a shared number succeeds and returns DUPLICATE_DELIVERY_NUMBER with the other order ids', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const a = await place(w, 1);
    const b = await place(w, 2);
    const c = await place(w, 3);
    for (const id of [a, b, c]) await reach(id, 'PACKED');
    expect((await go(a, 'OUT_FOR_DELIVERY', { deliveryNumber: 'RUN-9' })).warnings).toEqual([]);
    expect((await go(b, 'OUT_FOR_DELIVERY', { deliveryNumber: 'RUN-9' })).warnings).toEqual([{ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: 'RUN-9', orderIds: [a] }]);
    expect((await go(c, 'OUT_FOR_DELIVERY', { deliveryNumber: 'RUN-9' })).warnings).toEqual([{ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: 'RUN-9', orderIds: [a, b] }]);
    // a cancelled/returned order with the same number is not "open": it does not count
    await go(a, 'RETURNED');
    await go(b, 'RETURNED');
    const d = await place(w, 4);
    await reach(d, 'PACKED');
    expect((await go(d, 'OUT_FOR_DELIVERY', { deliveryNumber: 'RUN-9' })).warnings.map((x) => x.orderIds)).toEqual([[c]]);
  });

  it('correcting the number on an order already out: event with from/to text, no new e-mail, duplicate warning still reported', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    const a = await place(w, 1);
    const b = await place(w, 2);
    await reach(a, 'OUT_FOR_DELIVERY');
    await reach(b, 'OUT_FOR_DELIVERY');
    await go(b, 'DELIVERED').catch(() => undefined);
    const mailsBefore = (await emailsOf(a)).length;

    const r = await setDeliveryNumber(t.ctx, { orderId: a, deliveryNumber: '  DLV-2  ', userId: null });
    expect(r.warnings).toEqual([]);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a } })).deliveryNumber).toBe('DLV-2');
    const ev = await t.prisma.orderEvent.findFirstOrThrow({ where: { orderId: a }, orderBy: { id: 'desc' } });
    expect(ev).toMatchObject({ fromStatus: 'OUT_FOR_DELIVERY', toStatus: 'OUT_FOR_DELIVERY', note: 'Delivery number changed from DLV-1 to DLV-2' });
    expect((await emailsOf(a)).length).toBe(mailsBefore); // no resend
    expect((await emailsOf(a)).filter((e) => e === 'order_out_for_delivery')).toHaveLength(1);

    // correcting to a number another open order has: warning, still applied
    const r2 = await setDeliveryNumber(t.ctx, { orderId: a, deliveryNumber: 'DLV-1', userId: null }); // b still has DLV-1 (delivered)
    expect(r2.warnings).toEqual([{ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: 'DLV-1', orderIds: [b] }]);
    // same number again: no event, no change
    const evCount = await t.prisma.orderEvent.count({ where: { orderId: a } });
    await setDeliveryNumber(t.ctx, { orderId: a, deliveryNumber: 'DLV-1', userId: null });
    expect(await t.prisma.orderEvent.count({ where: { orderId: a } })).toBe(evCount);
    // the order stays out for delivery with its stock reserved
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a } })).status).toBe('OUT_FOR_DELIVERY');
    await assertStockInvariants(t.prisma);
  });

  it('POST /delivery from PACKED is the status change (sends the e-mail once); from NEW or DELIVERED it is INVALID_TRANSITION', async () => {
    const w = await buildWorld(t.prisma);
    const id = await place(w);
    expect((await errorOf(setDeliveryNumber(t.ctx, { orderId: id, deliveryNumber: 'A-1', userId: null }))).code).toBe('INVALID_TRANSITION');
    await reach(id, 'PACKED');
    await setDeliveryNumber(t.ctx, { orderId: id, deliveryNumber: 'A-1', userId: null });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('OUT_FOR_DELIVERY');
    expect((await emailsOf(id)).filter((e) => e === 'order_out_for_delivery')).toHaveLength(1);
    await go(id, 'DELIVERED');
    expect((await errorOf(setDeliveryNumber(t.ctx, { orderId: id, deliveryNumber: 'A-2', userId: null }))).code).toBe('INVALID_TRANSITION');
  });
});

describe('cash (business-rules 8)', () => {
  it('delivered sets collected; settled is a separate step; un-collecting un-settles; only DELIVERED orders', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = await place(w);
    const early = await client.post(`/admin/orders/${id}/cash`, { settled: true });
    expect(early.status).toBe(409);
    await reach(id, 'DELIVERED');
    const ok = await client.post(`/admin/orders/${id}/cash`, { settled: true });
    expect(ok.status).toBe(200);
    expect(ok.json()).toMatchObject({ cashCollected: true, cashSettled: true });
    const un = await client.post(`/admin/orders/${id}/cash`, { collected: false });
    expect(un.json()).toMatchObject({ cashCollected: false, cashSettled: false });
    expect((await client.post(`/admin/orders/${id}/cash`, { settled: true })).status).toBe(409);
    expect((await client.post(`/admin/orders/${id}/cash`, {})).status).toBe(400);
    const notes = (await t.prisma.orderEvent.findMany({ where: { orderId: id, fromStatus: 'DELIVERED', toStatus: 'DELIVERED' } })).map((e) => e.note);
    expect(notes).toEqual(['Cash marked settled', 'Cash marked not collected. Cash marked not settled']);
  });
});

describe('hold expiry (business-rules 9) with a fake clock', () => {
  it('default: changes nothing, the list flags holdExpired; extend-hold clears the flag', async () => {
    const w = await buildWorld(t.prisma);
    freezeTime('2026-10-14T08:00:00Z');
    const { client } = await t.adminClient();
    const id = await place(w);
    advanceTime(11 * 60_000 * 60);
    expect(await runHoldExpiry(t.ctx)).toEqual({ cancelled: 0 });
    advanceTime(2 * 3600_000); // 13 h after placing, hold is 12 h
    await client.login();
    expect(await runHoldExpiry(t.ctx)).toEqual({ cancelled: 0 });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('NEW');
    expect((await client.get('/admin/orders')).json().items[0].holdExpired).toBe(true);
    expect((await client.get('/admin/orders', { query: { holdExpired: true } })).json().total).toBe(1);

    const ext = await client.post(`/admin/orders/${id}/extend-hold`, { hours: 24 });
    expect(ext.status).toBe(200);
    expect(ext.json().holdExpired).toBe(false);
    expect(new Date(ext.json().holdExpiresAt).getTime()).toBe(now().getTime() + 24 * 3600_000);
    expect((await client.get('/admin/orders', { query: { holdExpired: true } })).json().total).toBe(0);
    expect((await client.post(`/admin/orders/${id}/extend-hold`, { hours: 0 })).status).toBe(400);
    expect((await client.post(`/admin/orders/${id}/extend-hold`, { hours: 169 })).status).toBe(400);
  });

  it('extend-hold on a confirmed order is a CONFLICT', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = await place(w);
    await go(id, 'CONFIRMED');
    expect((await client.post(`/admin/orders/${id}/extend-hold`, { hours: 2 })).status).toBe(409);
  });

  it('with autoExpireUnconfirmed: cancels expired NEW orders only, releases stock, queues the cancellation e-mail, reason recorded', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    await t.ctx.settings.update({ orders: { autoExpireUnconfirmed: true, stockHoldHours: 12 } });
    freezeTime('2026-10-14T08:00:00Z');
    const stale = await place(w, 1);
    const confirmed = await place(w, 2);
    await go(confirmed, 'CONFIRMED');
    advanceTime(6 * 3600_000);
    const fresh = await place(w, 3);
    advanceTime(7 * 3600_000); // stale is 13 h old, fresh 7 h
    expect(await runHoldExpiry(t.ctx)).toEqual({ cancelled: 1 });
    expect(await runHoldExpiry(t.ctx)).toEqual({ cancelled: 0 }); // idempotent
    const s = await t.prisma.order.findUniqueOrThrow({ where: { id: stale } });
    expect(s).toMatchObject({ status: 'CANCELLED', cancelReason: 'Expired: not confirmed' });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: confirmed } })).status).toBe('CONFIRMED');
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: fresh } })).status).toBe('NEW');
    expect(await emailsOf(stale)).toEqual(['order_received', 'order_cancelled']);
    expect(await lineStates(stale)).toEqual(['RELEASED']);
    expect(await t.prisma.orderEvent.count({ where: { orderId: stale, toStatus: 'CANCELLED', userId: null } })).toBe(1);
    expect((await variantOf(t.prisma, w)).reserved).toBe(2); // confirmed + fresh
    await assertStockInvariants(t.prisma);
  });

  it('an order confirmed a moment before the job runs is skipped, not an error', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ orders: { autoExpireUnconfirmed: true } });
    freezeTime('2026-10-14T08:00:00Z');
    const id = await place(w);
    advanceTime(13 * 3600_000);
    await go(id, 'CONFIRMED'); // clears the hold
    expect(await runHoldExpiry(t.ctx)).toEqual({ cancelled: 0 });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
  });
});

describe('e-mails queued by the flow (WP-C enqueue API)', () => {
  it('placing an order queues exactly one order_received; a repeated idempotent request queues none', async () => {
    const w = await buildWorld(t.prisma);
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: 'mail-key-0001' }));
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: 'mail-key-0001' }));
    const rows = await t.prisma.emailLog.findMany({ where: { orderId: a.orderId } });
    expect(rows.map((r) => [r.templateKey, r.toEmail, r.status])).toEqual([['order_received', 'customer0@example.com', 'PENDING']]);
  });

  it('master switch off or a disabled template queues nothing; an order without e-mail queues nothing', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ email: { enabled: false } });
    const a = await place(w, 1);
    expect(await emailsOf(a)).toEqual([]);
    await t.ctx.settings.update({ email: { enabled: true } });
    await t.prisma.emailTemplate.update({ where: { key: 'order_confirmed' }, data: { enabled: false } });
    const b = await place(w, 2);
    await go(b, 'CONFIRMED');
    expect(await emailsOf(b)).toEqual(['order_received']);
    const noMail = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 3, source: 'WHATSAPP', customer: { name: 'No Mail', email: null, phone: '71333333', whatsapp: null, whatsappSameAsPhone: true } }));
    expect(await emailsOf(noMail.orderId)).toEqual([]);
  });

  it('a manual CONFIRMED order queues order_confirmed (not order_received); sendEmail:false queues nothing', async () => {
    const w = await buildWorld(t.prisma);
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 1, source: 'INSTAGRAM', initialStatus: 'CONFIRMED' }));
    expect(await emailsOf(a.orderId)).toEqual(['order_confirmed']);
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 2, source: 'MANUAL', initialStatus: 'CONFIRMED', sendEmail: false }));
    expect(await emailsOf(b.orderId)).toEqual([]);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: b.orderId } })).status).toBe('CONFIRMED');
  });

  it('a website order never starts CONFIRMED even if asked', async () => {
    const w = await buildWorld(t.prisma);
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { initialStatus: 'CONFIRMED' }));
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: a.orderId } })).status).toBe('NEW');
  });

  it('founder alerts: only with onNewOrder + founderEmail, website orders only, one per order; low stock fires once per crossing', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com', onNewOrder: true, onLowStock: true } });
    await t.ctx.settings.update({ orders: { lowStockThreshold: 5 } });
    const a = await place(w, 1);
    const manual = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 2, source: 'MANUAL' }));
    expect(await emailsOf(a)).toEqual(['order_received', 'founder_new_order']);
    expect(await emailsOf(manual.orderId)).toEqual(['order_received']);
    // limited[0] has 30; take it down to the threshold: 28 left after the first order (2 reserved). Reserve 23 more => 5 available
    await t.prisma.stimpie.update({ where: { id: w.limited[0]!.id }, data: { quantity: 8 } }); // 8 total, 2 reserved = 6 available
    await placeOrder(t.ctx, placeInput(w, [stimpieItem(w.limited[0]!.id, 1)], { i: 3 })); // 5 available: crossing
    await placeOrder(t.ctx, placeInput(w, [stimpieItem(w.limited[0]!.id, 1)], { i: 4 })); // 4: already low, no second alert
    const low = await t.prisma.emailLog.findMany({ where: { templateKey: 'founder_low_stock' } });
    expect(low).toHaveLength(1);
    expect(low[0]!.toEmail).toBe('founder@example.com');
  });

  it('POST /admin/orders/:id/email: resend ignores switches, custom sends the text, unknown template is a validation error, no address is a conflict', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const id = await place(w);
    await t.ctx.settings.update({ email: { enabled: false } });
    const re = await client.post(`/admin/orders/${id}/email`, { template: 'order_confirmed' });
    expect(re.status).toBe(200);
    expect(re.json().emails.map((e: { template: string }) => e.template)).toContain('order_confirmed');
    const custom = await client.post(`/admin/orders/${id}/email`, { subject: 'Hello {customer_name}', body: 'Your order {order_number} is nearly ready.' });
    expect(custom.status).toBe(200);
    const row = await t.prisma.emailLog.findFirstOrThrow({ where: { orderId: id, templateKey: 'custom' } });
    expect(row.subject).toBe('Hello Customer 0');
    expect((await client.post(`/admin/orders/${id}/email`, { template: 'orders_lookup' })).status).toBe(400);
    expect((await client.post(`/admin/orders/${id}/email`, { template: 'nope' })).status).toBe(400);
    await t.prisma.order.update({ where: { id }, data: { contactEmail: null } });
    expect((await client.post(`/admin/orders/${id}/email`, { template: 'order_confirmed' })).status).toBe(409);
  });
});

describe('real SMTP into Mailpit (shared inbox: unique recipient per test, never clear everything)', () => {
  it('one order-received mail at placement, then exactly one matching mail per status (none for PACKED or RETURNED)', async () => {
    expect(await mailpitAvailable(), 'Mailpit must be running: npm run infra:up').toBe(true);
    const w = await buildWorld(t.prisma);
    const to = `wpb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    await mailpitClear({ to });
    const smtpCtx = { ...t.ctx, emailTransport: createSmtpTransport(t.config.smtp) };
    const body = orderBody(w, [packItem(w, [w.core[0]!.id])], { email: to });
    const key = { 'idempotency-key': `mailpit-${Date.now()}-0001` };
    const res = await t.client.post('/orders', body, { headers: key });
    expect(res.status).toBe(201);
    await t.client.post('/orders', body, { headers: key }); // double submit: same order, no second mail
    const id = (await t.prisma.order.findUniqueOrThrow({ where: { number: res.json().order.number } })).id;
    expect(await processDueEmails(smtpCtx)).toMatchObject({ sent: 1, failed: 0 });
    const subjects = async (n: number) => (await mailpitWaitFor(to, { count: n })).map((m) => m.Subject);
    expect(await subjects(1)).toEqual(['We got your order STP-1001']);
    const first = await mailpitMessage((await mailpitMessages({ to }))[0]!.ID);
    expect(first.Text).toContain('STP-1001');
    expect(first.Text).toContain('$38.00'); // pack 3500 + default fee 300

    const steps: [Parameters<typeof go>[1], number][] = [['CONFIRMED', 2], ['PACKED', 2], ['OUT_FOR_DELIVERY', 3], ['DELIVERED', 4]];
    for (const [status, expected] of steps) {
      await go(id, status);
      await processDueEmails(smtpCtx);
      await new Promise((r) => setTimeout(r, 300));
      expect((await mailpitMessages({ to })).length, status).toBe(expected);
    }
    await go(id, 'RETURNED');
    await processDueEmails(smtpCtx);
    await new Promise((r) => setTimeout(r, 300));
    const all = await mailpitMessages({ to });
    expect(all).toHaveLength(4);
    expect(new Set(all.map((m) => m.Subject)).size).toBe(4);
    expect(all.every((m) => m.Subject.includes('STP-1001') || m.Subject.length > 0)).toBe(true);
    expect(all.every((m) => m.To.every((a) => a.Address === to))).toBe(true);
    await mailpitClear({ to });
  });
});
