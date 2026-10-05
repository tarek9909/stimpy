import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();

describe('customers: filters and bulk messaging', () => {
  async function seed() {
    const ann = await makeCustomer(t.prisma, { name: 'Ann Lee', phone: '+96171000001', email: 'ann@example.com' });
    const bob = await makeCustomer(t.prisma, { name: 'Bob Roy', phone: '+96171000002', email: null });
    const cy = await makeCustomer(t.prisma, { name: 'Cy Dunn', phone: '+96171000003', email: 'cy@example.com' });
    await t.prisma.customer.update({ where: { id: ann.id }, data: { emailConsent: true, whatsappConsent: true } });
    await t.prisma.customer.update({ where: { id: cy.id }, data: { emailConsent: true, whatsappConsent: true } });
    await makeOrder(t.prisma, { phone: ann.phone, status: 'DELIVERED' });
    await makeOrder(t.prisma, { phone: ann.phone, status: 'DELIVERED' });
    await makeOrder(t.prisma, { phone: bob.phone, status: 'DELIVERED' });
    return { ann, bob, cy };
  }

  it('filters the list by order count, email and opt-out', async () => {
    const { ann, bob, cy } = await seed();
    const { client } = await t.adminClient();
    const names = async (qs: string) => (await client.get(`/admin/customers?${qs}`)).json<{ items: { name: string }[] }>().items.map((c) => c.name).sort();
    expect(await names('ordersMin=2')).toEqual(['Ann Lee']);
    expect(await names('ordersMax=0')).toEqual(['Cy Dunn']);
    expect(await names('hasEmail=no')).toEqual(['Bob Roy']);
    expect(await names('hasEmail=yes&ordersMin=1')).toEqual(['Ann Lee']);
    await client.patch(`/admin/customers/${cy.id}`, { marketingOptOut: true });
    expect(await names('optedOut=yes')).toEqual(['Cy Dunn']);
    expect(ann.id).not.toBe(bob.id);
  });

  it('preview and email skip people without an address or who opted out, and queue one email each', async () => {
    const { cy } = await seed();
    const { client } = await t.adminClient();
    await client.patch(`/admin/customers/${cy.id}`, { marketingOptOut: true });
    const target = { filters: {} };

    const preview = (await client.post('/admin/customers/bulk/preview', { target, channel: 'EMAIL' })).json();
    expect(preview).toMatchObject({ matched: 3, eligible: 1, skipped: { noContact: 1, noConsent: 0, optedOut: 1 } });

    const res = await client.post('/admin/customers/bulk/email', { target, subject: 'Hi {name}', body: 'Drop is live, {name}.' });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ queued: 1, skipped: { noContact: 1, noConsent: 0, optedOut: 1 } });
    const rows = await t.prisma.emailLog.findMany({ where: { toEmail: { in: ['ann@example.com', 'cy@example.com'] } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.toEmail).toBe('ann@example.com');
    expect(rows[0]!.subject).toBe('Hi Ann');
    expect(rows[0]!.bodyText).toContain('Drop is live, Ann.');
    expect(rows[0]!.bodyText).toContain('/unsubscribe?token=');
  });

  it('selected ids that nobody can receive are refused; unknown ids are ignored', async () => {
    const { bob } = await seed();
    const { client } = await t.adminClient();
    const res = await client.post('/admin/customers/bulk/email', { target: { ids: [bob.id, 999999] }, subject: 's', body: 'b' });
    expect(res.status).toBe(409);
  });

  it('WhatsApp returns per-customer wa.me links with the name filled in and sends nothing', async () => {
    const { ann } = await seed();
    const { client } = await t.adminClient();
    const res = await client.post('/admin/customers/bulk/whatsapp', { target: { ids: [ann.id] }, text: 'Hey {name}!' });
    expect(res.status).toBe(200);
    const body = res.json<{ items: { to: string; text: string; url: string }[] }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.text).toContain('Hey Ann!');
    expect(body.items[0]!.url.startsWith('https://wa.me/96171000001?text=')).toBe(true);
    expect(await t.prisma.emailLog.count()).toBe(0);
  });

  it('enforces channel-specific consent and uses the configurable campaign cap', async () => {
    const first = await makeCustomer(t.prisma, { phone: '+96171000011', email: 'first@example.com' });
    const second = await makeCustomer(t.prisma, { phone: '+96171000012', email: 'second@example.com' });
    await t.prisma.customer.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { emailConsent: true } });
    await t.ctx.settings.update({ email: { campaignRecipientCap: 1 } });
    const { client } = await t.adminClient();
    const preview = await client.post('/admin/customers/bulk/preview', { target: { filters: {} }, channel: 'EMAIL' });
    expect(preview.json()).toMatchObject({ eligible: 2, cap: 1, overCap: 1, skipped: { noContact: 0, noConsent: 0, optedOut: 0 } });
    const whatsapp = await client.post('/admin/customers/bulk/preview', { target: { ids: [first.id] }, channel: 'WHATSAPP' });
    expect(whatsapp.json()).toMatchObject({ eligible: 0, skipped: { noContact: 0, noConsent: 1, optedOut: 0 } });
  });

  it('rejects a target with both ids and filters', async () => {
    const { client } = await t.adminClient();
    const res = await client.post('/admin/customers/bulk/preview', { target: { ids: [1], filters: {} }, channel: 'EMAIL' });
    expect(res.status).toBe(400);
  });
});
