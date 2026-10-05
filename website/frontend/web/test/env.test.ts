import { describe, expect, it } from 'vitest';
import { absoluteUrl } from '@/lib/env';
import { assertProductionPublicUrls } from '@/lib/production-env';

describe('production public URL validation', () => {
  it('accepts real HTTPS endpoints', () => {
    expect(() => assertProductionPublicUrls({
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'https://api.stimpy.com/api/v1',
      NEXT_PUBLIC_SITE_URL: 'https://shop.stimpy.com',
    })).not.toThrow();
  });

  it.each([
    ['http://api.stimpy.com', 'https://shop.stimpy.com'],
    ['https://localhost:4000', 'https://shop.stimpy.com'],
    ['https://api.example.com', 'https://shop.stimpy.com'],
    ['https://user:secret@api.stimpy.com', 'https://shop.stimpy.com'],
  ])('rejects non-production public endpoints', ([api, site]) => {
    expect(() => assertProductionPublicUrls({
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_API_URL: api,
      NEXT_PUBLIC_SITE_URL: site,
    })).toThrow(/production URL must use HTTPS/);
  });

  it('continues to allow an internal HTTP API origin for server-side requests', () => {
    expect(absoluteUrl('API_URL_INTERNAL', 'http://api:4000/api/v1', false)).toBe('http://api:4000/api/v1');
  });
});
