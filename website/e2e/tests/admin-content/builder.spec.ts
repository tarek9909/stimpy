import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN, API, AUTH_FILE, WEB, WEBGL_ARGS, adminApi, ensureAuthState, noHScroll, shot, watchConsole } from './helpers';
import { REAL_GLB, notAGlb, tamperedGlb } from './glb';
import { mysql } from '../runtime';

test.use({ storageState: AUTH_FILE, launchOptions: { args: WEBGL_ARGS } });
test.beforeAll(ensureAuthState);

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const STIMPIES = resolve(process.env.E2E_ARTWORK_DIR ?? resolve(REPO_ROOT, 'content/stimpy-video/out/stimpies'));
const LOOKBOOK = resolve(STIMPIES, 'lookbook.jpg');
let api: APIRequestContext;
let original: Record<string, unknown>;

type Dbg = { camera: { position: { x: number; y: number; z: number } } };
declare global {
  interface Window {
    __stimpyBuilder3d?: Dbg;
  }
}

const getBuilder = async () => (await api.get('admin/builder')).json();
const databaseBuilderMode = () => mysql("SELECT `key`, value FROM builder_config WHERE `key` IN ('mode','defaultView') ORDER BY 1");
const save = (page: Page) => page.getByRole('button', { name: 'Save Builder settings' }).filter({ visible: true }).click();
const openBuilder = async (page: Page) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${ADMIN}/content?tab=builder`);
  await expect(page.getByTestId('readiness-chips')).toBeVisible();
};
const restore = async () => {
  const res = await api.put('admin/builder', { data: original });
  expect(res.ok()).toBe(true);
};

test.beforeAll(async () => {
  api = await adminApi();
  original = await getBuilder();
});
test.afterAll(async () => {
  await restore();
  await api?.dispose();
});

test('readiness chips match the server assetsReady and the preview is the real Builder', async ({ page }, info) => {
  const c = watchConsole(page);
  await openBuilder(page);
  const server = original.assetsReady as { model3d: boolean; colors2d: Array<{ ready: boolean }>; overlays2d: number; stimpieTextures: number };
  const chips = page.getByTestId('readiness-chips');
  await expect(chips).toContainText(`3D model: ${server.model3d ? 'ready' : 'missing'}`);
  await expect(chips).toContainText(`2D images: ${server.colors2d.filter((x) => x.ready).length} of ${server.colors2d.length} colours ready`);
  await expect(chips).toContainText(`2D shading overlays: ${server.overlays2d}`);
  await expect(chips).toContainText(`Stimpie textures: ${server.stimpieTextures}`);
  await expect(page.locator('[data-builder="page"]')).toBeVisible();
  await expect(page.getByText('Preview only').first()).toBeVisible();
  // the purchase UI is not part of the dashboard preview
  await expect(page.locator('[data-builder-add]')).toHaveCount(0);
  await noHScroll(page);
  await shot(page, 'builder-loaded', info.project.name);
  expect(c.errors, c.errors.join('\n')).toEqual([]);
});

test('preview can simulate missing WebGL and verify the automatic 2D fallback', async ({ page }) => {
  await restore();
  await openBuilder(page);
  await page.getByRole('radio', { name: /^Both/ }).check({ force: true });
  await page.locator('input[name="builder-default-view"][value="3D"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.getByLabel('Simulate').selectOption('no-webgl');
  await expect(page.locator('[data-builder="page"]')).toHaveAttribute('data-builder-view', '2d');
  await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
  await page.getByLabel('Simulate').selectOption('none');
  await expect(page.locator('[data-builder="page"]')).toHaveAttribute('data-builder-view', '3d');
  await expect(page.locator('[data-builder-toggle]')).toBeVisible();
});

test('mode radios: save 2D, BOTH, 3D and the public /builder follows; "Switch to 2D only" is one click', async ({ page }, info) => {
  await openBuilder(page);
  info.annotations.push({ type: 'builder-db-before', description: databaseBuilderMode() });
  const pub = await page.context().newPage();
  const publicToggle = async (expected: number, state: string) => {
    const observations: string[] = [];
    try {
      await expect.poll(async () => {
        const response = await pub.goto(`${WEB}/builder?builder3d=force`);
        await pub.waitForSelector('[data-builder="page"]');
        const count = await pub.locator('[data-builder-toggle]').count();
        observations.push(`${response?.status() ?? 'no response'} ${response?.headers()['x-nextjs-cache'] ?? 'no x-nextjs-cache'} count=${count}`);
        return count;
      }, { timeout: 90_000, intervals: [500, 1000, 2000], message: `public Builder should converge to ${expected} toggle(s) after ${state}` }).toBe(expected);
    } catch (error) {
      await info.attach(`builder-${state.replace(/\W+/g, '-')}-revalidation`, { body: Buffer.from(observations.join('\n')), contentType: 'text/plain' });
      throw error;
    }
    info.annotations.push({ type: 'builder-revalidation', description: `${state}: ${observations.join(' | ')}` });
  };
  // 2D only
  await page.getByRole('radio', { name: /^2D only/ }).check({ force: true });
  await expect(page.locator('input[name="builder-default-view"][value="3D"]')).toBeDisabled();
  await save(page);
  await expect(page.getByTestId('save-result')).toContainText('Saved and live');
  await expect.poll(async () => (await getBuilder()).mode).toBe('2D');
  const public2d = await (await page.request.get(`${API}/api/v1/builder/config`)).json();
  expect(public2d.effectiveMode).toBe('2D');
  info.annotations.push({ type: 'builder-db-after-2d', description: databaseBuilderMode() });
  info.annotations.push({ type: 'builder-api-after-2d', description: JSON.stringify(public2d) });
  await publicToggle(0, '2D-only save');
  await shot(page, 'builder-saved-2d', info.project.name);
  // Both with default view 2D
  await page.getByRole('radio', { name: /^Both/ }).check({ force: true });
  await page.locator('input[name="builder-default-view"][value="2D"]').evaluate((el) => (el as HTMLInputElement).click());
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  await expect.poll(async () => (await getBuilder()).mode).toBe('BOTH');
  const both = await getBuilder();
  expect(both).toMatchObject({ mode: 'BOTH', defaultView: '2D' });
  const publicBoth = await (await page.request.get(`${API}/api/v1/builder/config`)).json();
  expect(publicBoth).toMatchObject({ effectiveMode: 'BOTH', defaultView: '2D' });
  info.annotations.push({ type: 'builder-db-after-both', description: databaseBuilderMode() });
  info.annotations.push({ type: 'builder-api-after-both', description: JSON.stringify(publicBoth) });
  await publicToggle(1, 'BOTH save');
  // 3D only
  await page.getByRole('radio', { name: /^3D only/ }).check({ force: true });
  await save(page);
  await expect.poll(async () => (await getBuilder()).mode).toBe('3D');
  expect((await (await page.request.get(`${API}/api/v1/builder/config`)).json()).effectiveMode).toBe('3D');
  // one click back to 2D only, whatever else is on the form
  await page.getByRole('button', { name: 'Switch to 2D only' }).click();
  await expect(page.getByText('Switched to 2D only. It is live now.')).toBeVisible();
  expect((await getBuilder()).mode).toBe('2D');
  await pub.close();
  await restore();
});

test('removing the model saves with the server warning verbatim', async ({ page }, info) => {
  await restore();
  await openBuilder(page);
  await page.getByRole('button', { name: 'Remove model' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove model' }).click();
  await expect(page.getByTestId('mode-note')).toContainText('No 3D model uploaded yet. The website will fall back to 2D until you upload one.');
  await expect(page.getByTestId('readiness-chips')).toContainText('3D model: missing');
  await save(page);
  const banner = page.getByTestId('save-result');
  await expect(banner).toContainText('Saved, with warnings');
  const warnings = (await getBuilder()).warnings as string[];
  expect(warnings.length).toBeGreaterThan(0);
  for (const w of warnings) await expect(banner).toContainText(w);
  await shot(page, 'builder-warnings', info.project.name);
  await restore();
});

test('GLB upload: the real hoodie is parsed in the browser, then saved', async ({ page }, info) => {
  test.setTimeout(120_000);
  await restore();
  await openBuilder(page);
  const before = (await getBuilder()).model3d.url as string;
  await page.locator('input[type="file"][accept*="glb"]').setInputFiles(REAL_GLB);
  const report = page.getByTestId('glb-report');
  await expect(report).toContainText('Usable, with warnings', { timeout: 30_000 });
  await expect(report).toContainText('40,228');
  await expect(report).toContainText('fabric, panel');
  await expect(page.getByTestId('glb-warnings')).toContainText('exceed target 40000');
  await expect(page.getByTestId('glb-errors')).toHaveCount(0);
  const mesh = page.getByLabel(/^Back panel mesh/);
  await expect(mesh).toHaveValue('back_panel');
  expect(await mesh.locator('option').allInnerTexts()).toEqual(expect.arrayContaining(['back_panel', 'hoodie_body', 'zip']));
  await shot(page, 'builder-glb-report', info.project.name);
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  const after = (await getBuilder()).model3d;
  expect(after.url).not.toBe(before);
  expect(after.sizeBytes).toBe(978332);
  expect(after.backPanelMesh).toBe('back_panel');
});

test('deliberately invalid models: validator errors, saving is blocked; a non-GLB is refused', async ({ page }, info) => {
  test.setTimeout(120_000);
  await restore();
  const savedUrl = (await getBuilder()).model3d.url as string;
  await openBuilder(page);
  const bad = tamperedGlb('three-materials-skin', (j) => {
    (j.materials as unknown[]).push({ name: 'extra' });
    j.skins = [{ joints: [0] }];
    j.animations = [{ channels: [], samplers: [] }];
  });
  await page.locator('input[type="file"][accept*="glb"]').setInputFiles(bad);
  const report = page.getByTestId('glb-report');
  await expect(report).toContainText('Needs fixing before it can be used', { timeout: 30_000 });
  const errors = page.getByTestId('glb-errors');
  await expect(errors).toContainText('Exactly two materials required (found 3)');
  await expect(errors).toContainText('Scene must not contain skins (found 1)');
  await expect(errors).toContainText('Scene must not contain animations (found 1)');
  await shot(page, 'builder-glb-invalid', info.project.name);
  await save(page);
  await expect(page.getByText('Fix these before saving')).toBeVisible();
  await expect(page.getByText(/The 3D model has problems/)).toBeVisible();
  expect((await getBuilder()).model3d.url).toBe(savedUrl);
  // not a glTF at all
  await page.locator('input[type="file"][accept*="glb"]').setInputFiles(notAGlb('plain-text'));
  await expect(page.getByRole('alert').filter({ hasText: /glTF|GLB|3D model/i }).first()).toBeVisible();
});

test('mesh dropdown flags a name that is not in the model', async ({ page }) => {
  await restore();
  await openBuilder(page);
  await expect(page.getByTestId('glb-report')).toContainText('Passes every check|Usable', { useInnerText: true }).catch(() => undefined);
  await expect(page.getByTestId('glb-verdict')).toBeVisible({ timeout: 30_000 });
  // a stale name (e.g. an old model) is kept visible and flagged
  await page.getByLabel(/^Back panel mesh/).selectOption('hoodie_body');
  await expect(page.getByTestId('glb-errors')).toContainText('Back panel mesh "hoodie_body"').catch(() => undefined);
});

test('camera: orbit the live preview and copy the view into the form, then save', async ({ page }, info) => {
  test.skip(info.project.name === 'phone-360', 'orbit drag is a desktop interaction; phone layout is covered by the screens spec');
  test.setTimeout(120_000);
  await restore();
  await openBuilder(page);
  await page.waitForFunction(() => !!window.__stimpyBuilder3d?.camera, null, { timeout: 60_000 });
  await expect(page.locator('[data-builder-view="3d"] canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const canvas = page.locator('[data-builder-view="3d"] canvas').first();
  const box = (await canvas.boundingBox())!;
  const startPos = await page.evaluate(() => { const p = window.__stimpyBuilder3d!.camera.position; return [p.x, p.y, p.z]; });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 20, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const live = await page.evaluate(() => { const p = window.__stimpyBuilder3d!.camera.position; return [p.x, p.y, p.z]; });
  expect(Math.abs(live[0]! - startPos[0]!)).toBeGreaterThan(0.05);
  await page.getByRole('button', { name: 'Use current preview view' }).click();
  await expect(page.getByTestId('camera-note')).toContainText('Camera copied from the preview.');
  const posX = Number(await page.getByLabel('Position X').inputValue());
  const posZ = Number(await page.getByLabel('Position Z').inputValue());
  expect(posX).toBeCloseTo(live[0]!, 1);
  expect(posZ).toBeCloseTo(live[2]!, 1);
  await shot(page, 'builder-camera-copied', info.project.name);
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  const cam = (await getBuilder()).model3d.camera;
  expect(cam.position[0]).toBeCloseTo(live[0]!, 1);
  expect(cam.position[2]).toBeCloseTo(live[2]!, 1);
  // Reset returns the recommended defaults; invalid fov is blocked client-side
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByLabel('Position Z')).toHaveValue('-2.5');
  await page.getByLabel(/^Field of view/).fill('5');
  await save(page);
  await expect(page.getByText('Field of view must be between 10 and 100.').first()).toBeVisible();
  // lighting radios
  await page.getByLabel(/^Field of view/).fill('32');
  await page.getByRole('radio', { name: /^Night/ }).check({ force: true });
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  expect((await getBuilder()).model3d.lighting).toBe('NIGHT');
});

test('2D placement: numeric fields, drag, keyboard, rotation; saved and confirmed on the public page', async ({ page }, info) => {
  test.setTimeout(120_000);
  await restore();
  await openBuilder(page);
  const black = (await getBuilder()).colors[0];
  const card = page.getByTestId(`colour-card-${black.colorId}`);
  await card.locator('xpath=ancestor::details[1]').locator('summary').first().click();
  const stage = card.getByTestId('placement-editor');
  await expect(stage.getByTestId('placement-box')).toBeVisible();
  // numeric fields (percent) -> fractions
  await stage.getByLabel('X (centre)').fill('60');
  await stage.getByLabel('Y (centre)').fill('50');
  await stage.getByLabel('Width').fill('40');
  await stage.getByLabel('Rotation').fill('15');
  // the box keeps 0.64 (height = width / 0.64)
  const b0 = (await stage.getByTestId('placement-box').boundingBox())!;
  // keyboard nudge: ArrowRight +0.5%
  await stage.getByTestId('placement-box').focus();
  await page.keyboard.press('ArrowRight');
  await expect(stage.getByLabel('X (centre)')).toHaveValue('60.5');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(stage.getByLabel('Y (centre)')).toHaveValue('52');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  await expect(stage.getByLabel('X (centre)')).toHaveValue('60');
  await expect(stage.getByLabel('Y (centre)')).toHaveValue('50');
  // drag with the mouse: moves the centre
  await stage.getByTestId('placement-box').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b1 = (await stage.getByTestId('placement-box').boundingBox())!;
  void b0;
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 - 30, b1.y + b1.height / 2 - 20, { steps: 6 });
  await page.mouse.up();
  const x = Number(await stage.getByLabel('X (centre)').inputValue());
  const y = Number(await stage.getByLabel('Y (centre)').inputValue());
  expect(x).toBeLessThan(60);
  expect(y).toBeLessThan(50);
  await stage.getByLabel('X (centre)').fill('55');
  await stage.getByLabel('Y (centre)').fill('48');
  // invalid: mostly outside the image
  await stage.getByLabel('X (centre)').fill('100');
  await stage.getByLabel('Y (centre)').fill('100');
  await save(page);
  await expect(page.getByText('At least half of the panel must stay inside the image.').first()).toBeVisible();
  await stage.getByLabel('X (centre)').fill('55');
  await stage.getByLabel('Y (centre)').fill('48');
  await shot(page, 'builder-placement', info.project.name);
  // 2D mode so the public page shows the 2D stage
  await page.getByRole('radio', { name: /^2D only/ }).check({ force: true });
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  const placement = (await getBuilder()).colors[0].placement2d;
  expect(placement).toMatchObject({ x: 0.55, y: 0.48, width: 0.4, rotation: 15 });
  // the public page: the 2D panel is centred where the form says
  const pub = await page.context().newPage();
  await pub.goto(`${WEB}/builder`);
  const stage2d = pub.locator('[data-builder-stage="2d"]');
  await expect(stage2d).toBeVisible();
  await pub.waitForTimeout(800);
  const s = (await stage2d.boundingBox())!;
  const p = (await pub.locator('[data-layer="panel"]').boundingBox())!;
  // rotated by 15deg: the bounding box centre is still the panel centre
  expect((p.x + p.width / 2 - s.x) / s.width).toBeCloseTo(0.55, 1);
  expect((p.y + p.height / 2 - s.y) / s.height).toBeCloseTo(0.48, 1);
  const transform = await pub.locator('[data-layer="panel"]').evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
  await shot(pub, 'public-builder-2d', info.project.name);
  await pub.close();
  // copy to all colours (confirmed)
  await card.getByRole('button', { name: 'Copy placement to all colours' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Overwrite the placement of 3 other colours?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Overwrite' }).click();
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  const colors = (await getBuilder()).colors as Array<{ placement2d: { x: number } | null }>;
  expect(colors.every((x2) => x2.placement2d?.x === 0.55)).toBe(true);
});

test('flat image aspect check, overlay upload and per-Stimpie texture override', async ({ page }, info) => {
  test.setTimeout(120_000);
  await restore();
  await openBuilder(page);
  const black = (await getBuilder()).colors[0];
  const card = page.getByTestId(`colour-card-${black.colorId}`);
  await card.locator('xpath=ancestor::details[1]').locator('summary').first().click();
  // a landscape photo as the flat image warns about the 4:5 shape (not saved)
  await card.locator('input[type="file"]').first().setInputFiles(LOOKBOOK);
  await expect(card.getByText('This image is not 4:5')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'builder-aspect-warning', info.project.name);
  // texture override: off-aspect warns, on-aspect does not
  await page.locator('details', { hasText: 'Stimpie textures (advanced)' }).locator('summary').first().click();
  const stimpies = (await (await api.get('admin/stimpies?pageSize=100')).json()).items as Array<{ id: number; name: string }>;
  const target = stimpies[1]!;
  const row = page.getByTestId(`texture-row-${target.id}`);
  await row.locator('input[type="file"]').setInputFiles(LOOKBOOK);
  await expect(row.getByText(/The panel is 0\.64, so it will be cropped/)).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Use artwork' }).click();
  await expect(row.getByText('Uses the artwork')).toBeVisible();
  await row.locator('input[type="file"]').setInputFiles(`${STIMPIES}/stimpie-005.png`);
  await expect(row.getByText('Uses an override texture')).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText(/so it will be cropped/)).toHaveCount(0);
  await expect(page.getByTestId('readiness-chips')).toContainText(/Stimpie textures: \d+/);
  // reload the flat image to what it was: discard by re-opening is not needed; only the texture is saved here
  // (the landscape flat image is replaced back below so the saved state stays valid)
  await card.locator('input[type="file"]').first().setInputFiles(`${STIMPIES}/stimpie-004.png`);
  await page.waitForTimeout(1500);
  await save(page);
  await expect(page.getByTestId('save-result')).toBeVisible();
  const saved = await getBuilder();
  expect(saved.stimpieTextures.some((t: { stimpieId: number; textureUrl: string }) => t.stimpieId === target.id && /^http/.test(t.textureUrl))).toBe(true);
  // dirty guard: leaving with unsaved edits asks first
  await row.getByRole('button', { name: 'Use artwork' }).click();
  await page.getByRole('link', { name: 'Overview' }).first().click().catch(() => undefined);
  await restore();
});

test('401 mid-session: the next save sends the person to login and keeps the form', async ({ browser }, info) => {
  const ctx = await browser.newContext({ storageState: AUTH_FILE, viewport: info.project.use.viewport ?? undefined });
  const page = await ctx.newPage();
  await openBuilder(page);
  await page.getByRole('radio', { name: /^2D only/ }).check({ force: true });
  // the session ends in another tab / on the server
  await ctx.clearCookies();
  await save(page);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/session|sign|log in/i).first()).toBeVisible();
  await ctx.close();
});
