import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  publicEnv: {
    NEXT_PUBLIC_APP_ENV: 'production',
    NEXT_PUBLIC_META_PIXEL_ID: '123456789012345',
  },
}));

import { metaViewContentFor } from '@/components/layout/ClientEffects';
import { withoutAttribution } from '@/features/checkout/payload';
import { captureFbclid, ensureMetaPixel, FBCLID_STORAGE_KEY, getMetaAdSignals, META_PIXEL_SRC, metaTrack } from '@/lib/meta-pixel';
import { buildContentSecurityPolicy } from '@/lib/security-policy';

function clearCookies(): void {
  for (const part of document.cookie.split('; ')) {
    const name = part.split('=')[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.querySelectorAll('[data-stimpy-meta-pixel]').forEach((s) => s.remove());
  delete window.fbq;
  delete window._fbq;
  window.sessionStorage.clear();
  clearCookies();
  Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null });
  delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
});

describe('Meta Pixel', () => {
  it('loads the official script once with automatic configuration off, then queues explicit events', () => {
    expect(ensureMetaPixel()).toBe(true);
    expect(ensureMetaPixel()).toBe(true);
    const scripts = document.querySelectorAll<HTMLScriptElement>('[data-stimpy-meta-pixel]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe(META_PIXEL_SRC);
    metaTrack('Purchase', { currency: 'USD', value: 45, num_items: 1 }, 'STP-1042');
    expect(window.fbq!.queue).toEqual([
      ['set', 'autoConfig', false, '123456789012345'],
      ['init', '123456789012345'],
      ['track', 'Purchase', { currency: 'USD', value: 45, num_items: 1 }, { eventID: 'STP-1042' }],
    ]);
  });

  it('does nothing outside a production build or with a privacy signal', () => {
    vi.stubEnv('NODE_ENV', 'test');
    metaTrack('PageView');
    expect(window.fbq).toBeUndefined();
    vi.stubEnv('NODE_ENV', 'production');
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });
    metaTrack('PageView');
    expect(window.fbq).toBeUndefined();
    expect(getMetaAdSignals()).toBeUndefined();
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: null });
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl = true;
    expect(ensureMetaPixel()).toBe(false);
    expect(document.querySelector('[data-stimpy-meta-pixel]')).toBeNull();
  });

  it('marks product pages for ViewContent', () => {
    expect(metaViewContentFor('/shop/stimpie/bubblegum')).toEqual({ content_type: 'product', content_category: 'stimpie', content_name: 'bubblegum' });
    expect(metaViewContentFor('/shop/hoodie/stimpy-hoodie/')).toMatchObject({ content_category: 'hoodie' });
    expect(metaViewContentFor('/builder')).toMatchObject({ content_category: 'builder' });
    expect(metaViewContentFor('/shop')).toBeNull();
    expect(metaViewContentFor('/order/STP-1042/thanks')).toBeNull();
  });
});

describe('Meta ad signals sent with an order', () => {
  it('reads valid _fbp and _fbc cookies and ignores malformed ones', () => {
    document.cookie = '_fbp=fb.1.1730000000000.1234567890; path=/';
    document.cookie = '_fbc=not-a-meta-cookie; path=/';
    expect(getMetaAdSignals()).toEqual({ fbp: 'fb.1.1730000000000.1234567890' });
    document.cookie = '_fbc=fb.1.1730000000000.IwAR0abc; path=/';
    expect(getMetaAdSignals()).toEqual({ fbp: 'fb.1.1730000000000.1234567890', fbc: 'fb.1.1730000000000.IwAR0abc' });
  });

  it('builds the click id from the landing fbclid when the Pixel cookie is missing', () => {
    captureFbclid('?utm_source=meta&fbclid=IwAR0abc_DEF-123', 1730000000000);
    expect(JSON.parse(window.sessionStorage.getItem(FBCLID_STORAGE_KEY) ?? '{}')).toEqual({ value: 'IwAR0abc_DEF-123', at: 1730000000000 });
    expect(getMetaAdSignals()).toEqual({ fbc: 'fb.1.1730000000000.IwAR0abc_DEF-123' });
    window.sessionStorage.clear();
    captureFbclid('?fbclid=<script>');
    expect(window.sessionStorage.getItem(FBCLID_STORAGE_KEY)).toBeNull();
    expect(getMetaAdSignals()).toEqual({});
  });

  it('is dropped together with attribution when the server rejects tracking fields', () => {
    const body = {
      customer: { name: 'Rana', email: 'r@example.com', phone: '71123456', whatsapp: null, whatsappSameAsPhone: true },
      delivery: { areaName: 'Beirut', address: 'Hamra street, building 4', notes: null },
      items: [],
      attribution: { utmSource: 'meta' },
      metaAds: { fbp: 'fb.1.1730000000000.1234567890' },
      hp: '',
    };
    const stripped = withoutAttribution(body as never);
    expect(stripped).not.toHaveProperty('attribution');
    expect(stripped).not.toHaveProperty('metaAds');
    expect(stripped).toHaveProperty('customer');
  });
});

describe('Meta Pixel content security policy', () => {
  it('allows the Pixel script and its event endpoint only when the Pixel is configured', () => {
    const directive = (policy: string, name: string): string => policy.split('; ').find((p) => p.startsWith(`${name} `)) ?? '';
    const off = buildContentSecurityPolicy({ apiOrigins: ['http://localhost:4000'], mediaOrigins: [] });
    expect(off).not.toContain('facebook');
    const on = buildContentSecurityPolicy({ apiOrigins: ['http://localhost:4000'], mediaOrigins: [], metaPixel: true });
    expect(directive(on, 'script-src')).toContain('https://connect.facebook.net');
    expect(directive(on, 'img-src')).toContain('https://www.facebook.com');
    expect(directive(on, 'connect-src')).toContain('https://www.facebook.com');
    expect(on).not.toMatch(/https?:\/\/\*/);
  });
});
