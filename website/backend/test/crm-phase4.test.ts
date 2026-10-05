import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';
import { jobs } from './helpers/jobs';

describe('CRM segments and consent-gated campaigns', () => {
  const t = useTestApp();

  it('saves segments and previews aggregate, tag and consent filters through authenticated admin routes', async () => {
    await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const eligible = await makeCustomer(t.prisma, { name: 'Eligible CRM', email: 'eligible-crm@example.com' });
    const noConsent = await makeCustomer(t.prisma, { name: 'No Consent CRM', email: 'no-consent-crm@example.com' });
    await t.prisma.customer.update({ where: { id: eligible.id }, data: { emailConsent: true, consentUpdatedAt: new Date() } });
    const tag = await t.prisma.customerTag.create({ data: { name: 'Campaign cohort' } });
    await t.prisma.customerTagLink.create({ data: { customerId: eligible.id, tagId: tag.id } });
    await t.prisma.customerTagLink.create({ data: { customerId: noConsent.id, tagId: tag.id } });
    await makeOrder(t.prisma, { phone: eligible.phone, email: eligible.email, status: 'DELIVERED', placedAt: '2026-10-02T09:00:00Z' });
    await makeOrder(t.prisma, { phone: noConsent.phone, email: noConsent.email, status: 'NEW', placedAt: '2026-10-02T09:00:00Z' });

    const filters = { tagIds: [tag.id], orderCountMin: 1, lifetimeValueMinCents: 3800, lastOrderBefore: '2026-10-03', hasEmail: true };
    const saved = await client.post('/admin/segments', { name: 'October buyers', filters });
    expect(saved.status).toBe(201);
    expect(saved.json()).toMatchObject({ name: 'October buyers', filters });
    const preview = await client.post('/admin/segments/preview', { target: { segmentId: saved.json().id }, channel: 'EMAIL' });
    expect(preview.status).toBe(200);
    expect(preview.json()).toMatchObject({ matched: 2, eligible: 1, skipped: { noContact: 0, noConsent: 1, optedOut: 0 } });
    expect(preview.json().sample).toEqual([expect.objectContaining({ id: eligible.id, to: eligible.email })]);
    expect((await client.get('/admin/segments')).json().total).toBe(1);
    expect((await client.patch(`/admin/segments/${saved.json().id}`, { name: 'October delivered buyers' })).status).toBe(200);
  });

  it('requires explicit confirmation, adds unsubscribe links, and rechecks consent at actual email delivery', async () => {
    await buildWorld(t.prisma);
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'Campaign Recipient', email: 'campaign-recipient@example.com' });
    await t.prisma.customer.update({ where: { id: customer.id }, data: { emailConsent: true, consentUpdatedAt: new Date() } });
    const created = await client.post('/admin/campaigns', { target: { filters: { tagIds: [] } }, channel: 'EMAIL', templateKey: 'marketing_update' });
    expect(created.status).toBe(201);
    expect(created.json().status).toBe('DRAFT');
    expect(await t.prisma.emailLog.count()).toBe(0);

    const confirmed = await client.post(`/admin/campaigns/${created.json().id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.json()).toMatchObject({ status: 'QUEUED', sentCount: 0, recipients: { total: 1 } });
    const log = await t.prisma.emailLog.findFirstOrThrow({ where: { toEmail: customer.email! } });
    expect(log.subject).toBe('A little more Stimpy for your day');
    expect(log.bodyText).toContain('Hi Campaign Recipient,');
    expect(log.bodyText).toContain(`${t.ctx.config.webUrl}/shop`);
    expect(log.bodyText).not.toContain('{order_number}');
    expect(log.bodyHtml).toContain(`<a href="${t.ctx.config.webUrl}/shop"`);
    expect(log.bodyText).toContain('/unsubscribe?token=');
    expect(confirmed.json().recipients.items[0]).toMatchObject({ customerId: customer.id, status: 'QUEUED' });

    await t.prisma.customer.update({ where: { id: customer.id }, data: { emailConsent: false, unsubscribedAt: new Date() } });
    expect(await jobs.emailWorker(t.ctx)).toEqual({ sent: 0, failed: 0, retried: 0 });
    expect(t.transport.sent).toHaveLength(0);
    expect(await t.prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject({ status: 'FAILED', error: 'Customer consent was revoked before delivery.' });
    const updated = await client.get(`/admin/campaigns/${created.json().id}`);
    expect(updated.json()).toMatchObject({ status: 'COMPLETED', skippedCount: 1, sentCount: 0, recipients: { items: [expect.objectContaining({ status: 'SKIPPED' })] } });
  });

  it('creates manual WhatsApp links and records a sent action without sending a message automatically', async () => {
    await buildWorld(t.prisma);
    const { client, admin } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'WhatsApp Fan', email: 'wa-fan@example.com' });
    await t.prisma.customer.update({ where: { id: customer.id }, data: { whatsappConsent: true, emailConsent: false, unsubscribedAt: new Date() } });
    const created = await client.post('/admin/campaigns', { target: { filters: { tagIds: [] } }, channel: 'WHATSAPP', templateKey: 'marketing_update' });
    const confirmed = await client.post(`/admin/campaigns/${created.json().id}/confirm`);
    expect(confirmed.status).toBe(200);
    const recipient = confirmed.json().recipients.items[0];
    expect(recipient.whatsappUrl).toContain('https://wa.me/');
    expect(decodeURIComponent(recipient.whatsappUrl)).toContain(`${t.ctx.config.webUrl}/shop`);
    expect(decodeURIComponent(recipient.whatsappUrl)).toContain('Hi WhatsApp Fan');
    expect(recipient.whatsappUrl).toContain(encodeURIComponent('Reply STOP'));
    expect(await t.prisma.emailLog.count()).toBe(0);

    const sent = await client.post(`/admin/campaigns/${created.json().id}/recipients/${customer.id}/sent`);
    expect(sent.status).toBe(200);
    expect(sent.json()).toMatchObject({ customerId: customer.id, status: 'SENT' });
    expect(await t.prisma.customerNote.findFirstOrThrow({ where: { customerId: customer.id, userId: admin.user.id } })).toMatchObject({ body: `WhatsApp campaign ${created.json().id} marked as sent.` });
  });

  it('keeps campaign history with customer export, merge and privacy erasure', async () => {
    await buildWorld(t.prisma);
    const { client, admin } = await t.adminClient();
    const survivor = await makeCustomer(t.prisma, { phone: '+96171112001', name: 'Campaign Survivor' });
    const duplicate = await makeCustomer(t.prisma, { phone: '+96171112002', name: 'Campaign Duplicate' });
    const campaign = await t.prisma.campaignSend.create({ data: { filterJson: { tagIds: [] }, channel: 'WHATSAPP', templateKey: 'order_confirmation', createdBy: admin.user.id } });
    const recipient = await t.prisma.campaignRecipient.create({ data: { campaignId: campaign.id, customerId: duplicate.id, status: 'READY', destination: duplicate.whatsapp, bodySnapshot: `Hi ${duplicate.name}` } });

    const exported = await client.get(`/admin/customers/${duplicate.id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.json().campaignRecipients).toContainEqual(expect.objectContaining({ id: recipient.id, destination: duplicate.whatsapp }));
    expect((await client.post(`/admin/customers/${survivor.id}/merge`, { duplicateCustomerId: duplicate.id })).status).toBe(200);
    expect(await t.prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).toMatchObject({ customerId: survivor.id, destination: duplicate.whatsapp });

    expect((await client.delete(`/admin/customers/${survivor.id}/personal-data`)).status).toBe(204);
    expect(await t.prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).toMatchObject({ status: 'SKIPPED', destination: null, bodySnapshot: '[personal data erased]' });
    expect(await t.prisma.campaignSend.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ status: 'COMPLETED', skippedCount: 1 });
  });
});
