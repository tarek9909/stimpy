import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Absolute path of backend (the package root), independent of the current working directory. */
export const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let envFileLoaded = false;
/** Loads backend/.env into process.env without overriding variables that are already set. */
export function loadEnvFile(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  const file = join(API_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** A comma-separated list of origins ("http://localhost:5173,http://192.168.1.20:5173"). */
const originList = z
  .string()
  .min(1)
  .transform((s, ctx) => {
    const out: string[] = [];
    for (const raw of s.split(',').map((x) => x.trim()).filter(Boolean)) {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
        if (u.username || u.password) throw new Error('credentials');
        out.push(u.origin);
      } catch {
        ctx.addIssue({ code: 'custom', message: `"${raw}" is not a valid http(s) origin` });
        return z.NEVER;
      }
    }
    if (out.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'at least one origin is required' });
      return z.NEVER;
    }
    return out;
  });

const url = z.string().min(1).refine((s) => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}, 'must be a valid URL');

const DEFAULT_ADMIN_PASSWORDS = ['Stimpy-Dev-Password-1', 'change-me', 'changeme', 'password'].map((p) => p.toLowerCase());

function isLocalOrPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  return /^(?:localhost|0\.0\.0\.0|::1|::)$/.test(host)
    || /(?:^|\.)(?:localhost|local|test|example|invalid)$/.test(host)
    || /(?:^|\.)example\.(?:com|net|org)$/.test(host)
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function productionConfigProblems(e: z.infer<typeof envSchema>): string[] {
  if (e.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (!e.COOKIE_SECURE) problems.push('COOKIE_SECURE: must be true in production');
  if (e.ADMIN_PASSWORD && DEFAULT_ADMIN_PASSWORDS.includes(e.ADMIN_PASSWORD.toLowerCase())) {
    problems.push('ADMIN_PASSWORD: the default/example admin password is not allowed in production');
  }

  for (const [name, urls] of [['WEB_URL', e.WEB_URL], ['ADMIN_URL', e.ADMIN_URL]] as const) {
    for (const value of urls) {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || isLocalOrPlaceholderHost(parsed.hostname)) {
        problems.push(`${name}: production origins must use HTTPS and a non-local, non-example host`);
        break;
      }
    }
  }

  const apiUrl = new URL(e.API_PUBLIC_URL);
  if (apiUrl.protocol !== 'https:' || isLocalOrPlaceholderHost(apiUrl.hostname) || apiUrl.username || apiUrl.password) {
    problems.push('API_PUBLIC_URL: production URL must use HTTPS and a non-local, non-example host');
  }

  const databaseUrl = new URL(e.DATABASE_URL);
  let databaseName = '';
  try {
    databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  } catch {
    problems.push('DATABASE_URL: database name must use valid URL encoding');
  }
  if (isLocalOrPlaceholderHost(databaseUrl.hostname)) {
    problems.push('DATABASE_URL: production database host cannot be localhost or a placeholder host');
  }
  if (/(^|[_-])(dev|development|test|testing|local)([_-]|$)/i.test(databaseName)) {
    problems.push('DATABASE_URL: production database name cannot be a development, test, or local database');
  }
  let databasePassword = '';
  try {
    databasePassword = decodeURIComponent(databaseUrl.password).toLowerCase();
  } catch {
    problems.push('DATABASE_URL: credentials must use valid URL encoding');
  }
  if (['stimpy', 'password', 'change-me', 'changeme'].includes(databasePassword)) {
    problems.push('DATABASE_URL: default/example credentials are not allowed in production');
  }

  const smtpHost = e.SMTP_HOST.toLowerCase().replace(/\.$/, '');
  if (isLocalOrPlaceholderHost(smtpHost) || /(^|[.-])mailpit([.-]|$)/.test(smtpHost)) {
    problems.push('SMTP_HOST: configure a real SMTP provider in production');
  }
  return problems;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        const hasAuthorityAndDatabase = /^mysql:\/\/[^/?#]+\/[^/?#]+(?:[?#].*)?$/.test(value);
        return parsed.protocol === 'mysql:' && hasAuthorityAndDatabase && Boolean(parsed.hostname) && Boolean(parsed.pathname.replace(/^\//, ''));
      } catch {
        return false;
      }
    }, 'must be a mysql:// URL with a host and database name')
    .default('mysql://stimpy:stimpy@localhost:3317/stimpy'),
  WEB_URL: originList.prefault('http://localhost:3000'),
  ADMIN_URL: originList.prefault('http://localhost:5173'),
  API_PUBLIC_URL: url.default('http://localhost:4000'),
  SMTP_HOST: z.string().trim().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  COOKIE_SECURE: bool.default(false),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12, 'must be at least 12 characters').optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
  /**
   * How many reverse proxies sit in front of the API. `true` means exactly one (the usual Caddy/nginx). Only the
   * addresses those hops appended to X-Forwarded-For are believed; trusting every hop would let any client choose its
   * own IP by sending an X-Forwarded-For header and so bypass every per-IP rate limit.
   */
  TRUST_PROXY: z
    .string()
    .regex(/^(true|false|\d)$/, 'must be true, false or a proxy hop count (0-9)')
    .transform((v) => (v === 'true' ? 1 : v === 'false' ? 0 : Number(v)))
    .default(0),
  DISABLE_JOBS: bool.default(false),
  MAILPIT_URL: url.default('http://localhost:8025'),
  /** Meta Conversions API (optional). Both the pixel (dataset) id and the access token, or neither. */
  META_PIXEL_ID: z.string().regex(/^\d{5,25}$/, 'must be the numeric pixel (dataset) id').optional(),
  META_CAPI_TOKEN: z.string().trim().min(20, 'must be a Conversions API access token').optional(),
  /** Events Manager "Test events" code: events then show there only. Remove it for live tracking. */
  META_CAPI_TEST_EVENT_CODE: z.string().regex(/^[A-Za-z0-9]{1,40}$/, 'must be the code shown in Events Manager').optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'must look like v24.0').default('v24.0'),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  isTest: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  /** All allowed public-site origins. The first one is used for email links. */
  webUrls: string[];
  webUrl: string;
  /** All allowed dashboard origins. */
  adminUrls: string[];
  adminUrl: string;
  /** Without trailing slash. */
  apiPublicUrl: string;
  smtp: { host: string; port: number; user?: string; password?: string };
  /** Absolute path. */
  uploadDir: string;
  cookieSecure: boolean;
  adminEmail?: string;
  adminPassword?: string;
  logLevel: string;
  /** Number of trusted reverse-proxy hops (0 = use the socket address). */
  trustProxy: number;
  disableJobs: boolean;
  mailpitUrl: string;
  /** Meta Conversions API, or null when not configured (then no events are sent). */
  metaCapi: MetaCapiConfig | null;
};

