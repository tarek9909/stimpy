import { expect, test, type Page } from '@playwright/test';
import { isolateLoginIp } from '../runtime';

const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: test.info().project.use.viewport ?? undefined });
  page = await ctx.newPage();
  await isolateLoginIp(page, '198.18.0.11');
});
test.afterAll(async () => {
  await page.context().close();
});

const noHScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test('logged out visit redirects to login; wrong password shows the generic message', async () => {
  await page.goto(`${ADMIN}/orders`);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Forders/);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('login returns to the requested page and the shell renders', async () => {
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await noHScroll();
});

test('products: tabs, stimpies list, hoodie editor opens and closes', async () => {
  await page.goto(`${ADMIN}/products?tab=stimpies`);
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'STIMPY', exact: true })).toBeVisible();
  await page.goto(`${ADMIN}/products?tab=hoodies`);
  await page.getByRole('link', { name: 'Stimpy Hoodie' }).click();
  await expect(page).toHaveURL(/\/products\/hoodies\/\d+/);
  await expect(page.getByLabel(/^Name/)).toBeVisible();
  await noHScroll();
});

test('size chart tab renders measurements', async () => {
  await page.goto(`${ADMIN}/products?tab=size-chart`);
  await expect(page.getByRole('heading', { name: 'How to measure' })).toBeVisible();
  await noHScroll();
});

test('settings: business tab saves and validates', async () => {
  await page.goto(`${ADMIN}/settings?tab=business`);
  const name = page.getByLabel(/^Business name/);
  await expect(name).toBeVisible();
  await name.fill('');
  await page.getByRole('button', { name: 'Save business settings' }).click();
  await expect(page.getByText('Enter the business name.').first()).toBeVisible();
  await name.fill('Stimpy');
  await page.getByLabel(/^Instagram link/).fill('http://insecure.example');
  await page.getByRole('button', { name: 'Save business settings' }).click();
  await expect(page.getByText('The link must start with https://').first()).toBeVisible();
  await page.getByLabel(/^Instagram link/).fill('');
  await page.getByRole('button', { name: 'Save business settings' }).click();
  await expect(page.getByText('Business settings saved.')).toBeVisible();
});

test('settings: change password rejects a short new password client-side', async () => {
  await page.goto(`${ADMIN}/settings?tab=account`);
  await page.getByLabel(/^Current password/).fill(PASSWORD);
  await page.getByLabel(/^New password/).fill('short');
  await page.getByLabel(/^Confirm new password/).fill('short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Use at least 12 characters.').first()).toBeVisible();
});

test('unknown route shows 404 inside the shell; logout returns to login', async () => {
  await page.goto(`${ADMIN}/nope/nothing`);
  await expect(page.getByRole('heading', { name: 'Page not found' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("You're logged out.")).toBeVisible();
});
