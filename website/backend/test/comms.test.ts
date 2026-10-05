import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES, WHATSAPP_TEMPLATES } from '../src/lib/templates-catalog';
import { enqueueEmail, enqueueOrderEmail, processDueEmails } from '../src/services/email-queue';
import { useTestApp } from './helpers/app';
import { buildWorld } from './helpers/fixtures';
import { freezeTime, advanceTime } from './helpers/clock';
import { makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();

/** Freezes the clock first so the session is created (and later validated) at the same fixed instant. */
async function admin() {
  freezeTime('2026-10-14T10:00:00Z');
  await buildWorld(t.prisma);
  return (await t.adminClient()).client;
}

describe('email templates', () => {
  it('lists the six templates in catalog order with their allowed placeholders', async () => {
    const client = await admin();
    const res = await client.get('/admin/email-templates');
    expect(res.status).toBe(200);
    const list = res.json();
    expect(list.map((x: { key: string }) => x.key)).toEqual(['order_received', 'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled', 'orders_lookup', 'marketing_update']);
    expect(list[0]).toEqual({
      key: 'order_received', name: 'Order received', subject: 'We got your order {order_number}', body: EMAIL_TEMPLATES[0]!.body, enabled: true,
      placeholders: ['customer_name', 'order_number', 'items', 'total', 'delivery_number', 'tracking_url', 'cancel_reason'],
    });
    expect(list[5].placeholders).toEqual(['order_list', 'tracking_url']);
  });

  it('saves subject, body and enabled; later enqueues use the new text, earlier rows keep the old', async () => {
    const client = await admin();
    const o = await makeOrder(t.prisma, { number: 'STP-1', email: 'a@example.com', customerName: 'Rami' });
    const before = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmed' });
    const res = await client.put('/admin/email-templates/order_confirmed', { subject: 'Great news, {customer_name}', body: 'It is confirmed: {order_number}.', enabled: true });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ key: 'order_confirmed', subject: 'Great news, {customer_name}', body: 'It is confirmed: {order_number}.', enabled: true });
    const after = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmed', resend: true });
    const [b, a] = await Promise.all([before!.id, after!.id].map((id) => t.prisma.emailLog.findUniqueOrThrow({ where: { id } })));
    expect(b!.subject).toBe('Order STP-1 is confirmed');
    expect(a!.subject).toBe('Great news, Rami');
    expect(a!.bodyText).toContain('It is confirmed: STP-1.');
    expect((await client.get('/admin/email-templates')).json()[1]).toMatchObject({ subject: 'Great news, {customer_name}' });
  });

  it('rejects unknown placeholders (also {Foo}, {} and {a-b}) with field errors, and saves nothing', async () => {
    const client = await admin();
    const saveBefore = (await client.get('/admin/email-templates')).json()[0];
    for (const bad of ['{foo}', '{Customer_Name}', '{}', '{order-number}', '{order_list}', '{ order_number }']) {
      const r = await client.put('/admin/email-templates/order_received', { subject: `Hi ${bad}`, body: 'ok', enabled: true });
      expect(r.status, bad).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
      expect(r.json().error.fields.subject, bad).toContain(bad);
      const r2 = await client.put('/admin/email-templates/order_received', { subject: 'ok', body: `Hello ${bad}`, enabled: true });
      expect(r2.status, bad).toBe(400);
      expect(r2.json().error.fields.body, bad).toContain(bad);
    }
    // {order_list} is valid for orders_lookup only
    expect((await client.put('/admin/email-templates/orders_lookup', { subject: 's', body: '{order_list}', enabled: true })).status).toBe(200);
    expect((await client.get('/admin/email-templates')).json()[0]).toEqual(saveBefore);
  });

  it('validates lengths, one-line subject, required fields, strict body and the key', async () => {
    const client = await admin();
    const put = (body: object, key = 'order_received') => client.put(`/admin/email-templates/${key}`, body);
    const good = { subject: 'Hi', body: 'There', enabled: true };
    expect((await put({ ...good, subject: 'x'.repeat(201) })).status).toBe(400);
    expect((await put({ ...good, subject: 'x'.repeat(200) })).status).toBe(200);
    expect((await put({ ...good, body: 'x'.repeat(5001) })).status).toBe(400);
    expect((await put({ ...good, body: 'x'.repeat(5000) })).status).toBe(200);
    expect((await put({ ...good, subject: '' })).status).toBe(400);
    expect((await put({ ...good, body: '' })).status).toBe(400);
    expect((await put({ ...good, subject: 'two\nlines' })).json().error.fields.subject).toMatch(/one line/i);
    expect((await put({ subject: 'a', body: 'b' })).status).toBe(400); // enabled required
    expect((await put({ ...good, extra: true })).status).toBe(400);
    expect((await put(good, 'nope')).status).toBe(404);
  });

  it('a disabled template stops automatic e-mails but the test send still works', async () => {
    const client = await admin();
    const o = await makeOrder(t.prisma, { number: 'STP-1', email: 'a@example.com' });
    await client.put('/admin/email-templates/order_received', { subject: 'Hi {order_number}', body: 'b', enabled: false });
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' })).toBeNull();
    expect((await client.post('/admin/email-templates/order_received/test', { to: 't@example.com' })).status).toBe(202);
  });
});

