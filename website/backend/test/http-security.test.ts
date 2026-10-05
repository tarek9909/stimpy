import { describe, expect, it } from 'vitest';
import { LocalStorage } from '../src/lib/storage';
import { useTestApp } from './helpers/app';
import { probeModule } from './helpers/probe-module';

const t = useTestApp({ extraModules: [probeModule], reset: false });

const WEB = 'http://localhost:3000';
const ADMIN = 'http://localhost:5173';
const EVIL = 'http://evil.example';

const preflight = (path: string, origin: string, method: string) =>
  t.client.request('OPTIONS', path, {
    origin,
    headers: { 'access-control-request-method': method, 'access-control-request-headers': 'content-type,idempotency-key' },
  });

describe('CORS matrix (wiring 5.3)', () => {
  describe('public routes', () => {
    it('allow WEB_URL, no credentials, GET/POST, preflight cached 10 minutes', async () => {
      const res = await preflight('/orders', WEB, 'POST');
      expect(res.status).toBe(204);
      expect(res.header('access-control-allow-origin')).toBe(WEB);
      expect(res.header('access-control-allow-credentials')).toBeUndefined();
      expect(res.header('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
      expect(res.header('access-control-allow-headers')).toBe('Content-Type, Idempotency-Key');
      expect(res.header('access-control-max-age')).toBe('600');
    });

    it('also allow ADMIN_URL (live Builder preview), still without credentials', async () => {
      const res = await t.client.get('/options', { origin: ADMIN });
      expect(res.header('access-control-allow-origin')).toBe(ADMIN);
      expect(res.header('access-control-allow-credentials')).toBeUndefined();
    });

    it('expose X-Request-Id, Retry-After, Date on actual responses', async () => {
      const res = await t.client.get('/health', { origin: WEB });
      expect(res.header('access-control-expose-headers')).toBe('X-Request-Id, Retry-After, Date');
      expect(res.header('vary')).toContain('Origin');
    });

    it('give an unknown origin no CORS headers (the browser blocks it)', async () => {
      const res = await t.client.get('/options', { origin: EVIL });
      expect(res.status).toBe(200);
      expect(res.header('access-control-allow-origin')).toBeUndefined();
      const pre = await preflight('/orders', EVIL, 'POST');
      expect(pre.header('access-control-allow-origin')).toBeUndefined();
    });

    it('add nothing when there is no Origin header (curl, server-side fetch)', async () => {
      const res = await t.client.get('/options', { origin: null });
      expect(res.header('access-control-allow-origin')).toBeUndefined();
    });

    it('/health allows both origins and is never cached', async () => {
      for (const origin of [WEB, ADMIN]) {
        const res = await t.client.get('/health', { origin });
        expect(res.header('access-control-allow-origin')).toBe(origin);
        expect(res.header('cache-control')).toBe('no-store');
      }
    });

    it('error responses keep their CORS headers (so the browser can read the error)', async () => {
      const res = await t.client.get('/_probe/error/NOT_FOUND', { origin: WEB });
      expect(res.status).toBe(404);
      expect(res.header('access-control-allow-origin')).toBe(WEB);
    });
  });

  describe('auth and admin routes', () => {
    it('allow only ADMIN_URL, explicitly, with credentials and all methods', async () => {
      for (const path of ['/admin/colors', '/auth/login']) {
        const res = await preflight(path, ADMIN, 'PATCH');
        expect(res.status).toBe(204);
        expect(res.header('access-control-allow-origin')).toBe(ADMIN);
        expect(res.header('access-control-allow-credentials')).toBe('true');
        expect(res.header('access-control-allow-methods')).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
        expect(res.header('access-control-allow-headers')).toBe('Content-Type, Idempotency-Key');
      }
    });

    it('never answer with * and never allow the public site origin', async () => {
      const res = await preflight('/admin/colors', WEB, 'POST');
      expect(res.header('access-control-allow-origin')).toBeUndefined();
      expect(res.header('access-control-allow-credentials')).toBeUndefined();
    });

    it('expose Content-Disposition (CSV file names) on admin routes only', async () => {
      const admin = await t.client.get('/admin/colors', { origin: ADMIN });
      expect(admin.status).toBe(401);
      expect(admin.header('access-control-expose-headers')).toBe('X-Request-Id, Retry-After, Date, Content-Disposition');
      expect(admin.header('access-control-allow-credentials')).toBe('true');
    });
  });

  it('supports comma-separated origin lists (LAN phone testing)', async () => {
    const app = await t.extraApp({ ADMIN_URL: `${ADMIN},http://192.168.1.20:5173`, WEB_URL: `${WEB},http://192.168.1.20:3000` });
    const lan = await app.inject({ method: 'GET', url: '/api/v1/admin/colors', headers: { origin: 'http://192.168.1.20:5173' } });
    expect(lan.headers['access-control-allow-origin']).toBe('http://192.168.1.20:5173');
    const lanWeb = await app.inject({ method: 'GET', url: '/api/v1/options', headers: { origin: 'http://192.168.1.20:3000' } });
    expect(lanWeb.headers['access-control-allow-origin']).toBe('http://192.168.1.20:3000');
  });
});

describe('uploads are static, immutable and CORS *', () => {
  it('serves a stored file with CORS *, one-year immutable cache, nosniff and inline disposition', async () => {
    const storage = new LocalStorage(t.config.uploadDir, t.config.apiPublicUrl);
    const { path, url } = await storage.put(Buffer.from('GIF89a-test'), 'gif', 'image/gif');
    expect(url).toBe(`http://localhost:4000/uploads/${path}`);
    expect(path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{16}\.gif$/);

    const res = await t.client.get(`/uploads/${path}`, { origin: WEB });
    expect(res.status).toBe(200);
    expect(res.header('access-control-allow-origin')).toBe('*');
    expect(res.header('access-control-allow-credentials')).toBeUndefined();
    expect(res.header('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.header('x-content-type-options')).toBe('nosniff');
    expect(res.header('content-disposition')).toBe('inline');
    expect(res.header('cross-origin-resource-policy')).toBe('cross-origin');
    await storage.delete(path);
  });

  it('answers preflight for uploads and refuses path traversal', async () => {
    const pre = await t.client.request('OPTIONS', '/uploads/x.png', { origin: WEB, headers: { 'access-control-request-method': 'GET' } });
    expect(pre.status).toBe(204);
    expect(pre.header('access-control-allow-origin')).toBe('*');
    for (const p of ['/uploads/../package.json', '/uploads/%2e%2e/package.json', '/uploads/..%2f..%2f.env']) {
      const res = await t.client.get(p);
      expect([400, 404]).toContain(res.status);
      expect(res.body).not.toContain('"name"');
      expect(res.body).not.toContain('DATABASE_URL');
    }
  });

  it('the storage adapter refuses to write outside its root', async () => {
    const storage = new LocalStorage(t.config.uploadDir, t.config.apiPublicUrl);
    await expect(storage.putAt('../escape.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(/Invalid storage path/);
  });
});

describe('security headers', () => {
  it('API responses carry CSP frame-ancestors none, nosniff, no-referrer', async () => {
    const res = await t.client.get('/options');
    expect(res.header('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.header('x-content-type-options')).toBe('nosniff');
    expect(res.header('referrer-policy')).toBe('no-referrer');
    expect(res.header('x-frame-options')).toBe('DENY');
  });

  it('error responses carry them too', async () => {
    const res = await t.client.get('/admin/colors');
    expect(res.status).toBe(401);
    expect(res.header('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.header('x-content-type-options')).toBe('nosniff');
  });

  it('admin and auth responses are never cached; POSTs are never cached; public GETs opt in', async () => {
    expect((await t.client.get('/admin/colors')).header('cache-control')).toBe('no-store');
    expect((await t.client.post('/auth/login', { email: 'a@b.co', password: 'x' })).header('cache-control')).toBe('no-store');
    expect((await t.client.get('/options')).header('cache-control')).toBe('public, max-age=30');
  });

  it('adds HSTS only when cookies are Secure (HTTPS deployment)', async () => {
    expect((await t.client.get('/health')).header('strict-transport-security')).toBeUndefined();
    const app = await t.extraApp({ COOKIE_SECURE: 'true' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
  });
});

describe('Origin check on non-GET /admin and /auth (CSRF)', () => {
  it('rejects a wrong Origin with 403 FORBIDDEN, before authentication', async () => {
    for (const [method, path] of [['POST', '/admin/_probe/admin'], ['POST', '/auth/login'], ['POST', '/auth/logout'], ['PUT', '/admin/colors/order'], ['DELETE', '/admin/colors/1']] as const) {
      const res = await t.client.request(method, path, { origin: EVIL, body: {} });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
    }
  });
  it('rejects the public site origin too', async () => {
    expect((await t.client.post('/admin/colors', {}, { origin: WEB })).status).toBe(403);
  });
  it('lets GET through (the session check answers 401)', async () => {
    expect((await t.client.get('/admin/colors', { origin: EVIL })).status).toBe(401);
  });
  it('allows the dashboard origin and requests with no Origin (scripts)', async () => {
    expect((await t.client.post('/admin/colors', {}, { origin: ADMIN })).status).toBe(401);
    expect((await t.client.post('/admin/colors', {}, { origin: null })).status).toBe(401);
  });
  it('does not apply to public POSTs', async () => {
    expect((await t.client.post('/_probe/echo', {}, { origin: EVIL })).status).toBe(200);
  });
});
