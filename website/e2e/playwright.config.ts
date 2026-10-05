import { defineConfig } from '@playwright/test';

/**
 * Shared Playwright config (system Chrome, no browser download). Suites live in `tests/<area>/`.
 *
 * Environment (defaults match the canonical ports; override per engineer, e.g. FE-Web1 uses 4111 / 3101):
 *   E2E_WEB_URL   website origin           default http://localhost:3000
 *   E2E_API_URL   API origin               default http://localhost:4000
 *   E2E_ADMIN_URL dashboard origin         default http://localhost:5173
 *   E2E_MAILPIT_URL Mailpit HTTP API     default http://localhost:8025
 *   E2E_DB         isolated MySQL schema default stimpy_test_e2e
 *   E2E_BOOT=1    start API, website and dashboard here (otherwise servers must already be running)
 *   E2E_API_ONLY=1 start only the API (for isolated backend load gates)
 *   E2E_WEB_COMMAND  command that serves the website (default `npx next dev -p <port>`)
 *
 * Use `localhost`, never 127.0.0.1. Reports and screenshots are git-ignored (junctioned to D: on this machine).
 */
const web = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const api = process.env.E2E_API_URL ?? 'http://localhost:4000';
const admin = process.env.E2E_ADMIN_URL ?? 'http://localhost:5173';
const boot = process.env.E2E_BOOT === '1';
const apiOnly = process.env.E2E_API_ONLY === '1';
const includeApiLoad = process.env.E2E_INCLUDE_API_LOAD === '1';
const port = (u: string) => new URL(u).port || '80';
const database = process.env.E2E_DB ?? process.env.E2E_DB_NAME ?? 'stimpy_test_e2e';
const mysqlPort = process.env.E2E_MYSQL_PORT ?? '3317';
const outputDir = process.env.E2E_OUTPUT_DIR ?? './test-results';
const reportDir = process.env.E2E_REPORT_DIR ?? './playwright-report';

export default defineConfig({
  testDir: './tests',
  // The launch-load probe requires an API-only process and its own isolated run; never mix it into browser E2E.
  testIgnore: includeApiLoad ? [] : ['**/performance/api-load.spec.ts'],
  outputDir,
  reporter: [['list'], ['html', { open: 'never', outputFolder: reportDir }]],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: web,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  metadata: { api },
  projects: [
    { name: 'phone-360', use: { viewport: { width: 360, height: 800 }, isMobile: false, hasTouch: true } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: boot
    ? [
        {
          command: 'npm run start -w @stimpy/api',
          cwd: '..',
          url: `${api}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          stdout: process.env.E2E_API_LOG_LEVEL === 'info' ? 'pipe' : 'ignore',
          env: {
            PORT: port(api),
            API_PUBLIC_URL: api,
            WEB_URL: web,
            ADMIN_URL: admin,
            DATABASE_URL: process.env.E2E_DATABASE_URL ?? `mysql://stimpy:stimpy@localhost:${mysqlPort}/${database}`,
            SMTP_HOST: process.env.E2E_SMTP_HOST ?? process.env.SMTP_HOST ?? 'localhost',
            SMTP_PORT: process.env.E2E_SMTP_PORT ?? process.env.SMTP_PORT ?? '1025',
            MAILPIT_URL: process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025',
            UPLOAD_DIR: process.env.E2E_UPLOAD_DIR ?? process.env.UPLOAD_DIR ?? './uploads',
            TRUST_PROXY: process.env.E2E_TRUST_PROXY ?? 'true',
            DISABLE_JOBS: process.env.E2E_DISABLE_JOBS ?? 'false',
            LOG_LEVEL: process.env.E2E_API_LOG_LEVEL ?? 'warn',
            E2E_API_SERVER_TIMING: process.env.E2E_API_SERVER_TIMING ?? '0',
          },
        },
        ...(apiOnly ? [] : [
          {
            command: process.env.E2E_WEB_COMMAND ?? `npx next dev -p ${port(web)}`,
            cwd: '../frontend/web',
            url: web,
            reuseExistingServer: false,
            timeout: 120_000,
            env: {
              NEXT_PUBLIC_API_URL: `${api}/api/v1`,
              API_URL_INTERNAL: `${api}/api/v1`,
              NEXT_PUBLIC_SITE_URL: web,
              NEXT_PUBLIC_DEV_NO_CACHE: '1',
              NEXT_PUBLIC_BUILDER_TEST_OVERRIDES: '1',
            },
          },
          {
            command: process.env.E2E_ADMIN_COMMAND ?? 'npm run dev -w @stimpy/admin',
            cwd: '..',
            url: admin,
            reuseExistingServer: false,
            timeout: 60_000,
            env: { ADMIN_PORT: port(admin), VITE_API_URL: `${api}/api/v1` },
          },
        ]),
      ]
    : undefined,
});
