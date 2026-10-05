import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const WEBSITE_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
export const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const DATABASE = process.env.E2E_DB ?? process.env.E2E_DB_NAME ?? 'stimpy_test_e2e';
const MYSQL = process.env.E2E_MYSQL_PATH ?? resolve(WEBSITE_ROOT, '.infra/mysql-8.4.3-winx64/bin/mysql.exe');
const MYSQL_PORT = process.env.E2E_MYSQL_PORT ?? '3317';

/** Query only the explicitly selected E2E database; the default is isolated from dev and API-test databases. */
export function mysql(query: string): string {
  return execFileSync(
    MYSQL,
    ['-ustimpy', '-pstimpy', '-h127.0.0.1', `-P${MYSQL_PORT}`, '-N', '-B', DATABASE, '-e', query],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).replaceAll('\r', '').trim();
}

/** Keep independent UI login scenarios within the real per-IP throttle during the full matrix. */
export async function isolateLoginIp(page: Page, ip: string): Promise<void> {
  await page.route(`${API}/api/v1/auth/login`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }),
  );
}
