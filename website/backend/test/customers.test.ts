import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();

/** Walks a JSON value and returns every key (used for leak checks). */
const allKeys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), allKeys(x, out));
  return out;
};

async function seed() {
  await buildWorld(t.prisma);
  const p = t.prisma;
  // Rami: DELIVERED 3800 (3500 + 300), NEW, CANCELLED, RETURNED -> 3 non-cancelled orders, spent 3800 (delivered only), 1 returned
  const rami = { phone: '+96171123456', customerName: 'Rami Haddad', email: 'rami@example.com' };
  await makeOrder(p, { ...rami, number: 'STP-1', status: 'DELIVERED', placedAt: '2026-10-01T10:00:00Z', deliveredAt: '2026-10-03T10:00:00Z' });
  await makeOrder(p, { ...rami, number: 'STP-2', status: 'NEW', placedAt: '2026-10-10T10:00:00Z' });
  await makeOrder(p, { ...rami, number: 'STP-3', status: 'CANCELLED', placedAt: '2026-10-20T10:00:00Z', cancelledAt: '2026-10-20T11:00:00Z' });
  await makeOrder(p, { ...rami, number: 'STP-4', status: 'RETURNED', placedAt: '2026-10-05T10:00:00Z' });
  // Layla: one DELIVERED order of 7000 + 500
  await makeOrder(p, { phone: '+96103555111', customerName: 'Layla Nasr', email: 'layla@example.com', number: 'STP-5', status: 'DELIVERED', items: [{ kind: 'PACK', name: 'Hoodie + 2 Stimpies', unitPriceCents: 7000, unitCostCents: 3000 }], deliveryFeeCents: 500, placedAt: '2026-10-12T10:00:00Z', deliveredAt: '2026-10-13T10:00:00Z' });
  // Omar: only a cancelled order
  await makeOrder(p, { phone: '+96170999888', customerName: 'Omar Khoury', number: 'STP-6', status: 'CANCELLED', placedAt: '2026-10-14T10:00:00Z', cancelledAt: '2026-10-14T11:00:00Z' });
  // Nour: no orders at all
  await makeCustomer(p, { phone: '+96176000111', name: 'Nour Aziz', email: null });
}

