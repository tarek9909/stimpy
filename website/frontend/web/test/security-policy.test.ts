import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, configuredImageOrigin } from '@/lib/security-policy';

describe('configured media security policy', () => {
  it('allows exact API and configured upload/CDN origins for images, video and API connections', () => {
    const api = 'http://localhost:4000';
    const uploads = configuredImageOrigin('cdn.example.test:8443');
    const policy = buildContentSecurityPolicy({ apiOrigins: [api], mediaOrigins: [uploads] });
    for (const directive of ['img-src', 'media-src', 'connect-src']) {
      const sources = policy.split('; ').find((part) => part.startsWith(`${directive} `));
      expect(sources).toContain(api);
      expect(sources).toContain(uploads);
    }
    expect(policy).not.toMatch(/https?:\/\/\*/);
  });

  it('rejects broad or path-based host configuration', () => {
    expect(() => configuredImageOrigin('*.example.test')).toThrow(/Invalid NEXT_IMAGE_REMOTE_HOSTS/);
    expect(() => configuredImageOrigin('cdn.example.test/uploads')).toThrow(/Invalid NEXT_IMAGE_REMOTE_HOSTS/);
  });

  it('allows only the configured analytics origin for script loading and event connections', () => {
    const analytics = 'https://metrics.example.test';
    const policy = buildContentSecurityPolicy({ apiOrigins: ['http://localhost:4000'], mediaOrigins: [], analyticsOrigin: analytics });
    expect(policy.split('; ').find((part) => part.startsWith('script-src '))).toContain(analytics);
    expect(policy.split('; ').find((part) => part.startsWith('connect-src '))).toContain(analytics);
    expect(policy).not.toMatch(/https?:\/\/\*/);
  });
});
