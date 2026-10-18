import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors';
import { now } from '../lib/clock';
import { isValidTimezone } from '../lib/dates';
import { normalizePhone } from '../lib/phone';

/**
 * Typed settings groups (api-reference 5.12 + data-model 6). Stored as JSON rows in `settings`, one per group.
 * Every group has defaults, so a fresh database (no rows) behaves exactly like the seeded one.
 */

const email = z.string().trim().email().max(190);
/** Splits a stored address list ("a@x.com, b@y.com"; commas, semicolons, spaces or new lines) into addresses. */
export const splitEmails = (raw: string | null | undefined): string[] => (raw ?? '').split(/[\s,;]+/).filter(Boolean);
const MAX_ALERT_RECIPIENTS = 10;
/** One or several addresses in one string. Kept a plain string so existing single-address settings stay valid. */
const emailList = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => splitEmails(v).length > 0 && splitEmails(v).every((a) => email.safeParse(a).success), 'Enter valid email addresses separated by commas.')
  .refine((v) => splitEmails(v).length <= MAX_ALERT_RECIPIENTS, `Use at most ${MAX_ALERT_RECIPIENTS} addresses.`);
const phone = z.string().refine((v) => normalizePhone(v) !== null, 'Enter a Lebanese phone number, e.g. 03 123 456.');

// ---- shapes (field -> schema with default). `z.object(shape)` is used for reading, `z.strictObject(shape)` for writing.
const businessShape = {
  name: z.string().trim().min(1).max(120).default('Stimpy'),
  whatsappNumber: phone.nullable().default(null),
  supportEmail: email.nullable().default('info@stimpylb.com'),
  instagramUrl: z.string().url().max(300).nullable().default(null),
  timezone: z.string().refine(isValidTimezone, 'Enter a valid IANA timezone, e.g. Asia/Beirut.').default('Asia/Beirut'),
};
const ordersShape = {
  numberPrefix: z.string().regex(/^[A-Z0-9]{1,10}$/, 'Use 1-10 capital letters or digits.').default('STP'),
  firstNumber: z.number().int().min(1).max(999_999_999).default(1001),
  stockHoldHours: z.number().int().min(1).max(168).default(12),
  autoExpireUnconfirmed: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(10),
  hardwareCostCents: z.number().int().min(0).max(100_000).default(100),
};
const emailShape = {
  enabled: z.boolean().default(true),
  senderName: z.string().trim().min(1).max(100).default('Stimpy'),
  senderAddress: email.default('info@stimpylb.com'),
  replyTo: email.default('info@stimpylb.com'),
  footerText: z.string().max(500).default('Stimpy. One hoodie. Multiple identities.'),
  campaignRecipientCap: z.number().int().min(1).max(5_000).default(200),
  smtpHost: z.string().trim().max(255).nullable().default(null),
  smtpPort: z.number().int().min(1).max(65535).nullable().default(null),
  smtpUser: z.string().trim().max(190).nullable().default(null),
  smtpPassword: z.string().max(255).nullable().default(null),
  smtpSecure: z.boolean().default(false),
};
const notificationsShape = {
  founderEmail: emailList.nullable().default(null),
  onNewOrder: z.boolean().default(true),
  onLowStock: z.boolean().default(true),
};
const deliveryShape = {
  defaultFeeCents: z.number().int().min(0).max(1_000_000).default(500),
  estimateText: z.string().trim().min(1).max(200).default('4–5 business days'),
};
const setupShape = {
  reviewed: z.array(z.string().max(60)).max(50).default([]),
};

export const SETTING_GROUPS = ['business', 'orders', 'email', 'notifications', 'delivery', 'setup'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];
/** Groups exposed by GET/PATCH /admin/settings (delivery lives at /admin/settings/delivery, setup at /admin/setup). */
export const ADMIN_SETTING_GROUPS = ['business', 'orders', 'email', 'notifications'] as const;

const SHAPES = {
  business: businessShape,
  orders: ordersShape,
  email: emailShape,
  notifications: notificationsShape,
  delivery: deliveryShape,
  setup: setupShape,
} as const;

export const settingReadSchemas = {
  business: z.object(businessShape),
  orders: z.object(ordersShape),
  email: z.object(emailShape),
  notifications: z.object(notificationsShape),
  delivery: z.object(deliveryShape),
  setup: z.object(setupShape),
};
const strictSchemas = {
  business: z.strictObject(businessShape),
  orders: z.strictObject(ordersShape),
  email: z.strictObject(emailShape),
  notifications: z.strictObject(notificationsShape),
  delivery: z.strictObject(deliveryShape),
  setup: z.strictObject(setupShape),
};

export type SettingsMap = { [G in SettingGroup]: z.infer<(typeof settingReadSchemas)[G]> };
export type SettingsPatch = { [G in SettingGroup]?: Partial<SettingsMap[G]> };

