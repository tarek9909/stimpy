import { expect, test, type Page } from '@playwright/test';
import { isolateLoginIp } from './runtime';

const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: test.info().project.use.viewport ?? undefined });
  page = await ctx.newPage();
  await isolateLoginIp(page, '198.18.0.12');
});
test.afterAll(async () => {
  await page.context().close();
});

const noHScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test('login and navigate to customers list', async () => {
  await page.goto(`${ADMIN}/customers`);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fcustomers/);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
  await noHScroll();
});

test('customers list has records and links to customer detail', async () => {
  // Wait for customer rows/cards to appear in the table or card list
  const rows = page.locator('[data-row-id]');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // Click on the first customer name link
  const firstCustomerLink = rows.first().locator('a').first();
  const customerName = await firstCustomerLink.innerText();
  console.log(`Navigating to customer: ${customerName}`);
  await firstCustomerLink.click();

  await expect(page).toHaveURL(/\/customers\/\d+$/);
  await noHScroll();
});

test('customer profile renders stat tiles, contact info, recent orders and activity timeline', async () => {
  const content = page.locator('#main-content');
  await expect(content.getByRole('heading', { level: 1 })).toBeVisible();

  // Contact section
  await expect(content.getByRole('heading', { name: 'Contact' })).toBeVisible();

  // Stat tiles
  await expect(content.getByText('Orders', { exact: true })).toBeVisible();
  await expect(content.getByText('Lifetime value', { exact: true })).toBeVisible();
  await expect(content.getByText('Average order', { exact: true })).toBeVisible();
  await expect(content.getByText('First order', { exact: true })).toBeVisible();
  await expect(content.getByText('Last order', { exact: true })).toBeVisible();
  await expect(content.getByText('Favourite Stimpie', { exact: true })).toBeVisible();
  await expect(content.getByText('Favourite colour', { exact: true })).toBeVisible();

  // Recent orders
  await expect(content.getByRole('heading', { name: 'Recent orders' })).toBeVisible();

  // Activity timeline
  await expect(content.getByRole('heading', { name: 'Activity timeline' })).toBeVisible();

  // If "Load older activity" exists, click it and verify
  const loadMoreBtn = page.getByRole('button', { name: 'Load older activity' });
  if (await loadMoreBtn.isVisible()) {
    console.log('Load older activity button is visible, clicking it...');
    await loadMoreBtn.click();
    await page.waitForTimeout(500);
  }

  // Capture screenshot for visual verification
  const projectName = test.info().project.name;
  await page.screenshot({ path: `test-results/crm-phase1-${projectName}.png`, fullPage: true });

  await noHScroll();
});
