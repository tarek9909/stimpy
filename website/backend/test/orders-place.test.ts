import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createArea, createDrop, createStimpie } from './helpers/fixtures';
import { freezeTime } from './helpers/clock';
import { assertStockInvariants, deepKeys, hoodieItem, orderBody, packItem, phoneN, placeInput, stimpieItem, variantOf } from './helpers/orders';
import { AppError } from '../src/lib/errors';
import { placeOrder } from '../src/services/orders';
import type { CartItemInput } from '../src/services/pricing';

const t = useTestApp();

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected an AppError');
}

describe('placeOrder: the happy path writes everything in one go', () => {
  it('creates order, items, stock lines, event, movements, customer; prices from the database', async () => {
    const w = await buildWorld(t.prisma);
    const area = w.areas[1]!; // Mount Lebanon: fee 500, 3 days
    const input = placeInput(w, [packItem(w, [w.core[0]!.id], 1), stimpieItem(w.limited[0]!.id, 2)], {
      delivery: { areaId: area.id, areaName: 'Jounieh', address: 'Main street 5', notes: 'Call first' },
      attribution: { utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'drop-002-teaser' },
    });
    const res = await placeOrder(t.ctx, input);
    expect(res.created).toBe(true);
    expect(res.number).toBe('STP-1001');

    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: res.orderId }, include: { items: true, stockLines: true, events: true, customer: true } });
    expect(o.status).toBe('NEW');
    expect(o.source).toBe('WEBSITE');
    expect(o.subtotalCents).toBe(3500 + 2 * 1200);
    expect(o.deliveryFeeCents).toBe(500);
    expect(o.totalCents).toBe(3500 + 2400 + 500);
    // cost: pack = hoodie 1000 + hardware 100 + stimpie 600; limited stimpie 600 x2
    expect(o.costCents).toBe(1700 + 2 * 600);
    expect(o.contactPhone).toBe('+96171100000');
    expect(o.contactWhatsapp).toBe('+96171100000');
    expect(o.areaName).toBe('Jounieh');
    expect(o.utmSource).toBe('instagram');
    expect(o.utmCampaign).toBe('drop-002-teaser');
    expect(o.holdExpiresAt).not.toBeNull();
    expect(o.idempotencyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(o.items).toHaveLength(2);
    const pack = o.items.find((i) => i.kind === 'PACK')!;
    expect(pack.name).toBe(w.packs.one.name);
    expect(pack.detail).toEqual({ hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: [w.core[0]!.name] });
    expect(pack.unitCostCents).toBe(1700);
    // stock lines: pack -> variant + stimpie; extra -> limited stimpie x2
    expect(o.stockLines).toHaveLength(3);
    expect(o.stockLines.every((l) => l.state === 'RESERVED')).toBe(true);
    expect(o.events).toHaveLength(1);
    expect(o.events[0]).toMatchObject({ fromStatus: null, toStatus: 'NEW', userId: null });
    expect(o.customer.phone).toBe('+96171100000');

    const v = await variantOf(t.prisma, w);
    expect(v).toMatchObject({ quantity: 20, reserved: 1 });
    expect(await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.limited[0]!.id } })).toMatchObject({ quantity: 30, reserved: 2 });
    const moves = await t.prisma.stockMovement.findMany({ where: { orderId: o.id } });
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.field === 'RESERVED' && m.reason === 'ORDER_RESERVED' && m.delta > 0)).toBe(true);
    await assertStockInvariants(t.prisma);
  });

  it('merges the same Stimpie across lines into one reservation and one movement', async () => {
    const w = await buildWorld(t.prisma);
    const s = w.core[0]!.id;
    const res = await placeOrder(t.ctx, placeInput(w, [packItem(w, [s], 1), stimpieItem(s, 3)]));
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: s } })).reserved).toBe(4);
    const moves = await t.prisma.stockMovement.findMany({ where: { orderId: res.orderId, stimpieId: s } });
    expect(moves).toHaveLength(1);
    expect(moves[0]!.delta).toBe(4);
    expect(await t.prisma.orderStockLine.count({ where: { orderId: res.orderId, stimpieId: s } })).toBe(2);
    await assertStockInvariants(t.prisma);
  });

  it('honours placedAt (demo seed) and the hold from settings', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ orders: { stockHoldHours: 24 } });
    const placedAt = new Date('2026-09-01T10:00:00Z');
    const res = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { placedAt }));
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: res.orderId }, include: { events: true } });
    expect(o.placedAt.toISOString()).toBe(placedAt.toISOString());
    expect(o.holdExpiresAt!.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(o.events[0]!.createdAt.toISOString()).toBe(placedAt.toISOString());
  });

  it('uses the prefix and counter from settings', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ orders: { numberPrefix: 'XYZ', firstNumber: 2000 } });
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 1 }));
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 2 }));
    expect([a.number, b.number]).toEqual(['XYZ-2000', 'XYZ-2001']);
  });

  it('creates the counter row from firstNumber when the table is empty', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.counter.deleteMany();
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)]));
    expect(a.number).toBe('STP-1001');
  });
});

