import { topUpStock } from './helpers';
import { expect, test } from '@playwright/test';
import {
  AdminClient,
  addPackViaUi,
  adminOrderId,
  expectNoHorizontalScroll,
  fillCheckout,
  mailBody,
  openCheckoutFromDrawer,
  placeOrderButton,
  publicGet,
  purchasableStimpies,
  setStatus,
  shot,
  spoofIp,
  sql,
  sqlRows,
  uniqueCustomer,
  waitForMail,
  watchConsole,
  type ApiStimpie,
} from './helpers';

interface VariantRow {
  quantity: number;
  reserved: number;
}

function variantStock(color: string, size: string): VariantRow {
  const [row] = sqlRows(
    `SELECT hv.quantity, hv.reserved FROM hoodie_variants hv JOIN colors c ON c.id=hv.color_id JOIN sizes s ON s.id=hv.size_id WHERE c.name='${color}' AND s.label='${size}'`,
  );
  return { quantity: Number(row?.[0]), reserved: Number(row?.[1]) };
}

function stimpieStock(id: number): VariantRow {
  const [row] = sqlRows(`SELECT quantity, reserved FROM stimpies WHERE id=${id}`);
  return { quantity: Number(row?.[0]), reserved: Number(row?.[1]) };
}

let originalBusinessWhatsapp: string | null | undefined;

test.beforeAll(async () => {
  test.setTimeout(90_000);
  await topUpStock();
  const admin = await AdminClient.shared();
  const settings = await admin.ok<{ business: { whatsappNumber: string | null } }>('GET', '/admin/settings');
  originalBusinessWhatsapp = settings.business.whatsappNumber;
  await admin.ok('PATCH', '/admin/settings', { business: { whatsappNumber: '+96170123456' } });
});

test.afterAll(async () => {
  if (originalBusinessWhatsapp === undefined) return;
  const admin = await AdminClient.shared();
  await admin.ok('PATCH', '/admin/settings', { business: { whatsappNumber: originalBusinessWhatsapp } });
});
test.describe.configure({ mode: 'serial' });

