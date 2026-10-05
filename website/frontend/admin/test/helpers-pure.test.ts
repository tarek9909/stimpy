import { describe, expect, it } from 'vitest';
import { validateReturnTo, loginUrl } from '../src/auth/returnTo';
import { applyParams, boolParam, csvParam, enumParam, fromSortParam, intParam, readParams, stringParam, toSortParam } from '../src/lib/urlState';
import { isoToZonedInput, zonedInputToIso } from '../src/lib/time';
import { moveItem, moveToPosition, sortByIds } from '../src/lib/reorder';
import { pageWindow } from '../src/components/Pagination';
import { artworkAspectWarning, validateFile } from '../src/lib/upload';
import { sanitizeDraft } from '../src/auth/drafts';
import { normalizeApiBaseUrl, parseEnv } from '../src/env';
import { slugify, moneySchema } from '../src/lib/schemas';
import { canAccess } from '../src/auth/roles';

describe('returnTo validation (open redirects)', () => {
  it.each([
    ['/orders?status=NEW&page=2', '/orders?status=NEW&page=2'],
    ['/products/hoodies/3', '/products/hoodies/3'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/login', '/'],
    ['/login?returnTo=/x', '/'],
    ['javascript:alert(1)', '/'],
    ['/ok\\x', '/'],
    ['', '/'],
    [null, '/'],
    ['%2F%2Fevil.example', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(validateReturnTo(input as string | null)).toBe(expected);
  });
  it('builds the login url with the encoded location', () => {
    expect(loginUrl('/orders?status=NEW')).toBe('/login?returnTo=%2Forders%3Fstatus%3DNEW');
    expect(loginUrl('/')).toBe('/login');
  });
});

describe('URL state helpers', () => {
  const defs = { tab: enumParam(['a', 'b'] as const, 'a'), page: intParam(1, { min: 1 }), q: stringParam(), on: boolParam(), status: csvParam() };
  it('reads defaults and falls back on invalid values', () => {
    expect(readParams('', defs)).toEqual({ tab: 'a', page: 1, q: '', on: false, status: [] });
    expect(readParams('tab=zzz&page=-4&on=maybe', defs)).toMatchObject({ tab: 'a', page: 1, on: false });
    expect(readParams('tab=b&page=3&q=hi&on=true&status=X,Y', defs)).toEqual({ tab: 'b', page: 3, q: 'hi', on: true, status: ['X', 'Y'] });
  });
  it('omits defaults, keeps unknown params and resets the page when a filter changes', () => {
    const next = applyParams(new URLSearchParams('page=4&returnTo=/x&q=old'), { q: 'new' }, defs);
    expect(next.get('q')).toBe('new');
    expect(next.has('page')).toBe(false);
    expect(next.get('returnTo')).toBe('/x');
    expect(applyParams(new URLSearchParams('tab=b'), { tab: 'a' }, defs).toString()).toBe('');
    expect(applyParams(new URLSearchParams('q=x'), { page: 2 }, defs).toString()).toBe('q=x&page=2');
  });
  it('converts sort params', () => {
    expect(toSortParam('placedAt', 'desc')).toBe('-placedAt');
    expect(fromSortParam('-total')).toEqual({ field: 'total', direction: 'desc' });
    expect(fromSortParam('')).toBeNull();
  });
});

describe('business time zone conversion', () => {
  it('reads and writes wall time in Asia/Beirut (UTC+3 in October 2026)', () => {
    expect(isoToZonedInput('2026-10-14T09:30:00.000Z', 'Asia/Beirut')).toBe('2026-10-14T12:30');
    expect(zonedInputToIso('2026-10-14T12:30', 'Asia/Beirut')).toBe('2026-10-14T09:30:00.000Z');
  });
  it('handles a winter offset (UTC+2) and other zones', () => {
    expect(zonedInputToIso('2026-01-10T12:00', 'Asia/Beirut')).toBe('2026-01-10T10:00:00.000Z');
    expect(zonedInputToIso('2026-06-01T08:00', 'America/New_York')).toBe('2026-06-01T12:00:00.000Z');
  });
  it('returns null/empty for bad input', () => {
    expect(zonedInputToIso('', 'Asia/Beirut')).toBeNull();
    expect(zonedInputToIso('nope', 'Asia/Beirut')).toBeNull();
    expect(isoToZonedInput(null)).toBe('');
  });
});

describe('reorder helpers', () => {
  it('moves one step and to a position, never out of bounds', () => {
    expect(moveItem([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveToPosition([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(sortByIds([{ id: 1 }, { id: 2 }, { id: 3 }], [3, 1, 2], (r) => r.id).map((r) => r.id)).toEqual([3, 1, 2]);
  });
});

describe('pagination window', () => {
  it('shows gaps around the current page', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 'gap', 5]);
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 11, 12]);
  });
});

describe('artwork aspect', () => {
  it('flags artwork more than 2% off 0.64', () => {
    expect(artworkAspectWarning(800, 1250)).toBe(false);
    expect(artworkAspectWarning(3200, 5000)).toBe(false);
    expect(artworkAspectWarning(800, 1000)).toBe(true);
    expect(artworkAspectWarning(null, null)).toBe(false);
  });
});

describe('file validation', () => {
  const file = (name: string, size: number, type = '', bytes?: number[]) => {
    const f = new File([bytes ? new Uint8Array(bytes) : new Uint8Array(Math.min(size, 16))], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  it('rejects empty, wrong type and oversize files per kind', async () => {
    expect((await validateFile(file('a.png', 0, 'image/png'), 'image'))?.code).toBe('EMPTY');
    expect((await validateFile(file('a.exe', 100, 'application/x-msdownload'), 'image'))?.code).toBe('TYPE');
    expect((await validateFile(file('a.png', 12 * 1024 * 1024, 'image/png'), 'image'))?.message).toContain('10 MB');
    expect((await validateFile(file('a.mp4', 120 * 1024 * 1024, 'video/mp4'), 'video'))?.code).toBe('TOO_LARGE');
    expect(await validateFile(file('a.webp', 1000, 'image/webp'), 'image')).toBeNull();
  });
  it('checks the glTF header and ignores octet-stream for models', async () => {
    expect((await validateFile(file('m.glb', 60 * 1024 * 1024, 'application/octet-stream', [0x67, 0x6c, 0x54, 0x46]), 'model'))?.code).toBe('TOO_LARGE');
    expect((await validateFile(file('m.glb', 1000, 'application/octet-stream', [1, 2, 3, 4]), 'model'))?.code).toBe('GLB_HEADER');
    expect(await validateFile(file('m.glb', 1000, 'application/octet-stream', [0x67, 0x6c, 0x54, 0x46]), 'model')).toBeNull();
    expect((await validateFile(file('m.bin', 1000, 'application/octet-stream', [0x67, 0x6c, 0x54, 0x46]), 'model'))?.code).toBe('TYPE');
  });
});

describe('drafts never keep secrets or files', () => {
  it('strips password-like keys and File objects', () => {
    const clean = sanitizeDraft({ name: 'x', password: 'p', newPassword: 'n', nested: { token: 't', ok: 1, f: new File(['a'], 'a.txt') }, list: ['a', 'b'] });
    expect(clean).toEqual({ name: 'x', nested: { ok: 1 }, list: ['a', 'b'] });
  });
});

describe('env', () => {
  it('normalises the API url and applies defaults', () => {
    expect(normalizeApiBaseUrl('http://localhost:4121')).toBe('http://localhost:4121/api/v1');
    expect(normalizeApiBaseUrl('http://localhost:4121/api/v1/')).toBe('http://localhost:4121/api/v1');
    const env = parseEnv({ VITE_API_URL: 'http://localhost:4121' });
    expect(env.apiOrigin).toBe('http://localhost:4121');
    expect(env.orderPollMs).toBe(30000);
    expect(() => parseEnv({ VITE_API_URL: 'not a url' })).toThrow(/Invalid dashboard configuration/);
  });

  it('requires real HTTPS storefront and API URLs in production', () => {
    const valid = parseEnv({
      VITE_APP_ENV: 'production',
      VITE_API_URL: 'https://api.stimpy.com/api/v1',
      VITE_SITE_URL: 'https://shop.stimpy.com',
    });
    expect(valid.appEnv).toBe('production');
    expect(() => parseEnv({ VITE_APP_ENV: 'production' })).toThrow(/VITE_API_URL: production URL/);
    expect(() => parseEnv({ VITE_APP_ENV: 'production', VITE_API_URL: 'https://api.stimpy.com', VITE_SITE_URL: 'http://shop.stimpy.com' })).toThrow(/VITE_SITE_URL: production URL/);
    expect(() => parseEnv({ VITE_APP_ENV: 'production', VITE_API_URL: 'https://localhost:4000', VITE_SITE_URL: 'https://shop.stimpy.com' })).toThrow(/VITE_API_URL: production URL/);
    expect(() => parseEnv({ VITE_APP_ENV: 'production', VITE_API_URL: 'https://user:secret@api.stimpy.com', VITE_SITE_URL: 'https://shop.stimpy.com' })).toThrow(/VITE_API_URL: production URL/);
  });
});

describe('schemas and roles', () => {
  it('slugifies and validates money', () => {
    expect(slugify('Midnight Cedar!')).toBe('midnight-cedar');
    expect(moneySchema().safeParse('12.50').success).toBe(true);
    expect(moneySchema().safeParse('12.505').success).toBe(false);
    expect(moneySchema().safeParse('abc').success).toBe(false);
  });
  it('fails closed for unknown roles and PACKER', () => {
    expect(canAccess('OWNER', 'finance')).toBe(true);
    expect(canAccess('PACKER', 'orders')).toBe(false);
    expect(canAccess('SUPERUSER', 'orders')).toBe(false);
    expect(canAccess(undefined, 'orders')).toBe(false);
  });
});
