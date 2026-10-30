import { expect, test, type Page } from '@playwright/test';
import { ADMIN, API, mysql } from '../runtime';
import {
  AdminClient, expectNoHorizontalScroll, fillCheckout, recordOrders, spoofIp,
  submitAndWaitForThanks, uniqueCustomer, watchConsole,
} from '../checkout/helpers';

type Offer = { id: number; slug: string; type: string; stimpieCount: number; priceCents: number };
let admin: AdminClient;
let seven: Offer;
let ten: Offer;

const storedItems = (page: Page) => page.evaluate(() => {
  const cart = JSON.parse(localStorage.getItem('stimpy.cart') ?? '{"lines":[]}');
  return cart.lines.map((line: { item: Record<string, unknown> }) => line.item);
});

test.beforeAll(async () => {
  admin = await AdminClient.shared();
  const stamp = Date.now();
  seven = await admin.ok<Offer>('POST', '/admin/packs', {
    type: 'STIMPIE_ONLY', name: `Audit seven ${stamp}`, stimpieCount: 7, priceCents: 4900,
    eligibleStimpieIds: null,
  });
  ten = await admin.ok<Offer>('POST', '/admin/packs', {
    type: 'STIMPIE_ONLY', name: `Audit ten ${stamp}`, stimpieCount: 10, priceCents: 6500,
    eligibleStimpieIds: null,
  });
});

test.afterAll(async () => {
  if (seven) await admin.ok('DELETE', `/admin/packs/${seven.id}`);
  if (ten) await admin.ok('DELETE', `/admin/packs/${ten.id}`);
});

test.beforeEach(async ({ page }) => { await spoofIp(page); });

test('all initial prices are visible; a custom ten-piece offer survives edit, reload and checkout without a hoodie', async ({ page }, info) => {
  const console = watchConsole(page);
  await page.goto(`/shop/stimpie-packs?pack=${ten.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Stimpies without the hoodie' })).toBeVisible();
  const offers = page.getByRole('combobox', { name: 'Stimpie-only offer' });
  for (const [count, price] of [[1, 12], [2, 20], [3, 27], [4, 32], [5, 38]]) {
    await expect(offers.locator('option').filter({ hasText: new RegExp(`^${count} Stimpies? · .*\\$${price}(?:\\.00)?$`) })).toHaveCount(1);
  }
  const quantity = page.getByRole('spinbutton', { name: 'THE VOID quantity', exact: true });
  await quantity.fill('10');
  await expect(page.getByTestId('stimpie-pack-progress-label')).toContainText('(10/10)');
  const share = await page.getByTestId('share-stimpie-set').getAttribute('href');
  expect(share).toContain('the-void%3A10');
  await page.goto(share!);
  await expect(quantity).toHaveValue('10');
  const controlsFit = await page.getByRole('button', { name: 'Increase THE VOID quantity', exact: true }).evaluate((button) => {
    const card = button.closest('li')!.getBoundingClientRect();
    const control = button.getBoundingClientRect();
    return control.right <= card.right && control.left >= card.left;
  });
  expect(controlsFit, 'quantity buttons must fit inside the product card').toBe(true);
  await page.screenshot({ path: info.outputPath('stimpie-offer.png'), fullPage: false });
  await expect(page.getByRole('radiogroup', { name: /colour|color|size/i })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Add Stimpie set to cart', exact: true }).click();
  let drawer = page.getByRole('dialog', { name: 'Your cart', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('cart-line')).toContainText('$65');
  await expect.poll(() => storedItems(page)).toEqual([
    { kind: 'stimpie_pack', packId: ten.id, stimpies: [{ stimpieId: expect.any(Number), qty: 10 }], qty: 1 },
  ]);
  await drawer.getByRole('button', { name: /^Edit / }).click();
  const editor = page.getByRole('dialog', { name: /^Change / });
  await expect(editor.getByRole('spinbutton', { name: 'THE VOID quantity', exact: true })).toHaveValue('10');
  await editor.getByRole('combobox', { name: 'Stimpie-only offer' }).selectOption(String(seven.id));
  await expect(editor.getByTestId('stimpie-pack-progress-label')).toContainText('(7/7)');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(drawer.getByTestId('cart-line')).toContainText('$49');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Cart, 1 item', exact: true }).click();
  drawer = page.getByRole('dialog', { name: 'Your cart', exact: true });
  await expect(drawer.getByTestId('cart-line')).toContainText('$49');
  await drawer.getByRole('link', { name: 'Checkout', exact: true }).click();
  const customer = uniqueCustomer('stimpie-offer');
  await fillCheckout(page, { email: customer.email, phone: customer.phone, area: 'Beirut' });
  const requests = recordOrders(page);
  const number = await submitAndWaitForThanks(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.body.items).toEqual([
    { kind: 'stimpie_pack', packId: seven.id, stimpies: [{ stimpieId: expect.any(Number), qty: 7 }], qty: 1 },
  ]);
  const safeNumber = number.replace(/[^A-Z0-9-]/g, '');
  expect(mysql(`SELECT COUNT(*) FROM order_stock_lines l JOIN orders o ON o.id=l.order_id WHERE o.number='${safeNumber}' AND l.item_type='HOODIE_VARIANT'`)).toBe('0');
  expect(mysql(`SELECT SUM(l.qty) FROM order_stock_lines l JOIN orders o ON o.id=l.order_id WHERE o.number='${safeNumber}' AND l.item_type='STIMPIE'`)).toBe('7');
  expect(mysql(`SELECT subtotal_cents FROM orders WHERE number='${safeNumber}'`)).toBe('4900');
  const orderId = mysql(`SELECT id FROM orders WHERE number='${safeNumber}'`);
  await admin.ok('POST', `/admin/orders/${orderId}/status`, { to: 'CANCELLED', cancelReason: 'Offer acceptance completed' });
  console.assertClean();
});

test('admin can configure a ten-Stimpie offer and a Stimpie builder entry preserves Stimpies-only intent', async ({ page }) => {
  const login = await page.request.post(`${API}/api/v1/auth/login`, {
    headers: { Origin: ADMIN, 'X-Forwarded-For': '198.18.23.75' },
    data: { email: process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1' },
  });
  expect(login.ok()).toBe(true);
  await page.goto(`${ADMIN}/products/packs/new?type=STIMPIE_ONLY`);
  const name = `Configurable ten ${Date.now()}`;
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  await page.getByRole('spinbutton', { name: /^Stimpie count/ }).fill('10');
  await page.getByRole('textbox', { name: /^Price/ }).fill('61');
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/v1/admin/packs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create offer', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const created = await response.json() as Offer;
  try {
    expect(created).toMatchObject({ type: 'STIMPIE_ONLY', stimpieCount: 10, priceCents: 6100 });
    await page.goto(`${ADMIN}/products/packs/${created.id}`);
    await expect(page.getByRole('spinbutton', { name: /^Stimpie count/ })).toHaveValue('10');
    await page.goto('/builder?stimpie=the-void&view=2d');
    await expect(page.getByRole('link', { name: /Choose \d+ Stimpies/ }).first()).toBeVisible();
    await page.getByRole('link', { name: /Choose \d+ Stimpies/ }).first().click();
    await expect(page).toHaveURL(/\/shop\/stimpie-packs/);
    expect(await storedItems(page)).toEqual([]);
    await expectNoHorizontalScroll(page);
  } finally {
    await admin.ok('DELETE', `/admin/packs/${created.id}`);
  }
});
