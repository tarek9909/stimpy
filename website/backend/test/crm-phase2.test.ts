import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { makeCustomer } from './helpers/wpc-fixtures';

describe('CRM tags and customer notes', () => {
  const t = useTestApp();

  it('creates tags, attaches idempotently, filters customers in SQL, and cascades tag deletion', async () => {
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'VIP Customer' });
    const other = await makeCustomer(t.prisma, { name: 'Other Customer' });
    const created = await client.post('/admin/customer-tags', { name: 'VIP', color: '#112233' });
    expect(created.status).toBe(201);
    const tagId = created.json().id as number;
    expect((await client.post('/admin/customer-tags', { name: 'VIP' })).status).toBe(409);
    expect((await client.post(`/admin/customers/${customer.id}/tags/${tagId}`, {})).status).toBe(200);
    expect((await client.post(`/admin/customers/${customer.id}/tags/${tagId}`, {})).status).toBe(200);
    const filtered = await client.get('/admin/customers', { query: { tagId } });
    expect(filtered.status, filtered.body).toBe(200);
    expect(filtered.json().items.map((row: { id: number }) => row.id)).toEqual([customer.id]);
    expect(filtered.json().items[0].tags).toEqual([{ id: tagId, name: 'VIP', color: '#112233' }]);
    expect((await client.get(`/admin/customers/${other.id}/tags`)).json()).toEqual([]);

    expect((await client.delete(`/admin/customer-tags/${tagId}`)).status).toBe(204);
    expect((await client.get(`/admin/customers/${customer.id}/tags`)).json()).toEqual([]);
  });

  it('adds append-only notes to the customer timeline and redacts their text on privacy erasure', async () => {
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'Note Customer' });
    const created = await client.post(`/admin/customers/${customer.id}/notes`, { body: 'Customer asked for a call after 5' });
    expect(created.status).toBe(201);
    expect((await client.get(`/admin/customers/${customer.id}/notes`)).json().items).toMatchObject([{ body: 'Customer asked for a call after 5' }]);
    expect((await client.get(`/admin/customers/${customer.id}/timeline`)).json().items).toContainEqual(expect.objectContaining({ type: 'CUSTOMER_NOTE', detail: 'Customer asked for a call after 5' }));

    expect((await client.delete(`/admin/customers/${customer.id}/personal-data`)).status).toBe(204);
    const note = await t.prisma.customerNote.findUniqueOrThrow({ where: { id: created.json().id } });
    expect(note.body).toBe('[personal data erased]');
  });
});
