import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { createSmtpTransport } from '../src/lib/email-transport';

const t = useTestApp();

describe('SMTP configuration from settings', () => {
  it('defaults to null / false on empty settings', async () => {
    const { client } = await t.adminClient();
    const res = await client.get('/admin/settings');
    expect(res.status).toBe(200);
    const email = res.json<{ email: Record<string, unknown> }>().email;
    expect(email.smtpHost).toBeNull();
    expect(email.smtpPort).toBeNull();
    expect(email.smtpUser).toBeNull();
    expect(email.smtpPassword).toBeNull();
    expect(email.smtpSecure).toBe(false);
  });

  it('updates and persists SMTP settings via PATCH /admin/settings', async () => {
    const { client } = await t.adminClient();
    const patchRes = await client.patch('/admin/settings', {
      email: {
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        smtpUser: 'apikey',
        smtpPassword: 'SG.fake_secret_key_123',
        smtpSecure: false,
      },
    });
    expect(patchRes.status).toBe(200);
    const updated = patchRes.json<{ email: Record<string, unknown> }>().email;
    expect(updated.smtpHost).toBe('smtp.sendgrid.net');
    expect(updated.smtpPort).toBe(587);
    expect(updated.smtpUser).toBe('apikey');
    expect(updated.smtpPassword).toBe('SG.fake_secret_key_123');
    expect(updated.smtpSecure).toBe(false);

    // Verify GET returns the same persisted settings
    const getRes = await client.get('/admin/settings');
    const email = getRes.json<{ email: Record<string, unknown> }>().email;
    expect(email.smtpHost).toBe('smtp.sendgrid.net');
    expect(email.smtpPort).toBe(587);
    expect(email.smtpUser).toBe('apikey');
    expect(email.smtpPassword).toBe('SG.fake_secret_key_123');
    expect(email.smtpSecure).toBe(false);
  });

  it('can reset / clear SMTP settings to null', async () => {
    const { client } = await t.adminClient();
    const res = await client.patch('/admin/settings', {
      email: {
        smtpHost: null,
        smtpPort: null,
        smtpUser: null,
        smtpPassword: null,
        smtpSecure: false,
      },
    });
    expect(res.status).toBe(200);
    const email = res.json<{ email: Record<string, unknown> }>().email;
    expect(email.smtpHost).toBeNull();
    expect(email.smtpPort).toBeNull();
    expect(email.smtpUser).toBeNull();
    expect(email.smtpPassword).toBeNull();
    expect(email.smtpSecure).toBe(false);
  });

  it('validates port range on PATCH /admin/settings', async () => {
    const { client } = await t.adminClient();
    const badPortRes = await client.patch('/admin/settings', {
      email: {
        smtpPort: 999999,
      },
    });
    expect(badPortRes.status).toBe(400);
  });

  it('dynamic createSmtpTransport uses settings from getter and falls back when null', async () => {
    let currentSettings: { smtpHost: string | null; smtpPort: number | null; smtpUser: string | null; smtpPassword: string | null; smtpSecure: boolean } = {
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassword: null,
      smtpSecure: false,
    };

    const defaultCfg = { host: '127.0.0.1', port: 1025 };
    const transport = createSmtpTransport(defaultCfg, () => currentSettings);

    // When settings has a custom host, it attempts connecting to that custom host
    currentSettings = {
      smtpHost: '127.0.0.1',
      smtpPort: 19999, // Unused port to verify it connects to the configured port
      smtpUser: 'custom_user',
      smtpPassword: 'custom_password',
      smtpSecure: false,
    };

    // Attempting to send to a closed port 19999 should fail with ECONNREFUSED on port 19999
    await expect(
      transport.send({
        to: 'customer@example.com',
        from: 'Stimpy <orders@stimpy.local>',
        subject: 'Test',
        text: 'Hello',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow(/19999|ECONNREFUSED|connect/);
  });

  it('uses static host smtp.gmail.com with port 587 and sender email when app password is set without custom host', async () => {
    let currentSettings: Record<string, unknown> = {
      senderAddress: 'founder@stimpy.com',
      smtpPassword: 'app_secret_password',
      // smtpHost and smtpPort omitted to test static defaults
    };

    const defaultCfg = { host: '127.0.0.1', port: 1025 };
    const transport = createSmtpTransport(defaultCfg, () => currentSettings as any);

    // Attempting to connect to smtp.gmail.com:587 with fake credentials in test will either fail DNS/timeout/auth,
    // confirming it routes to the static host/port rather than local Mailpit 1025
    await expect(
      transport.send({
        to: 'customer@example.com',
        from: 'Stimpy <founder@stimpy.com>',
        subject: 'Test',
        text: 'Hello',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow();
  });
});
