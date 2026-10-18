import { describe, expect, it } from 'vitest';
import { createSmtpTransport } from '../src/lib/email-transport';
import { addMs, MINUTE } from '../src/lib/clock';
import {
  enqueueEmail,
  enqueueFounderNewOrderAlert,
  enqueueLowStockAlert,
  enqueueOrderEmail,
  enqueueOrdersLookupEmail,
  processDueEmails,
} from '../src/services/email-queue';
import { buildOrderWhatsapp, customerConfirmationWhatsappUrl } from '../src/services/whatsapp';
import { jobs } from './helpers/jobs';
import { freezeTime, advanceTime } from './helpers/clock';
import { mailpitAvailable, mailpitClear, mailpitMessage, mailpitWaitFor } from './helpers/mailpit';
import { buildWorld } from './helpers/fixtures';
import { useTestApp } from './helpers/app';
import { makeOrder } from './helpers/wpc-fixtures';

const t = useTestApp();

const PACK_ITEMS = [
  { kind: 'PACK' as const, name: 'Hoodie + 2 Stimpies', qty: 1, unitPriceCents: 4500, unitCostCents: 2300, detail: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: ['THE VOID', 'THE CEDAR'] } },
  { kind: 'STIMPIE' as const, name: 'THE DREAMER', qty: 2, unitPriceCents: 1000, unitCostCents: 600 },
];

async function orderWithEmail(email: string | null = 'rami@example.com', name = 'Rami Haddad') {
  await buildWorld(t.prisma);
  return makeOrder(t.prisma, { number: 'STP-1042', customerName: name, email, items: PACK_ITEMS, deliveryFeeCents: 300, status: 'NEW' });
}