describe('email template preview', () => {
  it('renders the saved template with sample data through the real layout', async () => {
    const client = await admin();
    const res = await client.post('/admin/email-templates/order_received/preview', {});
    expect(res.status).toBe(200);
    const p = res.json();
    expect(p.subject).toBe('We got your order STP-1042');
    expect(p.text).toContain('Hi Rami Haddad,');
    expect(p.text).toContain('- Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1');
    expect(p.text).toContain('Total to pay at the door: $45.00');
    expect(p.text).toContain('Stimpy. One hoodie. Multiple identities.');
    expect(p.html).toContain('<!doctype html>');
    expect(p.html).toContain('Track your order');
    expect(Object.keys(p).sort()).toEqual(['html', 'subject', 'text']);
  });

  it('previews unsaved edits without saving them, and uses footerText and the sample delivery number / cancel reason', async () => {
    const client = await admin();
    await t.ctx.settings.update({ email: { footerText: 'Custom <footer> text' } });
    const res = await client.post('/admin/email-templates/order_out_for_delivery/preview', { subject: 'Draft {order_number}', body: 'Number {delivery_number} reason{cancel_reason}' });
    const p = res.json();
    expect(p.subject).toBe('Draft STP-1042');
    expect(p.text).toContain('Number D-88231 reason Reason: Out of stock');
    expect(p.text).toContain('Custom <footer> text');
    expect(p.html).toContain('Custom &lt;footer&gt; text');
    expect((await client.get('/admin/email-templates')).json()[2].subject).toBe('Order {order_number} is on its way'); // not saved
  });

  it('only subject or only body can be overridden; the other comes from the saved template', async () => {
    const client = await admin();
    const onlyBody = (await client.post('/admin/email-templates/order_delivered/preview', { body: 'Just {order_number}' })).json();
    expect(onlyBody.subject).toBe('Your Stimpy has arrived');
    expect(onlyBody.text).toContain('Just STP-1042');
    const onlySubject = (await client.post('/admin/email-templates/order_delivered/preview', { subject: 'S {total}' })).json();
    expect(onlySubject.subject).toBe('S $45.00');
    expect(onlySubject.text).toContain('Your order STP-1042 was delivered.');
  });

  it('template authors cannot inject HTML: tags in the body are escaped', async () => {
    const client = await admin();
    const p = (await client.post('/admin/email-templates/order_received/preview', { body: '<img src=x onerror=alert(1)> <script>x</script> {customer_name}' })).json();
    expect(p.html).not.toContain('<img');
    expect(p.html).not.toContain('<script>');
    expect(p.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('404 for an unknown key; strict body; limits', async () => {
    const client = await admin();
    expect((await client.post('/admin/email-templates/nope/preview', {})).status).toBe(404);
    expect((await client.post('/admin/email-templates/order_received/preview', { extra: 1 })).status).toBe(400);
    expect((await client.post('/admin/email-templates/order_received/preview', { subject: 'x'.repeat(201) })).status).toBe(400);
  });
});

describe('email template test send', () => {
  it('queues a sample to the given address with 202, ignores the master switch, goes through the queue and the log', async () => {
    const client = await admin();
    await t.ctx.settings.update({ email: { enabled: false } });
    const res = await client.post('/admin/email-templates/order_confirmed/test', { to: 'founder@example.com' });
    expect(res.status).toBe(202);
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(row).toMatchObject({ toEmail: 'founder@example.com', templateKey: 'order_confirmed', status: 'PENDING', orderId: null, subject: 'Order STP-1042 is confirmed' });
    expect(row.bodyText).toContain('Total: $45.00');
    expect(t.transport.sent).toHaveLength(0); // not sent inline
    await processDueEmails(t.ctx);
    expect(t.transport.sent.map((m) => m.to)).toEqual(['founder@example.com']);
    const log = (await client.get('/admin/email-log')).json();
    expect(log.items[0]).toMatchObject({ to: 'founder@example.com', template: 'order_confirmed', status: 'SENT', orderNumber: null });
  });

  it('sends the SAVED template, validates the address, 404 for unknown keys', async () => {
    const client = await admin();
    await client.put('/admin/email-templates/order_delivered', { subject: 'Saved {order_number}', body: 'b', enabled: true });
    const r = await client.post('/admin/email-templates/order_delivered/test', { to: 'x@example.com' });
    expect((await t.prisma.emailLog.findUniqueOrThrow({ where: { id: r.json().id } })).subject).toBe('Saved STP-1042');
    for (const to of ['nope', '', 'a@b', 'a b@example.com']) expect((await client.post('/admin/email-templates/order_delivered/test', { to })).status, to).toBe(400);
    expect((await client.post('/admin/email-templates/order_delivered/test', {})).status).toBe(400);
    expect((await client.post('/admin/email-templates/nope/test', { to: 'x@example.com' })).status).toBe(404);
  });
});

describe('whatsapp templates', () => {
  it('lists the four templates with placeholders, saves the array and rejects unknown placeholders', async () => {
    const client = await admin();
    const list = (await client.get('/admin/whatsapp-templates')).json();
    expect(list.map((x: { key: string }) => x.key)).toEqual(['order_confirmation', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'marketing_update']);
    expect(list[0]).toEqual({ key: 'order_confirmation', name: 'Order confirmation', body: WHATSAPP_TEMPLATES[0]!.body, placeholders: ['customer_name', 'order_number', 'items', 'total', 'delivery_number', 'tracking_url', 'cancel_reason'] });

    list[1].body = 'Packed {order_number} for {customer_name}';
    const saved = await client.put('/admin/whatsapp-templates', list);
    expect(saved.status).toBe(200);
    expect(saved.json()[1].body).toBe('Packed {order_number} for {customer_name}');
    expect((await client.get('/admin/whatsapp-templates')).json()[1].body).toBe('Packed {order_number} for {customer_name}');

    const bad = [...list];
    bad[2] = { ...bad[2], body: 'Hello {foo}' };
    const r = await client.put('/admin/whatsapp-templates', bad);
    expect(r.status).toBe(400);
    expect(r.json().error.fields['2.body']).toContain('{foo}');
    expect((await client.get('/admin/whatsapp-templates')).json()[2].body).toBe(WHATSAPP_TEMPLATES[2]!.body); // nothing saved
  });

  it('validates keys, duplicates, empty bodies and strict items; the order whatsapp link uses the saved text', async () => {
    const client = await admin();
    expect((await client.put('/admin/whatsapp-templates', [{ key: 'nope', body: 'x' }])).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', [{ key: 'delivered', body: 'x' }, { key: 'delivered', body: 'y' }])).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', [{ key: 'delivered', body: '' }])).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', [{ key: 'delivered', body: 'x', extra: 1 }])).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', [])).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', { key: 'delivered', body: 'x' })).status).toBe(400);
    expect((await client.put('/admin/whatsapp-templates', [{ key: 'delivered', body: 'Hi {customer_name} #{order_number}' }])).status).toBe(200);
    const { buildOrderWhatsapp } = await import('../src/services/whatsapp');
    const o = await makeOrder(t.prisma, { number: 'STP-9', customerName: 'Ali', whatsapp: '+96171123456' });
    expect((await buildOrderWhatsapp(t.ctx, t.prisma, { orderId: o.id, template: 'delivered' })).text).toBe('Hi Ali #STP-9');
  });
});

