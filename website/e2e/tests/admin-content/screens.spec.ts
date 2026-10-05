import { test, expect } from '@playwright/test';
import { ADMIN, AUTH_FILE, ensureAuthState, noHScroll, shot, watchConsole, WEBGL_ARGS } from './helpers';

test.use({ launchOptions: { args: WEBGL_ARGS }, storageState: AUTH_FILE });
test.beforeAll(ensureAuthState);

/** Screenshot of every page and tab at the project's viewport (360 and 1280); also: no horizontal scroll, no console errors. */
const pages: Array<[string, string, RegExp]> = [
  ['drops-upcoming', '/drops', /Drops/],
  ['drops-live', '/drops?tab=live', /Drops/],
  ['drops-archive', '/drops?tab=archive', /Drops/],
  ['drop-new', '/drops/new', /New drop/],
  ['finance-profit', '/finance', /Finance/],
  ['finance-profit-all', '/finance?all=1', /Finance/],
  ['finance-cash', '/finance?tab=cash', /Finance/],
  ['finance-costs', '/finance?tab=costs', /Finance/],
  ['finance-ad-spend', '/finance?tab=costs&kind=ad-spend', /Finance/],
  ['insights-sales', '/insights?all=1', /Insights/],
  ['insights-products', '/insights?tab=products&all=1', /Insights/],
  ['insights-customers', '/insights?tab=customers&all=1', /Insights/],
  ['content-announcement', '/content', /Content/],
  ['content-faq', '/content?tab=faq', /Content/],
  ['content-policies', '/content?tab=policies', /Content/],
  ['content-homepage', '/content?tab=homepage', /Content/],
  ['content-emails', '/content?tab=emails', /Content/],
  ['content-whatsapp', '/content?tab=emails&section=whatsapp', /Content/],
  ['content-email-log', '/content?tab=emails&section=log', /Content/],
];

test.describe('screens', () => {
  test('every page renders, has no horizontal scroll and no console errors', async ({ page }, info) => {
    test.setTimeout(240_000);
    const c = watchConsole(page);
    for (const [name, path, heading] of pages) {
      await page.goto(`${ADMIN}${path}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      await noHScroll(page);
      await shot(page, name, info.project.name);
    }
    expect(c.errors, c.errors.join('\n')).toEqual([]);
  });

  test('builder tab renders with the live preview', async ({ page }, info) => {
    test.setTimeout(120_000);
    const c = watchConsole(page);
    await page.goto(`${ADMIN}/content?tab=builder`);
    await expect(page.getByTestId('builder-preview')).toBeVisible();
    await expect(page.getByText('Live mode')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    await noHScroll(page);
    await shot(page, 'content-builder', info.project.name);
    expect(c.errors, c.errors.join('\n')).toEqual([]);
  });
});
