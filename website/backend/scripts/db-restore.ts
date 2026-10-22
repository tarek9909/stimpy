/**
 * `npm run db:restore -- <file.sql>` restores a dump into DATABASE_URL. The database must be EMPTY: a mysqldump file
 * starts every table with DROP TABLE, so restoring over a live database would silently replace all of its data. The
 * script refuses a database that has tables unless `--force` is passed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfigOrExit } from '../src/config';
import { dbParts, findMysqlTool, mysqlInvocation } from './db-backup';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!file || !existsSync(resolve(file))) {
  console.error('Usage: npm run db:restore -- <backup.sql> [--force]');
  process.exit(1);
}
const config = loadConfigOrExit();
const p = dbParts(config.databaseUrl);
const conn = mysqlInvocation(p);

const count = spawnSync(findMysqlTool('mysql'), [...conn.args, '-N', '-B', '-e', 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()', p.db], {
  encoding: 'utf8', env: conn.env,
});
if (count.status !== 0) {
  console.error(count.stderr || 'could not inspect the target database');
  process.exit(1);
}
const tables = Number(count.stdout.trim());
if (!Number.isFinite(tables) || (tables > 0 && !force)) {
  console.error(`Refusing to restore: database ${p.db} already has ${count.stdout.trim()} tables and would be overwritten. Restore into an empty database, or pass --force.`);
  process.exit(1);
}

const res = spawnSync(findMysqlTool('mysql'), [...conn.args, '--default-character-set=utf8mb4', p.db], {
  input: readFileSync(resolve(file)), encoding: 'buffer', maxBuffer: 1024 * 1024 * 64, env: conn.env,
});
if (res.status !== 0) {
  console.error(res.stderr.toString() || 'restore failed');
  process.exit(1);
}
console.log(`Restored ${file} into ${p.db}.`);