/** Defaults for every group (what an empty `settings` table means). */
export const SETTINGS_DEFAULTS: SettingsMap = {
  business: settingReadSchemas.business.parse({}),
  orders: settingReadSchemas.orders.parse({}),
  email: settingReadSchemas.email.parse({}),
  notifications: settingReadSchemas.notifications.parse({}),
  delivery: settingReadSchemas.delivery.parse({}),
  setup: settingReadSchemas.setup.parse({}),
};

/** Zod schemas for the PATCH body of /admin/settings (every field optional, unknown keys rejected). */
export const settingsPatchShape = {
  business: z.strictObject(businessShape).partial(),
  orders: z.strictObject(ordersShape).partial(),
  email: z.strictObject(emailShape).partial(),
  notifications: z.strictObject(notificationsShape).partial(),
};

const ORDER_COUNTER = 'order_number';
const CACHE_TTL_MS = 5_000;

export class SettingsService {
  private cache = new Map<SettingGroup, { value: unknown; at: number }>();

  constructor(private readonly prisma: PrismaClient) {}

  clearCache(): void {
    this.cache.clear();
  }

  /** One typed group, defaults applied, cached for a few seconds (cache cleared on every write in this process). */
  async get<G extends SettingGroup>(group: G): Promise<SettingsMap[G]> {
    const t = now().getTime();
    const hit = this.cache.get(group);
    if (hit && t - hit.at < CACHE_TTL_MS) return hit.value as SettingsMap[G];
    const value = await this.readFresh(group);
    this.cache.set(group, { value, at: t });
    return value;
  }

  /** Uncached read (writes merge into this, so a stale cache can never overwrite another process's change). */
  private async readFresh<G extends SettingGroup>(group: G): Promise<SettingsMap[G]> {
    const row = await this.prisma.setting.findUnique({ where: { key: group } });
    return settingReadSchemas[group].parse(row?.value ?? {}) as SettingsMap[G];
  }

  /** All six groups. */
  async getAll(): Promise<SettingsMap> {
    const [business, orders, email, notifications, delivery, setup] = await Promise.all(SETTING_GROUPS.map((g) => this.get(g)));
    return { business, orders, email, notifications, delivery, setup } as SettingsMap;
  }

  /**
   * Partial update: for each group present, merge into the stored value, validate the merged result,
   * apply cross-field rules, store. Throws VALIDATION_ERROR with `group.field` paths.
   */
  async update(patch: SettingsPatch): Promise<SettingsMap> {
    const writes: { group: SettingGroup; value: unknown }[] = [];
    let counterStart: { next: number } | null = null;

    for (const group of SETTING_GROUPS) {
      const part = patch[group];
      if (!part || Object.keys(part).length === 0) continue;
      const current = await this.readFresh(group);
      const merged = { ...current, ...definedOnly(part) };
      const res = strictSchemas[group].safeParse(merged);
      if (!res.success) {
        const fields: Record<string, string> = {};
        for (const i of res.error.issues) fields[[group, ...i.path].join('.')] = i.message;
        throw AppError.validation(fields);
      }
      const value: Record<string, unknown> = { ...res.data };
      if (group === 'business' && typeof value.whatsappNumber === 'string') value.whatsappNumber = normalizePhone(value.whatsappNumber);

      if (group === 'orders') {
        const next = (value as SettingsMap['orders']).firstNumber;
        if (next !== (current as SettingsMap['orders']).firstNumber) {
          counterStart = { next };
        }
      }
      writes.push({ group, value });
    }

    if (writes.length > 0 || counterStart !== null) {
      await this.prisma.$transaction(async (tx) => {
        if (counterStart !== null) {
          // Serialize the first-number check with order creation, which increments this same row.
          await tx.$executeRaw`INSERT IGNORE INTO counters (name, value) VALUES (${ORDER_COUNTER}, ${counterStart.next - 1})`;
          const rows = await tx.$queryRaw<{ value: number | bigint }[]>`SELECT value FROM counters WHERE name = ${ORDER_COUNTER} FOR UPDATE`;
          const last = Number(rows[0]?.value ?? counterStart.next - 1);
          if (counterStart.next <= last) {
            throw AppError.validation({
              'orders.firstNumber': `Order numbers up to ${last} are already used. Choose ${last + 1} or higher.`,
            });
          }
          await tx.counter.update({ where: { name: ORDER_COUNTER }, data: { value: counterStart.next - 1 } });
        }
        for (const w of writes) {
          await tx.setting.upsert({
            where: { key: w.group },
            create: { key: w.group, value: w.value as object },
            update: { value: w.value as object },
          });
        }
      });
      this.clearCache();
    }
    return this.getAll();
  }
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export { SHAPES as SETTING_SHAPES };
