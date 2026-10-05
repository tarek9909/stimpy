import { topUpStock } from './helpers';
import { expect, test, type Page } from '@playwright/test';
import {
  cartWithStimpie,
  fillCheckout,
  orderCountFor,
  placeOrderButton,
  recordOrders,
  shot,
  spoofIp,
  sql,
  sqlRows,
  snapshotStimpie,
  submitAndWaitForThanks,
  uniqueCustomer,
  watchConsole,
} from './helpers';

const stimpieId = (slug: string) => Number(sql(`SELECT id FROM stimpies WHERE slug='${slug}'`));
const reservedOf = (id: number) => Number(sql(`SELECT reserved FROM stimpies WHERE id=${id}`));

async function readyCheckout(page: Page, slug: string, tag: string, qty = 1) {
  const me = uniqueCustomer(tag);
  await cartWithStimpie(page, slug, qty);
  await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
  await expect(page.getByTestId('summary-total-label')).toHaveText('Total', { timeout: 15_000 });
  await expect(page.getByText('Checking availability...')).toHaveCount(0);
  return me;
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  await topUpStock();
});
test.beforeEach(async ({ page }) => {
  await spoofIp(page);
});

test.describe('checkout failures and recovery', () => {
  test('SOLD_OUT between validate and submit: dialog names the item, nothing reserved, swap in an alternative, then order', async ({ page }, info) => {
    const c = watchConsole(page);
    const id = stimpieId('the-eye');
    const restore = snapshotStimpie(id);
    try {
      const me = await readyCheckout(page, 'the-eye', 'sold');
      const reservedBefore = reservedOf(id);
      let fired = false;
      await page.route('**/api/v1/orders', async (route) => {
        if (!fired) {
          fired = true;
          sql(`UPDATE stimpies SET quantity = reserved WHERE id=${id}`); // someone else bought the last one
        }
        await route.fallback();
      });
      await placeOrderButton(page).click();
      const dialog = page.getByRole('dialog', { name: 'Sorry, THE EYE just sold out.' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Nothing was charged and nothing was reserved.');
      await expect(dialog.getByTestId('sold-out-list')).toContainText('THE EYE just sold out.');
      await expect(dialog.getByTestId('stimpie-alternatives').getByRole('button', { name: 'Swap in' })).toHaveCount(4);
      expect(reservedOf(id)).toBe(reservedBefore);
      expect(orderCountFor(me.email)).toBe(0);
      await shot(page, info, 'sold-out-dialog', { fullPage: false });
      // the line is already marked unavailable behind the dialog
      await dialog.getByTestId('stimpie-alternatives').getByRole('button', { name: 'Swap in' }).first().click();
      await expect(dialog.getByText('Updated.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Update my order' }).click();
      await expect(page.getByTestId('cart-line')).toHaveCount(1);
      await expect(page.getByTestId('cart-line')).not.toContainText('THE EYE');
      await expect(page.getByTestId('cart-line')).toHaveAttribute('data-state', 'OK', { timeout: 15_000 });
      await submitAndWaitForThanks(page);
      expect(orderCountFor(me.email)).toBe(1);
    } finally {
      restore();
    }
    c.assertClean();
  });

  test('SOLD_OUT for a hoodie size: dialog offers other sizes, switching fixes the cart', async ({ page }) => {
    const me = uniqueCustomer('hsold');
    await page.goto('/shop/hoodie/stimpy-hoodie');
    await page.getByRole('radio', { name: /Hoodie only/ }).click({ force: true });
    await page.getByRole('radio', { name: /^Stone/ }).click({ force: true });
    await page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^L\b/ }).click({ force: true });
    await page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).click();
    await page.keyboard.press('Escape');
    await page.goto('/checkout');
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    await expect(page.getByTestId('summary-total-label')).toHaveText('Total', { timeout: 15_000 });
    const [row] = sqlRows(`SELECT hv.id, hv.quantity FROM hoodie_variants hv JOIN colors c ON c.id=hv.color_id JOIN sizes s ON s.id=hv.size_id WHERE c.name='Stone' AND s.label='L'`);
    const [vid, qty] = [row![0], row![1]];
    try {
      let fired = false;
      await page.route('**/api/v1/orders', async (route) => {
        if (!fired) {
          fired = true;
          sql(`UPDATE hoodie_variants SET quantity = reserved WHERE id=${vid}`);
        }
        await route.fallback();
      });
      await placeOrderButton(page).click();
      const dialog = page.getByRole('dialog', { name: /Stone, L just sold out|Stimpy Hoodie, Stone, L/ });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('variant-alternatives').getByRole('button').first()).toBeVisible();
      await dialog.getByTestId('variant-alternatives').getByRole('button').first().click();
      await expect(dialog.getByText('Updated.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Update my order' }).click();
      await expect(page.getByTestId('cart-line')).not.toContainText('Stone / L');
      await submitAndWaitForThanks(page);
      expect(orderCountFor(me.email)).toBe(1);
    } finally {
      sql(`UPDATE hoodie_variants SET quantity=${qty} WHERE id=${vid}`);
    }
  });

  test('NOT_PURCHASABLE: dialog with the reason, line marked unavailable, submit blocked', async ({ page }) => {
    const id = stimpieId('the-cedar');
    const restore = snapshotStimpie(id);
    try {
      const me = await readyCheckout(page, 'the-cedar', 'np');
      let fired = false;
      await page.route('**/api/v1/orders', async (route) => {
        if (!fired) {
          fired = true;
          sql(`UPDATE stimpies SET active=0 WHERE id=${id}`);
        }
        await route.fallback();
      });
      await placeOrderButton(page).click();
      const dialog = page.getByRole('dialog', { name: "Some items can't be ordered right now" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('not-purchasable-list')).toContainText("THE CEDAR isn't available any more.");
      await dialog.getByRole('button', { name: 'Update my order' }).click();
      await expect(page.getByTestId('cart-line')).toHaveAttribute('data-state', 'UNAVAILABLE');
      await expect(placeOrderButton(page)).toBeDisabled();
      expect(orderCountFor(me.email)).toBe(0);
    } finally {
      restore();
    }
  });

  test('PRICE_CHANGED from the server: dialog shows the new grand total, confirm places the order with a new key', async ({ page }, info) => {
    const id = stimpieId('the-wave');
    const restore = snapshotStimpie(id);
    try {
      const me = await readyCheckout(page, 'the-wave', 'price');
      const seen = recordOrders(page);
      let fired = false;
      await page.route('**/api/v1/orders', async (route) => {
        if (!fired) {
          fired = true;
          sql(`UPDATE stimpies SET price_cents=1500 WHERE id=${id}`);
        }
        await route.fallback();
      });
      await placeOrderButton(page).click();
      const dialog = page.getByRole('dialog', { name: 'The price changed' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('price-old')).toHaveText('$13');
      await expect(dialog.getByTestId('price-new')).toHaveText('$18');
      await shot(page, info, 'price-changed-dialog', { fullPage: false });
      expect(seen).toHaveLength(1); // never auto-resubmitted
      await dialog.getByRole('button', { name: 'Place order for $18' }).click();
      await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
      expect(seen).toHaveLength(2);
      expect(seen[1]!.body.expectedTotalCents).toBe(1800);
      expect(seen[1]!.key).not.toBe(seen[0]!.key);
      expect(sql(`SELECT total_cents FROM orders WHERE contact_email='${me.email}'`)).toBe('1800');
    } finally {
      restore();
    }
  });

  test('price changed before the pre-submit validate: confirm dialog, no order request yet', async ({ page }) => {
    const id = stimpieId('the-orbit');
    const restore = snapshotStimpie(id);
    try {
      const me = await readyCheckout(page, 'the-orbit', 'price2');
      sql(`UPDATE stimpies SET price_cents=1100 WHERE id=${id}`);
      const seen = recordOrders(page);
      await placeOrderButton(page).click();
      const dialog = page.getByRole('dialog', { name: 'The price changed' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('price-new')).toHaveText('$14');
      expect(seen).toHaveLength(0);
      await dialog.getByRole('button', { name: 'Review order' }).click();
      await expect(page.getByTestId('summary-total')).toHaveText('$14');
      await expect(placeOrderButton(page)).toHaveText('Place order for $14');
      await placeOrderButton(page).click();
      await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
      expect(seen[0]!.body.expectedTotalCents).toBe(1400);
      expect(orderCountFor(me.email)).toBe(1);
    } finally {
      restore();
    }
  });

  test('unavailable lines block submission (drawer and checkout), nothing is sent', async ({ page }) => {
    const id = stimpieId('the-signal');
    const restore = snapshotStimpie(id);
    try {
      const me = await readyCheckout(page, 'the-signal', 'blocked');
      const seen = recordOrders(page);
      sql(`UPDATE stimpies SET quantity = reserved WHERE id=${id}`);
      await page.reload();
      await expect(page.getByTestId('cart-line')).toHaveAttribute('data-state', 'UNAVAILABLE', { timeout: 15_000 });
      await expect(page.getByTestId('line-notices')).toContainText('THE SIGNAL just sold out.');
      await expect(page.getByTestId('cart-line').locator('p').first()).toHaveClass(/line-through/);
      await expect(placeOrderButton(page)).toBeDisabled();
      await expect(page.getByTestId('summary-subtotal')).toHaveText('$0');
      // the drawer says the same and disables Checkout
      await page.getByRole('button', { name: /^Cart, / }).click();
      const drawer = page.getByRole('dialog', { name: 'Your cart' });
      await expect(drawer.getByTestId('checkout-blocked')).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'Checkout' })).toHaveAttribute('aria-disabled', 'true');
      expect(seen).toHaveLength(0);
      expect(orderCountFor(me.email)).toBe(0);
    } finally {
      restore();
    }
  });

  test('partial stock: quantity is lowered to what is left with a notice, then the cart validates clean', async ({ page }) => {
    const id = stimpieId('the-wave');
    const restore = snapshotStimpie(id);
    try {
      await page.goto('/shop/stimpie/the-wave');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await page.getByRole('dialog', { name: 'Your cart' }).getByRole('button', { name: 'Increase quantity' }).click();
      await expect(page.getByRole('dialog', { name: 'Your cart' }).getByRole('status', { name: 'Quantity 2' })).toBeVisible();
      sql(`UPDATE stimpies SET quantity = reserved + 1 WHERE id=${id}`);
      await page.reload();
      await page.getByRole('button', { name: /^Cart, / }).click();
      const drawer = page.getByRole('dialog', { name: 'Your cart' });
      await expect(drawer.getByRole('status', { name: 'Quantity 1' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Only 1 left, we updated your cart.').first()).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'Checkout' })).not.toHaveAttribute('aria-disabled', 'true');
    } finally {
      restore();
    }
  });

  test('RATE_LIMITED: banner counts down from retryAfterSeconds, button re-enables, same key reused', async ({ page }) => {
    const me = await readyCheckout(page, 'the-orbit', 'rate');
    const seen = recordOrders(page);
    let n = 0;
    await page.route('**/api/v1/orders', async (route) => {
      if (n++ === 0) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'Retry-After': '4', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After, X-Request-Id' },
          body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests.', details: { retryAfterSeconds: 4 }, requestId: 'r-1' } }),
        });
      } else await route.fallback();
    });
    await placeOrderButton(page).click();
    const banner = page.getByTestId('rate-limit-banner');
    await expect(banner).toContainText("You're doing that too fast. Try again in");
    const first = Number(await page.getByTestId('rate-countdown').innerText());
    expect(first).toBeLessThanOrEqual(4);
    expect(first).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('button', { name: /^Try again in \d+s$/ }).filter({ visible: true })).toBeDisabled();
    await expect(banner).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Place order' }).filter({ visible: true })).toBeEnabled();
    await placeOrderButton(page).click();
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(seen[1]!.key).toBe(seen[0]!.key);
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('500 with a request id: message ends with the support code, retry reuses the key', async ({ page }) => {
    const me = await readyCheckout(page, 'the-orbit', 'err500');
    const seen = recordOrders(page);
    let n = 0;
    await page.route('**/api/v1/orders', async (route) => {
      if (n++ === 0) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*', 'X-Request-Id': 'req-fw2-0001', 'Access-Control-Expose-Headers': 'X-Request-Id' },
          body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.', details: null, requestId: 'req-fw2-0001' } }),
        });
      } else await route.fallback();
    });
    await placeOrderButton(page).click();
    const panel = page.getByTestId('network-panel');
    await expect(panel).toContainText("We couldn't confirm your order");
    await expect(panel.getByTestId('request-id')).toHaveText('req-fw2-0001');
    await expect(panel.getByText('Track it with your phone number')).toBeVisible();
    await panel.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.key).toBe(seen[0]!.key);
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('network failure after the server accepted the order: Retry sends the same key and there is exactly one order', async ({ page }, info) => {
    const me = await readyCheckout(page, 'the-orbit', 'net');
    const seen = recordOrders(page);
    let n = 0;
    await page.route('**/api/v1/orders', async (route) => {
      if (n++ === 0) {
        await route.fetch(); // the order IS created on the server...
        await route.abort('connectionreset'); // ...but the browser never sees the answer
      } else await route.fallback();
    });
    await placeOrderButton(page).click();
    const panel = page.getByTestId('network-panel');
    await expect(panel).toContainText("You won't be charged twice");
    await expect(panel.getByTestId('support-line')).toHaveCount(0); // no response, no code
    expect(orderCountFor(me.email)).toBe(1);
    await shot(page, info, 'network-failure', { fullPage: false });
    await panel.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.key).toBe(seen[0]!.key);
    expect(orderCountFor(me.email)).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('stimpy.checkout.attempt'))).toBeNull();
  });

  test('a changed field after a failure sends a new Idempotency-Key', async ({ page }) => {
    const me = await readyCheckout(page, 'the-wave', 'newkey');
    const seen = recordOrders(page);
    let n = 0;
    await page.route('**/api/v1/orders', async (route) => {
      if (n++ === 0) await route.abort('connectionreset');
      else await route.fallback();
    });
    await placeOrderButton(page).click();
    await expect(page.getByTestId('network-panel')).toBeVisible();
    await page.getByLabel(/^Address/).fill('Another street, building 9');
    await placeOrderButton(page).click();
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(seen[1]!.key).not.toBe(seen[0]!.key);
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('server VALIDATION_ERROR on customer.email: message under the field, focus moves there, draft kept', async ({ page }) => {
    const me = await readyCheckout(page, 'the-orbit', 'veml');
    await page.route('**/api/v1/orders', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields: { 'customer.email': 'That email domain cannot receive mail.' }, details: null, requestId: 'r-2' } }),
      }),
    );
    await placeOrderButton(page).click();
    await expect(page.locator('#field-customer\\.email-error')).toHaveText('That email domain cannot receive mail.');
    await expect(page.getByLabel(/^Email/)).toBeFocused();
    await expect(page.getByLabel(/^Full name/)).toHaveValue(me.name);
    await expect(page.getByTestId('error-summary')).toContainText('That email domain cannot receive mail.');
  });

  test('slow connection: "Still working" appears after 8 s and the order completes once', async ({ page }) => {
    test.setTimeout(90_000);
    const me = await readyCheckout(page, 'the-orbit', 'slow');
    await page.route('**/api/v1/orders', async (route) => {
      await new Promise((r) => setTimeout(r, 9000));
      await route.fallback();
    });
    await placeOrderButton(page).click();
    await expect(page.getByRole('button', { name: 'Placing order...' }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Still working. Please don't close this page.").filter({ visible: true })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('offline: message, nothing sent, order works once the connection is back', async ({ page, context }) => {
    const me = await readyCheckout(page, 'the-orbit', 'offline');
    const seen = recordOrders(page);
    await context.setOffline(true);
    await placeOrderButton(page).click();
    await expect(page.getByTestId('offline-message')).toContainText("You're offline. Connect to place your order.");
    expect(seen).toHaveLength(0);
    await expect(page.getByTestId('support-line')).toHaveCount(0);
    await expect(page.getByLabel(/^Address/)).toHaveValue(/Main street/);
    await context.setOffline(false);
    await expect(page.getByTestId('offline-message')).toHaveCount(0);
    await placeOrderButton(page).click();
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('a hand-edited cart with a repeated Stimpie in a pack is flagged, not sent', async ({ page }) => {
    await page.goto('/shop/hoodie/stimpy-hoodie');
    await page.getByRole('radio', { name: /Hoodie \+ 2 Stimpies/ }).click({ force: true });
    await page.getByRole('radio', { name: /^Black/ }).click({ force: true });
    await page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^L\b/ }).click({ force: true });
    const picks = page.getByTestId('stimpie-picker').getByRole('button', { pressed: false });
    await picks.nth(0).click();
    await picks.nth(0).click();
    await page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stimpy.cart') !== null)).toBe(true);
    await page.evaluate(() => {
      const cart = JSON.parse(localStorage.getItem('stimpy.cart')!);
      cart.lines[0].item.stimpieIds = [cart.lines[0].item.stimpieIds[0], cart.lines[0].item.stimpieIds[0]];
      localStorage.setItem('stimpy.cart', JSON.stringify(cart));
    });
    const seen = recordOrders(page);
    await page.goto('/checkout');
    await expect(page.getByTestId('cart-line')).toHaveAttribute('data-state', 'UNAVAILABLE', { timeout: 15_000 });
    await expect(page.getByTestId('line-notices')).toContainText("This item isn't sold any more.");
    await expect(placeOrderButton(page)).toBeDisabled();
    expect(seen).toHaveLength(0);
  });
});
