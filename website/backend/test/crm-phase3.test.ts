import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { hoodieItem, placeInput, phoneN } from './helpers/orders';
import { makeCustomer, makeOrder } from './helpers/wpc-fixtures';
import { placeOrder } from '../src/services/orders';

describe('CRM subscriber consent, unsubscribe and attribution', () => {
  const t = useTestApp();

  it('links pre-existing drop subscribers to a new customer and keeps first-touch attribution immutable', async () => {
    const world = await buildWorld(t.prisma);
    const phone = `+961${phoneN(61)}`;
    const email = 'fan@example.com';
    await t.prisma.subscriber.createMany({
      data: [
        { contact: email, type: 'EMAIL' },
        { contact: phone, type: 'WHATSAPP' },
      ],
    });
    const first = await placeOrder(t.ctx, placeInput(world, [hoodieItem(world)], {
      i: 61,
      customer: { name: 'First Touch', email, phone, whatsapp: phone, whatsappSameAsPhone: false },
      attribution: { utmSource: 'email', utmCampaign: 'checkout-reminder' },
      firstTouch: { utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'launch', utmContent: 'blue-card', utmTerm: 'hoodie', referrer: 'https://example.com/ad' },
    }));
    const customer = await t.prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(customer).toMatchObject({ emailConsent: true, whatsappConsent: true, firstSource: 'WEBSITE', firstUtmSource: 'instagram', firstUtmContent: 'blue-card', firstUtmTerm: 'hoodie', firstReferrer: 'https://example.com/ad' });
    expect(customer.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await t.prisma.subscriber.count({ where: { customerId: customer.id } })).toBe(2);
    const firstOrder = await t.prisma.order.findUniqueOrThrow({ where: { id: first.orderId } });
    expect(firstOrder).toMatchObject({ utmSource: 'email', utmCampaign: 'checkout-reminder', utmContent: null, referrer: null });
    const { client } = await t.adminClient();
    await t.prisma.subscriber.create({ data: { contact: 'other@example.com', type: 'EMAIL' } });
    const linkedSubscribers = await client.get('/admin/subscribers', { query: { customerId: customer.id } });
    expect(linkedSubscribers.json().total).toBe(2);
    expect(linkedSubscribers.json().items.map((subscriber: { contact: string }) => subscriber.contact).sort()).toEqual([email, phone].sort());

    const second = await placeOrder(t.ctx, placeInput(world, [hoodieItem(world, 1, 'black', 's')], {
      i: 62,
      customer: { name: 'Later Name', email: 'later@example.com', phone, whatsapp: phone, whatsappSameAsPhone: false },
      attribution: { utmSource: 'newsletter', utmCampaign: 'later' },
      firstTouch: { utmSource: 'tiktok', utmCampaign: 'must-not-overwrite' },
    }));
    const unchanged = await t.prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(unchanged).toMatchObject({ firstSource: 'WEBSITE', firstUtmSource: 'instagram', firstUtmCampaign: 'launch', firstUtmContent: 'blue-card' });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: second.orderId } })).utmSource).toBe('newsletter');
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: second.orderId } })).utmCampaign).toBe('later');
  });

  it('validates unsubscribe first, only revokes email consent on confirmation, and is idempotent', async () => {
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { email: 'unsubscribe@example.com' });
    const token = 'a'.repeat(64);
    await t.prisma.customer.update({ where: { id: customer.id }, data: { emailConsent: true, whatsappConsent: true, unsubscribeToken: token } });
    expect((await client.get(`/unsubscribe/${token}`)).status).toBe(200);
    expect((await t.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).emailConsent).toBe(true);
    expect((await client.post(`/unsubscribe/${token}/confirm`)).status).toBe(204);
    expect((await client.post(`/unsubscribe/${token}/confirm`)).status).toBe(204);
    const updated = await t.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updated).toMatchObject({ emailConsent: false, whatsappConsent: true });
    const profile = await client.get(`/admin/customers/${customer.id}/profile`);
    expect(profile.json().consentUpdatedAt).toBe(updated.consentUpdatedAt?.toISOString());
    expect((await client.get(`/unsubscribe/${'b'.repeat(64)}`)).status).toBe(404);
  });

  it('links a new explicit drop signup to the existing customer and timestamps consent', async () => {
    const world = await buildWorld(t.prisma);
    const phone = `+961${phoneN(77)}`;
    const customer = await makeCustomer(t.prisma, { phone, email: 'signup@example.com' });
    const result = await t.client.post(`/drops/${world.drop.id}/subscribe`, { contact: 'SIGNUP@example.com', type: 'EMAIL' });
    expect(result.status).toBe(204);
    expect(await t.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ emailConsent: true, unsubscribedAt: null });
    expect(await t.prisma.subscriber.findFirstOrThrow()).toMatchObject({ customerId: customer.id, contact: 'SIGNUP@example.com' });
  });

  it('merges every customer-owned record transactionally and adds a survivor timeline audit note', async () => {
    const { client, admin } = await t.adminClient();
    const survivor = await makeCustomer(t.prisma, { phone: '+96171100991', email: 'same@example.com', name: 'Survivor', notes: 'survivor note' });
    const duplicate = await makeCustomer(t.prisma, { phone: '+96171100992', email: 'same@example.com', name: 'Duplicate', notes: 'duplicate note' });
    const tag = await t.prisma.customerTag.create({ data: { name: 'Merge tag' } });
    await t.prisma.customerTagLink.create({ data: { customerId: duplicate.id, tagId: tag.id } });
    const followUp = await t.prisma.customerFollowUp.create({ data: { customerId: duplicate.id, userId: admin.user.id, dueAt: new Date('2026-11-01T00:00:00.000Z'), note: 'merge follow-up' } });
    const customerNote = await t.prisma.customerNote.create({ data: { customerId: duplicate.id, userId: admin.user.id, body: 'merge note' } });
    const order = await makeOrder(t.prisma, { phone: duplicate.phone, customerName: 'Historical snapshot' });
    await t.prisma.subscriber.create({ data: { customerId: duplicate.id, contact: 'same@example.com', type: 'EMAIL' } });

    const merged = await client.post(`/admin/customers/${survivor.id}/merge`, { duplicateCustomerId: duplicate.id });
    expect(merged.status).toBe(200);
    expect(await t.prisma.customer.findUnique({ where: { id: duplicate.id } })).toBeNull();
    expect(await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ customerId: survivor.id, customerName: 'Historical snapshot' });
    expect(await t.prisma.customerFollowUp.findUniqueOrThrow({ where: { id: followUp.id } })).toMatchObject({ customerId: survivor.id });
    expect(await t.prisma.customerNote.findUniqueOrThrow({ where: { id: customerNote.id } })).toMatchObject({ customerId: survivor.id });
    expect(await t.prisma.customerTagLink.count({ where: { customerId: survivor.id, tagId: tag.id } })).toBe(1);
    expect(await t.prisma.subscriber.findFirstOrThrow({ where: { contact: 'same@example.com' } })).toMatchObject({ customerId: survivor.id });
    expect(merged.json().notes).toContain('duplicate note');
    expect((await client.get(`/admin/customers/${survivor.id}/timeline`)).json().items).toContainEqual(expect.objectContaining({ type: 'CUSTOMER_NOTE', detail: `Merged duplicate customer ${duplicate.id} into this profile.` }));
  });
});
