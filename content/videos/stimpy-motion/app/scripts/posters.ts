#!/usr/bin/env node
// Export the Instagram posts (posters.html) as 1080 × 1350 PNGs. Run with Node 24+ (type stripping):
//
//   node scripts/posters.ts [--only 01_one-hoodie,14_the-split] [--out <dir>] [--chrome <path>]
//
// Default output: content/posters/.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(opt('out', path.resolve(APP, '..', '..', '..', 'posters'))!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
function findChrome() {
  const given = opt('chrome');
  if (given) return given;
  const cands = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
  return cands.find((p) => existsSync(p)) ?? cands[0]!;
}

const port = 5800 + Math.floor(Math.random() * 400);
const vite = spawn(process.execPath, [path.join(APP, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: APP, stdio: 'ignore', env: { ...process.env, STIMPY_NO_HMR: '1' } });
const base = `http://localhost:${port}`;
try {
  for (let i = 0; i < 300 && !(await reachable(base)); i++) await sleep(100);
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/posters.html`);
  await page.waitForFunction(() => (window as any).__posters?.ready || (window as any).__postersError, null, { timeout: 120000 });
  const fail = await page.evaluate(() => (window as any).__postersError);
  if (fail) throw new Error(fail);
  const only = opt('only')?.split(',');
  const ids: string[] = (await page.evaluate(() => (window as any).__posters.ids)).filter((id: string) => !only || only.includes(id));
  mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const b64: string = await page.evaluate((i) => (window as any).__posters.png(i), id);
    writeFileSync(path.join(OUT, `stimpy_post_${id}.png`), Buffer.from(b64, 'base64'));
    console.log(`  ✓ stimpy_post_${id}.png`);
  }
  if (errors.length) console.log('browser errors:\n  ' + errors.join('\n  '));
  await browser.close();
  console.log(`${ids.length} posts → ${OUT}`);
} finally {
  vite.kill();
}
