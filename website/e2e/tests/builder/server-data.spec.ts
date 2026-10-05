import { expect, test } from '@playwright/test';

type AuditVitals = { lcp: number; cls: number; eventDurations: number[] };

declare global {
  interface Window {
    __auditVitals?: AuditVitals;
  }
}

test('public Builder HTML contains server-fetched data and the browser does not refetch its catalog', async ({ page }, info) => {
  await page.addInitScript(() => {
    const metrics: AuditVitals = { lcp: 0, cls: 0, eventDurations: [] };
    window.__auditVitals = metrics;

    const watch = (type: string, update: (entry: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(update));
        observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      } catch {
        // Unsupported performance entry types are omitted from this audit sample.
      }
    };

    watch('largest-contentful-paint', (entry) => {
      metrics.lcp = entry.startTime;
    });
    watch('layout-shift', (entry) => {
      const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
    });
    watch(
      'event',
      (entry) => {
        const interaction = entry as PerformanceEntry & { interactionId?: number };
        if (interaction.interactionId) metrics.eventDurations.push(entry.duration);
      },
      { durationThreshold: 16 },
    );
  });

  const apiOrigin = new URL(process.env.E2E_API_URL ?? 'http://localhost:4000').origin;
  const browserCatalogRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const isBuilderData = /^\/api\/v1\/(?:builder\/config|options|packs(?:\/|$)|products\/(?:stimpies(?:\/|$)|hoodies\/))/.test(url.pathname);
    if (url.origin === apiOrigin && isBuilderData) browserCatalogRequests.push(`${request.method()} ${url.pathname}`);
  });

  const response = await page.goto('/builder', { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain('data-builder="page"');
  expect(html).toMatch(/aria-label="Preview:[^"]+ Stimpy hoodie/);
  await expect(page.locator('[data-builder="page"]')).toBeVisible();
  await page.waitForTimeout(500);

  const cart = page.getByRole('button', { name: /^Cart/ }).first();
  await expect(cart).toBeVisible();
  await cart.click();
  await page.waitForTimeout(250);

  expect(browserCatalogRequests, 'Builder config/catalog must be fetched by the server component').toEqual([]);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    return {
      ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      fcpMs: Math.round(fcp),
      lcpMs: Math.round(window.__auditVitals?.lcp ?? 0),
      cls: Number((window.__auditVitals?.cls ?? 0).toFixed(4)),
      maxEventDurationMs: window.__auditVitals?.eventDurations.length
        ? Math.max(...window.__auditVitals.eventDurations)
        : null,
    };
  });
  expect(metrics.ttfbMs).not.toBeNull();
  expect(metrics.fcpMs).toBeGreaterThan(0);
  expect(metrics.lcpMs).toBeGreaterThan(0);
  // This suite normally runs against local development servers; it is not a Lighthouse score.
  console.log(`LOCAL_BROWSER_VITALS ${info.project.name} ${JSON.stringify(metrics)}`);
});
