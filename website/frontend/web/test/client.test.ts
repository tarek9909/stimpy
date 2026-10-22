// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPublicClient } from '@stimpy/api-client';

const body = (code: string, extra: object = {}) => ({ error: { code, message: 'm', details: null, requestId: 'abcdef12-0000', ...extra } });
const resp = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });

describe('api client wrapper (node environment: real Request/AbortSignal)', () => {
  it('the client throws NETWORK for rejected fetches and passes ApiErrors through', async () => {
    const offline = createPublicClient({ baseUrl: 'http://x/api/v1', fetch: () => Promise.reject(new TypeError('fail')) });
    await expect(offline.GET('/api/v1/health')).rejects.toMatchObject({ code: 'NETWORK' });
    const down = createPublicClient({ baseUrl: 'http://x', fetch: async () => resp(409, body('SOLD_OUT', { details: { items: [] } })) });
    await expect(down.GET('/api/v1/packs')).rejects.toMatchObject({ code: 'SOLD_OUT', status: 409 });
  });

  it('retries GET on 5xx with the configured delays', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(503, body('INTERNAL')))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, time: 't' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const c = createPublicClient({ baseUrl: 'http://x', fetch: fetchMock, getRetryDelays: [1] });
    const { data } = await c.GET('/api/v1/health');
    expect(data?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not send a request whose caller signal is already aborted', async () => {
    const fetchMock = vi.fn((r: Request) => (r.signal.aborted ? Promise.reject(new DOMException('aborted', 'AbortError')) : Promise.resolve(resp(200, { ok: true }))));
    const client = createPublicClient({ baseUrl: 'http://x', fetch: fetchMock });
    const controller = new AbortController();
    controller.abort();
    await expect(client.GET('/api/v1/health', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
