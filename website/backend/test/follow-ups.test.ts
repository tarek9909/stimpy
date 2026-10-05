import { describe, expect, it } from 'vitest';
import { setClock } from '../src/lib/clock';
import { useTestApp } from './helpers/app';
import { makeCustomer } from './helpers/wpc-fixtures';

describe('customer follow-ups', () => {
  const t = useTestApp();

  it('filters incomplete follow-ups by the business-local calendar day and paginates', async () => {
    setClock(() => new Date('2026-10-04T10:00:00.000Z'));
    const { client, admin } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'Follow-up customer' });
    const rows = await Promise.all([
      t.prisma.customerFollowUp.create({ data: { customerId: customer.id, userId: admin.user.id, dueAt: new Date('2026-10-03T20:59:59.999Z'), note: 'overdue' } }),
      t.prisma.customerFollowUp.create({ data: { customerId: customer.id, userId: admin.user.id, dueAt: new Date('2026-10-04T06:00:00.000Z'), note: 'today' } }),
      t.prisma.customerFollowUp.create({ data: { customerId: customer.id, userId: admin.user.id, dueAt: new Date('2026-10-04T21:00:00.000Z'), note: 'upcoming' } }),
      t.prisma.customerFollowUp.create({ data: { customerId: customer.id, userId: admin.user.id, dueAt: new Date('2026-10-04T07:00:00.000Z'), note: 'done', doneAt: new Date('2026-10-04T08:00:00.000Z') } }),
    ]);

    const overdue = await client.get('/admin/follow-ups', { query: { due: 'overdue' } });
    const today = await client.get('/admin/follow-ups', { query: { due: 'today', pageSize: 1 } });
    const upcoming = await client.get('/admin/follow-ups', { query: { due: 'upcoming' } });
    expect(overdue.json().items.map((item: { id: number }) => item.id)).toEqual([rows[0].id]);
    expect(today.json()).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ note: 'today', customerName: 'Follow-up customer' }] });
    expect(upcoming.json().items.map((item: { id: number }) => item.id)).toEqual([rows[2].id]);
  });

  it('creates, edits, completes, reopens and deletes a follow-up, and includes it in the customer timeline', async () => {
    setClock(() => new Date('2026-10-04T10:00:00.000Z'));
    const { client } = await t.adminClient();
    const customer = await makeCustomer(t.prisma, { name: 'Timeline follow-up' });
    const created = await client.post('/admin/follow-ups', { customerId: customer.id, dueAt: '2026-10-04T12:00:00.000Z', note: 'Call back' });
    expect(created.status).toBe(201);
    expect(created.json()).toMatchObject({ customerId: customer.id, customerName: 'Timeline follow-up', note: 'Call back', doneAt: null });
    const id = created.json().id as number;

    const edited = await client.patch(`/admin/follow-ups/${id}`, { dueAt: '2026-10-05T12:00:00.000Z', note: 'Call tomorrow', done: true });
    expect(edited.status).toBe(200);
    expect(edited.json()).toMatchObject({ note: 'Call tomorrow', doneAt: '2026-10-04T10:00:00.000Z' });
    const timeline = await client.get(`/admin/customers/${customer.id}/timeline`);
    expect(timeline.json().items).toContainEqual(expect.objectContaining({ type: 'FOLLOW_UP', refId: String(id), detail: 'Call tomorrow · Due 2026-10-05T12:00:00.000Z' }));

    const reopened = await client.patch(`/admin/follow-ups/${id}`, { done: false });
    expect(reopened.json().doneAt).toBeNull();
    expect((await client.delete(`/admin/follow-ups/${id}`)).status).toBe(204);
    expect((await client.delete(`/admin/follow-ups/${id}`)).status).toBe(404);
  });
});
