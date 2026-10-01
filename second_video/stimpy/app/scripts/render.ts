#!/usr/bin/env node
// Offline renderer. Drives the app in headless Chrome (?export=1):
//   run with Node 24+ (type stripping): node scripts/render.ts <mode> ...
//   stills:  node scripts/render.ts stills --t 1.5,23,40.2 [--out dir] [--samples 1]
//   sheet:   bun scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--out file.png]  (or --times a,b,c | --cuts)
//   video:   bun scripts/render.ts video [--from 0] [--to 60] [--fps 60] [--crf 16] [--samples 8] [--shutter 0.5] [--out ../out/stimpy.mp4] [--noaudio]
//   gpu:     prints the WebGL renderer string
//   --scale 2 (all modes): true 3840×2160.
// Uses the Vite dev server at --url (default http://localhost:5173); starts a private one if unreachable.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '..');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
// the film is a vertical 9:16 Reel (see src/engine/gl.ts)
const LW = 1080, LH = 1920;
const OW = LW * SCALE, OH = LH * SCALE;
const SAMPLES = +opt('samples', mode === 'video' ? '8' : '1')!;
const SHUTTER = +opt('shutter', '0.5')!;

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function ensureServer() {
  // only reuse a server that is really this app (another project may own the default port)
  const url = opt('url');
  if (url && (await reachable(url))) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  const vite = path.join(APP, 'node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: APP, stdio: 'ignore', env: { ...process.env, STIMPY_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await reachable(u)); i++) await sleep(100);
  return { url: u, stop: () => proc.kill() };
}

async function openPage(url: string) {
  // Playwright's pipe transport hangs under Bun on Windows: start Chrome ourselves and attach over CDP.
  const chrome = opt('chrome', process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome')!;
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = path.join(ROOT, 'out/.chrome-profile');
  const proc = spawn(chrome, [...(flag('headed') ? [] : ['--headless=new']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', `--window-size=${LW},${LH}`,
    '--enable-gpu', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'],
    { stdio: 'ignore' });
  for (let i = 0; i < 100 && !(await reachable(`http://127.0.0.1:${port}/json/version`)); i++) await sleep(100);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const close = browser.close.bind(browser);
  (browser as any).close = async () => { try { await close(); } catch {} proc.kill(); };
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = await ctx.newPage();
  await page.setViewportSize({ width: LW, height: LH });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no webgl2';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return `${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}  float-rt: ${!!gl.getExtension('EXT_color_buffer_float')}`;
    }));
    page.on('crash', () => console.log('PAGE CRASHED'));
  }
  page.on('crash', () => console.error(`page crashed; log so far:\n${logs.join('\n')}`));
  page.on('console', (m) => { if (flag('verbose')) console.log('[console]', m.text().slice(0, 400)); });
  await page.goto(`${url}/?export=1${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  await page.waitForFunction(() => (window as any).__stimpy?.ready || (window as any).__stimpy?.error, null, { timeout: 180000 });
  const err = await page.evaluate(() => (window as any).__stimpy.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  return { browser, page, logs };
}

async function grab(page: Page, file: string) {
  // read the canvas' own pixels (full resolution at any scale)
  const b64: string = await page.evaluate(async () => {
    const cv = document.getElementById('c') as HTMLCanvasElement;
    const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'));
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  writeFileSync(file, Buffer.from(b64, 'base64'));
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    await page.evaluate(([t, s, sh]) => (window as any).__stimpy.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(6, '0')}.png`);
    await grab(page, f);
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, samples }) => {
    const P = (window as any).__stimpy;
    const cw = 270, ch = 480, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t, samples);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols, samples: SAMPLES });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const audio = path.join(APP, 'public/audio/stimpy.wav');
  const args = [ffmpegPath as unknown as string, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0'];
  if (!flag('noaudio')) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '16')!, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', 'aq-mode=3');
  if (!flag('noaudio')) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const [bin, ...rest] = args;
  const ff = spawn(bin!, rest, { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((r) => ff.on('close', r));
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();
  const wss = new WebSocketServer({ port: 0, maxPayload: OW * OH * 4 + 1024 });
  await new Promise((r) => wss.on('listening', r));
  const wsPort = (wss.address() as any).port;
  wss.on('connection', (ws) => {
    ws.on('message', (msg: Buffer, isBinary: boolean) => {
      if (!isBinary) return;
      const ok = ff.stdin!.write(msg);
      frames++;
      const ack = () => ws.send(String(frames));
      if (ok) ack(); else ff.stdin!.once('drain', ack);
      if (frames % 30 === 0 || frames === total) {
        const el = (performance.now() - t0) / 1000;
        process.stdout.write(`
${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
      }
    });
  });
  await page.evaluate((o) => (window as any).__stimpy.stream(o), { from, to, fps, ws: `ws://localhost:${wsPort}`, samples: SAMPLES, shutter: SHUTTER, inflight: 4 });
  while (frames < total) await sleep(20);
  ff.stdin!.end();
  await ffDone;
  wss.close();
  console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

const { url, stop } = await ensureServer();
try {
const { browser, page, logs } = await openPage(url);
try {
  const errs: string[] = await page.evaluate(() => (window as any).__stimpy.errors);
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    console.log((await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!)).join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      const tl: { start: number }[] = await page.evaluate(() => (window as any).__stimpy.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '2')!;
    const r = await page.evaluate(({ from, to, samples, shutter }) => {
      const P = (window as any).__stimpy;
      const buf = new Uint8Array(P.width * P.height * 4);
      const ms: number[] = [];
      for (let t = from; t < to; t += 1 / 60) { const a = performance.now(); P.engine.render(t, 1 / 60, samples, shutter); P.engine.readPixels(buf); ms.push(performance.now() - a); }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)] };
    }, { from, to, samples: SAMPLES, shutter: SHUTTER });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p95 ${r.p95!.toFixed(1)}ms`);
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__stimpy.duration);
    await video(page, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, path.resolve(opt('out', path.join(ROOT, 'out/stimpy.mp4'))!));
  }
  const errs2: string[] = await page.evaluate(() => (window as any).__stimpy.errors);
  if (errs2.length) console.error('SCENE ERRORS:\n' + errs2.slice(0, 10).join('\n'));
  else if (errs.length) console.error('SCENE ERRORS:\n' + errs.join('\n'));
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 30).join('\n'));
} finally {
  await browser.close();
  stop();
}
} catch (e) { console.error(e); process.exit(1); }
process.exit(0);
