/**
 * `npm run db:backup` writes a timestamped mysqldump of DATABASE_URL to backend/backups/ (git-ignored).
 * Uses the portable MySQL in website/.infra (or mysqldump on PATH). Remember to back up UPLOAD_DIR too.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_ROOT, loadConfigOrExit } from '../src/config';

export function findMysqlTool(name: 'mysqldump' | 'mysql'): string {
  const infra = join(API_ROOT, '..', '.infra');
  if (existsSync(infra)) {
    for (const d of readdirSync(infra)) {
      const exe = join(infra, d, 'bin', `${name}.exe`);
      if (/mysql-8/.test(d) && existsSync(exe)) return exe;
    }
  }
  return name; // PATH
}

export function dbParts(databaseUrl: string): { host: string; port: string; user: string; password: string; db: string } {
  const u = new URL(databaseUrl);
  return { host: u.hostname, port: u.port || '3306', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), db: u.pathname.replace(/^\//, '') };
}

/** Connection arguments for mysql/mysqldump. The password goes through MYSQL_PWD, never argv (visible in `ps`). */
export function mysqlInvocation(p: ReturnType<typeof dbParts>): { args: string[]; env: NodeJS.ProcessEnv } {
  return { args: [`-h${p.host}`, `-P${p.port}`, `-u${p.user}`], env: { ...process.env, MYSQL_PWD: p.password } };
}

const isMain = process.argv[1]?.endsWith('db-backup.ts');
if (isMain) {
  const config = loadConfigOrExit();
  const p = dbParts(config.databaseUrl);
  const dir = join(API_ROOT, 'backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${p.db}-${stamp}.sql`);
  const conn = mysqlInvocation(p);
  const res = spawnSync(findMysqlTool('mysqldump'), [...conn.args, '--single-transaction', '--routines', '--default-character-set=utf8mb4', p.db], {
    encoding: 'buffer', maxBuffer: 1024 * 1024 * 512, env: conn.env,
  });
  if (res.status !== 0) {
    console.error(res.stderr.toString() || 'mysqldump failed');
    process.exit(1);
  }
  writeFileSync(file, res.stdout);
  console.log(`Backup written: ${file} (${res.stdout.length} bytes)`);
}
