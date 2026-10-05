import { topUpStock } from './helpers';
import { expect, test } from '@playwright/test';
import {
  AdminClient,
  API,
  WEB,
  addPackViaUi,
  addStimpieViaUi,
  adminOrderId,
  cartWithStimpie,
  expectNoHorizontalScroll,
  fillCheckout,
  gotoSettled,
  mailFor,
  placeOrderViaApi,
  setStatus,
  shot,
  spoofIp,
  submitAndWaitForThanks,
  uniqueCustomer,
  waitForMail,
  watchConsole,
} from './helpers';

test.beforeAll(async () => {
  test.setTimeout(90_000);
  await topUpStock();
});
test.beforeEach(async ({ page }) => {
  await spoofIp(page);
});

const storedCart = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('stimpy.cart') ?? 'null'));

test.describe('cart persistence and drawer', () => {
  test('cart persists across reload; corrupt storage resets to empty without an error screen (QA 1, 5)', async ({ page }) => {
    const c = watchConsole(page, { ignoreFailedResourceLoads: false });
    await addStimpieViaUi(page, 'after-dark');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();
    await expect.poll(() => storedCart(page)).not.toBeNull();
    await page.reload();
    await expect(page).toHaveURL(/\/shop\/stimpie\/after-dark$/);
    await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();
    await page.waitForLoadState('networkidle'); // let the reloaded page finish hydrating before navigating away
    c.assertClean();
    await page.evaluate(() => localStorage.setItem('stimpy.cart', '{this is not json'));
    await gotoSettled(page, '/checkout');
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.setItem('stimpy.cart', JSON.stringify({ v: 99, lines: [] })));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
    c.assertClean();
  });

  test('a cart older than 30 days is cleared with a toast; 10 days old is kept (QA 6)', async ({ page }) => {
    await addStimpieViaUi(page, 'after-dark');
    await page.keyboard.press('Escape');
    await expect.poll(() => storedCart(page)).not.toBeNull();
    const setAge = (days: number) =>
      page.evaluate((d) => {
        const cart = JSON.parse(localStorage.getItem('stimpy.cart')!);
        cart.updatedAt = new Date(Date.now() - d * 86_400_000).toISOString();
        localStorage.setItem('stimpy.cart', JSON.stringify(cart));
      }, days);
    await setAge(10);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();
    await setAge(31);
    await page.reload();
    await expect(page.getByText('Your cart was cleared because it was old.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible();
  });

  test('two tabs: a change in one updates the other (QA 7)', async ({ page, context }) => {
    await gotoSettled(page, '/shop');
    const other = await context.newPage();
    await other.goto('/shop');
    await expect(other.getByRole('button', { name: 'Cart, 0 items' })).toBeVisible();
    await addStimpieViaUi(page, 'after-dark');
    await page.keyboard.press('Escape');
    await expect(other.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible({ timeout: 10_000 });
  });

  test('storage blocked: the cart still works in memory and a one-time notice appears (QA 8)', async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { get: boom, configurable: true });
    });
    await gotoSettled(page, '/shop/stimpie/after-dark');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
    await expect(drawer.getByText("Your cart won't be saved if you close this tab.")).toBeVisible({ timeout: 5000 });
    // in-page navigation keeps the in-memory cart
    await drawer.getByRole('link', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await expect(page.getByTestId('cart-line')).toHaveCount(1);
  });

  test('drawer: Edit re-opens the composer pre-filled and saves the change into the same line', async ({ page }, info) => {
    await addPackViaUi(page, { color: 'Black', size: 'L', stimpies: ['THE VOID', 'AFTER DARK'] });
    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer.getByTestId('cart-line')).toContainText('Black / L');
    await drawer.getByRole('button', { name: /^Edit Hoodie \+ 2 Stimpies/ }).click();
    const modal = page.getByRole('dialog', { name: /Change Hoodie \+ 2 Stimpies/ });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('radio', { name: /^Black/ })).toBeChecked();
    await expect(modal.getByRole('radio', { name: /^L\b/ })).toBeChecked();
    await modal.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: /^M\b/ }).dispatchEvent('click');
    await shot(page, info, 'edit-line-modal', { fullPage: false });
    await modal.getByRole('button', { name: 'Save changes' }).click();
    await expect(modal).toBeHidden();
    await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
    await expect(drawer.getByTestId('cart-line')).toContainText('Black / M');
    expect((await storedCart(page)).lines[0].item).toMatchObject({ kind: 'pack', sizeId: expect.any(Number), qty: 1 });
  });

  test('reduced motion: drawer, checkout and ordering work with prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const c = watchConsole(page);
    const me = uniqueCustomer('rm');
    await cartWithStimpie(page, 'after-dark');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    await submitAndWaitForThanks(page);
    c.assertClean();
  });
});

