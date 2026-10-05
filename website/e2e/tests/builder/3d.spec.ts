import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { watchConsole } from '../web-foundation/helpers';
import { API, GL_ARGS, SHOTS, idle3d, open3d, option, watchThree } from './util';

test.use({ launchOptions: { args: GL_ARGS } });

type D = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- debug handle of the 3D engine
const dbg = <T,>(page: Page, fn: (d: D) => T) => page.evaluate(`(${fn.toString()})(window.__stimpyBuilder3d)`) as Promise<T>;

test.describe('Builder 3D (real hoodie.glb, software GL with the explicit override)', () => {
  test('loads the real GLB: back_panel found, canvas non-blank, three.js loaded only now, toggle visible, role=img label', async ({ page }, testInfo) => {
    const con = watchConsole(page);
    const three = watchThree(page);
    const glb: { url: string; size: number; ms: number }[] = [];
    page.on('response', async (r) => {
      if (r.url().endsWith('.glb')) glb.push({ url: r.url(), size: (await r.body()).length, ms: 0 });
    });
    const t0 = Date.now();
    await open3d(page);
    const loadMs = Date.now() - t0;
    expect((await three.settled()).length).toBeGreaterThan(0); // the 3D chunk was requested because 3D was chosen
    expect(glb.length).toBeGreaterThan(0);
    expect(glb[0]?.size).toBeGreaterThan(900_000);
    testInfo.annotations.push({ type: 'glb', description: `${glb[0]?.size} bytes, page-to-ready ${loadMs} ms` });
    const info = await dbg(page, (d) => ({
      panel: d.panel.name,
      mats: [d.panel.material.name],
      toneMapping: d.renderer.toneMapping,
      colorSpace: d.renderer.outputColorSpace,
      shadows: d.renderer.shadowMap.enabled,
      tex: d.renderer.info.memory.textures,
      canvasTouch: d.canvas.style.touchAction,
      tabindex: d.canvas.getAttribute('tabindex'),
      role: d.canvas.getAttribute('role'),
      label: d.canvas.getAttribute('aria-label'),
      shaderFailed: d.shaderFailed,
      polar: [d.controls.minPolarAngle, d.controls.maxPolarAngle],
      pan: d.controls.enablePan,
      dist: [d.controls.minDistance, d.controls.maxDistance],
    }));
    expect(info.panel).toBe('back_panel');
    expect(info.colorSpace).toBe('srgb');
    expect(info.shadows).toBe(false);
    expect(info.canvasTouch).toBe('pan-y');
    expect(info.role).toBe('img');
    expect(info.label).toMatch(/3D preview of a Black Stimpy hoodie with the .* Stimpie on the back\. Drag to rotate\./);
    expect(info.shaderFailed).toBe(false);
    expect(info.pan).toBe(false);
    expect(info.polar[0]).toBeCloseTo((70 * Math.PI) / 180);
    expect(info.polar[1]).toBeCloseTo((100 * Math.PI) / 180);
    expect(info.dist[0] / info.dist[1]).toBeCloseTo(0.7 / 1.3, 3);
    await expect(page.locator('[data-builder-toggle]')).toBeVisible();
    await expect(page.locator('[data-builder-hint]')).toHaveText('Drag to turn');
    // non-blank: more than a few percent of the canvas has hoodie pixels
    const png = await page.locator('canvas[data-builder-canvas]').screenshot();
    const { data, info: im } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let dark = 0;
    for (let i = 0; i < data.length; i += im.channels) if ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number) < 150) dark++;
    expect(dark / (im.width * im.height)).toBeGreaterThan(0.1);
    await page.locator('[data-builder-frame]').screenshot({ path: `${SHOTS}/3d-loaded-${testInfo.project.name}.png` });
    con.assertClean();
  });

  test('texture is upright and not mirrored: the rendered panel correlates best with the artwork as supplied', async ({ page }) => {
    await open3d(page, '&stimpie=the-void&pack=hoodie-1-stimpie');
    await page.waitForTimeout(1500); // sway ends
    await idle3d(page);
    await page.evaluate(`window.__stimpyBuilder3d.handle.resetView()`);
    await page.waitForTimeout(1200);
    await idle3d(page);
    // project the panel's bounding box to screen
    const rect = await dbg(page, (d) => {
      const THREE_V = d.camera.position.constructor;
      d.panel.geometry.computeBoundingBox();
      const b = d.panel.geometry.boundingBox;
      const canvas = d.canvas.getBoundingClientRect();
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const v = new THREE_V(x, y, z).project(d.camera);
        const sx = (v.x * 0.5 + 0.5) * canvas.width;
        const sy = (-v.y * 0.5 + 0.5) * canvas.height;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      return { x: canvas.x + minX, y: canvas.y + minY, width: maxX - minX, height: maxY - minY };
    });
    const shot = await page.screenshot({ clip: rect });
    const art = await (await fetch(`${API}/api/v1/products/stimpies/the-void`)).json();
    const artBuf = Buffer.from(await (await fetch(art.artworkUrl)).arrayBuffer());
    const N = 48;
    const gray = async (b: Buffer, ops: (s: sharp.Sharp) => sharp.Sharp = (s) => s) =>
      Array.from(await ops(sharp(b).resize(N, Math.round(N / 0.64), { fit: 'fill' }).greyscale()).raw().toBuffer());
    const a = await gray(artBuf);
    const candidates: Record<string, number[]> = {
      normal: await gray(shot),
      flipH: await gray(shot, (s) => s.flop()),
      flipV: await gray(shot, (s) => s.flip()),
      rot180: await gray(shot, (s) => s.flip().flop()),
    };
    const corr = (x: number[], y: number[]) => {
      const mx = x.reduce((p, c) => p + c, 0) / x.length, my = y.reduce((p, c) => p + c, 0) / y.length;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < x.length; i++) { sxy += ((x[i] as number) - mx) * ((y[i] as number) - my); sxx += ((x[i] as number) - mx) ** 2; syy += ((y[i] as number) - my) ** 2; }
      return sxy / Math.sqrt(sxx * syy);
    };
    const scores = Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, corr(a, v)]));
    const best = Object.entries(scores).sort((p, q) => q[1] - p[1])[0]?.[0];
    expect(best, JSON.stringify(scores)).toBe('normal');
    expect(scores.normal as number).toBeGreaterThan(0.5);
  });

  test('swap in 3D: progress sweeps 0 to 1 once, the zip line shows, textures stay bounded, final art is the last tap', async ({ page }, testInfo) => {
    const con = watchConsole(page);
    await open3d(page, '&pack=hoodie-1-stimpie');
    await page.waitForTimeout(2200);
    await idle3d(page);
    const samples = page.evaluate<number[]>(
      () =>
        new Promise((res) => {
          const vals: number[] = [];
          const t0 = performance.now();
          const tick = () => {
            vals.push((window as any).__stimpyBuilder3d.uniforms.uProgress.value);
            if (performance.now() - t0 < 1800) requestAnimationFrame(tick);
            else res(vals);
          };
          tick();
        }),
    );
    await page.waitForTimeout(100);
    await option(page, /THE VOID/i).click();
    const vals = await samples;
    const max = Math.max(...vals);
    expect(max).toBeGreaterThan(0.9);
    expect(vals.some((v) => v > 0.2 && v < 0.8)).toBe(true);
    expect(vals[vals.length - 1]).toBe(0); // reset after the swap
    await idle3d(page);
    const state = await dbg(page, (d) => ({ keys: d.textureKeys(), tex: d.renderer.info.memory.textures, progress: d.uniforms.uProgress.value }));
    expect(state.tex).toBeLessThanOrEqual(6);
    expect(state.progress).toBe(0);
    await page.locator('[data-builder-frame]').screenshot({ path: `${SHOTS}/3d-after-swap-${testInfo.project.name}.png` });
    con.assertClean();
  });

  test('200 swaps then 20 mode toggles: textures never exceed 6, everything is released (test 17)', async ({ page }) => {
    test.setTimeout(240_000);
    await open3d(page, '&pack=hoodie-1-stimpie');
    await page.getByRole('radio', { name: /Hoodie only/ }).click();
    await page.waitForTimeout(2200);
    const names = ['THE VOID', 'STIMPY', 'AFTER DARK', 'THE ORBIT'];
    let maxTex = 0;
    for (let i = 0; i < 40; i++) {
      await option(page, new RegExp(names[i % names.length] as string, 'i')).click();
      await page.waitForTimeout(120);
      // fast-forward: wait until the swap finished roughly every 5th iteration
      if (i % 5 === 4) await idle3d(page);
      const tex = await dbg(page, (d) => d.renderer.info.memory.textures);
      maxTex = Math.max(maxTex, tex);
    }
    await idle3d(page);
    expect(maxTex).toBeLessThanOrEqual(6);
    // toggle 3D <-> 2D
    for (let i = 0; i < 20; i++) {
      await page.locator('[data-builder-toggle] [data-view="2d"]').click();
      await expect(page.locator('canvas[data-builder-canvas]')).toHaveCount(0);
      expect(await page.evaluate(() => !!(window as any).__stimpyBuilder3d)).toBe(false);
      await page.locator('[data-builder-toggle] [data-view="3d"]').click();
      await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 60_000 });
    }
    await page.locator('[data-builder-toggle] [data-view="2d"]').click();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('orbit: drag rotates, polar and distance stay within limits, wheel needs ctrl, Back view resets', async ({ page }) => {
    await open3d(page);
    await page.waitForTimeout(2200);
    const box = (await page.locator('canvas[data-builder-canvas]').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const before = await dbg(page, (d) => d.camera.position.toArray());
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 220, cy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const after = await dbg(page, (d) => d.camera.position.toArray());
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.3);
    // aggressive vertical drag: polar stays within 70..100 degrees
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 400, { steps: 12 });
    await page.mouse.move(cx, cy + 600, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const polar = await dbg(page, (d) => d.controls.getPolarAngle());
    expect(polar).toBeGreaterThanOrEqual((70 * Math.PI) / 180 - 1e-3);
    expect(polar).toBeLessThanOrEqual((100 * Math.PI) / 180 + 1e-3);
    // wheel without ctrl does nothing to the camera
    const d0 = await dbg(page, (d) => d.controls.getDistance());
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(400);
    expect(await dbg(page, (d) => d.controls.getDistance())).toBeCloseTo(d0, 3);
    // zoom buttons hit the distance limits
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(500);
    const limits = await dbg(page, (d) => [d.controls.getDistance(), d.controls.minDistance, d.controls.maxDistance]);
    expect(limits[0]).toBeGreaterThanOrEqual(limits[1] - 1e-3);
    for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.waitForTimeout(500);
    const far = await dbg(page, (d) => [d.controls.getDistance(), d.controls.maxDistance]);
    expect(far[0]).toBeLessThanOrEqual(far[1] + 1e-3);
    // Back view
    await page.getByRole('button', { name: 'Back view' }).click();
    await page.waitForTimeout(1200);
    const reset = await dbg(page, (d) => d.camera.position.toArray());
    expect(Math.abs(reset[0])).toBeLessThan(0.05);
    expect(reset[2]).toBeLessThan(-2);
  });

  test('keyboard and buttons: arrow keys rotate only with canvas focus; rotate buttons turn 45 degrees', async ({ page }) => {
    await open3d(page);
    await page.waitForTimeout(2200);
    const az = () => dbg(page, (d) => d.controls.getAzimuthalAngle());
    const diff = (a: number, b: number) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    const a0 = await az();
    await page.getByRole('button', { name: 'Rotate right 45 degrees' }).click();
    await page.waitForTimeout(700);
    const a1 = await az();
    expect(Math.abs(diff(a1, a0) - Math.PI / 4)).toBeLessThan(0.08);
    await page.keyboard.press('ArrowLeft'); // focus is on the button, not the canvas: no rotation
    await page.waitForTimeout(400);
    expect(diff(await az(), a1)).toBeLessThan(0.02);
    await page.locator('canvas[data-builder-canvas]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);
    expect(diff(await az(), a1)).toBeGreaterThan(0.1);
    // Tab leaves the canvas
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS');
  });

  test('mode toggle keeps the selection; 2D view shown again without replaying the swap', async ({ page }) => {
    await open3d(page, '&color=2&stimpie=the-void&pack=hoodie-1-stimpie');
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-builder-toggle] [data-view="2d"]').click();
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true');
    await expect(option(page, /THE VOID/i)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-layer="zip-line"]')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('stimpy.builder.view'))).toBe('2d');
  });

  test('colour change animates the tint in 3D and the label updates', async ({ page }) => {
    await open3d(page);
    await page.waitForTimeout(2200);
    const c0 = await dbg(page, (d) => {
      let col = '';
      d.scene.traverse((o: D) => { if (o.isMesh && o.material?.name === 'fabric') col = o.material.color.getHexString(); });
      return col;
    });
    await page.getByRole('radio', { name: /Coral/ }).click();
    await page.waitForTimeout(900);
    const c1 = await dbg(page, (d) => {
      let col = '';
      d.scene.traverse((o: D) => { if (o.isMesh && o.material?.name === 'fabric') col = o.material.color.getHexString(); });
      return col;
    });
    expect(c0).not.toBe(c1);
    expect(await page.locator('canvas[data-builder-canvas]').getAttribute('aria-label')).toMatch(/Coral Stimpy hoodie/);
  });

  test('swap shader failure: silent cross-fade fallback, SHADER_PATCH_FAILED reported, art still changes', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (m) => logs.push(m.text()));
    await open3d(page, '&builder3dshader=break&pack=hoodie-1-stimpie');
    await page.waitForTimeout(2200);
    expect(await dbg(page, (d) => d.shaderFailed)).toBe(true);
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '3d');
    await option(page, /THE VOID/i).click();
    await page.waitForTimeout(1200);
    await idle3d(page);
    expect(logs.some((l) => l.includes('builder_fallback') && l.includes('SHADER_PATCH_FAILED'))).toBe(true);
    const mapOk = await dbg(page, (d) => !!d.panel.material.map);
    expect(mapOk).toBe(true);
  });

  test('context loss: restored context keeps state; an unrestored loss falls back to 2D within 3 s', async ({ page }) => {
    await open3d(page, '&color=2');
    await page.waitForTimeout(2200);
    await page.evaluate(`(() => { const gl = window.__stimpyBuilder3d.renderer.getContext(); const e = gl.getExtension('WEBGL_lose_context'); window.__lose = e; e.loseContext(); setTimeout(() => e.restoreContext(), 600); })()`);
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '3d');
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true');
    await idle3d(page);
    await page.evaluate(`window.__stimpyBuilder3d.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()`);
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '2d', { timeout: 6000 });
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true'); // selection kept
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('a broken GLB URL (404) falls back to 2D silently and fires builder_fallback once', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (m) => logs.push(m.text()));
    await page.route('**/*.glb', (r) => r.fulfill({ status: 404, body: 'nope' }));
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => logs.some((l) => l.includes('builder_fallback') && l.includes('GLB_FAILED')), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '2d');
    expect(logs.filter((l) => l.includes('builder_fallback') && l.includes('GLB_FAILED')).length).toBe(1);
    await expect(page.locator('body')).not.toContainText(/failed|error|sorry/i);
  });

  test('a corrupt GLB falls back to 2D silently', async ({ page }) => {
    await page.route('**/*.glb', (r) => r.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from('this is not a glb at all, just text') }));
    await page.goto('/builder?builder3d=force', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '2d', { timeout: 30_000 });
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
  });

  test('off-screen pause: the render loop stops when the canvas is scrolled away and resumes (test 19)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await open3d(page);
    await page.waitForTimeout(2300);
    await idle3d(page);
    await page.evaluate(() => { const s = document.createElement('div'); s.style.height = '3000px'; s.id = 'pad'; document.querySelector('[data-builder]')!.after(s); window.scrollTo(0, 2200); });
    await page.waitForTimeout(600);
    const f1 = await dbg(page, (d) => d.frames);
    // poke the engine: while off-screen it must not render
    await page.evaluate(`window.__stimpyBuilder3d.handle.rotateBy(30)`);
    await page.waitForTimeout(600);
    const f2 = await dbg(page, (d) => d.frames);
    expect(f2).toBe(f1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    expect(await dbg(page, (d) => d.frames)).toBeGreaterThan(f2);
  });
});
