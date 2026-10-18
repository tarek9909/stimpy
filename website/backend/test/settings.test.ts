import { describe, expect, it } from 'vitest';
import { SETTINGS_DEFAULTS } from '../src/services/settings';
import { useTestApp } from './helpers/app';
import { seedOrderCounter } from './helpers/fixtures';

const t = useTestApp();
type Err = { error: { code: string; fields?: Record<string, string> } };

describe('settings service (typed groups, defaults, cache)', () => {
  it('returns documented defaults on an empty database', async () => {
    const s = await t.ctx.settings.getAll();
    expect(s.business).toEqual({ name: 'Stimpy', whatsappNumber: null, supportEmail: 'info@stimpylb.com', instagramUrl: null, timezone: 'Asia/Beirut' });
    expect(s.orders).toEqual({ numberPrefix: 'STP', firstNumber: 1001, stockHoldHours: 12, autoExpireUnconfirmed: false, lowStockThreshold: 10, hardwareCostCents: 100 });
    expect(s.email).toMatchObject({ enabled: true, senderName: 'Stimpy', senderAddress: 'info@stimpylb.com', replyTo: 'info@stimpylb.com' });
    expect(s.notifications).toEqual({ founderEmail: null, onNewOrder: true, onLowStock: true });
    expect(s.delivery).toEqual({ defaultFeeCents: 500, estimateText: '4–5 business days' });
    expect(s.setup).toEqual({ reviewed: [] });
    expect(SETTINGS_DEFAULTS.orders.lowStockThreshold).toBe(10);
  });

  it('fills defaults for fields missing from a stored (older) row', async () => {
    await t.prisma.setting.create({ data: { key: 'orders', value: { numberPrefix: 'ZZ' } } });
    const o = await t.ctx.settings.get('orders');
    expect(o.numberPrefix).toBe('ZZ');
    expect(o.stockHoldHours).toBe(12);
  });

  it('caches reads briefly and a write in this process clears the cache', async () => {
    await t.ctx.settings.get('business');
    await t.prisma.setting.upsert({ where: { key: 'business' }, create: { key: 'business', value: { name: 'Direct DB write' } }, update: { value: { name: 'Direct DB write' } } });
    expect((await t.ctx.settings.get('business')).name).toBe('Stimpy'); // still cached
    await t.ctx.settings.update({ business: { instagramUrl: 'https://instagram.com/stimpy' } });
    expect((await t.ctx.settings.get('business')).name).toBe('Direct DB write'); // cache was cleared by the write
  });
});

describe('GET /admin/settings', () => {
  it('requires a session', async () => {
    expect((await t.client.get('/admin/settings')).status).toBe(401);
  });

  it('returns exactly the four documented groups', async () => {
    const { client } = await t.adminClient();
    const res = await client.get('/admin/settings');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('no-store');
    const body = res.json<Record<string, Record<string, unknown>>>();
    expect(Object.keys(body)).toEqual(['business', 'orders', 'email', 'notifications']);
    expect(Object.keys(body.business!)).toEqual(['name', 'whatsappNumber', 'supportEmail', 'instagramUrl', 'timezone']);
    expect(Object.keys(body.orders!).sort()).toEqual(['autoExpireUnconfirmed', 'firstNumber', 'hardwareCostCents', 'lowStockThreshold', 'numberPrefix', 'stockHoldHours']);
    expect(Object.keys(body.email!).sort()).toEqual(['campaignRecipientCap', 'enabled', 'footerText', 'replyTo', 'senderAddress', 'senderName', 'smtpHost', 'smtpPassword', 'smtpPort', 'smtpSecure', 'smtpUser']);
    expect(Object.keys(body.notifications!).sort()).toEqual(['founderEmail', 'onLowStock', 'onNewOrder']);
  });
});

