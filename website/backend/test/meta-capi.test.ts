import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { MetaCapiConfig } from '../src/config';
import { buildPurchasePayload, queuePurchaseEvent, RETRY_DELAYS_MS, sendMetaEvents, type PurchaseEventInput } from '../src/services/meta-capi';

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

const config: MetaCapiConfig = { pixelId: '123456789012345', accessToken: 'EAAB-test-token-0123456789', graphVersion: 'v24.0' };

const input: PurchaseEventInput = {
  orderNumber: 'STP-1042',
  subtotalCents: 4500,
  numItems: 1,
  email: '  Rana@Example.com ',
  phoneE164: '+96171123456',
  clientIp: '203.0.113.7',
  userAgent: 'Mozilla/5.0 Instagram',
  signals: { fbp: 'fb.1.1730000000000.1234567890', fbc: 'fb.1.1730000000000.IwAR0abc_DEF-123' },
  eventSourceUrl: 'https://stimpy.example/checkout',
  eventTime: new Date('2026-11-01T10:00:00Z'),
};

const okResponse = (): Response => new Response('{"events_received":1}', { status: 200 });

describe('Meta Conversions API purchase payload', () => {
  it('uses the order number as the event id and hashes normalised personal data', () => {
    const body = buildPurchasePayload(config, input);
    const [event] = body.data as Array<Record<string, any>>;
    expect(event).toMatchObject({
      event_name: 'Purchase',
      event_time: 1793527200,
      event_id: 'STP-1042',
      action_source: 'website',
      event_source_url: 'https://stimpy.example/checkout',
      custom_data: { currency: 'USD', value: 45, num_items: 1, order_id: 'STP-1042' },
    });
    expect(event!.user_data).toEqual({
      em: [sha256('rana@example.com')],
      ph: [sha256('96171123456')],
      country: [sha256('lb')],
      client_ip_address: '203.0.113.7',
      client_user_agent: 'Mozilla/5.0 Instagram',
      fbp: input.signals.fbp,
      fbc: input.signals.fbc,
    });
    expect(body.access_token).toBe(config.accessToken);
    expect(body).not.toHaveProperty('test_event_code');
    expect(JSON.stringify(body)).not.toMatch(/rana|71123456/i);
  });

  it('leaves out missing optional data and adds the test event code when configured', () => {
    const body = buildPurchasePayload({ ...config, testEventCode: 'TEST123' }, { ...input, email: null, phoneE164: null, userAgent: undefined, signals: {} });
    const [event] = body.data as Array<Record<string, any>>;
    expect(Object.keys(event!.user_data).sort()).toEqual(['client_ip_address', 'country']);
    expect(body.test_event_code).toBe('TEST123');
  });
});

describe('Meta Conversions API sending', () => {
  it('posts JSON to the configured pixel and graph version', async () => {
    const fetch = vi.fn(async () => okResponse());
    await expect(sendMetaEvents(config, { data: [] }, { fetch, sleep: async () => undefined })).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v24.0/123456789012345/events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ data: [] });
  });

  it('retries network errors, 429 and 5xx with the documented delays, then gives up', async () => {
    const sleep = vi.fn(async (_ms: number) => undefined);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(sendMetaEvents(config, { data: [] }, { fetch, sleep })).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(RETRY_DELAYS_MS);
  });

  it('does not retry a request Meta rejects', async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"Invalid parameter"}}', { status: 400 }));
    await expect(sendMetaEvents(config, { data: [] }, { fetch, sleep: async () => undefined })).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the Conversions API is not configured', () => {
    const fetch = vi.fn(async () => okResponse());
    queuePurchaseEvent(null, input, { fetch, sleep: async () => undefined });
    expect(fetch).not.toHaveBeenCalled();
  });
});
