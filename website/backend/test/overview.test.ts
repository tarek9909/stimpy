import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createDrop, createStimpie, setVariantStock } from './helpers/fixtures';
import { freezeTime } from './helpers/clock';
import { makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();
const HOUR = 3_600_000;
// 2026-10-14T21:30:00Z is 2026-10-15 00:30 in Beirut (UTC+3): "today" is 15 Oct there
const NOW = '2026-10-14T21:30:00Z';
const ago = (ms: number): Date => new Date(new Date(NOW).getTime() - ms);

type Attention = { type: string; label: string; orderId: number | null; itemType: string | null; itemId: number | null };

describe('GET /admin/overview: today, 7 days, recent orders', () => {
  it('counts current NEW / CONFIRMED / OUT_FOR_DELIVERY orders, outstanding cash and today\'s delivered revenue in Beirut time', async () => {
    freezeTime(NOW);
    await buildWorld(t.prisma);
    const p = t.prisma;
    await makeOrder(p, { number: 'STP-1', status: 'NEW', placedAt: ago(10 * 60_000) });
    await makeOrder(p, { number: 'STP-2', status: 'NEW', placedAt: ago(20 * 60_000) });
    await makeOrder(p, { number: 'STP-3', status: 'CONFIRMED', placedAt: ago(HOUR) });
    await makeOrder(p, { number: 'STP-4', status: 'PACKED', placedAt: ago(HOUR) });
    await makeOrder(p, { number: 'STP-5', status: 'OUT_FOR_DELIVERY', placedAt: ago(5 * HOUR), outForDeliveryAt: ago(HOUR), deliveryNumber: 'D-1' });
    // delivered: 00:00:00 today (in), 23:59:59 yesterday (out of "today" but in the week); subtotal 3500 / 2500 + delivery 300
    await makeOrder(p, { number: 'STP-6', status: 'DELIVERED', placedAt: ago(30 * HOUR), deliveredAt: '2026-10-14T21:00:00Z' });
    await makeOrder(p, { number: 'STP-7', status: 'DELIVERED', placedAt: ago(30 * HOUR), deliveredAt: '2026-10-14T20:59:59Z', items: [{ kind: 'HOODIE', name: 'Stimpy Hoodie', unitPriceCents: 2500, unitCostCents: 1100 }], cashSettled: true });
    const { client } = await t.adminClient();
    const res = await client.get('/admin/overview');
    expect(res.status).toBe(200);
    const o = res.json();
    expect(o.today).toEqual({ newOrders: 2, toPack: 1, outForDelivery: 1, cashToCollectCents: 3800, revenueCents: 3500 });
    expect(o.sales7d).toHaveLength(7);
    expect(o.sales7d.map((d: { date: string }) => d.date)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
    expect(o.sales7d[5]).toEqual({ date: '2026-10-14', orders: 1, revenueCents: 2500 });
    expect(o.sales7d[6]).toEqual({ date: '2026-10-15', orders: 1, revenueCents: 3500 });
    expect(o.sales7d.slice(0, 5).every((d: { orders: number; revenueCents: number }) => d.orders === 0 && d.revenueCents === 0)).toBe(true);
  });

  it('recentOrders: the last 10 by placement time, newest first, as AdminOrderSummary', async () => {
    freezeTime(NOW);
    await buildWorld(t.prisma);
    for (let i = 1; i <= 12; i++) await makeOrder(t.prisma, { number: `STP-${i}`, status: 'NEW', placedAt: ago((13 - i) * 60_000) });
    const { client } = await t.adminClient();
    const o = (await client.get('/admin/overview')).json();
    expect(o.recentOrders.map((r: { number: string }) => r.number)).toEqual(['STP-12', 'STP-11', 'STP-10', 'STP-9', 'STP-8', 'STP-7', 'STP-6', 'STP-5', 'STP-4', 'STP-3']);
    expect(o.recentOrders[0]).toMatchObject({ number: 'STP-12', status: 'NEW', totalCents: 3800, itemsSummary: 'Hoodie + 1 Stimpie', holdExpired: false });
    expect(JSON.stringify(o)).not.toMatch(/costCents|unitCostCents|requestFingerprint/);
  });

  it('a fresh shop has zeros, an empty week and no live drop', async () => {
    freezeTime(NOW);
    const { client } = await t.adminClient();
    const o = (await client.get('/admin/overview')).json();
    expect(o.today).toEqual({ newOrders: 0, toPack: 0, outForDelivery: 0, cashToCollectCents: 0, revenueCents: 0 });
    expect(o.attention).toEqual([]);
    expect(o.liveDrop).toBeNull();
    expect(o.recentOrders).toEqual([]);
    expect(o.sales7d).toHaveLength(7);
  });
});

describe('GET /admin/overview: attention', () => {
  it('flags NEW orders waiting more than 2 hours, expired holds (not twice), and orders out for more than 48 hours', async () => {
    freezeTime(NOW);
    await buildWorld(t.prisma);
    const p = t.prisma;
    const fresh = await makeOrder(p, { number: 'STP-1', status: 'NEW', placedAt: ago(119 * 60_000), holdExpiresAt: new Date(new Date(NOW).getTime() + 10 * HOUR) });
    const waiting = await makeOrder(p, { number: 'STP-2', status: 'NEW', placedAt: ago(3 * HOUR), holdExpiresAt: new Date(new Date(NOW).getTime() + 9 * HOUR) });
    const expired = await makeOrder(p, { number: 'STP-3', status: 'NEW', placedAt: ago(13 * HOUR), holdExpiresAt: ago(HOUR) });
    const outOld = await makeOrder(p, { number: 'STP-4', status: 'OUT_FOR_DELIVERY', placedAt: ago(80 * HOUR), outForDeliveryAt: ago(50 * HOUR), deliveryNumber: 'D-1' });
    const outFresh = await makeOrder(p, { number: 'STP-5', status: 'OUT_FOR_DELIVERY', placedAt: ago(80 * HOUR), outForDeliveryAt: ago(47 * HOUR), deliveryNumber: 'D-2' });
    await makeOrder(p, { number: 'STP-6', status: 'CONFIRMED', placedAt: ago(100 * HOUR) }); // confirmed orders never alert here
    const { client } = await t.adminClient();
    const att: Attention[] = (await client.get('/admin/overview')).json().attention;
    expect(att.map((a) => [a.type, a.orderId])).toEqual([
      ['HOLD_EXPIRED', expired.id],
      ['NEW_TOO_LONG', waiting.id],
      ['OUT_TOO_LONG', outOld.id],
    ]);
    expect(att.map((a) => a.orderId)).not.toContain(fresh.id);
    expect(att.map((a) => a.orderId)).not.toContain(outFresh.id);
    expect(att[0]!.label).toContain('STP-3');
    expect(att[1]!.label).toContain('STP-2');
    expect(att[1]!.label).toContain('3 hours');
    expect(att[2]!.label).toContain('STP-4');
    expect(att.every((a) => a.itemType === null && a.itemId === null)).toBe(true);
  });

  it('flags failed e-mails (with the order when there is one)', async () => {
    freezeTime(NOW);
    await buildWorld(t.prisma);
    const o = await makeOrder(t.prisma, { number: 'STP-1', status: 'CONFIRMED', email: 'a@example.com' });
    await t.prisma.emailLog.create({ data: { orderId: o.id, toEmail: 'a@example.com', templateKey: 'order_confirmed', subject: 's', bodyText: 'b', bodyHtml: 'h', status: 'FAILED', attempts: 4, error: 'x' } });
    await t.prisma.emailLog.create({ data: { orderId: null, toEmail: 'b@example.com', templateKey: 'orders_lookup', subject: 's', bodyText: 'b', bodyHtml: 'h', status: 'FAILED', attempts: 4, error: 'x' } });
    await t.prisma.emailLog.create({ data: { orderId: o.id, toEmail: 'a@example.com', templateKey: 'order_received', subject: 's', bodyText: 'b', bodyHtml: 'h', status: 'SENT', attempts: 1 } });
    const { client } = await t.adminClient();
    const att: Attention[] = (await client.get('/admin/overview')).json().attention;
    expect(att.filter((a) => a.type === 'EMAIL_FAILED').map((a) => a.orderId).sort()).toEqual([null, o.id].sort());
    expect(att).toHaveLength(2);
  });

  it('LOW_STOCK carries itemType and itemId and covers hoodie variants and Stimpies at or below the threshold', async () => {
    freezeTime(NOW);
    const w = await buildWorld(t.prisma);
    const p = t.prisma;
    await t.ctx.settings.update({ orders: { lowStockThreshold: 5 } });
    // variant Black / M: 5 on hand, 1 reserved -> 4 available (low). Cream / L: 6 available (fine)
    await setVariantStock(p, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.m.id }, 5, 1);
    await setVariantStock(p, { hoodieId: w.hoodie.id, colorId: w.colors.cream.id, sizeId: w.sizes.l.id }, 6, 0);
    const variant = await p.hoodieVariant.findFirstOrThrow({ where: { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.m.id } });
    await p.stimpie.update({ where: { id: w.core[0]!.id }, data: { quantity: 5, reserved: 0 } }); // exactly at the threshold: low
    await p.stimpie.update({ where: { id: w.core[1]!.id }, data: { quantity: 3, reserved: 3 } }); // reserved out: sold out
    await p.stimpie.update({ where: { id: w.core[2]!.id }, data: { quantity: 6, reserved: 0 } }); // fine
    const { client } = await t.adminClient();
    const att: Attention[] = (await client.get('/admin/overview')).json().attention.filter((a: Attention) => a.type === 'LOW_STOCK');
    // lowest availability first; everything else in the seeded world has 20+ units
    expect(att).toEqual([
      { type: 'LOW_STOCK', label: 'AFTER DARK: sold out', orderId: null, itemType: 'STIMPIE', itemId: w.core[1]!.id },
      { type: 'LOW_STOCK', label: 'Stimpy Hoodie, Black, M: 4 left', orderId: null, itemType: 'HOODIE_VARIANT', itemId: variant.id },
      { type: 'LOW_STOCK', label: 'THE VOID: 5 left', orderId: null, itemType: 'STIMPIE', itemId: w.core[0]!.id },
    ]);
  });

  it('ignores never-stocked zero variants, inactive items and Stimpies of ended drops', async () => {
    freezeTime(NOW);
    const w = await buildWorld(t.prisma, { hoodieStock: 20 });
    const p = t.prisma;
    await p.hoodieVariant.updateMany({ where: { hoodieId: w.hoodie.id, colorId: w.colors.cream.id }, data: { quantity: 0, reserved: 0 } }); // zero and never had stock
    await p.stimpie.updateMany({ data: { quantity: 20 } });
    const inactive = await createStimpie(p, { name: 'HIDDEN', quantity: 1, active: false });
    const ended = await createDrop(p, { name: 'Old Drop', slug: 'old-drop', startsAt: ago(100 * HOUR), endedAt: ago(10 * HOUR) });
    await createStimpie(p, { name: 'OLD ONE', dropId: ended.id, quantity: 0 });
    void inactive;
    const { client } = await t.adminClient();
    const att: Attention[] = (await client.get('/admin/overview')).json().attention;
    expect(att).toEqual([]);
    // once a variant has had stock (a positive quantity movement) and is now at zero, it is an alert
    const variant = await p.hoodieVariant.findFirstOrThrow({ where: { hoodieId: w.hoodie.id, colorId: w.colors.cream.id, sizeId: w.sizes.s.id } });
    await p.stockMovement.create({ data: { itemType: 'HOODIE_VARIANT', variantId: variant.id, field: 'QUANTITY', delta: 10, reason: 'INITIAL' } });
    const att2: Attention[] = (await client.get('/admin/overview')).json().attention;
    expect(att2).toEqual([{ type: 'LOW_STOCK', label: 'Stimpy Hoodie, Cream, S: sold out', orderId: null, itemType: 'HOODIE_VARIANT', itemId: variant.id }]);
  });
});

describe('GET /admin/overview: live drop', () => {
  it('reports units total, committed (sold + reserved) units and the end time of the most recently started LIVE drop', async () => {
    freezeTime(NOW);
    const w = await buildWorld(t.prisma);
    const p = t.prisma;
    const [signal, stat] = w.limited; // 30 on hand each
    // 4 delivered units of SIGNAL (stock lines SOLD; quantity already reduced), 2 reserved of STATIC
    await p.stimpie.update({ where: { id: signal!.id }, data: { quantity: 26 } });
    await p.stimpie.update({ where: { id: stat!.id }, data: { quantity: 30, reserved: 2 } });
    await makeOrder(p, { number: 'STP-1', status: 'DELIVERED', deliveredAt: ago(HOUR), items: [{ kind: 'STIMPIE', name: 'THE SIGNAL', qty: 4, unitPriceCents: 1200, unitCostCents: 600, stimpieIds: [signal!.id] }] });
    await makeOrder(p, { number: 'STP-2', status: 'NEW', items: [{ kind: 'STIMPIE', name: 'THE STATIC', qty: 2, unitPriceCents: 1200, unitCostCents: 600, stimpieIds: [stat!.id] }] });
    await p.drop.update({ where: { id: w.drop.id }, data: { endsAt: new Date('2026-10-20T10:00:00Z') } });
    const { client } = await t.adminClient();
    const o = (await client.get('/admin/overview')).json();
    // on hand 26 + 30 = 56, plus 4 sold = 60 total; sold 4 + reserved 2 = 6
    expect(o.liveDrop).toEqual({ id: w.drop.id, name: 'Drop 001', unitsTotal: 60, unitsSold: 6, endsAt: '2026-10-20T10:00:00.000Z' });
  });

  it('is null for upcoming, ended and sold-out drops', async () => {
    freezeTime(NOW);
    await buildWorld(t.prisma);
    await t.prisma.drop.updateMany({ data: { startsAt: new Date('2026-10-30T00:00:00Z') } }); // upcoming
    const { client } = await t.adminClient();
    expect((await client.get('/admin/overview')).json().liveDrop).toBeNull();
    await t.prisma.drop.updateMany({ data: { startsAt: ago(10 * HOUR), endedAt: ago(HOUR) } }); // ended
    expect((await client.get('/admin/overview')).json().liveDrop).toBeNull();
    await t.prisma.drop.updateMany({ data: { endedAt: null } });
    await t.prisma.stimpie.updateMany({ where: { dropId: { not: null } }, data: { quantity: 0 } }); // sold out
    expect((await client.get('/admin/overview')).json().liveDrop).toBeNull();
  });
});

describe('setup checklist', () => {
  type Item = { key: string; status: string; kind: string; required: boolean; link: string; label: string; hint: string };
  const setupOf = async (client: Awaited<ReturnType<typeof t.adminClient>>['client']) => (await client.get('/admin/overview')).json().setup as { complete: boolean; items: Item[] };
  const status = (s: { items: Item[] }, key: string) => s.items.find((i) => i.key === key)!.status;

  it('lists the 14 documented items with kinds, requirements and links; a fresh seed is incomplete', async () => {
    const { client } = await t.adminClient();
    const s = await setupOf(client);
    expect(s.complete).toBe(false);
    expect(s.items.map((i) => [i.key, i.kind, i.required, i.link])).toEqual([
      ['business_whatsapp', 'AUTO', true, '/settings?tab=business'],
      ['contact_emails', 'AUTO', true, '/settings?tab=business'],
      ['founder_alerts', 'AUTO', false, '/settings?tab=notifications'],
      ['colors', 'REVIEW', true, '/products?tab=options'],
      ['sizes', 'REVIEW', true, '/products?tab=options'],
      ['size_chart', 'REVIEW', true, '/products?tab=size-chart'],
      ['hoodie_price', 'REVIEW', true, '/products?tab=hoodies'],
      ['packs_prices', 'REVIEW', true, '/products?tab=packs'],
      ['delivery_fee', 'REVIEW', true, '/deliveries?tab=fees'],
      ['policies', 'REVIEW', true, '/content?tab=policies'],
      ['email_texts', 'REVIEW', false, '/content?tab=emails'],
      ['first_stock', 'AUTO', true, '/stock'],
      ['builder_2d', 'AUTO', false, '/content?tab=builder'],
      ['builder_3d', 'AUTO', false, '/content?tab=builder'],
    ]);
    expect(s.items.every((i) => i.status === 'TODO')).toBe(true);
    expect(s.items.every((i) => i.label.length > 3 && i.hint.length > 3)).toBe(true);
  });

  it('AUTO items flip from the data: whatsapp, contact emails (all three must be real), founder alerts, first stock', async () => {
    const { client } = await t.adminClient();
    await t.ctx.settings.update({ business: { whatsappNumber: '03 123 456' } });
    expect(status(await setupOf(client), 'business_whatsapp')).toBe('DONE');

    // seeded defaults are @stimpy.local
    await t.ctx.settings.update({ business: { supportEmail: 'hello@stimpy.shop' }, email: { senderAddress: 'orders@stimpy.shop' } });
    expect(status(await setupOf(client), 'contact_emails')).toBe('TODO'); // reply-to is still the placeholder
    await t.ctx.settings.update({ email: { replyTo: 'owner@stimpy.shop' } });
    expect(status(await setupOf(client), 'contact_emails')).toBe('DONE');
    await t.ctx.settings.update({ business: { supportEmail: 'x@STIMPY.LOCAL' } });
    expect(status(await setupOf(client), 'contact_emails')).toBe('TODO');

    expect(status(await setupOf(client), 'founder_alerts')).toBe('TODO');
    await t.ctx.settings.update({ notifications: { founderEmail: 'me@example.com' } });
    expect(status(await setupOf(client), 'founder_alerts')).toBe('DONE');

    // first_stock needs a hoodie variant AND a Stimpie with available > 0
    const w = await buildWorld(t.prisma, { hoodieStock: 0 });
    expect(status(await setupOf(client), 'first_stock')).toBe('TODO');
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.m.id }, 3, 3);
    expect(status(await setupOf(client), 'first_stock')).toBe('TODO'); // fully reserved is not available
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.m.id }, 3, 2);
    expect(status(await setupOf(client), 'first_stock')).toBe('DONE');
    await t.prisma.stimpie.updateMany({ data: { quantity: 0 } });
    expect(status(await setupOf(client), 'first_stock')).toBe('TODO');
  });

  it('builder_2d needs an active colour with a 2D image and a placement; builder_3d needs a model and a named mesh', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const set = (key: string, value: unknown) => t.prisma.builderConfig.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
    expect(status(await setupOf(client), 'builder_2d')).toBe('TODO');
    await set('colors', [{ colorId: w.colors.black.id, hoodieImage2d: 'http://x/y.webp', overlay2d: null, placement2d: null }]);
    expect(status(await setupOf(client), 'builder_2d')).toBe('TODO'); // no placement
    await set('colors', [{ colorId: w.colors.black.id, hoodieImage2d: null, overlay2d: null, placement2d: { x: 0.5, y: 0.5, width: 0.3, rotation: 0 } }]);
    expect(status(await setupOf(client), 'builder_2d')).toBe('TODO'); // no image
    await set('colors', [{ colorId: w.colors.black.id, hoodieImage2d: 'http://x/y.webp', overlay2d: null, placement2d: { x: 0.5, y: 0.5, width: 0.3, rotation: 0 } }]);
    expect(status(await setupOf(client), 'builder_2d')).toBe('DONE');
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { active: false } });
    expect(status(await setupOf(client), 'builder_2d')).toBe('TODO'); // the colour is hidden

    await set('model3d', null);
    expect(status(await setupOf(client), 'builder_3d')).toBe('TODO');
    await set('model3d', { url: 'http://x/m.glb', sizeBytes: 5, backPanelMesh: '', panelAspect: 0.64 });
    expect(status(await setupOf(client), 'builder_3d')).toBe('TODO');
    await set('model3d', { url: 'http://x/m.glb', sizeBytes: 5, backPanelMesh: 'back_panel', panelAspect: 0.64 });
    expect(status(await setupOf(client), 'builder_3d')).toBe('DONE');
  });

  it('REVIEW items are marked and un-marked through POST /admin/setup/:key/done and persist in settings.setup.reviewed', async () => {
    const { client } = await t.adminClient();
    expect((await client.post('/admin/setup/colors/done', { done: true })).status).toBe(204);
    expect((await client.post('/admin/setup/sizes/done', { done: true })).status).toBe(204);
    expect((await client.post('/admin/setup/colors/done', { done: true })).status).toBe(204); // idempotent
    expect(status(await setupOf(client), 'colors')).toBe('DONE');
    expect((await t.ctx.settings.get('setup')).reviewed.sort()).toEqual(['colors', 'sizes']);
    t.ctx.settings.clearCache();
    expect((await client.post('/admin/setup/colors/done', { done: false })).status).toBe(204);
    const s = await setupOf(client);
    expect(status(s, 'colors')).toBe('TODO');
    expect(status(s, 'sizes')).toBe('DONE');
  });

  it('marking an AUTO item is a VALIDATION_ERROR, an unknown key is 404, the body is strict', async () => {
    const { client } = await t.adminClient();
    const auto = await client.post('/admin/setup/business_whatsapp/done', { done: true });
    expect(auto.status).toBe(400);
    expect(auto.json().error.code).toBe('VALIDATION_ERROR');
    expect((await client.post('/admin/setup/nope/done', { done: true })).status).toBe(404);
    expect((await client.post('/admin/setup/colors/done', {})).status).toBe(400);
    expect((await client.post('/admin/setup/colors/done', { done: 'yes' })).status).toBe(400);
    expect((await client.post('/admin/setup/colors/done', { done: true, extra: 1 })).status).toBe(400);
  });

  it('complete is true only when every required item is DONE (optional items do not matter)', async () => {
    const w = await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    await t.ctx.settings.update({
      business: { whatsappNumber: '03 123 456', supportEmail: 'hello@stimpy.shop' },
      email: { senderAddress: 'orders@stimpy.shop', replyTo: 'owner@stimpy.shop' },
    });
    const required = ['colors', 'sizes', 'size_chart', 'hoodie_price', 'packs_prices', 'delivery_fee', 'policies'];
    for (const key of required.slice(0, -1)) await client.post(`/admin/setup/${key}/done`, { done: true });
    expect((await setupOf(client)).complete).toBe(false);
    await client.post('/admin/setup/policies/done', { done: true });
    const s = await setupOf(client);
    expect(s.items.filter((i) => i.required).every((i) => i.status === 'DONE')).toBe(true);
    expect(s.items.find((i) => i.key === 'founder_alerts')!.status).toBe('TODO');
    expect(s.complete).toBe(true);
    void w;
  });
});

