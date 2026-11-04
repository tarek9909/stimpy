import { describe, expect, it, vi } from 'vitest';
import type { OneSignalConfig } from '../src/config';
import { ConfigError, parseConfig } from '../src/config';
import { buildOneSignalPayload, ONESIGNAL_PUSH_URL, PUSH_RETRY_DELAYS_MS, sendPush } from '../src/services/push';

const config: OneSignalConfig = { appId: '6b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', restApiKey: 'os_v2_app_test_key_0123456789' };
const msg = { externalIds: ['1', '2'], title: 'New order STP-1042', body: 'Rana · 1 item · $45.00', data: { orderId: '7' } };

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OneSignal payload', () => {
  it('targets the push channel by External ID and carries the text and data', () => {
    expect(buildOneSignalPayload(config, msg)).toEqual({
      app_id: config.appId,
      target_channel: 'push',
      include_aliases: { external_id: ['1', '2'] },
      headings: { en: 'New order STP-1042' },
      contents: { en: 'Rana · 1 item · $45.00' },
      data: { orderId: '7' },
    });
  });
});

describe('sendPush', () => {
  it('posts with the REST key and reports the created notification', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ id: 'notif-1', recipients: 2 }));
    const result = await sendPush(config, msg, { fetch, sleep: async () => {} });
    expect(result).toEqual({ sent: true, recipients: 2, status: 200 });
    expect(fetch).toHaveBeenCalledWith(ONESIGNAL_PUSH_URL, expect.objectContaining({ method: 'POST' }));
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(`Key ${config.restApiKey}`);
  });

  it('reports no recipients when OneSignal creates nothing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ errors: ['All included players are not subscribed'] }));
    expect(await sendPush(config, msg, { fetch, sleep: async () => {} })).toEqual({ sent: false, recipients: 0, status: 200 });
  });

  it('does not call OneSignal when there is no one to notify', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ id: 'x' }));
    expect(await sendPush(config, { ...msg, externalIds: [] }, { fetch, sleep: async () => {} })).toEqual({ sent: false, recipients: 0, status: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry a rejection such as a bad key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ errors: ['Invalid API key'] }, 403));
    const result = await sendPush(config, msg, { fetch, sleep: async () => {} });
    expect(result.sent).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries server errors, then gives up without throwing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({}, 503));
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const result = await sendPush(config, msg, { fetch, sleep });
    expect(result.sent).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(PUSH_RETRY_DELAYS_MS.length + 1);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual(PUSH_RETRY_DELAYS_MS);
  });

  it('recovers when a retry succeeds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(json({ id: 'ok', recipients: 1 }));
    const result = await sendPush(config, msg, { fetch, sleep: async () => {} });
    expect(result).toEqual({ sent: true, recipients: 1, status: 200 });
  });
});

describe('OneSignal config', () => {
  const base = { NODE_ENV: 'development' };

  it('is off when neither variable is set', () => {
    expect(parseConfig(base).onesignal).toBeNull();
  });

  it('turns on when both variables are set', () => {
    const cfg = parseConfig({ ...base, ONESIGNAL_APP_ID: config.appId, ONESIGNAL_REST_API_KEY: config.restApiKey });
    expect(cfg.onesignal).toEqual(config);
  });

  it('rejects a lone app id or lone key', () => {
    expect(() => parseConfig({ ...base, ONESIGNAL_APP_ID: config.appId })).toThrow(ConfigError);
    expect(() => parseConfig({ ...base, ONESIGNAL_REST_API_KEY: config.restApiKey })).toThrow(ConfigError);
  });

  it('rejects an app id that is not a UUID', () => {
    expect(() => parseConfig({ ...base, ONESIGNAL_APP_ID: 'not-a-uuid', ONESIGNAL_REST_API_KEY: config.restApiKey })).toThrow(ConfigError);
  });
});
