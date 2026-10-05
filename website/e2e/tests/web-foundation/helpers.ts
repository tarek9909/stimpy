import { expect, type Page, type TestInfo } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Collect console errors and page errors for the lifetime of a page; call `assertClean()` at the end. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // A 404 from a deliberately missing resource is not a console error of ours.
    if (/Failed to load resource.*404/.test(text)) return;
    errors.push(text.slice(0, 2500));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  return {
    errors,
    assertClean() {
      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

/** No horizontal page scroll (design-system 15: nothing wider than the viewport). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** Press Tab until `locator` is focused (max 40 presses) and assert a visible 3px focus outline. */
export async function expectFocusVisible(page: Page, locator: ReturnType<Page['locator']>) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) break;
  }
  const outline = await locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
}

export async function shot(page: Page, info: TestInfo, name: string) {
  // Screenshots inject a caret style; take them only after hydration or React reports a false mismatch.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/web-foundation/${info.project.name}-${name}.png`, fullPage: true });
}

export interface ApiStimpie {
  id: number;
  slug: string;
  name: string;
  status: 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';
  type: 'CORE' | 'LIMITED';
  remaining: number | null;
  purchasable: boolean;
  drop: { id: number; slug: string; name: string } | null;
}

export async function apiStimpies(): Promise<ApiStimpie[]> {
  const res = await fetch(`${API}/api/v1/products/stimpies?includeUpcoming=true&includeSoldOut=true&includeEnded=true`);
  return (await res.json()) as ApiStimpie[];
}