describe('enqueueOrderEmail', () => {
  it('renders the received template: placeholders filled, text and HTML parts, rendered content stored', async () => {
    const o = await orderWithEmail();
    const queued = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    expect(queued).not.toBeNull();
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: queued!.id } });
    expect(row).toMatchObject({ orderId: o.id, toEmail: 'rami@example.com', templateKey: 'order_received', status: 'PENDING', attempts: 0, subject: 'We got your order STP-1042' });
    // total = 4500 + 2*1000 + 300 delivery = 6800
    expect(row.bodyText).toContain('Hi Rami Haddad,');
    expect(row.bodyText).toContain('- Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1\n- THE DREAMER x2');
    expect(row.bodyText).toContain('Total to pay at the door: $68.00 (cash on delivery).');
    expect(row.bodyText).toContain(`${t.config.webUrl}/track?order=STP-1042`);
    expect(row.bodyText).not.toMatch(/\{[a-z_]+\}/);
    expect(row.bodyText).toContain('Stimpy. One hoodie. Multiple identities.'); // footerText
    expect(row.bodyHtml).toContain('<!doctype html>');
    expect(row.bodyHtml).toContain('#FF7A59'); // coral header bar
    expect(row.bodyHtml).toContain('>STIMPY<');
    expect(row.bodyHtml).toContain('Hi Rami Haddad,');
    expect(row.bodyHtml).toContain(`href="${t.config.webUrl}/track?order=STP-1042"`);
    expect(row.bodyHtml).toContain('Track your order'); // blue button
    expect(row.bodyHtml).toContain('#2E63FF');
    expect(row.bodyHtml).toContain('info@stimpylb.com'); // support address in the footer
  });

  it('escapes customer-supplied values in HTML but keeps them verbatim in the text part', async () => {
    const o = await orderWithEmail('x@example.com', '<script>alert("x")</script> & Co');
    await t.prisma.orderItem.updateMany({ where: { orderId: o.id, kind: 'STIMPIE' }, data: { name: '<img src=x onerror=1>' } });
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.bodyHtml).not.toContain('<script>');
    expect(row.bodyHtml).not.toContain('<img src=x');
    expect(row.bodyHtml).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co');
    expect(row.bodyHtml).toContain('&lt;img src=x onerror=1&gt;');
    expect(row.bodyText).toContain('<script>alert("x")</script> & Co');
  });

  it('a customer-typed placeholder or link is never expanded or linkified', async () => {
    const o = await orderWithEmail('x@example.com', '{total} https://evil.example/phish');
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.bodyText).toContain('Hi {total} https://evil.example/phish,');
    expect(row.bodyHtml).not.toContain('href="https://evil.example');
  });

  it('is idempotent per (order, template); different templates and manual resend are separate rows', async () => {
    const o = await orderWithEmail();
    const first = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmed' });
    expect(first).not.toBeNull();
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmed' })).toBeNull();
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' })).not.toBeNull();
    expect(await t.prisma.emailLog.count({ where: { orderId: o.id } })).toBe(2);
    const resent = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmed', resend: true });
    expect(resent).not.toBeNull();
    expect(resent!.id).not.toBe(first!.id);
    expect(await t.prisma.emailLog.count({ where: { orderId: o.id, templateKey: 'order_confirmed' } })).toBe(2);
  });

  it('is atomic with the caller transaction: a rollback leaves no row', async () => {
    const o = await orderWithEmail();
    await expect(
      t.prisma.$transaction(async (tx) => {
        await enqueueOrderEmail(t.ctx, tx, { orderId: o.id, template: 'order_received' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await t.prisma.emailLog.count()).toBe(0);
  });

  it('skips (no row, no error) without an address, with the master switch off, or with the template disabled', async () => {
    const noEmail = await orderWithEmail(null);
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: noEmail.id, template: 'order_received' })).toBeNull();

    const o = await makeOrder(t.prisma, { email: 'a@example.com' });
    await t.ctx.settings.update({ email: { enabled: false } });
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' })).toBeNull();
    await t.ctx.settings.update({ email: { enabled: true } });
    await t.prisma.emailTemplate.update({ where: { key: 'order_delivered' }, data: { enabled: false } });
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_delivered' })).toBeNull();
    expect(await t.prisma.emailLog.count()).toBe(0);
    // an explicit founder "resend" ignores the switches
    expect(await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_delivered', resend: true })).not.toBeNull();
  });

  it('every per-status template renders with its own content', async () => {
    const o = await orderWithEmail();
    await t.prisma.order.update({ where: { id: o.id }, data: { deliveryNumber: 'D-88231', cancelReason: 'Out of stock' } });
    const subjects: Record<string, string> = {};
    for (const key of ['order_received', 'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled'] as const) {
      const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: key });
      const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
      subjects[key] = row.subject;
      if (key === 'order_out_for_delivery') expect(row.bodyText).toContain('Delivery number: D-88231');
      if (key === 'order_cancelled') expect(row.bodyText).toContain('has been cancelled. Reason: Out of stock\n');
    }
    expect(subjects).toEqual({
      order_received: 'We got your order STP-1042',
      order_confirmed: 'Order STP-1042 is confirmed',
      order_out_for_delivery: 'Order STP-1042 is on its way',
      order_delivered: 'Your Stimpy has arrived',
      order_cancelled: 'Order STP-1042 was cancelled',
    });
  });

  it('cancel_reason renders as an empty string when there is none (clean sentence)', async () => {
    const o = await orderWithEmail();
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_cancelled' });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.bodyText).toContain('Your order STP-1042 has been cancelled.\n\nIf this is a surprise');
  });

  it('free-form custom e-mail fills placeholders from the order', async () => {
    const o = await orderWithEmail();
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'custom', custom: { subject: 'About {order_number}', body: 'Hello {customer_name}, quick question.' } });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row).toMatchObject({ templateKey: 'custom', subject: 'About STP-1042' });
    expect(row.bodyText).toContain('Hello Rami Haddad, quick question.');
  });

  it('strips CR/LF from subjects (header injection)', async () => {
    await buildWorld(t.prisma);
    const q = await enqueueEmail(t.ctx, t.prisma, { to: 'a@example.com', template: 'custom', custom: { subject: 'Hi\r\nBcc: evil@example.com', body: 'x' } });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.subject).not.toMatch(/[\r\n]/);
  });
});

