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
  await isolateLoginIp(page, '198.18.0.13');
});
test.afterAll(async () => {
  await page.context().close();
});

const noHScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test('login and navigate to Settings -> Customer email', async () => {
  await page.goto(`${ADMIN}/settings?tab=customer-email`);
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings%3Ftab%3Dcustomer-email/);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL(/\/settings\?tab=customer-email$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await noHScroll();
});

test('customer email settings: sender fields and footer save and persist', async () => {
  test.setTimeout(45_000);
  const section = page.getByRole('region', { name: 'Customer email & delivery' });
  await expect(section).toBeVisible();
  await expect(section.getByLabel(/^Sender display name/)).toHaveValue(/.+/);
  await expect(section.getByLabel(/^Sender email/)).toHaveValue(/.+@.+/);
  await expect(section.getByLabel(/^Reply-to address/)).toHaveValue(/.+@.+/);
  await expect(section.getByLabel('Footer text')).toBeVisible();
  await expect(section.getByLabel(/^Maximum campaign recipients/)).toHaveValue('200');

  const footer = section.getByLabel('Footer text');
  const originalFooter = await footer.inputValue();
  const testFooter = `E2E email footer ${Date.now()}`;
  try {
    await footer.fill(testFooter);
    await page.getByRole('button', { name: 'Save email settings' }).click();
    await expect(page.getByText('Email settings saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Customer email & delivery' }).getByLabel('Footer text')).toHaveValue(testFooter);
  } finally {
    await page.getByRole('region', { name: 'Customer email & delivery' }).getByLabel('Footer text').fill(originalFooter).catch(() => undefined);
    await page.getByRole('button', { name: 'Save email settings' }).click().catch(() => undefined);
  }
  await noHScroll();
});