describe('GET /admin/customers', () => {
  it('returns exactly the contract fields with counts, lifetime value and last order', async () => {
    await seed();
    const { client } = await t.adminClient();
    const res = await client.get('/admin/customers');
    expect(res.status).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ page: 1, pageSize: 25, total: 4 });
    const byName = Object.fromEntries(body.items.map((c: { name: string }) => [c.name, c]));
    expect(byName['Rami Haddad']).toEqual({
      id: expect.any(Number), name: 'Rami Haddad', email: 'rami@example.com', phone: '+96171123456', whatsapp: '+96171123456',
      ordersCount: 3, totalSpentCents: 3800, lastOrderAt: '2026-10-10T10:00:00.000Z', returnedCount: 1, warning: false, areaName: null, optedOut: false,
      emailConsent: false, whatsappConsent: false, unsubscribedAt: null, tags: [],
    });
    expect(byName['Layla Nasr']).toMatchObject({ ordersCount: 1, totalSpentCents: 7500, lastOrderAt: '2026-10-12T10:00:00.000Z' });
    expect(byName['Omar Khoury']).toMatchObject({ ordersCount: 0, totalSpentCents: 0, lastOrderAt: null });
    expect(byName['Nour Aziz']).toMatchObject({ ordersCount: 0, totalSpentCents: 0, lastOrderAt: null, email: null });
  });

  it('never leaks internal columns', async () => {
    await seed();
    const { client } = await t.adminClient();
    const keys = allKeys((await client.get('/admin/customers')).json());
    for (const bad of ['notes', 'areaId', 'createdAt', 'updatedAt', 'passwordHash', 'costCents', 'requestFingerprint']) expect(keys.has(bad), bad).toBe(false);
  });

  it('filter=repeat keeps customers with 2+ non-cancelled orders', async () => {
    await seed();
    const { client } = await t.adminClient();
    const rep = (await client.get('/admin/customers', { query: { filter: 'repeat' } })).json();
    expect(rep.items.map((c: { name: string }) => c.name)).toEqual(['Rami Haddad']);
    expect(rep.total).toBe(1);
    // a second non-cancelled order makes Layla repeat; a cancelled one never does
    await makeOrder(t.prisma, { phone: '+96103555111', number: 'STP-7', status: 'NEW' });
    await makeOrder(t.prisma, { phone: '+96170999888', number: 'STP-8', status: 'CANCELLED' });
    const rep2 = (await client.get('/admin/customers', { query: { filter: 'repeat', sort: 'name' } })).json();
    expect(rep2.items.map((c: { name: string }) => c.name)).toEqual(['Layla Nasr', 'Rami Haddad']);
    expect((await client.get('/admin/customers', { query: { filter: 'all' } })).json().total).toBe(4);
    expect((await client.get('/admin/customers', { query: { filter: 'bogus' } })).status).toBe(400);
  });

  it('searches name, phone (any format), e-mail and WhatsApp', async () => {
    await seed();
    await t.prisma.customer.update({ where: { phone: '+96170999888' }, data: { whatsapp: '+96171777000' } });
    const { client } = await t.adminClient();
    const names = async (q: string) => (await client.get('/admin/customers', { query: { q, sort: 'name' } })).json().items.map((c: { name: string }) => c.name);
    expect(await names('rami')).toEqual(['Rami Haddad']);
    expect(await names('HADDAD')).toEqual(['Rami Haddad']);
    expect(await names('layla@exam')).toEqual(['Layla Nasr']);
    expect(await names('71 123 456')).toEqual(['Rami Haddad']);
    expect(await names('+961 71 123 456')).toEqual(['Rami Haddad']);
    expect(await names('03 555 111')).toEqual(['Layla Nasr']); // normalised to +9613555111
    expect(await names('555')).toEqual(['Layla Nasr']);
    expect(await names('71777000')).toEqual(['Omar Khoury']); // WhatsApp number differs from the phone
    expect(await names('nobody')).toEqual([]);
    expect(await names('%')).toEqual([]); // LIKE wildcards are literal
    expect(await names('_')).toEqual([]);
  });

  it('sorts by name, ordersCount, totalSpentCents and lastOrderAt in both directions (no-order customers last)', async () => {
    await seed();
    const { client } = await t.adminClient();
    const names = async (sort?: string) => (await client.get('/admin/customers', { query: sort ? { sort } : {} })).json().items.map((c: { name: string }) => c.name);
    expect(await names('name')).toEqual(['Layla Nasr', 'Nour Aziz', 'Omar Khoury', 'Rami Haddad']);
    expect(await names('-name')).toEqual(['Rami Haddad', 'Omar Khoury', 'Nour Aziz', 'Layla Nasr']);
    expect((await names('-ordersCount'))[0]).toBe('Rami Haddad');
    expect((await names('ordersCount')).slice(-1)).toEqual(['Rami Haddad']);
    expect((await names('-totalSpentCents'))[0]).toBe('Layla Nasr'); // 7500 > 3800
    expect((await names('totalSpentCents')).slice(-2)).toEqual(['Rami Haddad', 'Layla Nasr']);
    // default and -lastOrderAt: newest first (Rami 10 Oct, Layla 12 Oct -> Layla first), customers without orders at the end
    expect((await names()).slice(0, 2)).toEqual(['Layla Nasr', 'Rami Haddad']);
    expect((await names('lastOrderAt')).slice(0, 2)).toEqual(['Rami Haddad', 'Layla Nasr']);
    expect(new Set((await names('lastOrderAt')).slice(2))).toEqual(new Set(['Nour Aziz', 'Omar Khoury']));
    expect(await names('unknownField')).toEqual(await names()); // unknown sort falls back to the default
  });

  it('paginates (page, pageSize, total) and caps pageSize at 100', async () => {
    await buildWorld(t.prisma);
    for (let i = 0; i < 7; i++) await makeCustomer(t.prisma, { name: `Cust ${String(i).padStart(2, '0')}` });
    const { client } = await t.adminClient();
    const p1 = (await client.get('/admin/customers', { query: { pageSize: 3, page: 1, sort: 'name' } })).json();
    const p3 = (await client.get('/admin/customers', { query: { pageSize: 3, page: 3, sort: 'name' } })).json();
    const p4 = (await client.get('/admin/customers', { query: { pageSize: 3, page: 4, sort: 'name' } })).json();
    expect(p1).toMatchObject({ page: 1, pageSize: 3, total: 7 });
    expect(p1.items.map((c: { name: string }) => c.name)).toEqual(['Cust 00', 'Cust 01', 'Cust 02']);
    expect(p3.items.map((c: { name: string }) => c.name)).toEqual(['Cust 06']);
    expect(p4.items).toEqual([]);
    expect((await client.get('/admin/customers', { query: { pageSize: 101 } })).status).toBe(400);
    expect((await client.get('/admin/customers', { query: { page: 0 } })).status).toBe(400);
  });

  it('flags a customer with 3 or more returned orders', async () => {
    await buildWorld(t.prisma);
    for (let i = 0; i < 3; i++) await makeOrder(t.prisma, { phone: '+96171000000', customerName: 'Risky', status: 'RETURNED' });
    await makeOrder(t.prisma, { phone: '+96171000001', customerName: 'Fine', status: 'RETURNED' });
    const { client } = await t.adminClient();
    const items = (await client.get('/admin/customers')).json().items;
    expect(items.find((c: { name: string }) => c.name === 'Risky')).toMatchObject({ returnedCount: 3, warning: true });
    expect(items.find((c: { name: string }) => c.name === 'Fine')).toMatchObject({ returnedCount: 1, warning: false });
  });
});