describe('PATCH /admin/settings', () => {
  it('updates a partial group and leaves the rest alone; the change is persisted', async () => {
    const { client } = await t.adminClient();
    const res = await client.patch('/admin/settings', { orders: { stockHoldHours: 24, lowStockThreshold: 5 }, business: { whatsappNumber: '03 123 456', name: 'Stimpy Lebanon' } });
    expect(res.status).toBe(200);
    const body = res.json<{ orders: Record<string, unknown>; business: Record<string, unknown> }>();
    expect(body.orders).toMatchObject({ stockHoldHours: 24, lowStockThreshold: 5, numberPrefix: 'STP', firstNumber: 1001 });
    expect(body.business).toMatchObject({ whatsappNumber: '+9613123456', name: 'Stimpy Lebanon', timezone: 'Asia/Beirut' }); // normalised
    expect((await client.get('/admin/settings')).json<{ orders: { stockHoldHours: number } }>().orders.stockHoldHours).toBe(24);
    expect((await t.prisma.setting.findUniqueOrThrow({ where: { key: 'orders' } })).value).toMatchObject({ stockHoldHours: 24 });
  });

  it('can set and clear nullable fields', async () => {
    const { client } = await t.adminClient();
    await client.patch('/admin/settings', { notifications: { founderEmail: 'founder@example.com' } });
    expect((await client.get('/admin/settings')).json<{ notifications: { founderEmail: string } }>().notifications.founderEmail).toBe('founder@example.com');
    await client.patch('/admin/settings', { notifications: { founderEmail: null } });
    expect((await client.get('/admin/settings')).json<{ notifications: { founderEmail: unknown } }>().notifications.founderEmail).toBeNull();
  });

  it('validates every field with dotted group.field paths', async () => {
    const { client } = await t.adminClient();
    const res = await client.patch('/admin/settings', {
      business: { timezone: 'Mars/Olympus', supportEmail: 'nope', whatsappNumber: '123', instagramUrl: 'not a url' },
      orders: { numberPrefix: 'st p', stockHoldHours: 0, lowStockThreshold: -1, hardwareCostCents: 1.5 },
      email: { senderAddress: 'x', enabled: 'yes' },
    });
    expect(res.status).toBe(400);
    const f = res.json<Err>().error.fields!;
    expect(Object.keys(f)).toEqual(expect.arrayContaining([
      'business.timezone', 'business.supportEmail', 'business.whatsappNumber', 'business.instagramUrl',
      'orders.numberPrefix', 'orders.stockHoldHours', 'orders.lowStockThreshold', 'orders.hardwareCostCents',
      'email.senderAddress', 'email.enabled',
    ]));
    expect(f['business.timezone']).toMatch(/IANA/);
  });

  it('rejects unknown groups and unknown fields', async () => {
    const { client } = await t.adminClient();
    const res = await client.patch('/admin/settings', { delivery: { defaultFeeCents: 1 }, orders: { color: 'red' } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toMatchObject({ delivery: 'Unknown field.', 'orders.color': 'Unknown field.' });
  });

  it('an empty patch is a no-op that returns the current settings', async () => {
    const { client } = await t.adminClient();
    expect((await client.patch('/admin/settings', {})).status).toBe(200);
  });

  it('requires a session and a valid Origin', async () => {
    expect((await t.client.patch('/admin/settings', {})).status).toBe(401);
    const { client } = await t.adminClient();
    expect((await client.patch('/admin/settings', {}, { origin: 'http://evil.example' })).status).toBe(403);
  });

  describe('orders.firstNumber', () => {
    it('raising it jumps the order counter forward', async () => {
      const { client } = await t.adminClient();
      await seedOrderCounter(t.prisma, 1000);
      const res = await client.patch('/admin/settings', { orders: { firstNumber: 5000 } });
      expect(res.status).toBe(200);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(4999);
    });

    it('cannot go below numbers already issued, and the counter never moves back', async () => {
      const { client } = await t.adminClient();
      await t.ctx.settings.update({ orders: { firstNumber: 1001 } });
      await seedOrderCounter(t.prisma, 1050); // 50 orders placed
      const low = await client.patch('/admin/settings', { orders: { firstNumber: 1040 } });
      expect(low.status).toBe(400);
      expect(low.json<Err>().error.fields!['orders.firstNumber']).toMatch(/1050/);
      const equal = await client.patch('/admin/settings', { orders: { firstNumber: 1050 } });
      expect(equal.status).toBe(400);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1050);
      // re-sending the unchanged value (the dashboard sends the whole group) is fine
      expect((await client.patch('/admin/settings', { orders: { firstNumber: 1001, stockHoldHours: 6 } })).status).toBe(200);
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1050);
    });

    it('changing the prefix does not touch the counter', async () => {
      const { client } = await t.adminClient();
      await seedOrderCounter(t.prisma, 1050);
      await client.patch('/admin/settings', { orders: { numberPrefix: 'ST2' } });
      expect((await t.prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value).toBe(1050);
    });
  });
});
