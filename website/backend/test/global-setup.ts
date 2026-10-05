import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs once per `vitest run`: applies all migrations to the TEST database (creating it if missing).
 * Refuses to touch any database whose name does not contain "test".
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'mysql://stimpy:stimpy@localhost:3317/stimpy_test';
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`TEST_DATABASE_URL must point at a database whose name contains "test" (got "${dbName}").`);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  const res = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`prisma migrate deploy failed for test database "${dbName}":\n${res.stdout}\n${res.stderr}`);
  }
}