test.describe('confirmation and tracking', () => {
  test('confirmation opened in another browser: reduced view with Track, no items or personal data (QA 34)', async ({ page, browser }, info) => {
    const me = uniqueCustomer('thx');
    await cartWithStimpie(page, 'the-eye');
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    const number = await submitAndWaitForThanks(page);
    const fresh = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL: info.project.use.baseURL });
    const p = await fresh.newPage();
    await spoofIp(p);
    await gotoSettled(p, `/order/${number}/thanks`);
    await expect(p.getByTestId('thanks-reduced')).toBeVisible();
    await expect(p.getByText("We can't show the full details here. Track your order with your phone number.")).toBeVisible();
    await expect(p.locator('body')).not.toContainText(me.email);
    await expect(p.locator('body')).not.toContainText('THE EYE');
    await shot(p, info, 'confirmation-reduced');
    await p.getByTestId('track-this-order').click();
    await expect(p.getByLabel(/^Order number/)).toHaveValue(number);
    await p.getByLabel(/^Phone/).fill(me.phone);
    await p.getByTestId('track-submit').click();
    await expect(p.getByTestId('track-heading')).toContainText(number);
    // an invalid number in the URL is a real 404
    const invalidRoute = { responses: [] as Array<{ path: string; status: number; cache: string | null }>, requestFailures: [] as string[], consoleErrors: [] as string[], pageErrors: [] as string[] };
    p.on('response', (response) => {
      if (response.request().resourceType() === 'document' && response.url().includes('/order/')) {
        invalidRoute.responses.push({ path: new URL(response.url()).pathname, status: response.status(), cache: response.headers()['x-nextjs-cache'] ?? null });
      }
    });
    p.on('requestfailed', (request) => invalidRoute.requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'failed'}`));
    p.on('console', (message) => { if (message.type() === 'error') invalidRoute.consoleErrors.push(message.text()); });
    p.on('pageerror', (error) => invalidRoute.pageErrors.push(error.message));
    const invalidResponse = await p.goto('/order/abc%20def%21/thanks', { waitUntil: 'domcontentloaded' });
    await p.waitForLoadState('networkidle');
    invalidRoute.responses.push({ path: new URL(p.url()).pathname, status: invalidResponse?.status() ?? 0, cache: invalidResponse?.headers()['x-nextjs-cache'] ?? null });
    try {
      await expect(p.getByRole('heading', { name: /isn.t here/ })).toBeVisible();
    } catch (error) {
      await info.attach('invalid-order-route-diagnostics', { body: Buffer.from(JSON.stringify(invalidRoute, null, 2)), contentType: 'application/json' });
      throw error;
    }
    await expect(p.getByTestId('order-number')).toHaveCount(0);
    await fresh.close();
  });

  test('wrong phone and unknown order give the identical message; cancelled and returned orders render their banners; screenshots', async ({ page }, info) => {
    const c = watchConsole(page);
    const admin = await AdminClient.shared();
    const me = uniqueCustomer('trk');
    const number = await placeOrderViaApi(me, 3);
    await gotoSettled(page, '/track');
    await shot(page, info, 'track-idle');
    await expectNoHorizontalScroll(page);

    const lookup = async (order: string, phone: string) => {
      await page.getByLabel(/^Order number/).fill(order);
      await page.getByLabel(/^Phone/).fill(phone);
      await page.getByTestId('track-submit').click();
    };
    await lookup(number, '70 999 888');
    const wrongPhone = await page.getByTestId('track-not-found').innerText();
    await expect(page.getByLabel(/^Order number/)).toHaveValue(number); // fields stay filled
    await expect(page.getByLabel(/^Phone/)).toHaveValue('70 999 888');
    await lookup('STP-999999', me.phone);
    expect(await page.getByTestId('track-not-found').innerText()).toBe(wrongPhone);
    expect(wrongPhone).toContain("We couldn't find an order with those details.");
    await shot(page, info, 'track-not-found');

    // formats: STP-n, stp-n and n all find the same order
    const bare = number.replace(/^STP-/, '');
    for (const typed of [number, number.toLowerCase(), bare]) {
      await gotoSettled(page, '/track');
      await lookup(typed, me.phone);
      await expect(page.getByTestId('track-heading')).toContainText(`order ${number}`);
    }

    // cancelled
    const id = await adminOrderId(admin, number);
    await setStatus(admin, id, 'CANCELLED', { cancelReason: 'Customer asked' });
    await gotoSettled(page, '/track');
    await lookup(number, me.phone);
    await expect(page.getByTestId('track-terminal')).toContainText('This order was cancelled.');
    await expect(page.getByRole('list', { name: 'Order progress' })).not.toContainText('Delivered');
    await shot(page, info, 'track-cancelled');

    // returned (a second order through the whole lifecycle)
    const me2 = uniqueCustomer('trk2');
    const n2 = await placeOrderViaApi(me2, 3);
    const id2 = await adminOrderId(admin, n2);
    for (const to of ['CONFIRMED', 'PACKED']) await setStatus(admin, id2, to);
    await setStatus(admin, id2, 'OUT_FOR_DELIVERY', { deliveryNumber: 'D-5001' });
    await setStatus(admin, id2, 'DELIVERED');
    await setStatus(admin, id2, 'RETURNED');
    await gotoSettled(page, '/track');
    await page.getByLabel(/^Order number/).fill(n2);
    await page.getByLabel(/^Phone/).fill(me2.phone);
    await page.getByTestId('track-submit').click();
    await expect(page.getByTestId('track-terminal')).toContainText('This order was returned.');
    await shot(page, info, 'track-returned');
    await expectNoHorizontalScroll(page);
    c.assertClean();
  });

  test('repeated wrong lookups hit RATE_LIMITED with a visible wait and a disabled button (QA 43)', async ({ page }) => {
    const ip = '10.77.88.99';
    await spoofIp(page, ip);
    for (let i = 0; i < 20; i++) {
      await fetch(`${API}/api/v1/orders/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: WEB, 'X-Forwarded-For': ip },
        body: JSON.stringify({ orderNumber: 'STP-1', phone: '03 123 456' }),
      });
    }
    await gotoSettled(page, '/track');
    await page.getByLabel(/^Order number/).fill('STP-1');
    await page.getByLabel(/^Phone/).fill('03 123 456');
    await page.getByTestId('track-submit').click();
    await expect(page.getByTestId('track-rate-limited')).toContainText(/Too many tries\. Please wait \d+ seconds\./);
    await expect(page.getByTestId('track-submit')).toBeDisabled();
  });

  test('lost order number: known and unknown emails look identical; the known one receives the mail (QA 42)', async ({ page }) => {
    const me = uniqueCustomer('lost');
    const number = await placeOrderViaApi(me, 3);
    await gotoSettled(page, '/track');
    await page.getByTestId('lost-number-toggle').click();
    const form = page.getByTestId('lost-number-form');
    await form.getByLabel(/^Email/).fill(me.email);
    await form.getByRole('button', { name: /Email me/ }).click();
    const known = await page.getByTestId('lost-number-message').innerText();
    expect(known).toBe("If we found orders for this email, we've emailed you the order numbers.");

    await gotoSettled(page, '/track');
    await page.getByTestId('lost-number-toggle').click();
    const stranger = `nobody-${Date.now().toString(36)}@fw2.example.com`;
    await page.getByTestId('lost-number-form').getByLabel(/^Email/).fill(stranger);
    await page.getByTestId('lost-number-form').getByRole('button', { name: /Email me/ }).click();
    await expect(page.getByTestId('lost-number-message')).toHaveText(known);

    const mail = await waitForMail(me.email, /order numbers|your orders|orders/i, 60_000).catch(async () => {
      const subjects = (await mailFor(me.email)).map((m) => m.Subject);
      throw new Error(`no lookup mail; subjects: ${subjects.join(' | ')}`);
    });
    expect(mail.Subject).not.toContain('We got your order');
    expect((await mailFor(stranger)).length).toBe(0);
    void number;
  });
});
