import { expect, type APIRequestContext, type Page, request as pwRequest } from '@playwright/test';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN, API, MAILPIT, WEB, DATABASE } from '../runtime';

export { ADMIN, API, MAILPIT, WEB };
export const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local';
export const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1';
export const SHOTS = process.env.E2E_SHOTS_DIR ?? 'D:/stimpy-cache/fa3-shots';
const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const AUTH_FILE = process.env.E2E_AUTH_FILE ?? resolve(E2E_ROOT, '.auth', `${DATABASE}.json`);
mkdirSync(dirname(AUTH_FILE), { recursive: true });

/** Chrome flags that let headless Chrome render WebGL (SwiftShader). */
export const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * Logs in ONCE through the API (login is rate limited to 5 per 15 minutes per account) and saves the session cookie as a
 * Playwright storage state that every spec reuses. Call in `test.beforeAll`; pair with `test.use({ storageState: AUTH_FILE })`.
 */
export async function ensureAuthState(): Promise<void> {
  if (existsSync(AUTH_FILE) && Date.now() - statSync(AUTH_FILE).mtimeMs < 6 * 3600_000) return;
  const ctx = await loginApi();
  await ctx.storageState({ path: AUTH_FILE });
  await ctx.dispose();
}

/** UI login (used by the auth-expiry test and the first visit of a spec that does not reuse the state). */
export async function login(page: Page): Promise<void> {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

/** A logged-in API client (own cookie jar) for setup, assertions against the contract and cleanup. */
async function loginApi(): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({
    baseURL: `${API}/api/v1/`,
    extraHTTPHeaders: { Origin: ADMIN, 'X-Forwarded-For': '198.18.1.11' },
    storageState: undefined,
  });
  const res = await ctx.post('auth/login', { data: { email: EMAIL, password: PASSWORD } });
  if (!res.ok()) throw new Error(`API login failed: ${res.status()}`);
  return ctx;
}

/** Logged-in API client that REUSES the saved session (no extra login: logins are rate limited). */
export async function adminApi(): Promise<APIRequestContext> {
  await ensureAuthState();
  return pwRequest.newContext({ baseURL: `${API}/api/v1/`, extraHTTPHeaders: { Origin: ADMIN }, storageState: AUTH_FILE });
}

export const noHScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

export function shot(page: Page, name: string, projectName: string) {
  return page.screenshot({ path: `${SHOTS}/${projectName}-${name}.png`, fullPage: true });
}

/** Collects console errors and failed requests (other than expected 4xx) so a test can assert there are none. */
export function watchConsole(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { errors };
}

/** Mailpit messages for ONE recipient (the inbox is shared: never list or delete everything). */
export async function mailpitFor(to: string): Promise<Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>> {
  const ctx = await pwRequest.newContext({ storageState: undefined });
  const res = await ctx.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}` } });
  const body = (await res.json()) as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }> };
  await ctx.dispose();
  return body.messages ?? [];
}