describe('email log', () => {
  async function seedLog() {
    const o1 = await makeOrder(t.prisma, { number: 'STP-1', email: 'a@example.com' });
    const o2 = await makeOrder(t.prisma, { number: 'STP-2', email: 'b@example.com' });
    const mk = (orderId: number | null, to: string, template: string, status: 'PENDING' | 'SENT' | 'FAILED', minutes: number, extra: object = {}) =>
      t.prisma.emailLog.create({ data: { orderId, toEmail: to, templateKey: template, subject: `Subject ${template}`, bodyText: 'b', bodyHtml: 'h', status, createdAt: new Date(Date.UTC(2026, 9, 14, 9, minutes)), ...extra } });
    await mk(o1.id, 'a@example.com', 'order_received', 'SENT', 1, { attempts: 1, sentAt: new Date() });
    await mk(o1.id, 'a@example.com', 'order_confirmed', 'FAILED', 2, { attempts: 4, error: 'SMTP down' });
    await mk(o2.id, 'b@example.com', 'order_received', 'PENDING', 3);
    await mk(null, 'c@example.com', 'orders_lookup', 'SENT', 4, { attempts: 1 });
    return { o1, o2 };
  }

  it('lists newest first with the contract shape and filters by status, orderId and template', async () => {
    const client = await admin();
    const { o1 } = await seedLog();
    const all = (await client.get('/admin/email-log')).json();
    expect(all).toMatchObject({ page: 1, pageSize: 25, total: 4 });
    expect(all.items.map((i: { template: string }) => i.template)).toEqual(['orders_lookup', 'order_received', 'order_confirmed', 'order_received']);
    expect(all.items[2]).toEqual({
      id: expect.any(Number), at: '2026-10-14T09:02:00.000Z', to: 'a@example.com', template: 'order_confirmed', subject: 'Subject order_confirmed',
      status: 'FAILED', attempts: 4, error: 'SMTP down', orderNumber: 'STP-1',
    });
    expect(all.items[0]).toMatchObject({ orderNumber: null, error: null });
    expect(JSON.stringify(all)).not.toMatch(/bodyText|bodyHtml|body_/); // the rendered body is not part of the list

    const q = async (query: object) => (await client.get('/admin/email-log', { query: query as Record<string, string> })).json();
    expect((await q({ status: 'FAILED' })).items).toHaveLength(1);
    expect((await q({ status: 'PENDING' })).total).toBe(1);
    expect((await q({ orderId: o1.id })).total).toBe(2);
    expect((await q({ template: 'order_received' })).total).toBe(2);
    expect((await q({ template: 'order_received', status: 'SENT', orderId: o1.id })).total).toBe(1);
    expect((await q({ template: 'nope' })).total).toBe(0);
    const p2 = await q({ pageSize: 3, page: 2 });
    expect(p2.items).toHaveLength(1);
    expect(p2).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect((await client.get('/admin/email-log', { query: { status: 'BOGUS' } })).status).toBe(400);
    expect((await client.get('/admin/email-log', { query: { orderId: 'x' } })).status).toBe(400);
  });

  it('retry resets a FAILED row to PENDING (attempts restart, due now) and the worker then sends it', async () => {
    const client = await admin();
    await seedLog();
    const failed = await t.prisma.emailLog.findFirstOrThrow({ where: { status: 'FAILED' } });
    const res = await client.post(`/admin/email-log/${failed.id}/retry`);
    expect(res.status).toBe(202);
    expect(res.json()).toEqual({ id: failed.id, status: 'PENDING' });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: failed.id } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 0, error: null });
    expect(row.nextAttemptAt).toEqual(new Date('2026-10-14T10:00:00Z'));
    advanceTime(1000);
    await processDueEmails(t.ctx);
    expect((await t.prisma.emailLog.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('SENT');
  });

  it('retry refuses rows that are not FAILED (409) and unknown ids (404)', async () => {
    const client = await admin();
    await seedLog();
    for (const status of ['SENT', 'PENDING'] as const) {
      const row = await t.prisma.emailLog.findFirstOrThrow({ where: { status } });
      const r = await client.post(`/admin/email-log/${row.id}/retry`);
      expect(r.status, status).toBe(409);
      expect(r.json().error.code).toBe('CONFLICT');
    }
    expect((await client.post('/admin/email-log/99999999/retry')).status).toBe(404);
    expect((await client.post('/admin/email-log/abc/retry')).status).toBe(400);
  });

  it('a retried row that fails again goes through the backoff once more', async () => {
    const client = await admin();
    const q = await enqueueEmail(t.ctx, t.prisma, { to: 'a@example.com', template: 'custom', custom: { subject: 's', body: 'b' } });
    t.transport.failWith = new Error('down');
    for (let i = 0; i < 4; i++) {
      await processDueEmails(t.ctx);
      advanceTime(31 * 60_000);
    }
    expect((await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } })).status).toBe('FAILED');
    await client.post(`/admin/email-log/${q!.id}/retry`);
    await processDueEmails(t.ctx);
    expect(await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } })).toMatchObject({ status: 'PENDING', attempts: 1 });
  });
});