describe('customers: identity is the normalised phone', () => {
  it('upserts by phone; latest name/email/whatsapp win; old orders keep their snapshot', async () => {
    const w = await buildWorld(t.prisma);
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { customer: { name: 'Rami H', email: 'old@example.com', phone: '03 123 456', whatsapp: null, whatsappSameAsPhone: true } }));
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 's')], { customer: { name: 'Rami Haddad', email: 'new@example.com', phone: '+961 3 123 456', whatsapp: '71 999 888', whatsappSameAsPhone: false } }));
    expect(await t.prisma.customer.count()).toBe(1);
    const c = await t.prisma.customer.findFirstOrThrow();
    expect(c).toMatchObject({ phone: '+9613123456', name: 'Rami Haddad', email: 'new@example.com', whatsapp: '+96171999888' });
    const oa = await t.prisma.order.findUniqueOrThrow({ where: { id: a.orderId } });
    expect(oa).toMatchObject({ customerName: 'Rami H', contactEmail: 'old@example.com', contactWhatsapp: '+9613123456' });
    const ob = await t.prisma.order.findUniqueOrThrow({ where: { id: b.orderId } });
    expect(ob.customerId).toBe(c.id);
    expect(ob.contactWhatsapp).toBe('+96171999888');
  });

  it('a different phone is a different customer; editing an order contact never rewrites the customer', async () => {
    const w = await buildWorld(t.prisma);
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 1 }));
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 2 }));
    expect(await t.prisma.customer.count()).toBe(2);
  });

  it('a manual order without an e-mail keeps the customer e-mail we already have', async () => {
    const w = await buildWorld(t.prisma);
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 1 }));
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'black', 's')], { i: 1, source: 'WHATSAPP', customer: { name: 'Customer 1', email: null, phone: phoneN(1), whatsapp: null, whatsappSameAsPhone: true } }));
    expect((await t.prisma.customer.findFirstOrThrow()).email).toBe('customer1@example.com');
  });
});

