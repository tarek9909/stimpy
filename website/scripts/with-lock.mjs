// Serialise a command across parallel workers (e.g. prisma generate / migrate on Windows locks the engine DLL).
// Usage: node scripts/with-lock.mjs <name> -- <command...>
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [name, , ...cmd] = process.argv.slice(2);
const lock = join(root, `.lock-${name}`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const t0 = Date.now();
for (;;) {
  try { mkdirSync(lock); break; } catch {
    try { if (Date.now() - statSync(lock).mtimeMs > 10 * 60_000) rmSync(lock, { recursive: true }); } catch {}
    if (Date.now() - t0 > 15 * 60_000) { console.error('lock timeout'); process.exit(1); }
    sleep(1500);
  }
}
try { process.exitCode = spawnSync(cmd.join(' '), { cwd: process.cwd(), stdio: 'inherit', shell: true }).status ?? 1; }
finally { rmSync(lock, { recursive: true, force: true }); }
