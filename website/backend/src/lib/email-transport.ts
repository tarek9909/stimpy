import nodemailer from 'nodemailer';
import type { Config } from '../config';

/** One method, as specified in integrations.md section 1. */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  from: string;
  replyTo?: string;
};

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** Strips CR/LF so a subject or address can never inject headers. */
export const stripCrLf = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

export type EmailSettingsConfig = {
  senderAddress?: string | null;
  senderName?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpSecure?: boolean | null;
};

/** SMTP via Nodemailer (Mailpit locally by default, or configured via settings). */
export function createSmtpTransport(
  cfg: Config['smtp'],
  getSettings?: () => Promise<EmailSettingsConfig | null | undefined> | EmailSettingsConfig | null | undefined,
): EmailTransport {
  const defaultTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: false,
    ignoreTLS: !cfg.user,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password ?? '' } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return {
    async send(m) {
      const settings = getSettings ? await getSettings() : null;
      let activeTransporter = defaultTransporter;

      if (settings?.smtpPassword && settings.smtpPassword.trim().length > 0) {
        const host = settings.smtpHost?.trim() || 'smtp.gmail.com';
        const secure = settings.smtpSecure ?? false;
        const port = settings.smtpPort ?? (secure ? 465 : 587);
        const user = settings.smtpUser?.trim() || settings.senderAddress?.trim() || undefined;
        const pass = settings.smtpPassword.trim();

        activeTransporter = nodemailer.createTransport({
          host,
          port,
          secure,
          ignoreTLS: !user && !secure,
          auth: user ? { user, pass } : undefined,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        });
      } else if (settings?.smtpHost && settings.smtpHost.trim().length > 0) {
        const host = settings.smtpHost.trim();
        const secure = settings.smtpSecure ?? false;
        const port = settings.smtpPort ?? (secure ? 465 : 587);
        const user = settings.smtpUser ? settings.smtpUser.trim() : undefined;
        const pass = settings.smtpPassword ?? undefined;

        activeTransporter = nodemailer.createTransport({
          host,
          port,
          secure,
          ignoreTLS: !user && !secure,
          auth: user ? { user, pass: pass ?? '' } : undefined,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 10000,
        });
      }

      await activeTransporter.sendMail({
        from: stripCrLf(m.from),
        to: stripCrLf(m.to),
        replyTo: m.replyTo ? stripCrLf(m.replyTo) : undefined,
        subject: stripCrLf(m.subject),
        text: m.text,
        html: m.html,
      });
    },
  };
}

/** Test double: records messages; set `failWith` to simulate an SMTP outage. */
export class RecordingTransport implements EmailTransport {
  public sent: EmailMessage[] = [];
  public failWith: Error | null = null;
  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
  clear(): void {
    this.sent = [];
    this.failWith = null;
  }
}