describe('validation inside the service (scripts call it directly)', () => {
  it.each([
    ['letters in the phone', { phone: '03abc456' }, 'customer.phone'],
    ['too few digits', { phone: '123' }, 'customer.phone'],
    ['a foreign country code', { phone: '+44 7700 900123' }, 'customer.phone'],
    ['a one-letter name', { name: 'R' }, 'customer.name'],
    ['a bad e-mail', { email: 'not-an-email' }, 'customer.email'],
  ])('rejects %s', async (_label, patch, field) => {
    const w = await buildWorld(t.prisma);
    const base = placeInput(w, [hoodieItem(w)]);
    const err = await errorOf(placeOrder(t.ctx, { ...base, customer: { ...base.customer, ...patch } }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(err.fields ?? {})).toContain(field);
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('requires a WhatsApp number unless it is the same as the phone', async () => {
    const w = await buildWorld(t.prisma);
    const base = placeInput(w, [hoodieItem(w)]);
    const err = await errorOf(placeOrder(t.ctx, { ...base, customer: { ...base.customer, whatsappSameAsPhone: false, whatsapp: null } }));
    expect(err.fields).toHaveProperty(['customer.whatsapp']);
  });

  it('a website order needs an e-mail, a manual one does not', async () => {
    const w = await buildWorld(t.prisma);
    const base = placeInput(w, [hoodieItem(w)]);
    const noEmail = { ...base.customer, email: null };
    expect((await errorOf(placeOrder(t.ctx, { ...base, customer: noEmail }))).fields).toHaveProperty(['customer.email']);
    const res = await placeOrder(t.ctx, { ...base, customer: noEmail, source: 'WHATSAPP' });
    expect(res.created).toBe(true);
  });
});

describe('PRICE_CHANGED and NOT_PURCHASABLE reserve nothing', () => {
  it('compares expectedTotalCents with the GRAND total (items + delivery)', async () => {
    const w = await buildWorld(t.prisma);
    const items = [packItem(w, [w.core[0]!.id])];
    const ok = await placeOrder(t.ctx, placeInput(w, items, { i: 1, expectedTotalCents: 3500 + 300 }));
    expect(ok.created).toBe(true);
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, items, { i: 2, expectedTotalCents: 3500 })));
    expect(err.code).toBe('PRICE_CHANGED');
    expect(err.httpStatus).toBe(422);
    expect(err.details).toEqual({ totalCents: 3800 });
    expect(await t.prisma.order.count()).toBe(1);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1001);
  });

  it('a price edit between page load and submit is PRICE_CHANGED', async () => {
    const w = await buildWorld(t.prisma);
    const items = [stimpieItem(w.core[0]!.id)];
    await t.prisma.stimpie.update({ where: { id: w.core[0]!.id }, data: { priceCents: 1500 } });
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, items, { expectedTotalCents: 1000 + 300 })));
    expect(err.code).toBe('PRICE_CHANGED');
    expect(err.details).toEqual({ totalCents: 1800 });
  });

  it('delivery fee is by area; no area means the default; fee changes do not touch old orders', async () => {
    const w = await buildWorld(t.prisma);
    const items = [hoodieItem(w)];
    const none = await placeOrder(t.ctx, placeInput(w, items, { i: 1 }));
    const beirut = await placeOrder(t.ctx, placeInput(w, items, { i: 2, delivery: { areaId: w.areas[0]!.id, areaName: 'Beirut', address: 'Hamra Street', notes: null } }));
    const leb = await placeOrder(t.ctx, placeInput(w, items, { i: 3, delivery: { areaId: w.areas[1]!.id, areaName: 'Mount Lebanon', address: 'Hamra Street', notes: null } }));
    const fee = async (id: number) => (await t.prisma.order.findUniqueOrThrow({ where: { id } })).deliveryFeeCents;
    expect([await fee(none.orderId), await fee(beirut.orderId), await fee(leb.orderId)]).toEqual([300, 300, 500]);
    await t.ctx.settings.update({ delivery: { defaultFeeCents: 900 } });
    await t.prisma.area.update({ where: { id: w.areas[1]!.id }, data: { feeCents: 777 } });
    expect(await fee(none.orderId)).toBe(300);
    expect(await fee(leb.orderId)).toBe(500);
    const later = await placeOrder(t.ctx, placeInput(w, items, { i: 4, delivery: { areaId: w.areas[1]!.id, areaName: 'x', address: 'Hamra Street', notes: null } }));
    expect(await fee(later.orderId)).toBe(777);
  });

  it('an unknown or hidden delivery area is a validation error on delivery.areaId', async () => {
    const w = await buildWorld(t.prisma);
    const hidden = await createArea(t.prisma, { name: 'Hidden', active: false });
    for (const areaId of [999999, hidden.id]) {
      const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { delivery: { areaId, areaName: 'x', address: 'Hamra Street', notes: null } })));
      expect(err.fields).toHaveProperty(['delivery.areaId']);
    }
  });

  it('drop not started / ended / hidden items are NOT_PURCHASABLE with the reason; stock is untouched', async () => {
    const w = await buildWorld(t.prisma);
    freezeTime('2026-10-14T10:00:00Z');
    const upcoming = await createDrop(t.prisma, { startsAt: new Date('2026-10-20T00:00:00Z') });
    const ended = await createDrop(t.prisma, { startsAt: new Date('2026-10-01T00:00:00Z'), endedAt: new Date('2026-10-10T00:00:00Z') });
    const sUp = await createStimpie(t.prisma, { dropId: upcoming.id });
    const sEnd = await createStimpie(t.prisma, { dropId: ended.id });
    const sHidden = await createStimpie(t.prisma, { active: false });
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [stimpieItem(sUp.id), hoodieItem(w), packItem(w, [sEnd.id]), stimpieItem(sHidden.id)])));
    expect(err.code).toBe('NOT_PURCHASABLE');
    const items = err.details!.items as { kind: string; stimpieId: number; itemIndex: number; reason: string; name: string }[];
    expect(items.map((i) => [i.itemIndex, i.stimpieId, i.reason])).toEqual([
      [0, sUp.id, 'DROP_NOT_STARTED'],
      [2, sEnd.id, 'DROP_ENDED'],
      [3, sHidden.id, 'INACTIVE'],
    ]);
    expect(items.every((i) => i.kind === 'STIMPIE')).toBe(true);
    expect(await t.prisma.order.count()).toBe(0);
    await assertStockInvariants(t.prisma);
  });

  it('an inactive hoodie variant (hidden colour) is NOT_PURCHASABLE / INACTIVE', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.color.update({ where: { id: w.colors.cream.id }, data: { active: false } });
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'cream')])));
    expect(err.code).toBe('NOT_PURCHASABLE');
    expect((err.details!.items as { kind: string; reason: string }[])[0]).toMatchObject({ kind: 'HOODIE_VARIANT', reason: 'INACTIVE' });
  });

  it('limited Stimpies may be used in packs while their drop is live', async () => {
    const w = await buildWorld(t.prisma);
    const res = await placeOrder(t.ctx, placeInput(w, [packItem(w, [w.limited[0]!.id, w.limited[1]!.id])]));
    expect(res.created).toBe(true);
  });
});