describe('GET /admin/search', () => {
  async function seed() {
    await buildWorld(t.prisma);
    const p = t.prisma;
    await makeOrder(p, { number: 'STP-1042', customerName: 'Rami Haddad', phone: '+96171123456', email: 'rami@example.com', deliveryNumber: 'D-88231', placedAt: '2026-10-14T10:00:00Z' });
    await makeOrder(p, { number: 'STP-1043', customerName: 'Layla Nasr', phone: '+9613555111', email: 'layla@example.com', placedAt: '2026-10-14T11:00:00Z' });
    await makeOrder(p, { number: 'STP-2042', customerName: 'Zed', phone: '+96176000222', placedAt: '2026-10-14T12:00:00Z' });
  }

  it('finds orders by number, bare digits, delivery number, phone, e-mail and name, plus matching customers', async () => {
    await seed();
    const { client } = await t.adminClient();
    const search = async (q: string) => (await client.get('/admin/search', { query: { q } })).json() as { orders: { number: string }[]; customers: { name: string; phone: string; email: string | null; id: number }[] };
    expect((await search('STP-1042')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('stp-1042')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('1042')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('d-88231')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('71 123 456')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('+96171123456')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    expect((await search('03 555 111')).orders.map((o) => o.number)).toEqual(['STP-1043']);
    expect((await search('layla@')).orders.map((o) => o.number)).toEqual(['STP-1043']);
    expect((await search('haddad')).orders.map((o) => o.number)).toEqual(['STP-1042']);
    const r = await search('Rami');
    expect(r.customers).toEqual([{ id: expect.any(Number), name: 'Rami Haddad', phone: '+96171123456', email: 'rami@example.com' }]);
    expect(Object.keys(r.orders[0]!)).toContain('itemsSummary');
    expect(await search('zzzz-nothing')).toEqual({ orders: [], customers: [] });
    expect(await search('%')).toEqual({ orders: [], customers: [] });
  });

  it('returns at most 5 orders (newest first) and 5 customers', async () => {
    await buildWorld(t.prisma);
    for (let i = 0; i < 8; i++) await makeOrder(t.prisma, { number: `STP-${3000 + i}`, customerName: `Searchable ${i}`, placedAt: new Date(Date.UTC(2026, 9, 1, i)) });
    const { client } = await t.adminClient();
    const r = (await client.get('/admin/search', { query: { q: 'Searchable' } })).json();
    expect(r.orders).toHaveLength(5);
    expect(r.orders.map((o: { number: string }) => o.number)).toEqual(['STP-3007', 'STP-3006', 'STP-3005', 'STP-3004', 'STP-3003']);
    expect(r.customers).toHaveLength(5);
  });

  it('an empty or missing q returns empty lists', async () => {
    await seed();
    const { client } = await t.adminClient();
    expect((await client.get('/admin/search', { query: { q: '   ' } })).json()).toEqual({ orders: [], customers: [] });
    expect((await client.get('/admin/search')).json()).toEqual({ orders: [], customers: [] });
    expect((await client.get('/admin/search', { query: { q: 'x'.repeat(121) } })).status).toBe(400);
  });
});

describe('GET /admin/users', () => {
  it('returns the single owner without secrets', async () => {
    const { client, admin } = await t.adminClient();
    const res = await client.get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual([{ id: admin.user.id, email: admin.email, name: 'Test Owner', role: 'OWNER' }]);
    expect(res.body).not.toMatch(/hash|password/i);
  });
});