export type MetaCapiConfig = { pixelId: string; accessToken: string; testEventCode?: string; graphVersion: string };

/** Pure, throws ConfigError. Used by the server (process.env) and by tests (any object). */
export function parseConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty strings as "unset" so `.env` lines like `SMTP_USER=` are fine.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) cleaned[k] = v === '' ? undefined : v;

  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`));
  }
  const e = parsed.data;
  const problems = productionConfigProblems(e);
  if (Boolean(e.META_PIXEL_ID) !== Boolean(e.META_CAPI_TOKEN)) {
    problems.push('META_PIXEL_ID / META_CAPI_TOKEN: set both to send Conversions API events, or neither');
  }
  if (problems.length) throw new ConfigError(problems);

  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    webUrls: e.WEB_URL,
    webUrl: e.WEB_URL[0]!,
    adminUrls: e.ADMIN_URL,
    adminUrl: e.ADMIN_URL[0]!,
    apiPublicUrl: e.API_PUBLIC_URL.replace(/\/+$/, ''),
    smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, password: e.SMTP_PASSWORD },
    uploadDir: isAbsolute(e.UPLOAD_DIR) ? e.UPLOAD_DIR : resolve(API_ROOT, e.UPLOAD_DIR),
    cookieSecure: e.COOKIE_SECURE,
    adminEmail: e.ADMIN_EMAIL,
    adminPassword: e.ADMIN_PASSWORD,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    trustProxy: e.TRUST_PROXY,
    disableJobs: e.DISABLE_JOBS,
    mailpitUrl: e.MAILPIT_URL.replace(/\/+$/, ''),
    metaCapi:
      e.META_PIXEL_ID && e.META_CAPI_TOKEN
        ? { pixelId: e.META_PIXEL_ID, accessToken: e.META_CAPI_TOKEN, testEventCode: e.META_CAPI_TEST_EVENT_CODE, graphVersion: e.META_GRAPH_VERSION }
        : null,
  };
}

/** Loads `.env`, validates `process.env`, and prints a readable message then exits on failure. */
export function loadConfigOrExit(): Config {
  loadEnvFile();
  try {
    return parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