describe('GET /admin/customers/:id', () => {
  it('adds notes and the order summaries (newest first, AdminOrderSummary shape)', async () => {
    await seed();
    const rami = await t.prisma.customer.findUniqueOrThrow({ where: { phone: '+96171123456' } });
    await t.prisma.customer.update({ where: { id: rami.id }, data: { notes: 'Prefers calls after 5pm' } });
    const { client } = await t.adminClient();
    const res = await client.get(`/admin/customers/${rami.id}`);
    expect(res.status).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: rami.id, name: 'Rami Haddad', notes: 'Prefers calls after 5pm', ordersCount: 3, totalSpentCents: 3800 });
    expect(body.orders.map((o: { number: string }) => o.number)).toEqual(['STP-3', 'STP-2', 'STP-4', 'STP-1']); // includes the cancelled order
    expect(Object.keys(body.orders[0]).sort()).toEqual(
      ['areaName', 'cashCollected', 'cashSettled', 'contactPhone', 'customerName', 'deliveryNumber', 'holdExpired', 'id', 'itemsSummary', 'number', 'placedAt', 'source', 'status', 'totalCents'].sort(),
    );
    const keys = allKeys(body);
    for (const bad of ['costCents', 'unitCostCents', 'requestFingerprint', 'idempotencyKey', 'idempotencyHash', 'utmSource']) expect(keys.has(bad), bad).toBe(false);
  });

  it('a customer without notes has notes null; unknown id is 404', async () => {
    await seed();
    const nour = await t.prisma.customer.findUniqueOrThrow({ where: { phone: '+96176000111' } });
    const { client } = await t.adminClient();
    expect((await client.get(`/admin/customers/${nour.id}`)).json()).toMatchObject({ notes: null, orders: [], ordersCount: 0 });
    const missing = await client.get('/admin/customers/99999999');
    expect(missing.status).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
    expect((await client.get('/admin/customers/abc')).status).toBe(400);
  });
});

describe('PATCH /admin/customers/:id', () => {
  it('edits name, email, whatsapp (normalised) and notes, returns the detail, and never rewrites past orders', async () => {
    await seed();
    const rami = await t.prisma.customer.findUniqueOrThrow({ where: { phone: '+96171123456' } });
    const { client } = await t.adminClient();
    const res = await client.patch(`/admin/customers/${rami.id}`, { name: 'Rami H.', email: ' new@example.com ', whatsapp: '03 987 654', notes: 'VIP' });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Rami H.', email: 'new@example.com', whatsapp: '+9613987654', phone: '+96171123456', notes: 'VIP' });
    const order = await t.prisma.order.findUniqueOrThrow({ where: { number: 'STP-1' } });
    expect(order).toMatchObject({ customerName: 'Rami Haddad', contactEmail: 'rami@example.com', contactWhatsapp: '+96171123456' });
  });

  it('empty email and empty notes become null; a partial patch leaves other fields alone', async () => {
    await seed();
    const rami = await t.prisma.customer.findUniqueOrThrow({ where: { phone: '+96171123456' } });
    const { client } = await t.adminClient();
    await client.patch(`/admin/customers/${rami.id}`, { notes: 'x' });
    const res = await client.patch(`/admin/customers/${rami.id}`, { email: '', notes: '   ' });
    expect(res.json()).toMatchObject({ email: null, notes: null, name: 'Rami Haddad' });
    expect((await client.patch(`/admin/customers/${rami.id}`, { email: null })).json().email).toBeNull();
    expect((await client.patch(`/admin/customers/${rami.id}`, {})).status).toBe(200);
  });

  it('validates fields and rejects unknown ones (phone is the identity and cannot change)', async () => {
    await seed();
    const rami = await t.prisma.customer.findUniqueOrThrow({ where: { phone: '+96171123456' } });
    const { client } = await t.adminClient();
    const fieldsOf = async (body: object) => {
      const r = await client.patch(`/admin/customers/${rami.id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      return r.json().error.fields as Record<string, string>;
    };
    expect(await fieldsOf({ name: 'A' })).toHaveProperty('name');
    expect(await fieldsOf({ name: 'x'.repeat(81) })).toHaveProperty('name');
    expect(await fieldsOf({ email: 'not-an-email' })).toHaveProperty('email');
    expect(await fieldsOf({ email: `${'a'.repeat(190)}@example.com` })).toHaveProperty('email');
    expect(await fieldsOf({ whatsapp: '12345' })).toHaveProperty('whatsapp');
    expect(await fieldsOf({ notes: 'x'.repeat(2001) })).toHaveProperty('notes');
    expect(await fieldsOf({ phone: '+96171000000' })).toBeTruthy();
    expect(await fieldsOf({ ordersCount: 5 })).toBeTruthy();
    expect((await client.patch('/admin/customers/99999999', { name: 'Zed Zed' })).status).toBe(404);
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: rami.id } })).phone).toBe('+96171123456');
  });
});
