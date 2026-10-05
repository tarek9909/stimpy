import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { ADMIN, API, AUTH_FILE, WEB, adminApi, ensureAuthState, noHScroll, shot, watchConsole } from './helpers';
import { mysql } from '../runtime';

test.use({ storageState: AUTH_FILE });
test.beforeAll(ensureAuthState);
test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const DROP_NAME = `E2E Drop ${stamp}`;
const STIMPIE_NAME = `E2E Stimpie ${stamp}`;
let api: APIRequestContext;
let stimpieId = 0;
let dropId = 0;

test.beforeAll(async () => {
  api = await adminApi();
  const list = await (await api.get('admin/stimpies?pageSize=1')).json();
  const artworkUrl = list.items[0].artworkUrl as string;
  const res = await api.post('admin/stimpies', { data: { name: STIMPIE_NAME, type: 'LIMITED', priceCents: 1000, artworkUrl, quantity: 5 } });
  expect(res.status()).toBe(201);
  stimpieId = (await res.json()).id;
});

test.afterAll(async () => {
  if (dropId) await api.delete(`admin/drops/${dropId}`);
  if (stimpieId) await api.delete(`admin/stimpies/${stimpieId}`);
  await api?.dispose();
});

const databaseDrop = () => mysql(`SELECT d.id,d.name,d.slug,d.accent_color,d.starts_at,d.ends_at,d.ended_at,s.id,s.name,s.type,s.drop_id,s.quantity,s.reserved,s.active FROM drops d LEFT JOIN stimpies s ON s.drop_id=d.id WHERE d.id=${dropId}`);

const publicDrops = async (page: Page, matches: (text: string) => boolean, info: TestInfo, state: string) => {
  const ctx = await page.context().newPage();
  const observations: string[] = [];
  let text = '';
  try {
    try {
      await expect.poll(async () => {
        const response = await ctx.goto(`${WEB}/drops`);
        text = await ctx.locator('main').innerText();
        observations.push(`${response?.status() ?? 'no response'} ${response?.headers()['x-nextjs-cache'] ?? 'no x-nextjs-cache'} match=${matches(text)}`);
        return matches(text);
      }, { timeout: 30_000, intervals: [500, 1000, 2000], message: `public /drops should converge after ${state}` }).toBe(true);
    } catch (error) {
      await info.attach(`drops-${state.replace(/\W+/g, '-')}-revalidation`, { body: Buffer.from(observations.join('\n')), contentType: 'text/plain' });
      throw error;
    }
    info.annotations.push({ type: 'drops-revalidation', description: `${state}: ${observations.join(' | ')}` });
    return text;
  } finally {
    await ctx.close();
  }
};

