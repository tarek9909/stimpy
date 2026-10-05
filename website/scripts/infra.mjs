// Local infrastructure: MySQL on 3317 and Mailpit (SMTP 1025, web 8025).
// Uses Docker when `docker` exists; otherwise the portable binaries in .infra/ (see README "No Docker").
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, openSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const infra = join(root, '.infra');
const cmd = process.argv[2] ?? 'status';
const hasDocker = spawnSync('docker', ['--version'], { shell: true }).status === 0 && !process.env.STIMPY_NO_DOCKER;

const mysqlBase = existsSync(infra) ? readdirSync(infra).map((d) => join(infra, d)).find((d) => /mysql-8/.test(d) && existsSync(join(d, 'bin'))) : undefined;
const mailpitExe = join(infra, 'mailpit', 'mailpit.exe');
const dataDir = join(infra, 'data');
const pidDir = join(infra, 'pids');
const logDir = join(infra, 'logs');
const MYSQL_PORT = 3317;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (port) => new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
const waitPort = async (port, label, tries = 60) => { for (let i = 0; i < tries; i++) { if (await portOpen(port)) return; await wait(1000); } throw new Error(`${label} did not open port ${port}`); };
const mysqlCli = (sql, db) => spawnSync(join(mysqlBase, 'bin', 'mysql.exe'), ['-uroot', '-h127.0.0.1', `-P${MYSQL_PORT}`, ...(db ? [db] : []), '-e', sql], { encoding: 'utf8' });

function startDetached(exe, args, name) {
  mkdirSync(pidDir, { recursive: true }); mkdirSync(logDir, { recursive: true });
  const out = openSync(join(logDir, `${name}.log`), 'a');
  const child = spawn(exe, args, { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  writeFileSync(join(pidDir, `${name}.pid`), String(child.pid));
  child.unref();
}
function stopByPid(name) {
  const f = join(pidDir, `${name}.pid`);
  if (!existsSync(f)) return;
  const pid = readFileSync(f, 'utf8').trim();
  spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { shell: true });
  rmSync(f, { force: true });
}

async function up() {
  if (hasDocker) { const r = spawnSync('docker', ['compose', 'up', '-d', '--wait'], { cwd: root, stdio: 'inherit', shell: true }); process.exit(r.status ?? 0); }
  if (!mysqlBase) throw new Error('No Docker and no portable MySQL in .infra/. See README "No Docker".');
  if (!(await portOpen(MYSQL_PORT))) {
    const fresh = !existsSync(join(dataDir, 'mysql'));
    if (fresh) {
      mkdirSync(dataDir, { recursive: true });
      const r = spawnSync(join(mysqlBase, 'bin', 'mysqld.exe'), ['--initialize-insecure', `--basedir=${mysqlBase}`, `--datadir=${dataDir}`, '--console'], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('mysqld --initialize-insecure failed');
    }
    startDetached(join(mysqlBase, 'bin', 'mysqld.exe'), [`--basedir=${mysqlBase}`, `--datadir=${dataDir}`, `--port=${MYSQL_PORT}`, '--bind-address=127.0.0.1', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--default-time-zone=+00:00', '--max-connections=300', '--mysqlx=OFF', '--skip-log-bin', '--innodb-redo-log-capacity=33554432', '--console'], 'mysql');
    await waitPort(MYSQL_PORT, 'MySQL');
    await wait(1500);
    if (fresh) {
      const sql = "CREATE DATABASE IF NOT EXISTS stimpy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS stimpy_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'stimpy'@'%' IDENTIFIED BY 'stimpy'; CREATE USER IF NOT EXISTS 'stimpy'@'localhost' IDENTIFIED BY 'stimpy'; GRANT ALL PRIVILEGES ON *.* TO 'stimpy'@'%'; GRANT ALL PRIVILEGES ON *.* TO 'stimpy'@'localhost'; FLUSH PRIVILEGES;";
      const r = mysqlCli(sql); if (r.status !== 0) throw new Error('bootstrap SQL failed: ' + r.stderr);
    }
  }
  if (!(await portOpen(1025)) && existsSync(mailpitExe)) {
    startDetached(mailpitExe, ['--smtp', '127.0.0.1:1025', '--listen', '127.0.0.1:8025', '--database', join(infra, 'mailpit.db')], 'mailpit');
    await waitPort(1025, 'Mailpit', 20);
  }
  console.log('infra up: MySQL localhost:3317 (stimpy/stimpy), Mailpit smtp 1025 web http://localhost:8025');
}
async function down() {
  if (hasDocker) { spawnSync('docker', ['compose', 'down'], { cwd: root, stdio: 'inherit', shell: true }); return; }
  stopByPid('mailpit');
  if (mysqlBase && (await portOpen(MYSQL_PORT))) spawnSync(join(mysqlBase, 'bin', 'mysqladmin.exe'), ['-uroot', '-h127.0.0.1', `-P${MYSQL_PORT}`, 'shutdown']);
  await wait(1500); stopByPid('mysql');
  console.log('infra down');
}
async function reset() {
  if (hasDocker) { spawnSync('docker', ['compose', 'down', '-v'], { cwd: root, stdio: 'inherit', shell: true }); return up(); }
  await down(); rmSync(dataDir, { recursive: true, force: true }); rmSync(join(infra, 'mailpit.db'), { force: true }); await up();
}
async function status() { console.log({ docker: hasDocker, mysql3317: await portOpen(MYSQL_PORT), mailpitSmtp1025: await portOpen(1025), mailpitWeb8025: await portOpen(8025) }); }

try { await ({ up, down, reset, status }[cmd] ?? status)(); } catch (e) { console.error(e.message); process.exit(1); }
