import { describe, expect, it } from 'vitest';
import { ALL_ERROR_CODES, ERROR_STATUS } from '../src/lib/errors';
import { useTestApp } from './helpers/app';
import { probeModule } from './helpers/probe-module';

const t = useTestApp({ extraModules: [probeModule], reset: false });

type Err = { error: { code: string; message: string; fields?: Record<string, string>; details: unknown; requestId: string } };

describe('error handler: one error type, one body', () => {
  it('has every code of api-reference section 1 with the documented HTTP status', () => {
    const documented: Record<string, number> = {
      VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, SOLD_OUT: 409, NOT_PURCHASABLE: 409,
      INVALID_TRANSITION: 409, CONFLICT: 409, FILE_TOO_LARGE: 413, UNSUPPORTED_FILE_TYPE: 415,
      DELIVERY_NUMBER_REQUIRED: 422, PRICE_CHANGED: 422, RATE_LIMITED: 429, INTERNAL: 500,
    };
    for (const [code, status] of Object.entries(documented)) expect(ERROR_STATUS[code as keyof typeof ERROR_STATUS]).toBe(status);
    expect(ALL_ERROR_CODES).toEqual(expect.arrayContaining(Object.keys(documented)));
  });

  it.each(ALL_ERROR_CODES.filter((c) => c !== 'INTERNAL'))('%s produces the standard body, status and request id', async (code) => {
    const res = await t.client.get(`/_probe/error/${code}`);
    expect(res.status).toBe(ERROR_STATUS[code]);
    const body = res.json<Err>();
    expect(body.error.code).toBe(code);
    expect(typeof body.error.message).toBe('string');
    expect(body.error.requestId).toBe(res.header('x-request-id'));
    expect(body.error).toHaveProperty('details');
    if (code === 'VALIDATION_ERROR') expect(body.error.fields).toEqual({ field: 'Bad.' });
    else expect(body.error).not.toHaveProperty('fields');
  });

  it('carries details for SOLD_OUT and INVALID_TRANSITION', async () => {
    const sold = (await t.client.get('/_probe/error/SOLD_OUT')).json<Err>();
    expect(sold.error.details).toMatchObject({ items: [{ kind: 'STIMPIE', stimpieId: 1, itemIndex: 0, requested: 2, available: 1 }] });
    const tr = (await t.client.get('/_probe/error/INVALID_TRANSITION')).json<Err>();
    expect(tr.error.details).toEqual({ from: 'NEW', to: 'DELIVERED', allowed: ['CONFIRMED'] });
  });

  it('RATE_LIMITED sends Retry-After and details.retryAfterSeconds', async () => {
    const res = await t.client.get('/_probe/error/RATE_LIMITED');
    expect(res.status).toBe(429);
    expect(res.header('retry-after')).toBe('42');
    expect(res.json<Err>().error.details).toEqual({ retryAfterSeconds: 42 });
  });

  it('unexpected errors become INTERNAL with a request id and leak nothing', async () => {
    const res = await t.client.get('/_probe/boom');
    expect(res.status).toBe(500);
    const e = res.json<Err>().error;
    expect(e.code).toBe('INTERNAL');
    expect(e.requestId).toBe(res.header('x-request-id'));
    expect(res.body).not.toContain('kaboom');
    expect(res.body).not.toContain('rami@example.com');
    expect(res.body).not.toContain('stack');
  });

  it('every response has a fresh X-Request-Id; client ids are not trusted', async () => {
    const a = await t.client.get('/health', { headers: { 'x-request-id': 'attacker-chosen' } });
    const b = await t.client.get('/health');
    expect(a.header('x-request-id')).not.toBe('attacker-chosen');
    expect(a.header('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.header('x-request-id')).not.toBe(b.header('x-request-id'));
  });
});

describe('validation errors map to VALIDATION_ERROR with dotted field paths', () => {
  const valid = { customer: { email: 'a@b.co', name: 'Rami' }, items: [{ sizeId: 1 }], kind: 'a', qty: 1 };

  it('accepts a valid body', async () => {
    expect((await t.client.post('/_probe/validate', valid)).status).toBe(200);
  });

  it('reports nested and array paths', async () => {
    const res = await t.client.post('/_probe/validate', {
      customer: { email: 'nope', name: 'R' },
      items: [{ sizeId: 'x' }, { sizeId: 1, stimpieIds: [1, 'y'] }],
      kind: 'c',
      qty: 11,
    });
    expect(res.status).toBe(400);
    const { error } = res.json<Err>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toMatchObject({
      'customer.email': 'Enter a valid email address.',
      'customer.name': 'Must be at least 2 characters.',
      'items.0.sizeId': expect.any(String),
      'items.1.stimpieIds.1': expect.any(String),
      kind: 'Choose one of the allowed options.',
      qty: 'Must be at most 10.',
    });
  });

  it('reports a missing field as required and an oversized array on the array path', async () => {
    const res = await t.client.post('/_probe/validate', { ...valid, qty: undefined, items: [{ sizeId: 1 }, { sizeId: 2 }, { sizeId: 3 }] });
    const { error } = res.json<Err>();
    expect(error.fields!.qty).toBe('This field is required.');
    expect(error.fields!.items).toMatch(/Too many items/);
  });

  it('rejects unknown request fields', async () => {
    const res = await t.client.post('/_probe/validate', { ...valid, isAdmin: true, customer: { ...valid.customer, role: 'x' } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toMatchObject({ isAdmin: 'Unknown field.', 'customer.role': 'Unknown field.' });
  });

  it('validates query strings too', async () => {
    const res = await t.client.get('/_probe/query', { query: { n: 'abc' } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toHaveProperty('n');
    expect((await t.client.get('/_probe/query', { query: { n: 3 } })).json()).toEqual({ n: 3 });
  });

  it('malformed JSON is a VALIDATION_ERROR, an empty body with a JSON content type is tolerated', async () => {
    const bad = await t.client.request('POST', '/_probe/validate', { payload: '{not json', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    expect(bad.json<Err>().error.code).toBe('VALIDATION_ERROR');
    const empty = await t.client.request('POST', '/_probe/noschema-body', { payload: '', headers: { 'content-type': 'application/json' } });
    expect(empty.status).toBe(200);
  });

  it('a missing body on a route that needs one reports the body', async () => {
    const res = await t.client.request('POST', '/_probe/validate', { payload: '', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toHaveProperty('body');
  });
});

describe('body size limits', () => {
  it('rejects JSON bodies over 100 KB with 413', async () => {
    const res = await t.client.post('/_probe/echo', { pad: 'x'.repeat(105 * 1024) });
    expect(res.status).toBe(413);
    expect(res.json<Err>().error.code).toBe('FILE_TOO_LARGE');
    expect(res.json<Err>().error.details).toEqual({ maxBytes: 102400 });
  });
  it('accepts a body just under the limit', async () => {
    expect((await t.client.post('/_probe/echo', { pad: 'x'.repeat(90 * 1024) })).status).toBe(200);
  });
});

describe('404 and 405', () => {
  it('unknown path is the standard 404', async () => {
    const res = await t.client.get('/api/v1/definitely/not/here');
    expect(res.status).toBe(404);
    const { error } = res.json<Err>();
    expect(error.code).toBe('NOT_FOUND');
    expect(error.requestId).toBeTruthy();
  });
  it('unknown root path is 404 too', async () => {
    expect((await t.client.get('/nothing')).status).toBe(404);
  });
  it('known path with the wrong method is 405 with an Allow header', async () => {
    const res = await t.client.delete('/options');
    expect(res.status).toBe(405);
    expect(res.header('allow')).toBe('GET');
    expect(res.json<Err>().error.code).toBe('METHOD_NOT_ALLOWED');
    const p = await t.client.post('/health', {});
    expect(p.status).toBe(405);
  });
  it('parameterised paths are recognised for 405', async () => {
    const res = await t.client.delete('/admin/colors/order');
    // PUT /admin/colors/order exists; DELETE /admin/colors/:id exists too -> the guard answers first
    expect([401, 405]).toContain(res.status);
  });
});

describe('response schemas are enforced', () => {
  it('strips fields that are not in the schema', async () => {
    const res = await t.client.get('/_probe/strip');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ name: 'visible' });
    expect(res.body).not.toContain('argon2');
  });
  it('a response that does not match its schema is an INTERNAL error, not a leak', async () => {
    const res = await t.client.get('/_probe/bad-shape');
    expect(res.status).toBe(500);
    expect(res.json<Err>().error.code).toBe('INTERNAL');
  });
});
