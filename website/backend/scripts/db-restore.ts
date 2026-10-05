/**
 * `npm run db:restore -- <file.sql>` restores a dump into DATABASE_URL (the database must be EMPTY; it is not dropped).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfigOrExit } from '../src/config';
import { dbParts, findMysqlTool } from './db-backup';

const file = process.argv[2];
if (!file || !existsSync(resolve(file))) {
  console.error('Usage: npm run db:restore -- <backup.sql>');
  process.exit(1);
}
const config = loadConfigOrExit();
const p = dbParts(config.databaseUrl);
const res = spawnSync(findMysqlTool('mysql'), [`-h${p.host}`, `-P${p.port}`, `-u${p.user}`, `--password=${p.password}`, '--default-character-set=utf8mb4', p.db], {
  input: readFileSync(resolve(file)), encoding: 'buffer', maxBuffer: 1024 * 1024 * 64,
});
if (res.status !== 0) {
  console.error(res.stderr.toString() || 'restore failed');
  process.exit(1);
}
console.log(`Restored ${file} into ${p.db}.`);