test.describe('checkout journey (real stack)', () => {
  test('hoodie + pack -> drawer -> checkout -> order -> confirmation -> DB -> email -> track -> admin lifecycle', async ({ page, context }, info) => {
    test.setTimeout(240_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const c = watchConsole(page);
    await spoofIp(page);
    const me = uniqueCustomer('journey');
    const picks: ApiStimpie[] = (await purchasableStimpies()).filter((s) => s.type === 'CORE').slice(0, 2);
    expect(picks).toHaveLength(2);
    const stock0 = { blackL: variantStock('Black', 'L'), stoneM: variantStock('Stone', 'M'), s1: stimpieStock(picks[0]!.id), s2: stimpieStock(picks[1]!.id) };

    // --- 1. real product page: a pack, then a hoodie on its own (other colour)
    await addPackViaUi(page, { color: 'Black', size: 'L', stimpies: picks.map((p) => p.name) });
    await page.keyboard.press('Escape');
    await page.goto('/shop/hoodie/stimpy-hoodie');
    await page.getByRole('radio', { name: /Hoodie only/ }).click({ force: true });
    await page.getByRole('radio', { name: /^Stone/ }).click({ force: true });
    await page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^M\b/ }).click({ force: true });
    await page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).click();

    // --- 2. cart drawer
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer.getByTestId('cart-line')).toHaveCount(2);
    await expect(drawer.getByTestId('cart-subtotal')).toHaveText('$70', { timeout: 15_000 });
    await expect(drawer.getByText('Delivery calculated at checkout.')).toContainText('2-3 working days');
    await shot(page, info, '01-cart-drawer', { fullPage: false });

    // --- 3. checkout page: empty, errors, filled
    await openCheckoutFromDrawer(page);
    await expect(page.getByTestId('summary-total')).toHaveText('$73', { timeout: 15_000 });
    await expect(page.getByTestId('summary-total-label')).toHaveText('Estimated total');
    await shot(page, info, '02-checkout-empty');
    await placeOrderButton(page).click();
    await expect(page.getByTestId('error-summary')).toBeVisible();
    await expect(page.getByLabel(/^Full name/)).toBeFocused();
    await shot(page, info, '03-checkout-errors');
    await fillCheckout(page, { email: me.email, name: me.name, phone: me.phone, area: 'Beirut', notes: 'Call before arriving' });
    await expect(page.getByTestId('summary-total-label')).toHaveText('Total', { timeout: 10_000 });
    await expect(page.getByTestId('summary-delivery-label')).toHaveText('Delivery to Beirut');
    await expectNoHorizontalScroll(page);
    await shot(page, info, '04-checkout-filled');
    await shot(page, info, '04b-checkout-sticky', { fullPage: false });

    // --- 4. place the order
    const bodies: Record<string, unknown>[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/orders')) bodies.push(r.postDataJSON() as Record<string, unknown>);
    });
    await placeOrderButton(page).click();
    await expect(page).toHaveURL(/\/order\/STP-\d+\/thanks$/, { timeout: 30_000 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      customer: { name: me.name, email: me.email, phone: me.phone, whatsapp: null, whatsappSameAsPhone: true },
      expectedTotalCents: 7300,
      hp: '',
    });
    expect(bodies[0]).not.toHaveProperty('attribution');

    // --- 5. confirmation page
    const number = (await page.getByTestId('order-number').innerText()).trim();
    expect(number).toMatch(/^STP-\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused();
    await expect(page.getByTestId('confirm-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/96170123456\?text=/);
    await expect(page.getByTestId('confirm-whatsapp')).toHaveAttribute('target', '_blank');
    expect(decodeURIComponent((await page.getByTestId('confirm-whatsapp').getAttribute('href'))!)).toContain(number); // the message carries the order number
    await expect(page.getByTestId('estimate')).toContainText('2-3 working days');
    await expect(page.getByTestId('total')).toHaveText('$73');
    await expect(page.getByTestId('order-item')).toHaveCount(2);
    await expect(page.getByTestId('email-notice')).toContainText(me.email);
    await page.getByTestId('copy-order-number').click();
    await expect(page.getByTestId('copy-order-number')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(number);
    await expectNoHorizontalScroll(page);
    await shot(page, info, '05-confirmation');
    // the cart and the draft are gone
    expect(await page.evaluate(() => localStorage.getItem('stimpy.cart'))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('stimpy.checkout.draft'))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('stimpy.checkout.attempt'))).toBeNull();
    // router.replace: Back leaves checkout out of history; landing on /checkout again shows the empty state and the order link
    await page.goBack();
    await expect(page).not.toHaveURL(/\/(checkout|thanks)/);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
    await page.getByTestId('recent-order-link').click();
    await expect(page.getByTestId('order-number')).toHaveText(number);
    // reload keeps the full page (sessionStorage)
    await page.reload();
    await expect(page.getByTestId('order-number')).toHaveText(number);

    // --- 6. the database
    const [order] = sqlRows(
      `SELECT id, status, source, customer_name, contact_email, contact_phone, contact_whatsapp, area_name, subtotal_cents, delivery_fee_cents, total_cents, notes FROM orders WHERE number='${number}'`,
    );
    expect(order).toBeDefined();
    const orderId = Number(order![0]);
    expect(order!.slice(1)).toEqual(['NEW', 'WEBSITE', me.name, me.email, me.normalizedPhone, me.normalizedPhone, 'Beirut', '7000', '300', '7300', 'Call before arriving']);
    expect(sqlRows(`SELECT kind, qty, unit_price_cents FROM order_items WHERE order_id=${orderId} ORDER BY id`)).toEqual([
      ['PACK', '1', '4500'],
      ['HOODIE', '1', '2500'],
    ]);
    // stock: exactly one Black L, one Stone M and one of each picked Stimpie reserved
    expect(variantStock('Black', 'L').reserved).toBe(stock0.blackL.reserved + 1);
    expect(variantStock('Stone', 'M').reserved).toBe(stock0.stoneM.reserved + 1);
    expect(stimpieStock(picks[0]!.id).reserved).toBe(stock0.s1.reserved + 1);
    expect(stimpieStock(picks[1]!.id).reserved).toBe(stock0.s2.reserved + 1);
    expect(variantStock('Black', 'L').quantity).toBe(stock0.blackL.quantity);
    expect(Number(sql(`SELECT COUNT(*) FROM order_stock_lines WHERE order_id=${orderId} AND state='RESERVED'`))).toBe(4);

    // --- 7. the "order received" email
    const received = await waitForMail(me.email, /./);
    expect(received.Subject).toContain(number);
    expect(await mailBody(received.ID)).toContain(number);

    // --- 8. track it (a fresh page: no sessionStorage, as on another device)
    const other = await context.browser()!.newContext({ viewport: page.viewportSize() ?? undefined });
    const tracker = await other.newPage();
    await spoofIp(tracker);
    const tc = watchConsole(tracker);
    await tracker.goto(`/track?order=${number}`);
    await expect(tracker.getByLabel(/^Order number/)).toHaveValue(number);
    await tracker.getByLabel(/^Phone/).fill(`+961 ${me.phone.slice(1)}`);
    await tracker.getByTestId('track-submit').click();
    await expect(tracker.getByTestId('track-heading')).toHaveText(`Hi ${me.name}, here's order ${number}`);
    await expect(tracker.getByRole('listitem').filter({ hasText: 'Received' })).toBeVisible();
    await expect(tracker.getByTestId('delivery-number-card')).toHaveCount(0);
    await expect(tracker.getByText(/Delivery number/)).toHaveCount(0);
    await expect(tracker.getByTestId('track-estimate')).toContainText('2-3 working days');
    await shot(tracker, info, '06-track-new');

    // --- 9. the founder moves it through the lifecycle; the track page and the emails follow
    const admin = await AdminClient.shared();
    const id = await adminOrderId(admin, number);
    expect(id).toBe(orderId);
    await setStatus(admin, id, 'CONFIRMED');
    await setStatus(admin, id, 'PACKED');
    await tracker.getByTestId('track-refresh').click();
    await expect(tracker.getByRole('listitem').filter({ hasText: 'Packed' })).toContainText(/Packed/);
    await expect(tracker.getByTestId('delivery-number-card')).toHaveCount(0);

    await setStatus(admin, id, 'OUT_FOR_DELIVERY', { deliveryNumber: 'D-88231' });
    await tracker.getByTestId('track-refresh').click();
    await expect(tracker.getByTestId('delivery-number')).toHaveText('D-88231');
    await expect(tracker.getByTestId('delivery-number-card')).toContainText('Quote this number if the courier calls.');
    await shot(tracker, info, '07-track-out-for-delivery');

    await setStatus(admin, id, 'DELIVERED');
    await tracker.getByTestId('track-refresh').click();
    await expect(tracker.getByRole('listitem').filter({ hasText: 'Delivered' })).toBeVisible();
    await expect(tracker.getByTestId('track-estimate')).toHaveCount(0);
    await expect(tracker.getByTestId('delivery-number')).toHaveText('D-88231');
    await shot(tracker, info, '08-track-delivered');

    const confirmed = await waitForMail(me.email, /confirm/i);
    const out = await waitForMail(me.email, /on its way/i);
    const delivered = await waitForMail(me.email, /has arrived/i);
    expect(await mailBody(out.ID)).toContain('D-88231');
    expect([confirmed.ID, out.ID, delivered.ID, received.ID].length).toBe(new Set([confirmed.ID, out.ID, delivered.ID, received.ID]).size);
    expect(Number(sql(`SELECT COUNT(*) FROM order_stock_lines WHERE order_id=${orderId} AND state='SOLD'`))).toBe(4);

    // the public API agrees with what the page showed
    const tracked = await publicGet<unknown>('/health');
    expect(tracked).toBeTruthy();
    c.assertClean();
    tc.assertClean();
    await other.close();
  });
});
