import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';

/** Regression tests for CRM defects found in the 2026-10 audit. */
describe('CRM audit regressions', () => {
  const t = useTestApp();

  it('merges a duplicate whose unsubscribe token the survivor inherits (unique token is released first)', async () => {
    const { client } = await t.adminClient();
    const survivor = await makeCustomer(t.prisma, { phone: '+96171113001', name: 'Survivor No Token' });
    const duplicate = await makeCustomer(t.prisma, { phone: '+96171113002', name: 'Duplicate With Token' });
    const token = 'a'.repeat(64);
    await t.prisma.customer.update({ where: { id: duplicate.id }, data: { unsubscribeToken: token } });

    const res = await client.post(`/admin/customers/${survivor.id}/merge`, { duplicateCustomerId: duplicate.id });
    expect(res.status, res.body).toBe(200);
    expect(await t.prisma.customer.findUnique({ where: { id: duplicate.id } })).toBeNull();
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: survivor.id } })).unsubscribeToken).toBe(token);
    // The old link from an e-mail sent to the duplicate still works for the merged profile.
    expect((await t.client.get(`/unsubscribe/${token}`)).status).toBe(200);
  });

  it('customer list lastOrderBefore / lastOrderAfter use business-timezone days (Asia/Beirut), not UTC days', async () => {
    const { client } = await t.adminClient();
    // 2026-10-13T22:30Z is 14 Oct 01:30 in Beirut (UTC+3): the last order is on the 14th.
    const order = await makeOrder(t.prisma, { phone: '+96171113010', status: 'DELIVERED', placedAt: '2026-10-13T22:30:00Z' });

    const after13 = await client.get('/admin/customers', { query: { lastOrderAfter: '2026-10-13' } });
    expect(after13.status, after13.body).toBe(200);
    expect(after13.json().items.map((r: { id: number }) => r.id)).toEqual([order.customerId]);
    const after14 = await client.get('/admin/customers', { query: { lastOrderAfter: '2026-10-14' } });
    expect(after14.json().items).toEqual([]);

    const before14 = await client.get('/admin/customers', { query: { lastOrderBefore: '2026-10-14' } });
    expect(before14.json().items).toEqual([]);
    const before15 = await client.get('/admin/customers', { query: { lastOrderBefore: '2026-10-15' } });
    expect(before15.json().items.map((r: { id: number }) => r.id)).toEqual([order.customerId]);
  });

  it('privacy erasure keeps delivered mail SENT, stops pending mail, and erased mail cannot be retried', async () => {
    await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const order = await makeOrder(t.prisma, { phone: '+96171113020', email: 'erase-me@example.com', status: 'DELIVERED' });
    const base = { orderId: order.id, toEmail: 'erase-me@example.com', templateKey: 'order_received', subject: 's', bodyText: 't', bodyHtml: 'h', nextAttemptAt: new Date() };
    const sent = await t.prisma.emailLog.create({ data: { ...base, status: 'SENT', attempts: 1, sentAt: new Date() } });
    const pending = await t.prisma.emailLog.create({ data: { ...base, status: 'PENDING', attempts: 0 } });
    const failed = await t.prisma.emailLog.create({ data: { ...base, status: 'FAILED', attempts: 4, error: 'smtp down' } });

    expect((await client.delete(`/admin/customers/${order.customerId}/personal-data`)).status).toBe(204);
    const rows = await t.prisma.emailLog.findMany({ where: { id: { in: [sent.id, pending.id, failed.id] } }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['SENT', 'FAILED', 'FAILED']);
    expect(rows.every((r) => r.toEmail.endsWith('@privacy.invalid') && r.bodyHtml === '[personal data erased]')).toBe(true);

    const overview = await client.get('/admin/overview');
    expect(overview.json().attention.filter((a: { type: string }) => a.type === 'EMAIL_FAILED')).toHaveLength(2);
    const retry = await client.post(`/admin/email-log/${failed.id}/retry`);
    expect(retry.status).toBe(409);
    expect((await t.prisma.emailLog.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('FAILED');
  });

  it('bulk marketing e-mail has a clickable unsubscribe link in the HTML part', async () => {
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { phone: '+96171113030', name: 'Link Reader', email: 'link-reader@example.com' });
    await t.prisma.customer.update({ where: { id: customer.id }, data: { emailConsent: true } });
    const res = await client.post('/admin/customers/bulk/email', { target: { ids: [customer.id] }, subject: 'Hi {name}', body: 'News, {name}.' });
    expect(res.status, res.body).toBe(200);
    const row = await t.prisma.emailLog.findFirstOrThrow({ where: { toEmail: 'link-reader@example.com' } });
    const { unsubscribeToken } = await t.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row.bodyHtml).toContain(`<a href="${t.ctx.config.webUrl}/unsubscribe?token=${unsubscribeToken}"`);
  });
});