describe('founder alerts', () => {
  it('new-order alert has number, customer, items, total and the dashboard link; once per order', async () => {
    const o = await orderWithEmail();
    expect(await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id })).toBeNull(); // no founderEmail yet
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com' } });
    const q = await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row).toMatchObject({ toEmail: 'founder@example.com', templateKey: 'founder_new_order', orderId: o.id });
    expect(row.subject).toBe('New order STP-1042: Rami Haddad ($68.00)');
    expect(row.bodyText).toContain('Customer: Rami Haddad');
    expect(row.bodyText).toContain('- Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1');
    expect(row.bodyText).toContain('Total to collect: $68.00');
    expect(row.bodyText).toContain(`${t.config.adminUrl}/orders/${o.id}`);
    expect(row.bodyHtml).toContain(`href="${t.config.adminUrl}/orders/${o.id}"`);
    expect(await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id })).toBeNull();
  });

  it('is controlled by notifications.onNewOrder and ignores the customer master switch', async () => {
    const o = await orderWithEmail();
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com', onNewOrder: false } });
    expect(await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id })).toBeNull();
    await t.ctx.settings.update({ notifications: { onNewOrder: true }, email: { enabled: false } });
    expect(await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id })).not.toBeNull();
  });

  it('HTML-escapes customer text in the founder alert too', async () => {
    const o = await orderWithEmail('a@example.com', '<b>Bold</b>');
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com' } });
    const q = await enqueueFounderNewOrderAlert(t.ctx, t.prisma, { orderId: o.id });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.bodyHtml).not.toContain('<b>Bold</b>');
    expect(row.bodyHtml).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });

  it('low-stock alert goes to the founder only when onLowStock and founderEmail are set', async () => {
    await buildWorld(t.prisma);
    const input = { itemType: 'STIMPIE' as const, itemId: 7, name: 'THE VOID', available: 4, threshold: 10 };
    expect(await enqueueLowStockAlert(t.ctx, t.prisma, input)).toBeNull();
    await t.ctx.settings.update({ notifications: { founderEmail: 'founder@example.com' } });
    const q = await enqueueLowStockAlert(t.ctx, t.prisma, input);
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.subject).toBe('Low stock: THE VOID (4 left)');
    expect(row.bodyText).toContain('/stock?tab=stimpies&highlight=7');
    await t.ctx.settings.update({ notifications: { onLowStock: false } });
    expect(await enqueueLowStockAlert(t.ctx, t.prisma, input)).toBeNull();
  });
});

describe('orders_lookup', () => {
  it('lists the 10 most recent orders, newest first, with date, status and total', async () => {
    await buildWorld(t.prisma);
    const orders = Array.from({ length: 12 }, (_, i) => ({ number: `STP-${2000 + i}`, placedAt: new Date(Date.UTC(2026, 9, 1 + i, 10)), status: 'DELIVERED', totalCents: 5800 }));
    const q = await enqueueOrdersLookupEmail(t.ctx, t.prisma, { to: 'rami@example.com', orders });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    const lines = row.bodyText.split('\n').filter((l) => l.startsWith('STP-'));
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe('STP-2011 - 12 Oct 2026 - Delivered - $58.00');
    expect(lines[9]).toBe('STP-2002 - 3 Oct 2026 - Delivered - $58.00');
    expect(row.bodyText).toContain(`${t.config.webUrl}/track`);
    expect(await enqueueOrdersLookupEmail(t.ctx, t.prisma, { to: 'rami@example.com', orders: [] })).toBeNull();
  });

  it('formats dates in the business timezone (23:30 UTC on 14 Oct is already 15 Oct in Beirut)', async () => {
    await buildWorld(t.prisma);
    const q = await enqueueOrdersLookupEmail(t.ctx, t.prisma, { to: 'r@example.com', orders: [{ number: 'STP-1', placedAt: new Date('2026-10-14T23:30:00Z'), status: 'OUT_FOR_DELIVERY', totalCents: 100 }] });
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row.bodyText).toContain('STP-1 - 15 Oct 2026 - Out for delivery - $1.00');
  });
});

