import { z } from 'zod';

/**
 * Build-time configuration (state-and-errors 19.2). Only non-secret values: everything VITE_* is
 * bundled. Validated once at start-up; a bad value fails fast with a readable message.
 */
const schema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
  VITE_SITE_URL: z.string().url().default('http://localhost:3000'),
  VITE_APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  VITE_DEFAULT_TIMEZONE: z.string().min(1).default('Asia/Beirut'),
  VITE_ORDER_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).max(600_000).default(30_000),
});

export interface Env {
  /** Always ends with `/api/v1`, no trailing slash. */
  apiBaseUrl: string;
  /** `http://localhost:4000` */
  apiOrigin: string;
  siteUrl: string;
  appEnv: 'local' | 'staging' | 'production';
  defaultTimeZone: string;
  orderPollMs: number;
}

/** Accepts `http://host:4000`, `http://host:4000/` or `http://host:4000/api/v1`. */
export function normalizeApiBaseUrl(raw: string): string {
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/api/v1') ? path : `${path}/api/v1`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function isLocalOrPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  return /^(?:localhost|0\.0\.0\.0|::1|::)$/.test(host)
    || /(?:^|\.)(?:localhost|local|test|example|invalid)$/.test(host)
    || /(?:^|\.)example\.(?:com|net|org)$/.test(host)
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function requireProductionUrl(name: string, value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || isLocalOrPlaceholderHost(url.hostname) || url.username || url.password) {
    throw new Error(`Invalid dashboard configuration (.env):\n  ${name}: production URL must use HTTPS and a non-local, non-example host`);
  }
}

export function parseEnv(raw: Record<string, unknown>): Env {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value.trim();
  }
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid dashboard configuration (.env):\n${lines.join('\n')}`);
  }
  const v = result.data;
  const apiBaseUrl = normalizeApiBaseUrl(v.VITE_API_URL);
  if (v.VITE_APP_ENV === 'production') {
    requireProductionUrl('VITE_API_URL', apiBaseUrl);
    requireProductionUrl('VITE_SITE_URL', v.VITE_SITE_URL);
  }
  return {
    apiBaseUrl,
    apiOrigin: new URL(apiBaseUrl).origin,
    siteUrl: v.VITE_SITE_URL.replace(/\/+$/, ''),
    appEnv: v.VITE_APP_ENV,
    defaultTimeZone: v.VITE_DEFAULT_TIMEZONE,
    orderPollMs: v.VITE_ORDER_POLL_INTERVAL_MS,
  };
}

let cached: Env | null = null;

/** Lazily parsed so tests can import modules without a complete environment. */
export function getEnv(): Env {
  cached ??= parseEnv(import.meta.env as unknown as Record<string, unknown>);
  return cached;
}

/** Test helper. */
export function setEnvForTests(env: Env | null): void {
  cached = env;
}
