import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { RATE_RULES } from '../src/lib/rate-limiter';
import { DAY, HOUR } from '../src/lib/clock';
import { hashToken, isCommonPassword, upsertAdminUser, verifyPassword } from '../src/services/auth';
import { TestClient, useTestApp } from './helpers/app';
import { advanceTime, freezeTime } from './helpers/clock';
import { createAdmin, DEFAULT_ADMIN } from './helpers/fixtures';
import { jobs } from './helpers/jobs';
import { probeModule } from './helpers/probe-module';

const t = useTestApp({ extraModules: [probeModule] });
const ADMIN_ORIGIN = 'http://localhost:5173';
type Err = { error: { code: string; message: string; fields?: Record<string, string>; details: { retryAfterSeconds?: number } | null } };

const newBrowser = (): TestClient => new TestClient(t.app, ADMIN_ORIGIN);

describe('POST /auth/login', () => {
  it('logs in, returns the user and sets the HttpOnly SameSite=Lax session cookie', async () => {
    await createAdmin(t.prisma);
    const c = newBrowser();
    const res = await c.login();
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ user: { id: expect.any(Number), email: DEFAULT_ADMIN.email, name: 'Test Owner', role: 'OWNER' } });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/^stimpy_session=[A-Za-z0-9_-]{40,}/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(res.body).not.toContain('passwordHash');
  });

  it('marks the cookie Secure when COOKIE_SECURE=true', async () => {
    await createAdmin(t.prisma);
    const app = await t.extraApp({ COOKIE_SECURE: 'true' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: DEFAULT_ADMIN });
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/i);
  });

  it('stores only the SHA-256 hash of the token, never the token', async () => {
    await createAdmin(t.prisma);
    const c = newBrowser();
    await c.login();
    const token = c.cookies.get('stimpy_session')!;
    const rows = await t.prisma.adminSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.tokenHash).toHaveLength(64);
  });

  it('hashes passwords with Argon2id', async () => {
    const { user, password } = await createAdmin(t.prisma);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(user.passwordHash, password)).toBe(true);
    expect(await verifyPassword(user.passwordHash, 'wrong')).toBe(false);
  });

  it('matches the e-mail case-insensitively', async () => {
    await createAdmin(t.prisma);
    expect((await newBrowser().login(DEFAULT_ADMIN.email.toUpperCase())).status).toBe(200);
  });

  it('gives the same generic 401 for a wrong password and an unknown e-mail', async () => {
    await createAdmin(t.prisma);
    const wrongPw = await newBrowser().login(DEFAULT_ADMIN.email, 'not-the-password');
    const unknown = await newBrowser().login('nobody@test.local', 'not-the-password');
    for (const r of [wrongPw, unknown]) {
      expect(r.status).toBe(401);
      expect(r.json<Err>().error.code).toBe('UNAUTHENTICATED');
      expect(r.header('set-cookie')).toBeUndefined();
    }
    expect(wrongPw.json<Err>().error.message).toBe(unknown.json<Err>().error.message);
  });

  it('does a hash comparison for unknown e-mails too (timing-neutral): both failures take comparable time', async () => {
    await createAdmin(t.prisma);
    const time = async (email: string): Promise<number> => {
      const s = performance.now();
      await newBrowser().login(email, 'not-the-password');
      return performance.now() - s;
    };
    await time('warmup@test.local');
    const known = Math.min(await time(DEFAULT_ADMIN.email), await time(DEFAULT_ADMIN.email));
    const unknown = Math.min(await time('nobody@test.local'), await time('nobody2@test.local'));
    // The unknown e-mail must not be the fast path (a skipped hash would be >10x faster).
    expect(unknown).toBeGreaterThan(known * 0.4);
  });

  it('validates the body (field errors) and rejects unknown fields', async () => {
    const r = await newBrowser().post('/auth/login', { email: 'not-an-email', password: '' });
    expect(r.status).toBe(400);
    expect(r.json<Err>().error.fields).toMatchObject({ email: 'Enter a valid email address.', password: 'This field is required.' });
    expect((await newBrowser().post('/auth/login', { email: 'a@b.co', password: 'x', remember: true })).status).toBe(400);
  });

  describe('rate limiting', () => {
    it('limits per e-mail (5 per 15 minutes) with Retry-After and details.retryAfterSeconds, even from other IPs', async () => {
      freezeTime('2026-10-14T10:00:00Z');
      await createAdmin(t.prisma);
      const c = newBrowser();
      for (let i = 0; i < 5; i++) {
        const r = await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: 'wrong-password' }, { ip: `10.0.0.${i + 1}` });
        expect(r.status).toBe(401);
      }
      const blocked = await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password }, { ip: '10.0.0.99' });
      expect(blocked.status).toBe(429);
      expect(blocked.json<Err>().error.code).toBe('RATE_LIMITED');
      expect(blocked.header('retry-after')).toBe(String(15 * 60));
      expect(blocked.json<Err>().error.details).toEqual({ retryAfterSeconds: 15 * 60 });
      // the window slides: Retry-After counts down
      advanceTime(5 * 60_000);
      const later = await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: 'x' }, { ip: '10.0.0.98' });
      expect(later.status).toBe(429);
      expect(later.header('retry-after')).toBe(String(10 * 60));
      // after the window the correct password works again
      advanceTime(10 * 60_000 + 1000);
      expect((await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password }, { ip: '10.0.0.97' })).status).toBe(200);
    });

    it('limits per IP (5 per 15 minutes) across different e-mails', async () => {
      freezeTime('2026-10-14T10:00:00Z');
      const c = newBrowser();
      for (let i = 0; i < 5; i++) expect((await c.post('/auth/login', { email: `user${i}@test.local`, password: 'wrong-password' })).status).toBe(401);
      const blocked = await c.post('/auth/login', { email: 'another@test.local', password: 'wrong-password' });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.header('retry-after'))).toBeGreaterThan(0);
      // another IP is unaffected
      expect((await c.post('/auth/login', { email: 'another@test.local', password: 'wrong-password' }, { ip: '10.9.9.9' })).status).toBe(401);
    });

    it('a successful login clears the per-e-mail counter', async () => {
      await createAdmin(t.prisma);
      const c = newBrowser();
      for (let i = 0; i < 3; i++) await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: 'wrong-password' }, { ip: `10.1.0.${i}` });
      expect((await c.login()).status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await c.post('/auth/login', { email: DEFAULT_ADMIN.email, password: 'wrong-password' }, { ip: `10.2.0.${i}` })).status).toBe(401);
    });

    it('declares the documented limits', () => {
      expect(RATE_RULES.loginIp).toMatchObject({ max: 5, windowMs: 15 * 60_000 });
      expect(RATE_RULES.loginEmail).toMatchObject({ max: 5, windowMs: 15 * 60_000 });
    });
  });
});

