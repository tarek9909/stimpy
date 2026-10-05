import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  publicEnv: {
    NEXT_PUBLIC_APP_ENV: 'production',
    NEXT_PUBLIC_ANALYTICS_SRC: 'https://metrics.example.test/script.js',
    NEXT_PUBLIC_ANALYTICS_DOMAIN: 'store.example.test',
  },
}));

import { installAnalyticsScript } from '@/components/layout/AnalyticsLoader';
import { buildPageViewProps } from '@/components/layout/ClientEffects';
import { safeAnalyticsPath, track } from '@/lib/track';
import { captureUtm } from '@/lib/utm';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.querySelectorAll('[data-stimpy-analytics]').forEach((script) => script.remove());
  delete window.plausible;
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null });
  delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
});

describe('privacy-aware analytics', () => {
  it('does not inject a script when configuration is absent or the app is not production', () => {
    expect(installAnalyticsScript({
      src: undefined,
      domain: undefined,
      appEnv: 'local',
      production: false,
      doNotTrack: false,
      globalPrivacyControl: false,
    })).toBeNull();
    expect(document.querySelector('[data-stimpy-analytics]')).toBeNull();
  });

  it('loads only the configured HTTPS script and disables provider auto-pageviews', () => {
    const cleanup = installAnalyticsScript({
      src: 'https://metrics.example.test/script.js',
      domain: 'store.example.test',
      appEnv: 'production',
      production: true,
      doNotTrack: false,
      globalPrivacyControl: false,
    });
    const script = document.querySelector<HTMLScriptElement>('script[data-stimpy-analytics]');
    expect(script).not.toBeNull();
    expect(script).toMatchObject({ async: true, defer: true, src: 'https://metrics.example.test/script.js' });
    expect(script?.dataset.domain).toBe('store.example.test');
    expect(window.plausible?.o).toEqual({ autoCapturePageviews: false });
    cleanup?.();
    expect(document.querySelector('[data-stimpy-analytics]')).toBeNull();
  });

  it.each([
    { doNotTrack: true, globalPrivacyControl: false },
    { doNotTrack: false, globalPrivacyControl: true },
  ])('honors privacy signal $doNotTrack/$globalPrivacyControl', (signals) => {
    expect(installAnalyticsScript({
      src: 'https://metrics.example.test/script.js',
      domain: 'store.example.test',
      appEnv: 'production',
      production: true,
      ...signals,
    })).toBeNull();
    expect(document.querySelector('[data-stimpy-analytics]')).toBeNull();
  });

  it('reports redacted pageviews and scrubs PII fields', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const plausible = vi.fn();
    window.plausible = plausible;
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '0' });

    track('page_view', { path: '/order/STP-1042/thanks?email=private', email: 'private@example.test' });

    expect(plausible).toHaveBeenCalledWith('pageview', {
      props: { path: '/order/thanks' },
      url: 'http://localhost:3000/order/thanks',
    });
    expect(safeAnalyticsPath('/unsubscribe/private-token?email=private')).toBe('/unsubscribe');
  });

  it('adds only clean UTM campaign fields and the referrer host to page views', () => {
    window.history.replaceState({}, '', '/shop?utm_source=instagram&utm_medium=story&utm_campaign=drop%2002%21&email=private');
    Object.defineProperty(document, 'referrer', { configurable: true, value: 'https://social.example.test/story?token=private' });

    expect(buildPageViewProps('/shop')).toEqual({
      path: '/shop',
      utm_source: 'instagram',
      utm_medium: 'story',
      utm_campaign: 'drop02',
      referrer_host: 'social.example.test',
    });
  });

  it('carries first-touch campaign and referrer host to later route views without the URL query', () => {
    captureUtm('?utm_source=instagram&utm_medium=story&utm_campaign=launch', {
      landingPath: '/',
      referrer: 'https://social.example.test/a?token=private',
    });
    window.history.replaceState({}, '', '/checkout?email=private@example.test');
    Object.defineProperty(document, 'referrer', { configurable: true, value: '' });

    expect(buildPageViewProps('/checkout')).toEqual({
      path: '/checkout',
      utm_source: 'instagram',
      utm_medium: 'story',
      utm_campaign: 'launch',
      referrer_host: 'social.example.test',
    });
  });
});