describe('worker', () => {
  it('sends a due row through the transport with the sender and reply-to from settings, then marks it SENT', async () => {
    const o = await orderWithEmail();
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    await t.ctx.settings.update({ email: { senderName: 'Stimpy "HQ"', senderAddress: 'shop@example.com', replyTo: 'owner@example.com' } });
    const res = await jobs.emailWorker(t.ctx);
    expect(res).toEqual({ sent: 1, failed: 0, retried: 0 });
    expect(t.transport.sent).toHaveLength(1);
    expect(t.transport.sent[0]).toMatchObject({ to: 'rami@example.com', subject: 'We got your order STP-1042', from: '"Stimpy HQ" <shop@example.com>', replyTo: 'owner@example.com' });
    expect(t.transport.sent[0]!.html).toContain('<!doctype html>');
    const row = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, error: null });
    expect(row.sentAt).not.toBeNull();
    expect((await jobs.emailWorker(t.ctx)).sent).toBe(0); // nothing sent twice
  });

  it('takes at most 20 rows per run', async () => {
    await buildWorld(t.prisma);
    for (let i = 0; i < 25; i++) await enqueueEmail(t.ctx, t.prisma, { to: `u${i}@example.com`, template: 'custom', custom: { subject: 's', body: 'b' } });
    expect((await processDueEmails(t.ctx)).sent).toBe(20);
    expect((await processDueEmails(t.ctx)).sent).toBe(5);
  });

  it('retries at +1, +5, +30 minutes and is FAILED after the 4th failed attempt (fake clock)', async () => {
    const start = freezeTime('2026-10-14T10:00:00Z');
    const o = await orderWithEmail();
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    t.transport.failWith = new Error('SMTP down');
    const row = () => t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });

    expect(await processDueEmails(t.ctx)).toEqual({ sent: 0, failed: 0, retried: 1 });
    let r = await row();
    expect(r).toMatchObject({ status: 'PENDING', attempts: 1, error: 'SMTP down' });
    expect(r.nextAttemptAt).toEqual(addMs(start, 1 * MINUTE));

    advanceTime(59_000); // not due yet
    expect(await processDueEmails(t.ctx)).toEqual({ sent: 0, failed: 0, retried: 0 });
    expect((await row()).attempts).toBe(1);

    advanceTime(1_000); // +1 min
    expect((await processDueEmails(t.ctx)).retried).toBe(1);
    r = await row();
    expect(r.attempts).toBe(2);
    expect(r.nextAttemptAt).toEqual(addMs(start, 6 * MINUTE)); // now(+1m) + 5 min

    advanceTime(5 * MINUTE);
    expect((await processDueEmails(t.ctx)).retried).toBe(1);
    r = await row();
    expect(r.attempts).toBe(3);
    expect(r.nextAttemptAt).toEqual(addMs(start, 36 * MINUTE)); // now(+6m) + 30 min

    advanceTime(30 * MINUTE);
    expect(await processDueEmails(t.ctx)).toEqual({ sent: 0, failed: 1, retried: 0 });
    r = await row();
    expect(r).toMatchObject({ status: 'FAILED', attempts: 4, error: 'SMTP down' });

    advanceTime(24 * 60 * MINUTE);
    expect(await processDueEmails(t.ctx)).toEqual({ sent: 0, failed: 0, retried: 0 }); // FAILED rows are never picked up
    expect(t.transport.sent).toHaveLength(0);
  });

  it('succeeds on a retry once the transport recovers, and the order is never touched by a failure', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const o = await orderWithEmail();
    const before = await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    const q = await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    t.transport.failWith = new Error('boom');
    await processDueEmails(t.ctx);
    t.transport.failWith = null;
    advanceTime(MINUTE);
    expect((await processDueEmails(t.ctx)).sent).toBe(1);
    expect(await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } })).toMatchObject({ status: 'SENT', attempts: 2, error: null });
    expect(await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).toEqual(before);
  });

  it('two workers running at the same time send each message exactly once', async () => {
    await buildWorld(t.prisma);
    for (let i = 0; i < 8; i++) await enqueueEmail(t.ctx, t.prisma, { to: `u${i}@example.com`, template: 'custom', custom: { subject: 's', body: 'b' } });
    const [a, b] = await Promise.all([processDueEmails(t.ctx), processDueEmails(t.ctx)]);
    expect(a.sent + b.sent).toBe(8);
    expect(t.transport.sent).toHaveLength(8);
    expect(new Set(t.transport.sent.map((m) => m.to)).size).toBe(8);
  });

  it('the master switch does not stop an already queued message; error text is truncated to 500 chars', async () => {
    await buildWorld(t.prisma);
    const q = await enqueueEmail(t.ctx, t.prisma, { to: 'a@example.com', template: 'custom', custom: { subject: 's', body: 'b' } });
    await t.ctx.settings.update({ email: { enabled: false } });
    t.transport.failWith = new Error('x'.repeat(900));
    await processDueEmails(t.ctx);
    const r = await t.prisma.emailLog.findUniqueOrThrow({ where: { id: q!.id } });
    expect(r.error).toHaveLength(500);
  });
});

