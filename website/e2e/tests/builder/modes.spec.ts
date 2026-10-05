import { expect, test, type Page } from '@playwright/test';
import { watchConsole } from '../web-foundation/helpers';
import { GL_ARGS, adminSession, publicConfig, watchThree } from './util';

/** The page reads the config on each request here (NEXT_PUBLIC_DEV_NO_CACHE=1 turns every revalidate window into 0). */
test.describe.configure({ mode: 'serial' });
test.use({ launchOptions: { args: GL_ARGS } });

let original: any; // eslint-disable-line @typescript-eslint/no-explicit-any
let admin: Awaited<ReturnType<typeof adminSession>>;

test.beforeAll(async () => {
  admin = await adminSession();
  original = await admin.get();
});
test.afterAll(async () => {
  const r = await admin.put(original);
  expect(r.status).toBe(200);
});

async function setMode(mode: '2D' | '3D' | 'BOTH', defaultView: '2D' | '3D' = '3D', withModel = true) {
  const b = JSON.parse(JSON.stringify(original));
  b.mode = mode;
  b.defaultView = defaultView;
  if (!withModel) b.model3d = null;
  const r = await admin.put(b);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
}

const view = (page: Page) => page.locator('[data-builder]').getAttribute('data-builder-view');

test.describe('config follows the dashboard (test 1-4, 30)', () => {

  test('mode 2D only: 2D, no toggle, no three.js request (with the force override on)', async ({ page }) => {
    await setMode('2D');
    expect((await publicConfig()).effectiveMode).toBe('2D');
    const three = watchThree(page);
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(await view(page)).toBe('2d');
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    expect(await three.settled()).toEqual([]);
  });

  test('mode 3D only: 3D with no toggle', async ({ page }) => {
    await setMode('3D');
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
    expect(await view(page)).toBe('3d');
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
  });

  test('mode 3D only on a weak device (2 GB): silently 2D, never frozen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 2 }));
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(await view(page)).toBe('2d');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/weak|slow|device|unsupported/i);
  });

  test('BOTH, default 3D then default 2D: toggle visible, opens in the default, selection preserved', async ({ page }) => {
    await setMode('BOTH', '3D');
    await page.goto('/builder?builder3d=force&color=3', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
    await expect(page.locator('[data-builder-toggle]')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Stone/ })).toHaveAttribute('aria-checked', 'true');
    await setMode('BOTH', '2D');
    const ctx = page.context();
    const p2 = await ctx.newPage();
    await p2.goto('/builder?builder3d=force&color=3', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2500);
    expect(await view(p2)).toBe('2d');
    await expect(p2.locator('[data-builder-toggle]')).toBeVisible();
    await p2.locator('[data-builder-toggle] [data-view="3d"]').click();
    await p2.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
    await expect(p2.getByRole('radio', { name: /Stone/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('model removed: effectiveMode downgrades to 2D and the page follows', async ({ page }) => {
    const body = await setMode('BOTH', '3D', false);
    expect(body.warnings.length).toBeGreaterThan(0);
    const cfg = await publicConfig();
    expect(cfg.mode).toBe('BOTH');
    expect(cfg.effectiveMode).toBe('2D');
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    expect(await view(page)).toBe('2d');
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    await setMode('BOTH', '3D'); // restore the model
    expect((await publicConfig()).effectiveMode).toBe('BOTH');
  });

  test('a colour without a 2D image is hidden in 2D and shown in 3D; a colour with no look at all is never shown (tests 5, 6)', async ({ page }) => {
    const b = JSON.parse(JSON.stringify(original));
    b.mode = 'BOTH';
    b.defaultView = '3D';
    b.colors = b.colors.map((c: any) => (c.colorId === 3 ? { ...c, hoodieImage2d: null, placement2d: null } : c)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = await admin.put(b);
    expect(r.status).toBe(200);
    await page.addInitScript(() => sessionStorage.setItem('stimpy.builder.view', '2d'));
    await page.goto('/builder?builder3d=force&color=3', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(await view(page)).toBe('2d');
    await expect(page.getByRole('radio', { name: /Stone/ })).toHaveCount(0); // hidden in 2D
    await expect(page.getByRole('radio', { name: /Black/ })).toHaveAttribute('aria-checked', 'true'); // share link colour replaced silently
    await page.locator('[data-builder-toggle] [data-view="3d"]').click();
    await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
    await expect(page.getByRole('radio', { name: /Stone/ })).toHaveCount(1); // 3D renders it from the tint
    expect((await admin.put(original)).status).toBe(200);
  });
});

test.describe('automatic fallbacks (section 6)', () => {
  test('no WebGL at all: silent 2D, no toggle, no three.js, no console errors, no message', async ({ browser }) => {
    const b = await browser.browserType().launch({ channel: 'chrome', args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2'] });
    const page = await (await b.newContext({ baseURL: process.env.E2E_WEB_URL, viewport: { width: 1280, height: 900 } })).newPage();
    const con = watchConsole(page);
    const three = watchThree(page);
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(await view(page)).toBe('2d');
    expect(await page.evaluate(() => !document.createElement('canvas').getContext('webgl2'))).toBe(true);
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await three.settled()).toEqual([]);
    await expect(page.locator('body')).not.toContainText(/webgl|unsupported|not supported/i);
    con.assertClean();
    await b.close();
  });

  test.describe('with software GL', () => {
  
    test('without the override the SwiftShader check silently chooses 2D (real fallback logic)', async ({ page }) => {
      const three = watchThree(page);
      await page.goto('/builder', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      expect(await view(page)).toBe('2d');
      expect(await three.settled()).toEqual([]);
    });

    test('3g: 3D is held back until "Load 3D (about N MB)" is tapped', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { effectiveType: '3g', saveData: false }, configurable: true }));
      const three = watchThree(page);
      const glbs: string[] = [];
      page.on('request', (r) => r.url().endsWith('.glb') && glbs.push(r.url()));
      await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      expect(await view(page)).toBe('2d');
      expect(await three.settled()).toEqual([]);
      expect(glbs).toEqual([]);
      const btn = page.getByRole('button', { name: /Load 3D \(about 0\.9 MB\)/ });
      await expect(btn).toBeVisible();
      await btn.click();
      await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
      expect(glbs.length).toBeGreaterThan(0);
    });

    test('save-data / 2g: 3D never downloads on its own', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { effectiveType: '2g', saveData: true }, configurable: true }));
      const glbs: string[] = [];
      page.on('request', (r) => r.url().endsWith('.glb') && glbs.push(r.url()));
      await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      expect(await view(page)).toBe('2d');
      expect(glbs).toEqual([]);
      // idle preloading is skipped on save-data: carousel neighbours are not decoded eagerly (no extra art requests beyond the visible cards)
      await expect(page.getByRole('button', { name: /Load 3D/ })).toBeVisible();
    });

    test('slow frames: the real frame-time sampling switches to 2D silently, hides the toggle and caches the verdict for the session', async ({ page }) => {
      test.setTimeout(180_000);
      const logs: string[] = [];
      page.on('console', (m) => logs.push(m.text()));
      // renderer = bypass ONLY the software check; the sampler runs for real; 70 ms per frame is added to simulate a weak GPU.
      await page.goto('/builder?builder3d=renderer&builder3dframe=70', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-builder-3d]', { timeout: 90_000 });
      await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '2d', { timeout: 150_000 });
      await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem('stimpy.builder.tier'))).toBe('disabled');
      expect(logs.some((l) => l.includes('builder_fallback') && l.includes('SLOW_FRAMES'))).toBe(true);
      await expect(page.locator('body')).not.toContainText(/slow|performance|fps/i);
    });
  });
});