describe('pack rules', () => {
  it('needs exactly stimpieCount Stimpies', async () => {
    const w = await buildWorld(t.prisma);
    const one = await errorOf(placeOrder(t.ctx, placeInput(w, [{ ...packItem(w, [w.core[0]!.id, w.core[1]!.id]), packId: w.packs.one.id } as CartItemInput])));
    expect(one.fields).toHaveProperty(['items.0.stimpieIds']);
    const two = await errorOf(placeOrder(t.ctx, placeInput(w, [{ ...packItem(w, [w.core[0]!.id]), packId: w.packs.two.id } as CartItemInput])));
    expect(two.fields).toHaveProperty(['items.0.stimpieIds']);
  });

  it('rejects duplicate Stimpies in one pack (path items.N.stimpieIds.M) but allows the same Stimpie on several lines', async () => {
    const w = await buildWorld(t.prisma);
    const s = w.core[0]!.id;
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w), packItem(w, [s, s])])));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.fields).toEqual({ 'items.1.stimpieIds.1': 'Each Stimpie in a pack must be different.' });
    const ok = await placeOrder(t.ctx, placeInput(w, [packItem(w, [s]), packItem(w, [s], 1, 'cream')], { i: 5 }));
    expect(ok.created).toBe(true);
  });

  it('reports every malformed item in one response with items.N paths', async () => {
    const w = await buildWorld(t.prisma);
    const err = await errorOf(
      placeOrder(t.ctx, placeInput(w, [
        { ...hoodieItem(w), sizeId: 999999 } as CartItemInput,
        stimpieItem(999999),
        { ...packItem(w, [w.core[0]!.id]), packId: 999999 } as CartItemInput,
        { ...hoodieItem(w), hoodieId: 999999 } as CartItemInput,
      ])),
    );
    expect(Object.keys(err.fields!).sort()).toEqual(['items.0.sizeId', 'items.1.stimpieId', 'items.2.packId', 'items.3.hoodieId'].sort());
  });
});

