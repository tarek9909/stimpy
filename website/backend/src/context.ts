import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import { createPrisma } from './lib/db';
import { createSmtpTransport, type EmailTransport } from './lib/email-transport';
import { LocalStorage, type Storage } from './lib/storage';
import { SettingsService } from './services/settings';

/**
 * Everything a service or job needs, built once and passed explicitly (no hidden globals).
 * Services take `(ctx, input)`; inside, `ctx.prisma.$transaction(async (tx) => ...)` for multi-table work.
 */
export type AppContext = {
  config: Config;
  prisma: PrismaClient;
  settings: SettingsService;
  storage: Storage;
  emailTransport: EmailTransport;
};

export function createContext(config: Config, overrides: Partial<AppContext> = {}): AppContext {
  const prisma = overrides.prisma ?? createPrisma(config.databaseUrl);
  const settings = overrides.settings ?? new SettingsService(prisma);
  return {
    config,
    prisma,
    settings,
    storage: overrides.storage ?? new LocalStorage(config.uploadDir, config.apiPublicUrl),
    emailTransport: overrides.emailTransport ?? createSmtpTransport(config.smtp, () => settings.get('email')),
  };
}
