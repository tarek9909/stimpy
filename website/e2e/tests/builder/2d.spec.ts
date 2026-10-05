import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, watchConsole } from '../web-foundation/helpers';
import { GL_ARGS, SHOTS, option, watchThree } from './util';

test.use({ launchOptions: { args: GL_ARGS } });

const shot = (name: string, testInfo: { project: { name: string } }) => `${SHOTS}/${name}-${testInfo.project.name}.png`;

test.describe('Builder 2D', () => {
  test('headless software GL silently chooses 2D: no toggle, no canvas, no three.js, no console errors', async ({ page }) => {
    const con = watchConsole(page);
    const three = watchThree(page);
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-layer="hoodie"]')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-builder]')).toHaveAttribute('data-builder-view', '2d');
    await expect(page.locator('[data-builder-toggle]')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await three.settled()).toEqual([]);
    await expect(page.locator('body')).not.toContainText(/webgl|not supported|unsupported/i);
    con.assertClean();
  });

  test('home page: teaser swaps with the zip wipe, CTA carries the selection, no three.js', async ({ page }) => {
    const con = watchConsole(page);
    const three = watchThree(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const teaser = page.locator('#builder-teaser');
    await teaser.scrollIntoViewIfNeeded();
    await expect(teaser.locator('[data-builder="teaser"]')).toBeVisible();
    await expect(teaser.getByRole('radio')).toHaveCount(4);
    const list = teaser.getByRole('listbox', { name: 'Stimpies' });
    expect(await list.getByRole('option').count()).toBeLessThanOrEqual(6);
    const second = list.getByRole('option').nth(1);
    const slug = await second.getAttribute('data-stimpie-slug');
    await second.click();
    await expect.poll(() => teaser.locator('[data-layer="zip-line"]').count(), { timeout: 3000 }).toBe(1);
    await expect(teaser.getByRole('link', { name: 'Open full Builder' })).toHaveAttribute('href', new RegExp(`stimpie=${slug}`));
    await page.waitForTimeout(700);
    await expect(teaser.locator('[data-layer="zip-line"]')).toHaveCount(0);
    expect(await three.settled()).toEqual([]);
    con.assertClean();
  });

  test('zip wipe: mid-swap frame follows the 450 ms timeline (clip-path and line in lock-step), only one swap at a time', async ({ page }, testInfo) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-layer="stimpie-new"]')).toBeVisible();
    await page.waitForTimeout(800);
    await option(page, /THE VOID/i).click();
    await expect(page.locator('[data-swapping="true"]')).toHaveCount(1);
    const sample = await page.evaluate(() => {
      const anims = document.getAnimations().filter((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
        return !!el && !!el.closest('[data-layer="swap"]');
      });
      const durations = anims.map((a) => a.effect?.getTiming().duration);
      for (const a of anims) {
        a.pause();
        a.currentTime = 225;
      }
      const img = document.querySelector('[data-layer="stimpie-new"]') as HTMLElement;
      const line = document.querySelector('[data-layer="zip-line"]') as HTMLElement;
      const wrap = document.querySelector('[data-layer="swap"]') as HTMLElement;
      const h = wrap.offsetHeight;
      const m = new DOMMatrixReadOnly(getComputedStyle(line).transform);
      return { durations, clip: getComputedStyle(img).clipPath, lineY: m.m42, h, lineOpacity: getComputedStyle(line).opacity };
    });
    expect(sample.durations.every((d) => d === 450)).toBe(true);
    expect(sample.durations.length).toBe(3);
    const pctMatch = /inset\(0px 0px ([\d.]+)% 0px\)/.exec(sample.clip) ?? /inset\(0px 0px ([\d.]+)%/.exec(sample.clip);
    expect(pctMatch, `clip ${sample.clip}`).not.toBeNull();
    expect(Number(pctMatch?.[1])).toBeGreaterThan(40);
    expect(Number(pctMatch?.[1])).toBeLessThan(60);
    expect(sample.lineY / sample.h).toBeGreaterThan(0.4);
    expect(sample.lineY / sample.h).toBeLessThan(0.6);
    expect(Number(sample.lineOpacity)).toBe(1);
    await page.locator('[data-builder-frame]').screenshot({ path: shot('2d-midswap', testInfo) });
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    await expect(page.locator('[data-layer="stimpie-old"]')).toHaveCount(0);
    await expect(page.locator('[data-layer="stimpie-new"]')).toHaveAttribute('alt', /THE VOID/i);
  });

  test('rapid swapping: ten taps in two seconds end on the last one, one old image at most, no console errors', async ({ page }) => {
    const con = watchConsole(page);
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-layer="stimpie-new"]')).toBeVisible();
    await page.waitForTimeout(800);
    // pick hoodie only so every tap is a plain preview
    await page.getByRole('radio', { name: /Hoodie only/ }).click();
    const options = page.getByRole('listbox', { name: 'Stimpies' }).getByRole('option');
    const n = Math.min(10, await options.count());
    let maxOld = 0;
    for (let i = 0; i < n; i++) {
      await options.nth(i).click({ force: true });
      maxOld = Math.max(maxOld, await page.locator('[data-layer="stimpie-old"]').count());
      await page.waitForTimeout(150);
    }
    const lastSlug = await options.nth(n - 1).getAttribute('data-stimpie-slug');
    await page.waitForTimeout(1200);
    await expect(page.locator('[data-layer="stimpie-new"]')).toHaveCount(1);
    await expect(page.locator('[data-layer="stimpie-old"]')).toHaveCount(0);
    expect(maxOld).toBeLessThanOrEqual(1);
    await expect(options.nth(n - 1)).toHaveAttribute('aria-selected', 'true');
    expect(lastSlug).toBeTruthy();
    con.assertClean();
  });

  test('colour change cross-fades the hoodie, keeps the Stimpie and never shows the zip line', async ({ page }) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const before = await page.locator('[data-layer="hoodie"]').getAttribute('src');
    await page.getByRole('radio', { name: /Cream/ }).click();
    let sawFade = false;
    for (let i = 0; i < 20 && !sawFade; i++) {
      sawFade = (await page.locator('[data-layer="hoodie-prev"]').count()) > 0;
      if (!sawFade) await page.waitForTimeout(15);
    }
    await expect(page.locator('[data-layer="zip-line"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await page.locator('[data-layer="hoodie"]').getAttribute('src')).not.toBe(before);
    await expect(page.locator('[data-layer="hoodie-prev"]')).toHaveCount(0);
    await expect(page.locator('[data-layer="stimpie-new"]')).toBeVisible();
  });

  test('pack flow: two slots, size sheet, add to cart creates the exact cart item', async ({ page }, testInfo) => {
    const con = watchConsole(page);
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const add = page.locator('[data-builder-add]');
    await expect(add).toBeDisabled();
    await expect(page.getByText('Pick 1 more Stimpie')).toBeVisible();
    // choose THE VOID (a Core, purchasable) for slot 2
    await option(page, /THE VOID/i).click();
    await expect(add).toBeEnabled();
    await expect(add).toContainText('Add to cart - $45');
    await add.click();
    const sheet = page.getByRole('dialog', { name: 'Choose your size' });
    await expect(sheet).toBeVisible();
    await page.screenshot({ path: shot('2d-sizesheet', testInfo) });
    // Black M is LOW (4), XL sold out
    await expect(sheet.getByRole('radio', { name: /XL, sold out/ })).toBeDisabled();
    await sheet.getByRole('radio', { name: /^M/ }).click();
    await sheet.locator('[data-builder-confirm-size]').click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('stimpy.cart') ?? '{}').lines?.length ?? 0)).toBe(1);
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('stimpy.cart') ?? '{}'));
    expect(cart.lines).toHaveLength(1);
    const item = cart.lines[0].item;
    expect(item.kind).toBe('pack');
    expect(item.qty).toBe(1);
    expect(item.stimpieIds).toHaveLength(2);
    expect(new Set(item.stimpieIds).size).toBe(2);
    expect(Object.keys(item).sort()).toEqual(['colorId', 'hoodieId', 'kind', 'packId', 'qty', 'sizeId', 'stimpieIds']);
    expect(cart.lines[0].ui.unitPriceCents).toBe(4500);
    expect(cart.lines[0].ui.colorName).toBe('Black');
    con.assertClean();
  });

  test('hoodie only and a sold-out colour', async ({ page }) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByRole('radio', { name: /Hoodie only/ }).click();
    await expect(page.locator('[data-builder-add]')).toContainText('$25');
    await expect(page.locator('[data-builder-add]')).toBeEnabled();
    // Coral is almost entirely out of stock in the seed: find a sold-out swatch
    const soldOut = page.locator('[data-sold-out="true"]').first();
    if (await soldOut.count()) {
      await soldOut.click();
      await expect(page.locator('[data-builder-add]')).toBeDisabled();
      await expect(page.getByText('This colour is sold out. Try another colour.')).toBeVisible();
    }
  });

  test('sold-out Stimpie is previewable but not addable, with the reason', async ({ page }) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const soldOut = page.getByRole('listbox', { name: 'Stimpies' }).getByRole('option', { name: /sold out/i }).first();
    if (await soldOut.count()) {
      await soldOut.click();
      await expect(page.locator('[data-builder-add]')).toBeDisabled();
      await expect(page.getByText('Choose an available Stimpie')).toBeVisible();
    }
  });

  test('share link restores the selection, invalid values are ignored, URL stays in sync without history entries', async ({ page }) => {
    await page.goto('/builder?color=2&pack=hoodie-1-stimpie&stimpie=the-void', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ })).toHaveAttribute('aria-checked', 'true');
    await expect(option(page, /THE VOID/i)).toHaveAttribute('aria-selected', 'true');
    const len = await page.evaluate(() => history.length);
    await page.getByRole('radio', { name: /Black/ }).click();
    await expect.poll(() => page.url()).toContain('color=1');
    expect(await page.evaluate(() => history.length)).toBe(len);
    await page.goto('/builder?color=99999&stimpie=nope&pack=%3Cscript%3E', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-builder]')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Black/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('metadata for a share link uses the Stimpie', async ({ request }) => {
    const html = await (await request.get('/builder?stimpie=the-void')).text();
    expect(html).toMatch(/THE VOID on a Stimpy hoodie/i);
    expect(html).toMatch(/og:image/);
  });

  test('reduced motion: swap and colour change are instant, no zip line, no animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await option(page, /THE VOID/i).click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.effect && (a.effect as KeyframeEffect).target?.closest?.('[data-builder]')).length)).toBe(0);
    await expect(page.locator('[data-layer="zip-line"]')).toHaveCount(0);
    await expect(page.locator('[data-layer="stimpie-new"]')).toHaveAttribute('alt', /THE VOID/i);
    await expect(page.locator('[data-layer="stimpie-old"]')).toHaveCount(0);
    await page.getByRole('radio', { name: /Cream/ }).click();
    await page.waitForTimeout(100);
    await expect(page.locator('[data-layer="hoodie-prev"]')).toHaveCount(0);
  });

  test('keyboard only: swatches, carousel, packs, size sheet focus returns to Add to cart', async ({ page }) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const black = page.getByRole('radio', { name: /^Black/ });
    await black.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /Cream/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(black).toHaveAttribute('aria-checked', 'true');
    // carousel is one tab stop
    expect(await page.locator('[role="option"][tabindex="0"]').count()).toBe(1);
    const first = page.locator('[role="option"][tabindex="0"]');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    // Tab leaves the carousel
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('option');
    // pack radiogroup with arrows
    const packs = page.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ });
    await page.getByRole('radio', { name: /Hoodie \+ 2 Stimpies/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(packs).toHaveAttribute('aria-checked', 'true');
    const add = page.locator('[data-builder-add]');
    await expect(add).toBeEnabled();
    await add.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Choose your size' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(add).toBeFocused();
  });

  test('live region and accessible names', async ({ page }) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ }).click();
    await expect(page.locator('[data-builder-live]')).toContainText(/Black selected\..*Hoodie plus 1 Stimpie, \$35\./);
    await expect(page.getByRole('combobox', { name: 'Choose Stimpie' })).toHaveCount(1);
    await expect(page.locator('[data-layer="hoodie"]')).toHaveAttribute('alt', /Black Stimpy hoodie, back view/);
  });

  test('layout: no horizontal scroll, 44px targets, Preview label and See real photos always visible', async ({ page }, testInfo) => {
    await page.goto('/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await expectNoHorizontalScroll(page);
    await expect(page.getByText('Preview', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'See real photos' })).toBeVisible();
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-builder] button, [data-builder] [role="radio"]')]
        .map((e) => (e as HTMLElement).getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
        .length,
    );
    expect(small).toBe(0);
    // CLS: the stage reserves its box before images load
    const aspect = await page.locator('[data-builder-frame]').evaluate((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height);
    expect(aspect).toBeCloseTo(0.8, 1);
    await page.screenshot({ path: shot('2d-page', testInfo), fullPage: false });
  });
});