test('create a drop with accent colour, dates and an assigned Stimpie; it shows as UPCOMING on the public /drops page', async ({ page }, info) => {
  const c = watchConsole(page);
  await page.goto(`${ADMIN}/drops/new`);
  await page.getByLabel(/^Name/).fill(DROP_NAME);
  await expect(page.getByLabel(/^Slug/)).toHaveValue(`e2e-drop-${stamp}`);
  await page.getByText('Sky', { exact: true }).click();
  await page.getByLabel(/^Launch/).fill('2026-12-01T18:00');
  await page.getByLabel(/^End/).fill('2026-12-05T18:00');
  // validation: end before launch
  await page.getByLabel(/^End/).fill('2026-11-30T18:00');
  await page.getByRole('button', { name: 'Save drop' }).click();
  await expect(page.getByText('The end must be after the launch.').first()).toBeVisible();
  await page.getByLabel(/^End/).fill('2026-12-05T18:00');
  // a past launch is blocked when creating (UI check)
  await page.getByLabel(/^Launch/).fill('2026-01-01T18:00');
  await page.getByRole('button', { name: 'Save drop' }).click();
  await expect(page.getByText('Pick a launch time in the future.').first()).toBeVisible();
  await page.getByLabel(/^Launch/).fill('2026-12-01T18:00');
  // assign the Stimpie
  await page.getByLabel('Search Stimpies').fill(STIMPIE_NAME);
  await page.getByLabel(STIMPIE_NAME).check();
  await expect(page.getByText('1 selected')).toBeVisible();
  await shot(page, 'drop-form-filled', info.project.name);
  await noHScroll(page);
  await page.getByRole('button', { name: 'Save drop' }).click();
  await expect(page).toHaveURL(/\/drops$/);
  await expect(page.getByRole('link', { name: DROP_NAME, exact: true })).toBeVisible();
  const row = await (await api.get('admin/drops?state=UPCOMING&pageSize=100')).json();
  const made = row.items.find((d: { name: string }) => d.name === DROP_NAME);
  expect(made).toBeTruthy();
  dropId = made.id;
  expect(made).toMatchObject({ accentColor: 'SKY', accentHex: '#5CC8FF', state: 'UPCOMING' });
  expect(made.stimpies.map((s: { id: number }) => s.id)).toEqual([stimpieId]);
  info.annotations.push({ type: 'drop-api-after-create', description: JSON.stringify(made) });
  info.annotations.push({ type: 'drop-db-after-create', description: databaseDrop() });
  // Beirut is UTC+2 in December: 18:00 local = 16:00Z
  expect(made.startsAt).toBe('2026-12-01T16:00:00.000Z');
  await shot(page, 'drops-upcoming-with-new', info.project.name);
  // public site
  const txt = await publicDrops(page, (text) => text.includes(DROP_NAME) && text.includes('Coming soon'), info, 'drop create');
  expect(txt).toContain(DROP_NAME);
  expect(txt).toContain('Coming soon');
  expect(c.errors, c.errors.join('\n')).toEqual([]);
});