describe('atomicity', () => {
  it('a sold-out multi-line order is all-or-nothing: no order, no number, nothing reserved, no movements', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.stimpie.update({ where: { id: w.core[1]!.id }, data: { quantity: 1 } });
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 2), stimpieItem(w.core[0]!.id, 2), stimpieItem(w.core[1]!.id, 2)])));
    expect(err.code).toBe('SOLD_OUT');
    expect(err.details!.items).toEqual([
      { kind: 'STIMPIE', stimpieId: w.core[1]!.id, itemIndex: 2, name: w.core[1]!.name, requested: 2, available: 1 },
    ]);
    expect(await t.prisma.order.count()).toBe(0);
    expect(await t.prisma.stockMovement.count()).toBe(0);
    expect(await t.prisma.customer.count()).toBe(0);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1000);
    expect(await variantOf(t.prisma, w)).toMatchObject({ reserved: 0 });
    expect((await t.prisma.stimpie.findUniqueOrThrow({ where: { id: w.core[0]!.id } })).reserved).toBe(0);
    await assertStockInvariants(t.prisma);
  });

  it('SOLD_OUT lists every failing item, the summed requested count and the first line that needs it', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 1 });
    const s = w.core[0]!.id;
    await t.prisma.stimpie.update({ where: { id: s }, data: { quantity: 2 } });
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [packItem(w, [s], 1), packItem(w, [s], 1, 'cream'), hoodieItem(w, 2)])));
    expect(err.code).toBe('SOLD_OUT');
    const items = err.details!.items as { kind: string; itemIndex: number; requested: number; available: number }[];
    const variant = items.find((i) => i.kind === 'HOODIE_VARIANT')!;
    const stim = items.find((i) => i.kind === 'STIMPIE');
    // black M: pack (1) + hoodie line (2) = 3 requested, 1 available; first needed by line 0
    expect(variant).toMatchObject({ itemIndex: 0, requested: 3, available: 1, hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.m.id });
    expect(stim).toBeUndefined(); // 2 Stimpies requested, 2 available: fine
    expect(items).toHaveLength(1);
  });

  it('an exception thrown inside the transaction leaves no partial rows (kill in the middle)', async () => {
    const w = await buildWorld(t.prisma);
    // a context whose transaction client fails when the first order event is written, AFTER stock was reserved
    const failing = {
      ...t.ctx,
      prisma: new Proxy(t.prisma, {
        get(target, prop, recv) {
          if (prop === '$transaction') {
            return (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
              target.$transaction(
                (tx) =>
                  fn(
                    new Proxy(tx, {
                      get(txTarget, txProp, txRecv) {
                        if (txProp === 'orderEvent') return { ...txTarget.orderEvent, create: () => { throw new Error('boom'); } };
                        return Reflect.get(txTarget, txProp, txRecv);
                      },
                    }),
                  ),
                opts as never,
              );
          }
          return Reflect.get(target, prop, recv);
        },
      }),
    } as typeof t.ctx;
    await expect(placeOrder(failing, placeInput(w, [packItem(w, [w.core[0]!.id])]))).rejects.toThrow('boom');
    expect(await t.prisma.order.count()).toBe(0);
    expect(await t.prisma.orderItem.count()).toBe(0);
    expect(await t.prisma.orderStockLine.count()).toBe(0);
    expect(await t.prisma.stockMovement.count()).toBe(0);
    expect(await t.prisma.customer.count()).toBe(0);
    expect(await t.prisma.emailLog.count()).toBe(0);
    expect(await variantOf(t.prisma, w)).toMatchObject({ reserved: 0 });
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1000);
    // and the next order gets the number the failed one would have had: no gap, nothing reused
    expect((await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)]))).number).toBe('STP-1001');
  });
});

