import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'));

// Every worker talks to the TEST database only. DATABASE_URL is overridden so app code cannot reach dev data.
const testDb = process.env.TEST_DATABASE_URL ?? 'mysql://stimpy:stimpy@localhost:3317/stimpy_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One TEST_DATABASE_URL = one test process at a time. Parallel engineers use different databases.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
      TEST_DATABASE_URL: testDb,
      LOG_LEVEL: 'silent',
      DISABLE_JOBS: 'true',
      API_PUBLIC_URL: 'http://localhost:4000',
      WEB_URL: 'http://localhost:3000',
      ADMIN_URL: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      UPLOAD_DIR: './uploads-test',
    },
  },
});
