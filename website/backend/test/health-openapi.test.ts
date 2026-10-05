import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_ROOT } from '../src/config';
import { keyOf, parseContract } from '../scripts/contract-parser';
import { useTestApp } from './helpers/app';
import { probeModule } from './helpers/probe-module';

const t = useTestApp({ extraModules: [probeModule], reset: false });

describe('GET /health', () => {
  it('returns ok and a millisecond-precision ISO time, uncached, with CORS for both origins', async () => {
    const before = Date.now();
    const res = await t.client.get('/health', { origin: 'http://localhost:3000' });
    expect(res.status).toBe(200);
    const body = res.json<{ ok: boolean; time: string }>();
    expect(body.ok).toBe(true);
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Math.abs(new Date(body.time).getTime() - before)).toBeLessThan(5000);
    expect(res.header('cache-control')).toBe('no-store');
    expect(res.header('access-control-allow-origin')).toBe('http://localhost:3000');
    expect((await t.client.get('/health', { origin: 'http://localhost:5173' })).header('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('answers 503 { ok: false } when the database is unreachable', async () => {
    const app = await t.extraApp({});
    const original = app.ctx.prisma.$queryRaw;
    (app.ctx.prisma as unknown as { $queryRaw: unknown }).$queryRaw = () => Promise.reject(new Error('db down'));
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    (app.ctx.prisma as unknown as { $queryRaw: unknown }).$queryRaw = original;
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false });
  });
});

describe('OpenAPI', () => {
  it('serves Swagger UI at /docs and the JSON at /docs/json', async () => {
    const ui = await t.client.get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.header('content-type')).toContain('text/html');
    const res = await t.client.get('/docs/json');
    expect(res.status).toBe(200);
    const doc = res.json<{ openapi: string; info: { title: string }; paths: Record<string, Record<string, { tags?: string[]; responses: Record<string, unknown>; security?: unknown }>>; components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> } }>();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe('Stimpy API');
    expect(doc.paths['/api/v1/health']).toBeDefined();
    expect(doc.paths['/api/v1/admin/colors']!.get!.security).toEqual([{ cookieAuth: [] }]);
    expect(doc.paths['/api/v1/options']!.get!.security).toBeUndefined();
    expect(doc.components.securitySchemes).toHaveProperty('cookieAuth');
    expect(doc.components.schemas).toHaveProperty('Color');
    expect(doc.components.schemas).toHaveProperty('ErrorResponse');
    // Zod schemas drive the document: request bodies and responses are described
    expect(doc.paths['/api/v1/auth/login']!.post!.responses['200']).toBeDefined();
    expect(doc.paths['/api/v1/admin/colors']!.post!.responses['201']).toBeDefined();
  });

  it('every API route declares tags and a success response schema (so the document is complete)', () => {
    const bare = t.app.routeList.filter((r) => r.url.startsWith('/api/v1/') && (!r.tags.length || !r.hasResponseSchema));
    expect(bare.map((r) => `${r.method} ${r.url}`)).toEqual([]);
  });
});

describe('contract parser and contract check', () => {
  const contract = readFileSync(join(API_ROOT, '..', '..', 'docs', 'website', 'backend', 'api-reference.md'), 'utf8');

  it('understands every notation used in api-reference.md', () => {
    const keys = new Set(parseContract(contract).map(keyOf));
    for (const k of [
      'GET /health', 'GET /options', 'POST /orders', 'POST /orders/track', 'GET /products/hoodies/{}', 'POST /drops/{}/subscribe',
      'POST /auth/login', 'GET /admin/orders/{}/whatsapp', 'POST /admin/orders/bulk-status', 'PUT /admin/builder', 'GET /admin/builder',
      'PUT /admin/content/{}', 'GET /admin/content/{}', 'PUT /admin/size-chart', 'GET /admin/size-chart', 'PUT /admin/colors/order',
      'PATCH /admin/hoodies/{}', 'DELETE /admin/stimpies/{}', 'GET /admin/areas', 'DELETE /admin/areas/{}', 'POST /admin/drops/{}/end',
      'PATCH /admin/drops/{}', 'GET /admin/ad-spend', 'POST /admin/ad-spend', 'DELETE /admin/ad-spend/{}', 'PUT /admin/faqs/order',
      'GET /admin/whatsapp-templates', 'PUT /admin/whatsapp-templates', 'GET /admin/settings/delivery', 'PATCH /admin/settings',
      'POST /admin/setup/{}/done', 'GET /admin/search', 'GET /admin/users', 'GET /admin/subscribers', 'POST /cart/validate',
    ]) expect(keys, k).toContain(k);
    // false positives must not appear
    for (const k of ['POST /drops', 'GET /drops/{}/subscribe', 'POST /health']) expect(keys, k).not.toContain(k);
    expect(keys.size).toBeGreaterThan(120);
  });

  it('parses the three notations on a small sample', () => {
    const md = [
      '| `GET /a` | x |',
      '| `GET` / `PUT /b/:key` | x |',
      '`/c` : `GET` list, `GET /:id`, `POST`, `DELETE /:id`, and `POST /c/:id/end`.',
      '| `/d` | `GET`, `PATCH /:id`. Fields |',
      '| `/e` | Same, with `x` |',
      '| `GET/POST /f` | x |',
      '| `PATCH/DELETE /f/:id` | x |',
      '`/f`:',
      '- `GET` list',
      '- `PUT` replace',
    ].join('\n');
    const keys = parseContract(md).map(keyOf);
    expect(keys).toEqual(expect.arrayContaining([
      'GET /a', 'GET /b/{}', 'PUT /b/{}', 'GET /c', 'GET /c/{}', 'POST /c', 'DELETE /c/{}', 'POST /c/{}/end',
      'GET /d', 'PATCH /d/{}', 'GET /e', 'PATCH /e/{}', 'GET /f', 'PUT /f',
      'GET /f', 'POST /f', 'PATCH /f/{}', 'DELETE /f/{}',
    ]));
  });

  it('nothing is implemented that the contract does not document', () => {
    const documented = new Set(parseContract(contract).map(keyOf));
    const crmContractPath = join(API_ROOT, '..', 'docs', 'crm', 'backend.md');
    if (existsSync(crmContractPath)) {
      for (const e of parseContract(readFileSync(crmContractPath, 'utf8'))) {
        const path = e.path.startsWith('/admin') ? e.path : `/admin${e.path}`;
        documented.add(keyOf({ method: e.method, path }));
      }
    }
    const undocumented = t.app.routeList
      .filter((r) => r.url.startsWith('/api/v1') && !r.url.includes('/_probe/'))
      .map((r) => keyOf({ method: r.method, path: r.url.slice('/api/v1'.length) }))
      .filter((k) => !documented.has(k));
    expect(undocumented).toEqual([]);
  });
});