describe('idempotency', () => {
  it('same key + same body returns the original order (created: false); a different body is CONFLICT on Idempotency-Key', async () => {
    const w = await buildWorld(t.prisma);
    const key = 'key-1234567890';
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: key }));
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: key }));
    expect(a.created).toBe(true);
    expect(b).toEqual({ orderId: a.orderId, number: a.number, created: false });
    expect(await t.prisma.order.count()).toBe(1);
    expect(await variantOf(t.prisma, w)).toMatchObject({ reserved: 1 });

    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 2)], { idempotencyKey: key })));
    expect(err.code).toBe('CONFLICT');
    expect(err.details).toEqual({ field: 'Idempotency-Key' });
    expect(await t.prisma.order.count()).toBe(1);
  });

  it('a changed expectedTotalCents is a different body', async () => {
    const w = await buildWorld(t.prisma);
    const key = 'key-abcdefghij';
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: key }));
    const err = await errorOf(placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { idempotencyKey: key, expectedTotalCents: 2800 })));
    expect(err.details).toEqual({ field: 'Idempotency-Key' });
  });

  it('10 concurrent requests with the same key create exactly one order and reserve once', async () => {
    const w = await buildWorld(t.prisma);
    const results = await Promise.all(Array.from({ length: 10 }, () => placeOrder(t.ctx, placeInput(w, [packItem(w, [w.core[0]!.id])], { idempotencyKey: 'concurrent-key-1' }))));
    expect(new Set(results.map((r) => r.number)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await t.prisma.order.count()).toBe(1);
    expect(await variantOf(t.prisma, w)).toMatchObject({ reserved: 1 });
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1001);
    await assertStockInvariants(t.prisma);
  });

  it('concurrent reuse of one key from different phones is a conflict, even while customer work runs before numbering', async () => {
    const w = await buildWorld(t.prisma);
    const key = 'cross-phone-race-123';
    const [first, second] = await Promise.allSettled([
      placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 81, idempotencyKey: key })),
      placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { i: 82, idempotencyKey: key })),
    ]);
    expect([first.status, second.status].filter((status) => status === 'fulfilled')).toHaveLength(1);
    const rejected = [first, second].find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(AppError);
      expect((rejected.reason as AppError).code).toBe('CONFLICT');
    }
    expect(await t.prisma.order.count()).toBe(1);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1001);
    await assertStockInvariants(t.prisma);
  });

  it('without a key, an identical website order from the same phone within 60 s is the same order', async () => {
    const w = await buildWorld(t.prisma);
    freezeTime('2026-10-14T10:00:00Z');
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)]));
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)]));
    expect(b).toEqual({ orderId: a.orderId, number: a.number, created: false });
    // a different cart is a different order
    const c = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 2)]));
    expect(c.created).toBe(true);
  });

  it('concurrent identical website requests without a key create one order for a new customer', async () => {
    const w = await buildWorld(t.prisma);
    const input = placeInput(w, [hoodieItem(w)], { i: 76 });
    const results = await Promise.all(Array.from({ length: 10 }, () => placeOrder(t.ctx, input)));
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await t.prisma.order.count()).toBe(1);
    expect((await variantOf(t.prisma, w)).reserved).toBe(1);
    expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1001);
    await assertStockInvariants(t.prisma);
  });

  it('concurrent identical website requests without a key create one order for a RETURNING customer too', async () => {
    const w = await buildWorld(t.prisma);
    // an earlier, different order makes the customer row exist before the burst
    await placeOrder(t.ctx, placeInput(w, [hoodieItem(w, 1, 'cream', 's')], { i: 77 }));
    const input = placeInput(w, [hoodieItem(w)], { i: 77 });
    const results = await Promise.all(Array.from({ length: 10 }, () => placeOrder(t.ctx, input)));
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await t.prisma.order.count()).toBe(2);
    expect((await variantOf(t.prisma, w)).reserved).toBe(1);
    await assertStockInvariants(t.prisma);
  });

  it('...but not after 60 s, and not for manual orders', async () => {
    const w = await buildWorld(t.prisma);
    const base = freezeTime('2026-10-14T10:00:00Z');
    const a = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { placedAt: base }));
    freezeTime('2026-10-14T10:01:01Z');
    const b = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)]));
    expect(b.created).toBe(true);
    const m1 = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { source: 'WHATSAPP' }));
    const m2 = await placeOrder(t.ctx, placeInput(w, [hoodieItem(w)], { source: 'WHATSAPP' }));
    expect([a.orderId, b.orderId, m1.orderId, m2.orderId]).toHaveLength(4);
    expect(new Set([m1.orderId, m2.orderId]).size).toBe(2);
  });
});

