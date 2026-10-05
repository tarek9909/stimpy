import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/config';

const base = { NODE_ENV: 'development' };
const production = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  DATABASE_URL: 'mysql://stimpy:secret@mysql:3306/stimpy_prod',
  WEB_URL: 'https://shop.stimpy.com',
  ADMIN_URL: 'https://admin.stimpy.com',
  API_PUBLIC_URL: 'https://api.stimpy.com',
  SMTP_HOST: 'smtp.mailprovider.com',
};

describe('config validation (backend README section 6)', () => {
  it('applies the documented defaults', () => {
    const c = parseConfig(base);
    expect(c.port).toBe(4000);
    expect(c.host).toBe('0.0.0.0');
    expect(c.databaseUrl).toBe('mysql://stimpy:stimpy@localhost:3317/stimpy');
    expect(c.webUrl).toBe('http://localhost:3000');
    expect(c.adminUrl).toBe('http://localhost:5173');
    expect(c.apiPublicUrl).toBe('http://localhost:4000');
    expect(c.smtp).toMatchObject({ host: 'localhost', port: 1025 });
    expect(c.cookieSecure).toBe(false);
    expect(c.uploadDir.replace(/\\/g, '/')).toMatch(/backend\/uploads$/);
  });

  it('accepts comma-separated origin lists and normalises them', () => {
    const c = parseConfig({ ...base, ADMIN_URL: 'http://localhost:5173/, http://192.168.1.20:5173', WEB_URL: 'http://localhost:3000,http://192.168.1.20:3000' });
    expect(c.adminUrls).toEqual(['http://localhost:5173', 'http://192.168.1.20:5173']);
    expect(c.webUrl).toBe('http://localhost:3000');
    expect(c.webUrls).toHaveLength(2);
  });

  it('treats empty values as unset', () => {
    expect(parseConfig({ ...base, SMTP_USER: '', SMTP_PASSWORD: '' }).smtp.user).toBeUndefined();
  });

  it.each([
    [{ PORT: 'abc' }, 'PORT'],
    [{ PORT: '70000' }, 'PORT'],
    [{ DATABASE_URL: 'postgres://x' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'mysql:///stimpy' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'mysql://localhost:3306' }, 'DATABASE_URL'],
    [{ ADMIN_URL: 'not a url' }, 'ADMIN_URL'],
    [{ WEB_URL: 'ftp://localhost' }, 'WEB_URL'],
    [{ API_PUBLIC_URL: 'nope' }, 'API_PUBLIC_URL'],
    [{ COOKIE_SECURE: 'maybe' }, 'COOKIE_SECURE'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
    [{ ADMIN_EMAIL: 'x' }, 'ADMIN_EMAIL'],
    [{ ADMIN_PASSWORD: 'short' }, 'ADMIN_PASSWORD'],
  ])('refuses invalid %j', (env, name) => {
    let err: unknown;
    try {
      parseConfig({ ...base, ...env });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain(name);
  });

  it('refuses insecure production settings', () => {
    expect(() => parseConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => parseConfig({ ...production, ADMIN_PASSWORD: 'Stimpy-Dev-Password-1' })).toThrow(/ADMIN_PASSWORD/);
    expect(parseConfig({ ...production, ADMIN_PASSWORD: 'a-really-long-unique-pass-9' }).isProduction).toBe(true);
  });

  it.each([
    [{ WEB_URL: 'https://localhost:3000' }, 'WEB_URL'],
    [{ ADMIN_URL: 'http://admin.stimpy.com' }, 'ADMIN_URL'],
    [{ API_PUBLIC_URL: 'https://api.example.com' }, 'API_PUBLIC_URL'],
    [{ API_PUBLIC_URL: 'https://user:secret@api.stimpy.com' }, 'API_PUBLIC_URL'],
    [{ WEB_URL: 'https://user:secret@shop.stimpy.com' }, 'WEB_URL'],
    [{ DATABASE_URL: 'mysql://user:secret@127.0.0.1:3306/stimpy_prod' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'mysql://user:secret@mysql:3306/stimpy_test' }, 'DATABASE_URL'],
    [{ DATABASE_URL: 'mysql://stimpy:stimpy@mysql:3306/stimpy_prod' }, 'DATABASE_URL'],
    [{ SMTP_HOST: 'mailpit' }, 'SMTP_HOST'],
    [{ SMTP_HOST: ' mailpit ' }, 'SMTP_HOST'],
    [{ ADMIN_PASSWORD: 'stimpy-dev-password-1' }, 'ADMIN_PASSWORD'],
  ])('rejects non-production infrastructure %j', (override, name) => {
    expect(() => parseConfig({ ...production, ...override })).toThrow(new RegExp(name));
  });

  it('reports every problem at once', () => {
    try {
      parseConfig({ ...base, PORT: 'x', ADMIN_URL: 'y' });
      expect.unreachable();
    } catch (e) {
      expect((e as ConfigError).issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
