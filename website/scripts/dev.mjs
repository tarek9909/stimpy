// Runs API, web and admin together (infra must already be up).
import { spawn } from 'node:child_process';
const procs = [['api', 'api:dev'], ['web', 'web:dev'], ['admin', 'admin:dev']].map(([n, s]) => {
  const p = spawn('npm', ['run', s], { stdio: 'inherit', shell: true });
  p.on('exit', (c) => { console.log(`[${n}] exited ${c}`); });
  return p;
});
process.on('SIGINT', () => { procs.forEach((p) => p.kill()); process.exit(0); });
