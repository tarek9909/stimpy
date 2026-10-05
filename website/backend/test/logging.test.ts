import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { TestClient, useTestApp } from './helpers/app';
import { createAdmin, DEFAULT_ADMIN } from './helpers/fixtures';
import { probeModule } from './helpers/probe-module';

const lines: string[] = [];
const sink = new Writable({
  write(chunk, _enc, cb) {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    cb();
  },
});

const t = useTestApp({ env: { LOG_LEVEL: 'debug' }, logStream: sink, extraModules: [probeModule] });

describe('structured logging with masking', () => {
  it('logs one JSON line per request with method, path, route, status, duration, request id and user id', async () => {
    lines.length = 0;
    const { client, admin } = await t.adminClient();
    lines.length = 0;
    const res = await client.get('/admin/_probe/admin');
    const entry = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.msg === 'request completed');
    expect(entry).toMatchObject({
      method: 'GET',
      path: '/api/v1/admin/_probe/admin',
      route: '/api/v1/admin/_probe/admin',
      status: 200,
      requestId: res.header('x-request-id'),
      userId: admin.user.id,
    });
    expect(typeof entry!.durationMs).toBe('number');
  });

  it('never logs bodies of /auth, passwords, cookies, session tokens, full phones or e-mails, nor query strings', async () => {
    await createAdmin(t.prisma);
    lines.length = 0;
    const c = new TestClient(t.app, 'http://localhost:5173');
    await c.login();
    const token = c.cookies.get('stimpy_session')!;
    await c.post('/auth/login', { email: 'someone@secret-domain.example', password: 'Hunter2-Hunter2-xx' });
    await c.get('/auth/me');
    await c.post('/_probe/echo', { customer: { phone: '03 123 456', email: 'rami@private-mail.example', name: 'Rami Haddad' }, address: 'Secret street 5' });
    await c.get('/_probe/query', { query: { n: '5', q: 'rami@private-mail.example' } });
    await c.get('/_probe/boom'); // an error whose message contains an e-mail and a phone
    await c.post('/auth/change-password', { currentPassword: 'Hunter2-Hunter2-xx', newPassword: 'Another-Secret-Pass-99' });
    await c.post('/auth/logout');

    const all = lines.join('\n');
    expect(lines.length).toBeGreaterThan(5);
    for (const secret of [
      DEFAULT_ADMIN.password, 'Hunter2-Hunter2-xx', 'Another-Secret-Pass-99', token, 'stimpy_session',
      'someone@secret-domain.example', 'rami@private-mail.example', '03 123 456', '71123456', '+96171123456', 'Secret street', 'Rami Haddad',
      'q=rami',
    ]) expect(all, `log must not contain ${secret}`).not.toContain(secret);
    // the 500 was logged (with a scrubbed message), at error level
    const boom = lines.map((l) => JSON.parse(l) as { level: number; msg: string; err?: { message: string } }).find((l) => l.msg === 'unhandled error');
    expect(boom).toBeDefined();
    expect(boom!.level).toBeGreaterThanOrEqual(50);
    expect(boom!.err!.message).toContain('kaboom');
    expect(boom!.err!.message).not.toContain('rami@example.com');
  });
});