describe('GET /auth/me', () => {
  it('is 401 UNAUTHENTICATED without a session', async () => {
    const r = await newBrowser().get('/auth/me');
    expect(r.status).toBe(401);
    expect(r.json<Err>().error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the user and the earlier of the sliding and absolute expiry', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    const r = await client.get('/auth/me');
    expect(r.status).toBe(200);
    const body = r.json<{ user: { email: string }; session: { expiresAt: string } }>();
    expect(body.user.email).toBe(DEFAULT_ADMIN.email);
    expect(body.session.expiresAt).toBe('2026-10-21T10:00:00.000Z'); // now + 7 days
  });

  it('rejects a garbage or tampered cookie', async () => {
    const c = newBrowser();
    c.cookies.set('stimpy_session', 'x'.repeat(43));
    expect((await c.get('/auth/me')).status).toBe(401);
    c.cookies.set('stimpy_session', 'short');
    expect((await c.get('/auth/me')).status).toBe(401);
  });
});

describe('session lifetime: sliding 7 days, absolute 30 days', () => {
  it('slides on use', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    advanceTime(6 * DAY);
    const r1 = await client.get('/auth/me');
    expect(r1.status).toBe(200);
    expect(r1.json<{ session: { expiresAt: string } }>().session.expiresAt).toBe('2026-10-27T10:00:00.000Z'); // 6d + 7d
    advanceTime(6 * DAY);
    expect((await client.get('/auth/me')).status).toBe(200); // still alive thanks to sliding
  });

  it('expires after 7 idle days', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    advanceTime(7 * DAY + 1000);
    const r = await client.get('/auth/me');
    expect(r.status).toBe(401);
    expect(await t.prisma.adminSession.count()).toBe(0); // the expired row is removed
  });

  it('never lasts beyond 30 days, however active, and expiresAt is capped at the absolute expiry', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    for (let day = 5; day <= 25; day += 5) {
      advanceTime(5 * DAY);
      expect((await client.get('/auth/me')).status).toBe(200);
    }
    advanceTime(4 * DAY + 12 * HOUR); // 29.5 days
    const r = await client.get('/auth/me');
    expect(r.status).toBe(200);
    expect(r.json<{ session: { expiresAt: string } }>().session.expiresAt).toBe('2026-11-13T10:00:00.000Z'); // login + 30 days, not now + 7
    advanceTime(1 * DAY);
    expect((await client.get('/auth/me')).status).toBe(401);
  });

  it('session-cleanup job deletes expired sessions and keeps live ones', async () => {
    freezeTime('2026-10-14T10:00:00Z');
    const { client } = await t.adminClient();
    await t.adminClient({ email: 'second@test.local' });
    advanceTime(8 * DAY);
    // keep the first one alive by using it just now? it expired already: use the second's jar instead
    const live = await createAdmin(t.prisma, { email: 'third@test.local' });
    const c3 = newBrowser();
    await c3.login(live.email, live.password);
    const res = await jobs.sessionCleanup(t.ctx);
    expect(res.deleted).toBe(2);
    expect(await t.prisma.adminSession.count()).toBe(1);
    expect((await c3.get('/auth/me')).status).toBe(200);
    expect((await client.get('/auth/me')).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('ends the session, clears the cookie, answers 204', async () => {
    const { client } = await t.adminClient();
    const r = await client.post('/auth/logout');
    expect(r.status).toBe(204);
    expect(r.body).toBe('');
    expect(String(r.headers['set-cookie'])).toMatch(/stimpy_session=;/);
    expect(await t.prisma.adminSession.count()).toBe(0);
    expect((await client.get('/auth/me')).status).toBe(401);
  });

  it('is always 204, also with no or an invalid session', async () => {
    expect((await newBrowser().post('/auth/logout')).status).toBe(204);
    const c = newBrowser();
    c.cookies.set('stimpy_session', 'y'.repeat(43));
    expect((await c.post('/auth/logout')).status).toBe(204);
    const { client } = await t.adminClient();
    const stale = client.fork();
    stale.cookies.set('stimpy_session', client.cookies.get('stimpy_session')!);
    expect((await client.post('/auth/logout')).status).toBe(204);
    expect((await stale.post('/auth/logout')).status).toBe(204); // already ended
  });

  it('works with a JSON content type and no body', async () => {
    const { client } = await t.adminClient();
    const r = await client.request('POST', '/auth/logout', { payload: '', headers: { 'content-type': 'application/json' } });
    expect(r.status).toBe(204);
  });
});

describe('POST /auth/change-password', () => {
  const NEW = 'A-Much-Better-Pass-42';

  it('changes the password, ends all OTHER sessions, keeps the current one', async () => {
    const { client, admin } = await t.adminClient();
    const other = newBrowser();
    await other.login(admin.email, admin.password);
    expect(await t.prisma.adminSession.count()).toBe(2);

    const r = await client.post('/auth/change-password', { currentPassword: admin.password, newPassword: NEW });
    expect(r.status).toBe(204);
    expect(await t.prisma.adminSession.count()).toBe(1);
    expect((await client.get('/auth/me')).status).toBe(200);
    expect((await other.get('/auth/me')).status).toBe(401);
    expect((await newBrowser().login(admin.email, admin.password)).status).toBe(401); // old password dead
    expect((await newBrowser().login(admin.email, NEW)).status).toBe(200);
  });

  it('a wrong current password is 400 VALIDATION_ERROR on fields.currentPassword (never 401)', async () => {
    const { client } = await t.adminClient();
    const r = await client.post('/auth/change-password', { currentPassword: 'definitely-wrong', newPassword: NEW });
    expect(r.status).toBe(400);
    expect(r.json<Err>().error.code).toBe('VALIDATION_ERROR');
    expect(r.json<Err>().error.fields).toEqual({ currentPassword: 'Current password is incorrect.' });
    expect((await client.get('/auth/me')).status).toBe(200); // the session is untouched
  });

  it('enforces 12+ characters and the common-password list on fields.newPassword', async () => {
    const { client, admin } = await t.adminClient();
    const short = await client.post('/auth/change-password', { currentPassword: admin.password, newPassword: 'short-one' });
    expect(short.status).toBe(400);
    expect(short.json<Err>().error.fields).toHaveProperty('newPassword');
    const common = await client.post('/auth/change-password', { currentPassword: admin.password, newPassword: 'password12345' });
    expect(common.status).toBe(400);
    expect(common.json<Err>().error.fields!.newPassword).toMatch(/too common/);
    const same = await client.post('/auth/change-password', { currentPassword: admin.password, newPassword: admin.password });
    expect(same.json<Err>().error.fields).toHaveProperty('newPassword');
    expect(isCommonPassword('PASSWORD12345')).toBe(true);
    expect(isCommonPassword(NEW)).toBe(false);
  });

  it('is 401 without a session, and a wrong Origin is 403', async () => {
    expect((await newBrowser().post('/auth/change-password', { currentPassword: 'a', newPassword: NEW })).status).toBe(401);
    const { client, admin } = await t.adminClient();
    expect((await client.post('/auth/change-password', { currentPassword: admin.password, newPassword: NEW }, { origin: 'http://evil.example' })).status).toBe(403);
  });

  it('is rate limited per user', async () => {
    const { client } = await t.adminClient();
    for (let i = 0; i < 5; i++) await client.post('/auth/change-password', { currentPassword: 'wrong-password', newPassword: NEW });
    const r = await client.post('/auth/change-password', { currentPassword: 'wrong-password', newPassword: NEW });
    expect(r.status).toBe(429);
    expect(r.header('retry-after')).toBeTruthy();
  });
});

describe('requireAdmin guard and the admin scope', () => {
  it('lets an authenticated request through and exposes request.auth', async () => {
    const { client, admin } = await t.adminClient();
    const r = await client.get('/admin/_probe/admin');
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ userId: admin.user.id });
  });

  it('401 comes before body validation errors', async () => {
    const r = await newBrowser().post('/admin/_probe/admin', { wrong: 'shape' });
    expect(r.status).toBe(401);
  });

  it('clears a dead cookie when it answers 401', async () => {
    const c = newBrowser();
    c.cookies.set('stimpy_session', 'z'.repeat(43));
    const r = await c.get('/admin/_probe/admin');
    expect(r.status).toBe(401);
    expect(String(r.headers['set-cookie'])).toMatch(/stimpy_session=;/);
  });

  it('EVERY /admin/** route returns 401 without a session, and 403 for a wrong Origin on non-GET', async () => {
    const adminRoutes = t.app.routeList.filter((r) => r.admin);
    expect(adminRoutes.length).toBeGreaterThan(10);
    for (const r of adminRoutes) {
      const url = r.url.replace(/:[A-Za-z_]+/g, '1');
      const res = await newBrowser().request(r.method as 'GET', url, { body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
      expect(res.status, `${r.method} ${r.url} without session`).toBe(401);
      if (r.method !== 'GET') {
        const bad = await newBrowser().request(r.method as 'POST', url, { origin: 'http://evil.example', body: {} });
        expect(bad.status, `${r.method} ${r.url} wrong Origin`).toBe(403);
      }
    }
  });

  it('upsertAdminUser creates, keeps and (on request) resets passwords', async () => {
    const a = await upsertAdminUser(t.ctx, { email: 'new@test.local', password: 'Initial-Password-123' }, { updatePassword: false });
    expect(a.created).toBe(true);
    const b = await upsertAdminUser(t.ctx, { email: 'new@test.local', password: 'Other-Password-4567' }, { updatePassword: false });
    expect(b.created).toBe(false);
    expect(await verifyPassword(b.user.passwordHash, 'Initial-Password-123')).toBe(true);
    const c = await upsertAdminUser(t.ctx, { email: 'new@test.local', password: 'Other-Password-4567' }, { updatePassword: true });
    expect(await verifyPassword(c.user.passwordHash, 'Other-Password-4567')).toBe(true);
    await expect(upsertAdminUser(t.ctx, { email: 'x@test.local', password: 'short' }, { updatePassword: true })).rejects.toThrow(/12/);
    expect(hashToken('a')).toHaveLength(64);
  });
});