test('moving the launch earlier makes it LIVE on the public page; ending it needs the typed name and archives it', async ({ page }, info) => {
  await page.goto(`${ADMIN}/drops/${dropId}`);
  await page.getByLabel(/^Launch/).fill('2026-10-03T10:00');
  await page.getByLabel(/^End/).fill('');
  await page.getByRole('button', { name: 'Save drop' }).click();
  await expect(page).toHaveURL(/tab=live|\/drops(\?|$)/);
  const live = await (await api.get('admin/drops?state=LIVE&pageSize=100')).json();
  expect(live.items.some((d: { id: number }) => d.id === dropId)).toBe(true);
  const adminUrl = `${API}/api/v1/admin/drops/${dropId}`;
  const publicUrl = `${API}/api/v1/drops?e2e_probe=${encodeURIComponent(`${dropId}-${Date.now()}`)}`;
  const adminResponse = await page.request.get(adminUrl, { headers: { 'Cache-Control': 'no-cache' } });
  const admin = await adminResponse.json();
  expect(admin.state).toBe('LIVE');
  // Beirut is UTC+3 in October: 10:00 local = 07:00Z.
  expect(admin.startsAt).toBe('2026-10-03T07:00:00.000Z');
  const publicResponse = await page.request.get(publicUrl, { headers: { 'Cache-Control': 'no-cache' } });
  const pub = await publicResponse.json();
  const snapshotPath = info.outputPath('drop-live-api-db-snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    configuredWebApi: {
      API_URL_INTERNAL: `${API}/api/v1`,
      NEXT_PUBLIC_API_URL: `${API}/api/v1`,
      NEXT_PUBLIC_DEV_NO_CACHE: '1',
    },
    adminUrl,
    publicUrl,
    sameApiOrigin: new URL(adminUrl).origin === new URL(publicUrl).origin,
    adminStatus: adminResponse.status(),
    adminHeaders: adminResponse.headers(),
    publicStatus: publicResponse.status(),
    publicHeaders: publicResponse.headers(),
    admin,
    public: pub,
    database: databaseDrop(),
  }, null, 2));
  await info.attach('drop-live-api-db-snapshot', { path: snapshotPath, contentType: 'application/json' });
  // the website now shows it as live
  expect(await publicDrops(page, (text) => text.includes(DROP_NAME), info, 'drop moved to LIVE')).toContain(`${DROP_NAME}`);
  info.annotations.push({ type: 'drop-api-after-live', description: JSON.stringify({ admin: live.items.find((d: { id: number }) => d.id === dropId), public: pub }) });
  info.annotations.push({ type: 'drop-db-after-live', description: databaseDrop() });
  expect(pub.live?.name).toBe(DROP_NAME);

  await page.goto(`${ADMIN}/drops?tab=live`);
  await expect(page.getByRole('heading', { name: DROP_NAME })).toBeVisible();
  const panel = page.getByRole('region', { name: DROP_NAME });
  await expect(panel.getByText(/units per hour|Sell-through speed/)).toBeVisible();
  await expect(page.getByText('More than one drop is live')).toBeVisible();
  await noHScroll(page);
  await shot(page, 'drops-live-with-new', info.project.name);
  // end it: confirm stays disabled until the exact name is typed
  await panel.getByRole('button', { name: 'End drop now' }).click();
  const dialog = page.getByRole('alertdialog');
  const confirm = dialog.getByRole('button', { name: 'End drop now' });
  await expect(confirm).toBeDisabled();
  await shot(page, 'drop-end-dialog', info.project.name);
  await dialog.getByLabel(/Type/).fill('wrong name');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Type/).fill(DROP_NAME);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/ended\. It is now in the archive/)).toBeVisible();
  const after = await (await api.get(`admin/drops/${dropId}`)).json();
  expect(after.state).toBe('ENDED');
  await page.goto(`${ADMIN}/drops?tab=archive`);
  await expect(page.getByRole('link', { name: DROP_NAME, exact: true })).toBeVisible();
  await shot(page, 'drops-archive-with-new', info.project.name);
  const pubAfter = await (await page.request.get(`${API}/api/v1/drops`)).json();
  info.annotations.push({ type: 'drop-api-after-ended', description: JSON.stringify({ admin: after, public: pubAfter }) });
  info.annotations.push({ type: 'drop-db-after-ended', description: databaseDrop() });
  expect(pubAfter.archive.some((d: { name: string }) => d.name === DROP_NAME)).toBe(true);
});

test('subscribers of the drop are listed and the CSV downloads', async ({ page }, info) => {
  const email = `e2e-${stamp}@example.com`;
  const sub = await page.request.post(`${API}/api/v1/drops/${dropId}/subscribe`, { data: { contact: email, type: 'EMAIL' }, headers: { Origin: WEB } });
  expect(sub.status()).toBe(204);
  await page.goto(`${ADMIN}/drops/${dropId}`);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText('This drop is read-only')).toBeVisible();
  await noHScroll(page);
  await shot(page, 'drop-detail-ended', info.project.name);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^subscribers-\d{4}-\d{2}-\d{2}\.csv$/);
  const body = readFileSync(await download.path(), 'utf8');
  expect(body).toContain(email);
  expect(body.split('\n')[0]).toContain('contact');
});

test('deleting a drop is confirmed; a drop with orders cannot be deleted (CONFLICT copy)', async ({ page }) => {
  await page.goto(`${ADMIN}/drops/${dropId}`);
  await page.getByRole('button', { name: 'Delete drop' }).first().click();
  await expect(page.getByRole('alertdialog')).toContainText('This can\'t be undone');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  // a seeded drop with order lines: Drop 001
  const all = await (await api.get('admin/drops?pageSize=100')).json();
  const seeded = all.items.find((d: { name: string }) => d.name.startsWith('Drop 001'));
  await page.goto(`${ADMIN}/drops/${seeded.id}`);
  await page.getByRole('button', { name: 'Delete drop' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete drop' }).click();
  await expect(page.getByText("This drop has orders. You can't delete it.")).toBeVisible();
});