describe('real SMTP into Mailpit', () => {
  it('delivers a complete multipart message with the right headers', async () => {
    expect(await mailpitAvailable(), 'Mailpit must be running: npm run infra:up').toBe(true);
    const to = `wpc-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    await mailpitClear({ to });
    const o = await orderWithEmail(to, 'Rami <b>Haddad</b>');
    await enqueueOrderEmail(t.ctx, t.prisma, { orderId: o.id, template: 'order_received' });
    const ctx = { ...t.ctx, emailTransport: createSmtpTransport(t.config.smtp) };
    expect(await processDueEmails(ctx)).toEqual({ sent: 1, failed: 0, retried: 0 });
    const [summary] = await mailpitWaitFor(to);
    const msg = await mailpitMessage(summary!.ID);
    expect(msg.Subject).toBe('We got your order STP-1042');
    expect(msg.To[0]!.Address).toBe(to);
    expect(msg.ReplyTo[0]!.Address).toBe('info@stimpylb.com');
    expect(summary!.From.Address).toBe('info@stimpylb.com');
    expect(summary!.From.Name).toBe('Stimpy');
    expect(msg.Text).toContain('Hi Rami <b>Haddad</b>,');
    expect(msg.Text).toContain('Total to pay at the door: $68.00');
    expect(msg.HTML).toContain('Hi Rami &lt;b&gt;Haddad&lt;/b&gt;,');
    expect(msg.HTML).not.toContain('<b>Haddad</b>');
    expect(msg.HTML).toContain('Track your order');
    await mailpitClear({ to });
  });
});

describe('whatsapp helpers', () => {
  it('builds a wa.me link to the order whatsapp number with the encoded, filled template', async () => {
    await buildWorld(t.prisma);
    const o = await makeOrder(t.prisma, { number: 'STP-1042', customerName: 'Rami & Co', phone: '+96103123456', whatsapp: '+96171123456', items: PACK_ITEMS });
    const wa = await buildOrderWhatsapp(t.ctx, t.prisma, { orderId: o.id, template: 'order_confirmation' });
    expect(wa.to).toBe('+96171123456');
    expect(wa.text).toBe(
      "Hi Rami & Co, this is Stimpy. We received your order STP-1042: - Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1\n- THE DREAMER x2. Total $68.00, cash on delivery. Can you confirm your address and that you'd like us to prepare it?",
    );
    expect(wa.url).toBe(`https://wa.me/96171123456?text=${encodeURIComponent(wa.text)}`);
    expect(wa.url).toContain('Rami%20%26%20Co');
    await t.prisma.order.update({ where: { id: o.id }, data: { deliveryNumber: 'D-1' } });
    expect((await buildOrderWhatsapp(t.ctx, t.prisma, { orderId: o.id, template: 'out_for_delivery' })).text).toBe('Hi Rami & Co, your order STP-1042 is out for delivery (delivery number D-1). Total to pay: $68.00.');
    await expect(buildOrderWhatsapp(t.ctx, t.prisma, { orderId: o.id, template: 'nope' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('customer confirmation link is null until the business number is set, then uses the fixed text', async () => {
    await buildWorld(t.prisma);
    const input = { orderNumber: 'STP-1042', customerName: 'Rami', totalCents: 5800, items: [{ name: 'Hoodie', qty: 1, detail: { color: 'Black', size: 'M' } }] };
    expect(await customerConfirmationWhatsappUrl(t.ctx, input)).toBeNull();
    await t.ctx.settings.update({ business: { whatsappNumber: '03 123 456' } });
    const url = await customerConfirmationWhatsappUrl(t.ctx, input);
    expect(url).toBe(`https://wa.me/9613123456?text=${encodeURIComponent('Hi Stimpy, I just placed order STP-1042: - Hoodie (Black, M) x1. Total $58.00. My name is Rami.')}`);
  });
});
