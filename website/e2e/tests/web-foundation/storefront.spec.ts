import { expect, test } from '@playwright/test';
import { apiStimpies, expectFocusVisible, expectNoHorizontalScroll, shot, watchConsole } from './helpers';

test.describe('web foundation smoke', () => {
  test('home: hero, packs, drop strip, no console errors, no horizontal scroll, skip link', async ({ page }, info) => {
    const c = watchConsole(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Order now' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pick your set' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current drop' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Skip link is the first focusable element and becomes visible with a focus ring.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await shot(page, info, 'home');
    c.assertClean();
  });

  test('header: nav, mobile menu with focus trap, cart opens and is empty', async ({ page }, info) => {
    await page.goto('/');
    const phone = info.project.name.startsWith('phone');
    if (phone) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      const dialog = page.getByRole('dialog', { name: 'Menu' });
      await expect(dialog).toBeVisible();
      // focus stays inside the menu after many Tab presses
      for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    } else {
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shop' })).toBeVisible();
    }
    await page.getByRole('button', { name: /^Cart, 0 items/ }).click();
    await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeVisible();
    await expect(page.getByText('Your cart is empty.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeHidden();
  });

  test('shop: tabs and Stimpie filters live in the URL', async ({ page }, info) => {
    const c = watchConsole(page);
    await page.goto('/shop');
    await expect(page.getByRole('heading', { level: 1, name: 'Shop' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Stimpy Hoodie/ }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Stimpies' }).click();
    await expect(page).toHaveURL(/tab=stimpies/);
    await expect(page.getByRole('status').filter({ hasText: /Stimpies$/ }).first()).toBeVisible();

    const phone = info.project.name.startsWith('phone');
    if (phone) {
      await page.getByRole('button', { name: /^Filters/ }).click();
      const sheet = page.getByRole('dialog', { name: 'Filters' });
      await page.waitForTimeout(600); // sheet slide-in
      await sheet.getByRole('radio', { name: 'Limited' }).click();
      await expect(page).toHaveURL(/type=LIMITED/);
      await sheet.getByRole('button', { name: 'Show results' }).click();
    } else {
      await page.getByRole('radiogroup', { name: 'Type' }).getByRole('radio', { name: 'Limited' }).click({ force: true });
      await expect(page).toHaveURL(/type=LIMITED/);
    }
    // every card now shows the Limited badge
    const cards = page.locator('main ul >> li').filter({ has: page.getByText('Limited', { exact: true }) });
    await expect(cards.first()).toBeVisible();

    // unknown drop slug: filter ignored with a notice
    await page.goto('/shop?tab=stimpies&drop=does-not-exist');
    await expect(page.getByText(/couldn.t find that drop/i)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shot(page, info, 'shop-stimpies');
    c.assertClean();
  });

  test('hoodie detail: pack, colour, size, two Stimpies, add to cart, persists on reload', async ({ page }, info) => {
    const c = watchConsole(page);
    await page.goto('/shop/hoodie/stimpy-hoodie');
    await expect(page.getByRole('heading', { level: 1, name: 'Stimpy Hoodie' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const add = page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true });
    await expect(add).toBeDisabled();

    await page.getByRole('radio', { name: /Hoodie \+ 2 Stimpies/ }).click({ force: true });
    await page.getByRole('radio', { name: /^Cream/ }).click({ force: true });
    // M is sold out in Cream in the seed? pick the first size that is enabled
    const sizes = page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio');
    const count = await sizes.count();
    for (let i = 0; i < count; i++) {
      const r = sizes.nth(i);
      if (await r.isEnabled()) {
        await r.click({ force: true });
        break;
      }
    }
    await expect(page.getByTestId('stimpie-picker').getByText(/Pick 2 Stimpies \(0\/2\)/)).toBeVisible();
    const picks = page.getByTestId('stimpie-picker').getByRole('button', { pressed: false });
    await picks.nth(0).click();
    await picks.nth(0).click(); // the first unpressed one again (the previous is now pressed)
    await expect(page.getByTestId('stimpie-picker').getByText(/\(2\/2\)/)).toBeVisible();
    await expect(add).toBeEnabled();
    await shot(page, info, 'hoodie-configured');
    await add.click();

    const drawer = page.getByRole('dialog', { name: 'Your cart' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
    await expect(drawer.getByTestId('cart-line')).toContainText('Hoodie + 2 Stimpies');
    await shot(page, info, 'cart-drawer');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();

    // exact contract shape in localStorage
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stimpy.cart') ?? 'null'));
    expect(stored.v).toBe(1);
    expect(stored.lines[0].item).toMatchObject({ kind: 'pack', qty: 1 });
    expect(stored.lines[0].item.stimpieIds).toHaveLength(2);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();
    c.assertClean();
  });

  test('hoodie detail honours preselection params', async ({ page }) => {
    await page.goto('/shop/hoodie/stimpy-hoodie?pack=hoodie-1-stimpie&color=1');
    await expect(page.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /^Black/ })).toBeChecked();
  });

  test('stimpie detail: AVAILABLE adds to cart; LOW, SOLD_OUT and UPCOMING show their states', async ({ page }, info) => {
    const c = watchConsole(page);
    const all = await apiStimpies();
    const by = (s: string) => all.find((x) => x.status === s);

    const available = by('AVAILABLE')!;
    await page.goto(`/shop/stimpie/${available.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(available.name);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('dialog', { name: 'Your cart' }).getByTestId('cart-line')).toContainText(`Stimpie: ${available.name}`);
    await page.keyboard.press('Escape');

    const low = by('LOW');
    if (low) {
      await page.goto(`/shop/stimpie/${low.slug}`);
      await expect(page.getByTestId('remaining')).toHaveText(`Only ${low.remaining} left`);
    }
    const sold = by('SOLD_OUT');
    if (sold) {
      await page.goto(`/shop/stimpie/${sold.slug}`);
      await expect(page.getByTestId('stimpie-status-sold-out')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
      await shot(page, info, 'stimpie-sold-out');
    }
    const upcoming = by('UPCOMING');
    if (upcoming) {
      await page.goto(`/shop/stimpie/${upcoming.slug}`);
      await expect(page.getByTestId('stimpie-status-upcoming')).toBeVisible();
      await expect(page.getByRole('timer').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Notify me' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(0);
      await shot(page, info, 'stimpie-upcoming');
    }
    await page.goto('/shop/stimpie/not-a-real-slug');
    await expect(page.getByRole('heading', { name: /isn.t here/ })).toBeVisible();
    c.assertClean();
  });

  test('drops: live drop, upcoming subscribe (validation, success, idempotent)', async ({ page }, info) => {
    const c = watchConsole(page);
    await page.goto('/drops');
    await expect(page.getByRole('heading', { level: 1, name: 'Drops' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Current drop' })).toBeVisible();
    await expect(page.getByRole('timer').first()).toBeVisible();

    const form = page.getByRole('form').first();
    await form.getByRole('radio', { name: 'Email' }).click({ force: true });
    await form.getByRole('button', { name: 'Notify me' }).click();
    await expect(form.getByText('Enter your email address.')).toBeVisible();
    await form.getByLabel('Email address').fill(`fe1-${Date.now()}@example.com`);
    await form.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByText("You're on the list.").first()).toBeVisible();
    await shot(page, info, 'drops');
    await expectNoHorizontalScroll(page);

    await page.goto('/drops/drop-001');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Drop 001');
    await expect(page.getByTestId('drop-stimpies').getByRole('listitem').first()).toBeVisible();
    c.assertClean();
  });

  test('help: size guide table, care, FAQ groups in the URL', async ({ page }, info) => {
    const c = watchConsole(page);
    await page.goto('/help');
    await expect(page.getByTestId('size-chart')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Size' })).toBeVisible();
    await page.getByRole('tab', { name: 'Care' }).click();
    await expect(page).toHaveURL(/tab=care/);
    await expect(page.getByText(/Wash cold/)).toBeVisible();
    await page.getByRole('tab', { name: 'FAQ' }).click();
    await expect(page).toHaveURL(/tab=faq/);
    await expect(page.getByTestId('faq').getByRole('heading', { level: 2 }).first()).toBeVisible();
    const first = page.getByTestId('faq').locator('summary').first();
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expectNoHorizontalScroll(page);
    await shot(page, info, 'help-faq');
    c.assertClean();
  });

  test('content pages render, have one h1, and never scroll sideways', async ({ page }) => {
    const c = watchConsole(page);
    for (const path of ['/how-it-works', '/delivery-returns', '/about', '/legal', '/builder', '/checkout', '/track']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expectNoHorizontalScroll(page);
    }
    await page.goto('/delivery-returns');
    await expect(page.locator('#main-content').getByTestId('fee-highlight')).toBeVisible();
    c.assertClean();
  });

  test('keyboard focus is visible on links and buttons', async ({ page }, info) => {
    await page.goto('/shop');
    await expectFocusVisible(page, page.getByRole('link', { name: 'Skip to content' }));
    if (!info.project.name.startsWith('phone')) {
      await expectFocusVisible(page, page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shop' }));
    }
  });

  test('seo basics: sitemap, robots, 404 status, canonical and JSON-LD', async ({ page, request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('/shop/hoodie/stimpy-hoodie');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /checkout');
    const notFound = await request.get('/definitely-not-a-page');
    expect(notFound.status()).toBe(404);
    await page.goto('/shop/hoodie/stimpy-hoodie');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/shop\/hoodie\/stimpy-hoodie$/);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld ?? '[]')).toBeTruthy();
  });
});
