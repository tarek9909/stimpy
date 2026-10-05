import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();

describe('CRM Phase 1: Customer Profile & Timeline', () => {
  describe('GET /admin/customers/:id/profile', () => {
    it('returns empty stats and null favourites for customer with zero orders', async () => {
      await buildWorld(t.prisma);
      const cust = await makeCustomer(t.prisma, {
        name: 'Sarah Zero',
        phone: '+96171999001',
        email: 'sarah@example.com',
        notes: 'New sign-up',
      });

      const { client } = await t.adminClient();
      const res = await client.get(`/admin/customers/${cust.id}/profile`);
      expect(res.status).toBe(200);

      const profile = res.json();
      expect(profile).toMatchObject({
        id: cust.id,
        name: 'Sarah Zero',
        email: 'sarah@example.com',
        phone: '+96171999001',
        whatsapp: '+96171999001',
        notes: 'New sign-up',
        orderCount: 0,
        lifetimeValueCents: 0,
        averageOrderValueCents: 0,
        firstOrderAt: null,
        lastOrderAt: null,
        returnedCount: 0,
        warning: false,
        favouriteStimpie: null,
        favouriteStimpieType: null,
        favouriteColor: null,
        favouriteColorHex: null,
        recentOrders: [],
      });
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
    });

    it('computes SQL aggregates correctly for mixed-status orders (excluding cancelled/returned from LTV)', async () => {
      const world = await buildWorld(t.prisma);
      const phone = '+96171999002';
      const cust = await makeCustomer(t.prisma, {
        name: 'Tarek Mix',
        phone,
        email: 'tarek@example.com',
      });

      // Get color and stimpie references
      const black = world.colors.black;
      const cream = world.colors.cream;
      const coral = await t.prisma.color.create({
        data: { name: 'Coral', hex: '#FF7A59', position: 3, active: true, images: [] },
      });
      const coreStimpie = world.core[0]!;
      const dropStimpie = world.limited[0]!;

      // Ensure variants exist for coral
      await t.prisma.hoodieVariant.createMany({
        data: [
          { hoodieId: world.hoodie.id, colorId: coral.id, sizeId: world.sizes.s.id, sku: 'H-CORAL-S', quantity: 20 },
          { hoodieId: world.hoodie.id, colorId: coral.id, sizeId: world.sizes.m.id, sku: 'H-CORAL-M', quantity: 20 },
        ],
      });

      // Find variants
      const blackVariant = await t.prisma.hoodieVariant.findFirstOrThrow({ where: { colorId: black.id } });
      const coralVariant = await t.prisma.hoodieVariant.findFirstOrThrow({ where: { colorId: coral.id } });
      const creamVariant = await t.prisma.hoodieVariant.findFirstOrThrow({ where: { colorId: cream.id } });

      // Order 1: DELIVERED, $40 (subtotal 3500 + delivery 500)
      // Items: 1 Hoodie Black + 1 Core Stimpie
      const o1 = await makeOrder(t.prisma, {
        phone,
        number: 'STP-101',
        status: 'DELIVERED',
        placedAt: '2026-10-01T10:00:00Z',
        deliveredAt: '2026-10-02T10:00:00Z',
        deliveryFeeCents: 500,
        items: [{ kind: 'PACK', name: 'Pack Black', unitPriceCents: 3500, unitCostCents: 1500, qty: 1 }],
      });
      const item1 = await t.prisma.orderItem.findFirstOrThrow({ where: { orderId: o1.id } });
      await t.prisma.orderStockLine.createMany({
        data: [
          { orderId: o1.id, orderItemId: item1.id, itemType: 'HOODIE_VARIANT', variantId: blackVariant.id, qty: 1, state: 'SOLD' },
          { orderId: o1.id, orderItemId: item1.id, itemType: 'STIMPIE', stimpieId: coreStimpie.id, qty: 1, state: 'SOLD' },
        ],
      });

      // Order 2: CONFIRMED, $50 (subtotal 4500 + delivery 500)
      // Items: 1 Hoodie Black + 1 Limited Stimpie
      const o2 = await makeOrder(t.prisma, {
        phone,
        number: 'STP-102',
        status: 'CONFIRMED',
        placedAt: '2026-10-05T10:00:00Z',
        confirmedAt: '2026-10-05T12:00:00Z',
        deliveryFeeCents: 500,
        items: [{ kind: 'PACK', name: 'Pack Black 2', unitPriceCents: 4500, unitCostCents: 1500, qty: 1 }],
      });
      const item2 = await t.prisma.orderItem.findFirstOrThrow({ where: { orderId: o2.id } });
      await t.prisma.orderStockLine.createMany({
        data: [
          { orderId: o2.id, orderItemId: item2.id, itemType: 'HOODIE_VARIANT', variantId: blackVariant.id, qty: 1, state: 'RESERVED' },
          { orderId: o2.id, orderItemId: item2.id, itemType: 'STIMPIE', stimpieId: dropStimpie.id, qty: 1, state: 'RESERVED' },
        ],
      });

      // Order 3: RETURNED, $30 (subtotal 2500 + delivery 500)
      // Items: 1 Hoodie Coral + 1 Core Stimpie
      const o3 = await makeOrder(t.prisma, {
        phone,
        number: 'STP-103',
        status: 'RETURNED',
        placedAt: '2026-10-10T10:00:00Z',
        returnedAt: '2026-10-12T10:00:00Z',
        deliveryFeeCents: 500,
        items: [{ kind: 'PACK', name: 'Pack Coral', unitPriceCents: 2500, unitCostCents: 1500, qty: 1 }],
      });
      const item3 = await t.prisma.orderItem.findFirstOrThrow({ where: { orderId: o3.id } });
      await t.prisma.orderStockLine.createMany({
        data: [
          { orderId: o3.id, orderItemId: item3.id, itemType: 'HOODIE_VARIANT', variantId: coralVariant.id, qty: 1, state: 'RESTOCKED' },
          { orderId: o3.id, orderItemId: item3.id, itemType: 'STIMPIE', stimpieId: coreStimpie.id, qty: 1, state: 'RESTOCKED' },
        ],
      });

      // Order 4: CANCELLED, $60 (subtotal 5500 + delivery 500)
      // Items: 1 Hoodie Cream
      const o4 = await makeOrder(t.prisma, {
        phone,
        number: 'STP-104',
        status: 'CANCELLED',
        placedAt: '2026-10-15T10:00:00Z',
        cancelledAt: '2026-10-15T11:00:00Z',
        deliveryFeeCents: 500,
        items: [{ kind: 'HOODIE', name: 'Hoodie Cream', unitPriceCents: 5500, unitCostCents: 2000, qty: 1 }],
      });
      const item4 = await t.prisma.orderItem.findFirstOrThrow({ where: { orderId: o4.id } });
      await t.prisma.orderStockLine.createMany({
        data: [
          { orderId: o4.id, orderItemId: item4.id, itemType: 'HOODIE_VARIANT', variantId: creamVariant.id, qty: 1, state: 'RELEASED' },
        ],
      });

      const { client } = await t.adminClient();
      const res = await client.get(`/admin/customers/${cust.id}/profile`);
      expect(res.status).toBe(200);

      const p = res.json();

      // Non-cancelled orders: o1 (DELIVERED), o2 (CONFIRMED), o3 (RETURNED) -> count 3
      expect(p.orderCount).toBe(3);

      // LTV excludes CANCELLED and RETURNED:
      // o1 (4000) + o2 (5000) = 9000 cents ($90.00)
      expect(p.lifetimeValueCents).toBe(9000);

      // Average Order Value = 9000 / 2 = 4500 cents ($45.00)
      expect(p.averageOrderValueCents).toBe(4500);

      // First and last non-cancelled order dates
      expect(p.firstOrderAt).toBe('2026-10-01T10:00:00.000Z');
      expect(p.lastOrderAt).toBe('2026-10-10T10:00:00.000Z');

      // Returns count
      expect(p.returnedCount).toBe(1);
      expect(p.warning).toBe(false);

      // Favourites (excluding cancelled order o4):
      // Colours: Black (2 units in o1 and o2) vs Coral (1 unit in o3). Black wins!
      expect(p.favouriteColor).toBe(black.name);
      expect(p.favouriteColorHex).toBe(black.hex);

      // Stimpies: coreStimpie (2 units in o1 and o3) vs dropStimpie (1 unit in o2). Core wins!
      expect(p.favouriteStimpie).toBe(coreStimpie.name);
      expect(p.favouriteStimpieType).toBe('CORE');

      // Recent orders: all 4 orders, newest placedAt first (STP-104, STP-103, STP-102, STP-101)
      expect(p.recentOrders).toHaveLength(4);
      expect(p.recentOrders.map((o: { number: string }) => o.number)).toEqual(['STP-104', 'STP-103', 'STP-102', 'STP-101']);
    });

    it('returns 404 for unknown customer id and 400 for invalid id', async () => {
      await buildWorld(t.prisma);
      const { client } = await t.adminClient();
      const notFound = await client.get('/admin/customers/99999999/profile');
      expect(notFound.status).toBe(404);
      expect(notFound.json().error.code).toBe('NOT_FOUND');

      const badParam = await client.get('/admin/customers/abc/profile');
      expect(badParam.status).toBe(400);
    });
  });

  describe('GET /admin/customers/:id/timeline', () => {
    it('returns empty items and null cursor for customer with no activity', async () => {
      await buildWorld(t.prisma);
      const cust = await makeCustomer(t.prisma, { name: 'Empty Cust', phone: '+96171999003' });

      const { client } = await t.adminClient();
      const res = await client.get(`/admin/customers/${cust.id}/timeline`);
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ items: [], nextCursor: null });
    });

    it('merges orders, events, notes and email logs in strict newest-first order with cursor pagination', async () => {
      await buildWorld(t.prisma);
      const phone = '+96171999004';
      const cust = await makeCustomer(t.prisma, {
        name: 'Timeline Cust',
        phone,
        email: 'timeline@example.com',
      });

      const admin = await t.prisma.adminUser.findFirstOrThrow();

      // 1. Order placed at T1
      const order = await makeOrder(t.prisma, {
        phone,
        number: 'STP-201',
        status: 'DELIVERED',
        placedAt: '2026-10-01T10:00:00Z',
      });

      // 2. Order event at T2
      await t.prisma.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: 'NEW',
          toStatus: 'CONFIRMED',
          createdAt: new Date('2026-10-01T11:00:00Z'),
          note: 'Confirmed via WhatsApp',
        },
      });

      // 3. Order note at T3
      await t.prisma.orderNote.create({
        data: {
          orderId: order.id,
          userId: admin.id,
          body: 'Special gift wrapping requested',
          createdAt: new Date('2026-10-01T12:00:00Z'),
        },
      });

      // 4. Email log at T4
      await t.prisma.emailLog.create({
        data: {
          orderId: order.id,
          toEmail: 'timeline@example.com',
          templateKey: 'order_out_for_delivery',
          subject: 'Your Stimpy order is on its way!',
          bodyText: 'Tracking details...',
          bodyHtml: '<p>Tracking details...</p>',
          status: 'SENT',
          sentAt: new Date('2026-10-02T08:00:00Z'),
          createdAt: new Date('2026-10-02T08:00:00Z'),
        },
      });

      // 5. Order event at T5
      await t.prisma.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: 'OUT_FOR_DELIVERY',
          toStatus: 'DELIVERED',
          createdAt: new Date('2026-10-02T15:00:00Z'),
          note: 'Delivered and cash collected',
        },
      });

      const { client } = await t.adminClient();

      // Full timeline request
      const res = await client.get(`/admin/customers/${cust.id}/timeline`);
      expect(res.status).toBe(200);
      const data = res.json();
      expect(data.items).toHaveLength(5);
      expect(data.nextCursor).toBeNull();

      // Verify ordering: newest first (T5 -> T4 -> T3 -> T2 -> T1)
      const types = data.items.map((i: { type: string }) => i.type);
      expect(types).toEqual(['ORDER_EVENT', 'EMAIL', 'ORDER_NOTE', 'ORDER_EVENT', 'ORDER']);

      // Verify each item shape: type, at, title, detail, refId
      for (const item of data.items) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('at');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('detail');
        expect(item).toHaveProperty('refId');
      }

      // Check specific details
      expect(data.items[0]).toMatchObject({
        type: 'ORDER_EVENT',
        title: 'Order STP-201: DELIVERED',
        detail: 'Delivered and cash collected',
        at: '2026-10-02T15:00:00.000Z',
      });
      expect(data.items[1]).toMatchObject({
        type: 'EMAIL',
        title: 'Email: Your Stimpy order is on its way!',
        detail: 'Template: order_out_for_delivery · To: timeline@example.com · Status: SENT',
        at: '2026-10-02T08:00:00.000Z',
      });
      expect(data.items[2]).toMatchObject({
        type: 'ORDER_NOTE',
        title: expect.stringContaining('Note on order STP-201'),
        detail: 'Special gift wrapping requested',
        at: '2026-10-01T12:00:00.000Z',
      });
      expect(data.items[4]).toMatchObject({
        type: 'ORDER',
        title: 'Order STP-201 placed',
        at: '2026-10-01T10:00:00.000Z',
      });

      // Cursor pagination test: page size 2
      const page1Res = await client.get(`/admin/customers/${cust.id}/timeline`, { query: { limit: 2 } });
      const page1 = page1Res.json();
      expect(page1.items).toHaveLength(2);
      expect(page1.items.map((i: { type: string }) => i.type)).toEqual(['ORDER_EVENT', 'EMAIL']);
      expect(page1.nextCursor).toBe(page1.items[1].id);

      // Page 2
      const page2Res = await client.get(`/admin/customers/${cust.id}/timeline`, { query: { limit: 2, cursor: page1.nextCursor } });
      const page2 = page2Res.json();
      expect(page2.items).toHaveLength(2);
      expect(page2.items.map((i: { type: string }) => i.type)).toEqual(['ORDER_NOTE', 'ORDER_EVENT']);
      expect(page2.nextCursor).toBe(page2.items[1].id);

      // Page 3 (final)
      const page3Res = await client.get(`/admin/customers/${cust.id}/timeline`, { query: { limit: 2, cursor: page2.nextCursor } });
      const page3 = page3Res.json();
      expect(page3.items).toHaveLength(1);
      expect(page3.items[0].type).toBe('ORDER');
      expect(page3.nextCursor).toBeNull();
    });

    it('returns 404 for unknown customer id in timeline', async () => {
      await buildWorld(t.prisma);
      const { client } = await t.adminClient();
      const res = await client.get('/admin/customers/99999999/timeline');
      expect(res.status).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });
});