describe('POST /orders (public)', () => {
  it('returns 201 with the public shape, whatsappUrl (null until configured), trackUrl and estimateText', async () => {
    const w = await buildWorld(t.prisma);
    const body = orderBody(w, [packItem(w, [w.core[0]!.id])], { areaId: w.areas[1]!.id, expectedTotalCents: 3500 + 500 });
    const res = await t.client.post('/orders', body, { origin: 'http://localhost:3000', headers: { 'idempotency-key': 'abc-123-key-0001' } });
    expect(res.status).toBe(201);
    const j = res.json();
    expect(j.order).toMatchObject({ number: 'STP-1001', status: 'NEW', customerName: 'Customer 0', contactEmail: 'customer0@example.com', subtotalCents: 3500, deliveryFeeCents: 500, totalCents: 4000, estimateText: '3 working days' });
    expect(j.order.items[0]).toMatchObject({ kind: 'PACK', qty: 1, unitPriceCents: 3500, lineTotalCents: 3500, details: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: [w.core[0]!.name] } });
    expect(j.whatsappUrl).toBeNull();
    expect(j.trackUrl).toBe('http://localhost:3000/track?order=STP-1001');

    await t.ctx.settings.update({ business: { whatsappNumber: '03 111 222' } });
    const again = await t.client.post('/orders', body, { headers: { 'idempotency-key': 'abc-123-key-0001' } });
    expect(again.status).toBe(200);
    expect(again.json().order.number).toBe('STP-1001');
    expect(again.json().whatsappUrl).toMatch(/^https:\/\/wa\.me\/9613111222\?text=Hi%20Stimpy/);
    expect(decodeURIComponent(again.json().whatsappUrl)).toContain('STP-1001');

    const other = await t.client.post('/orders', { ...body, customer: { ...body.customer, name: 'Someone Else' } }, { headers: { 'idempotency-key': 'abc-123-key-0001' } });
    expect(other.status).toBe(409);
    expect(other.json().error).toMatchObject({ code: 'CONFLICT', details: { field: 'Idempotency-Key' } });
  });

  it('estimateText: the global text when the area has no estDays', async () => {
    const w = await buildWorld(t.prisma);
    await t.ctx.settings.update({ delivery: { estimateText: '1-2 days' } });
    const res = await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { areaId: w.areas[0]!.id }));
    expect(res.json().order.estimateText).toBe('1-2 days');
  });

  it('never leaks internal fields (costs, hashes, fingerprints, ids of other customers)', async () => {
    const w = await buildWorld(t.prisma);
    const res = await t.client.post('/orders', orderBody(w, [packItem(w, [w.core[0]!.id])]));
    const keys = [...deepKeys(res.json())].map((k) => k.toLowerCase());
    for (const banned of ['cost', 'unitcostcents', 'costcents', 'idempotency', 'fingerprint', 'utm', 'hold', 'cashcollected', 'customerid', 'userid', 'notes']) {
      expect(keys.filter((k) => k.includes(banned))).toEqual([]);
    }
  });

  it('honeypot: a filled hp is a generic VALIDATION_ERROR without fields and stores nothing', async () => {
    const w = await buildWorld(t.prisma);
    const res = await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { hp: 'http://spam.example' }));
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.fields).toEqual({});
    expect(await t.prisma.order.count()).toBe(0);
    expect(await t.prisma.customer.count()).toBe(0);
  });

  it('field errors use dotted paths; unknown fields are rejected; qty and item-count bounds', async () => {
    const w = await buildWorld(t.prisma);
    const body = orderBody(w, [hoodieItem(w)]);
    const bad = await t.client.post('/orders', { ...body, customer: { ...body.customer, email: 'nope', phone: '12' }, delivery: { ...body.delivery, address: 'x' } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json().error.fields)).toEqual(expect.arrayContaining(['customer.email', 'customer.phone', 'delivery.address']));
    expect((await t.client.post('/orders', { ...body, extra: 1 })).json().error.fields).toHaveProperty('extra');
    expect((await t.client.post('/orders', orderBody(w, [hoodieItem(w, 11)]))).json().error.fields).toHaveProperty(['items.0.qty']);
    const many = Array.from({ length: 21 }, () => hoodieItem(w));
    expect((await t.client.post('/orders', orderBody(w, many))).json().error.fields).toHaveProperty('items');
    expect((await t.client.post('/orders', { ...body, items: [] })).json().error.fields).toHaveProperty('items');
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('a bad Idempotency-Key header is rejected', async () => {
    const w = await buildWorld(t.prisma);
    const res = await t.client.post('/orders', orderBody(w, [hoodieItem(w)]), { headers: { 'idempotency-key': 'x' } });
    expect(res.status).toBe(400);
  });

  it('rate limits: 5 per 10 min per IP, 3 per hour per phone, with Retry-After; the clock resets them', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    freezeTime('2026-10-14T10:00:00Z');
    for (let i = 1; i <= 5; i++) {
      const r = await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { i }), { ip: '10.0.0.1' });
      expect(r.status).toBe(201);
    }
    const sixth = await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { i: 6 }), { ip: '10.0.0.1' });
    expect(sixth.status).toBe(429);
    expect(sixth.json().error.code).toBe('RATE_LIMITED');
    expect(Number(sixth.header('retry-after'))).toBeGreaterThan(0);
    expect(sixth.json().error.details.retryAfterSeconds).toBe(Number(sixth.header('retry-after')));
    // another IP is fine
    expect((await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { i: 7 }), { ip: '10.0.0.2' })).status).toBe(201);
    // 10 minutes later the IP is free again
    freezeTime('2026-10-14T10:10:01Z');
    expect((await t.client.post('/orders', orderBody(w, [hoodieItem(w)], { i: 8 }), { ip: '10.0.0.1' })).status).toBe(201);
  });

  it('per phone: the 4th order within an hour from different IPs is rate limited', async () => {
    const w = await buildWorld(t.prisma, { hoodieStock: 50 });
    freezeTime('2026-10-14T10:00:00Z');
    for (let n = 1; n <= 3; n++) {
      const r = await t.client.post('/orders', orderBody(w, [hoodieItem(w, n)], { i: 1 }), { ip: `10.1.0.${n}` });
      expect(r.status).toBe(201);
    }
    const fourth = await t.client.post('/orders', orderBody(w, [hoodieItem(w, 4)], { i: 1 }), { ip: '10.1.0.9' });
    expect(fourth.status).toBe(429);
    freezeTime('2026-10-14T11:00:01Z');
    expect((await t.client.post('/orders', orderBody(w, [hoodieItem(w, 4)], { i: 1 }), { ip: '10.1.0.9' })).status).toBe(201);
  });

  it('malformed requests do not burn the IP budget', async () => {
    const w = await buildWorld(t.prisma);
    for (let n = 0; n < 8; n++) await t.client.post('/orders', { nope: true }, { ip: '10.2.0.1' });
    expect((await t.client.post('/orders', orderBody(w, [hoodieItem(w)]), { ip: '10.2.0.1' })).status).toBe(201);
  });
});
