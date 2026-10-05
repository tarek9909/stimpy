#!/usr/bin/env node
// Offline renderer: drives the app in headless Chrome (?export=1). Run with Node 24+ (type stripping):
//
//   node scripts/render.ts video  --film logo [--v <variant>] [--samples 8] [--shutter 0.5] [--fps 60] [--out file.mp4]
//   node scripts/render.ts all    [--film glimpses,countdown] [--samples 8]   every variant (of the named films) → ../out/
//   node scripts/render.ts sheet  --film logo [--v x] [--n 16] [--cols 4] [--out file.png]   contact sheet
//   node scripts/render.ts stills --film logo --t 1.5,4.2 [--out dir]                      PNG stills
//   node scripts/render.ts wav    --film logo [--out file.wav]                                soundtrack only
//   node scripts/render.ts check                                   smoke-test every film for script errors
//   --scale 2 (any mode): true 2160×3840.   --chrome <path> to pick the browser.
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const START = performance.now();
const since = () => ((performance.now() - START) / 1000).toFixed(1) + 's';
let FRAMES_SEEN = 0;
const argv = process.argv.slice(2);
const mode = argv[0] ?? 'check';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(APP, '..', 'out');
const SCALE = Math.max(1, Math.round(+opt('scale', '1')!));
const OW = 1080 * SCALE, OH = 1920 * SCALE;
const SAMPLES = +opt('samples', mode === 'video' || mode === 'all' ? '8' : '1')!;
const SHUTTER = +opt('shutter', '0.5')!;

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function startServer() {
  const port = 5300 + Math.floor(Math.random() * 500);
  const vite = path.join(APP, 'node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: APP, stdio: 'ignore', env: { ...process.env, STIMPY_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 300 && !(await reachable(u)); i++) await sleep(100);
  return { url: u, stop: () => proc.kill() };
}

function findChrome() {
  const given = opt('chrome');
  if (given) return given;
  const cands = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
  return cands.find((p) => existsSync(p)) ?? cands[0]!;
}

// A minimal DevTools client. Playwright enables Chrome's Network domain, which mirrors every 8 MB WebSocket
// frame into the DevTools channel; after a few hundred frames that overflows (>256 MB) and Chrome exits.
// This client only uses Target/Page/Runtime, so frame data never leaves the page except through our socket.
export interface Page {
  evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
}
class CDP {
  private id = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private ws: WebSocket;
  onEvent: (method: string, params: any) => void = () => {};
  constructor(url: string) { this.ws = new WebSocket(url); }
  async open() {
    await new Promise<void>((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = () => rej(new Error('CDP connection failed')); });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined) { const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); }
      else this.onEvent(m.method, m.params);
    };
    this.ws.onclose = () => { for (const p of this.pending.values()) p.rej(new Error('Chrome closed the DevTools connection')); this.pending.clear(); };
  }
  send(method: string, params: any = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function openPage(url: string) {
  // launch Chrome ourselves and drive it over the DevTools protocol
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), `stimpy-chrome-${port}`);
  const gpuFlags = process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [];
  const proc = spawn(findChrome(), [...(flag('headed') ? [] : ['--headless=new']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--window-size=1080,1920', '--autoplay-policy=no-user-gesture-required',
    '--enable-gpu', ...gpuFlags, '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(opt('chromelog') ? ['--enable-logging=stderr', '--v=0'] : []), 'about:blank'],
    { stdio: opt('chromelog') ? ['ignore', 'ignore', 'pipe'] : 'ignore' });
  if (opt('chromelog')) { const { createWriteStream } = await import('node:fs'); proc.stderr!.pipe(createWriteStream(opt('chromelog')!)); }
  proc.on('exit', (code, sig) => { if (flag('verbose')) console.error(`\n[renderer] chrome exited code=${code} signal=${sig} at ${since()} after ${FRAMES_SEEN} frames`); });
  let ver: any = null;
  for (let i = 0; i < 150 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })).json(); } catch { await sleep(100); } }
  if (!ver) throw new Error('could not start Chrome (pass --chrome <path>)');
  const cdp = new CDP(ver.webSocketDebuggerUrl);
  await cdp.open();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const logs: string[] = [];
  cdp.onEvent = (method, params) => {
    if (params?.sessionId && params.sessionId !== sessionId) return;
    if (method === 'Runtime.exceptionThrown') logs.push(`[pageerror] ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text}`);
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'warning')) logs.push(`[${params.type}] ${params.args.map((a: any) => a.value ?? a.description).join(' ')}`);
    if (method === 'Inspector.targetCrashed') console.error(`\n[renderer] the page crashed. Log so far:\n${logs.join('\n')}`);
  };
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Inspector.enable', {}, sessionId).catch(() => {});
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false }, sessionId);
  const page: Page = {
    async evaluate(fn: any, arg?: any) {
      const expression = `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(`page.evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
  };
  await cdp.send('Page.navigate', { url: `${url}/?export=1${SCALE !== 1 ? `&scale=${SCALE}` : ''}` }, sessionId);
  const t0 = performance.now();
  while (!(await page.evaluate(() => !!((window as any).__stimpy?.ready || (window as any).__stimpy?.error)).catch(() => false))) {
    if (performance.now() - t0 > 180000) throw new Error('app did not boot within 3 minutes');
    await sleep(100);
  }
  const err = await page.evaluate(() => (window as any).__stimpy.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const close = async () => {
    try { await cdp.send('Browser.close'); } catch { /* */ }
    cdp.close(); proc.kill(); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* */ }
  };
  return { page, logs, close };
}

interface Loaded { id: string; variant: string; duration: number; title: string; marks: { t: number; label: string }[]; folder: string }
const loadFilm = (page: Page, id: string, v?: string): Promise<Loaded> => page.evaluate(([id, v]) => (window as any).__stimpy.load(id, v || undefined), [id, v ?? ''] as const);
const slug = (f: Loaded) => `${f.id}${f.variant ? `_${f.variant}` : ''}`;
/** Films with their own folder render into out/<folder>/. */
const outDir = (f: Loaded) => (f.folder ? path.join(OUT, f.folder) : OUT);

async function grab(page: Page, file: string) {
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

async function writeWav(page: Page, file: string) {
  const b64: string = await page.evaluate(() => (window as any).__stimpy.wav());
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(b64, 'base64'));
}

async function sheet(page: Page, times: number[], cols: number, out: string, width = 270) {
  const dataUrl: string = await page.evaluate(async ({ times, cols, samples, width }) => {
    const P = (window as any).__stimpy;
    const cw = width, ch = Math.round(width * 16 / 9), pad = 6, lab = 18;
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
  }, { times, cols, samples: SAMPLES, width });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, f: Loaded, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const fps = +opt('fps', '60')!;
  const from = +opt('from', '0')!, to = +opt('to', String(f.duration))!;
  const wav = out.replace(/\.mp4$/, '') + '.wav';
  await writeWav(page, wav);
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0',
    '-ss', String(from), '-t', String(to - from), '-i', wav,
    '-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '16')!, '-pix_fmt', 'yuv420p', '-tune', 'animation', '-x264-params', 'aq-mode=3',
    '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out];
  const ff = spawn(ffmpegPath as unknown as string, args, { stdio: ['pipe', 'inherit', 'inherit'] });
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
      FRAMES_SEEN = frames;
      const ack = () => ws.send(String(frames));
      if (ok) ack(); else ff.stdin!.once('drain', ack);
      if (frames % 30 === 0 || frames === total) {
        const el = (performance.now() - t0) / 1000;
        process.stdout.write(`\r  ${slug(f)}: ${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
      }
    });
  });
  await page.evaluate((o) => (window as any).__stimpy.stream(o), { from, to, fps, ws: `ws://localhost:${wsPort}`, samples: SAMPLES, shutter: SHUTTER, inflight: 4 });
  while (frames < total) await sleep(20);
  ff.stdin!.end();
  await ffDone;
  wss.close();
  console.log(`\n  wrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

const { url, stop } = await startServer();
let code = 0;
try {
  const { page, logs, close } = await openPage(url);
  try {
    const films: { id: string; variants: string[] }[] = await page.evaluate(() => (window as any).__stimpy.films);
    const film = opt('film'), v = opt('v');
    const errs = async () => (await page.evaluate(() => (window as any).__stimpy.errors)) as string[];
    if (mode === 'video') {
      const f = await loadFilm(page, film ?? 'logo', v);
      await video(page, f, path.resolve(opt('out', path.join(outDir(f), `stimpy_${slug(f)}.mp4`))!));
    } else if (mode === 'all') {
      // every variant of every film, or only the films named with --film (comma-separated)
      const only = film ? film.split(',') : null;
      for (const F of films.filter((x) => !only || only.includes(x.id))) for (const vv of F.variants.length ? F.variants : ['']) {
        const f = await loadFilm(page, F.id, vv);
        await video(page, f, path.join(outDir(f), `stimpy_${slug(f)}.mp4`));
      }
    } else if (mode === 'wav') {
      const f = await loadFilm(page, film ?? 'logo', v);
      const out = path.resolve(opt('out', path.join(outDir(f), `stimpy_${slug(f)}.wav`))!);
      await writeWav(page, out);
      console.log(out);
    } else if (mode === 'stills') {
      const f = await loadFilm(page, film ?? 'logo', v);
      const dir = path.resolve(opt('out', path.join(OUT, 'stills'))!);
      mkdirSync(dir, { recursive: true });
      for (const t of (opt('t') ?? '0').split(',').map(Number)) {
        await page.evaluate(([t, s, sh]) => (window as any).__stimpy.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
        const file = path.join(dir, `${slug(f)}_${t.toFixed(2)}.png`);
        await grab(page, file);
        console.log(file);
      }
    } else if (mode === 'sheet') {
      const f = await loadFilm(page, film ?? 'logo', v);
      let times: number[];
      if (opt('times')) times = opt('times')!.split(',').map(Number);
      else {
        const from = +opt('from', '0')!, to = +opt('to', String(f.duration - 0.02))!, nn = +opt('n', '16')!;
        times = Array.from({ length: nn }, (_, i) => from + ((to - from) * i) / Math.max(1, nn - 1));
      }
      const out = path.resolve(opt('out', f.folder ? path.join(outDir(f), `${slug(f)}_sheet.png`) : path.join(OUT, 'sheets', `${slug(f)}.png`))!);
      await sheet(page, times, +opt('cols', '4')!, out, +opt('w', '270')!);
      console.log(out);
    } else if (mode === 'check') {
      for (const F of films) for (const vv of F.variants.length ? F.variants : ['']) {
        const f = await loadFilm(page, F.id, vv);
        const step = 1 / +opt('fps', '12')!;
        const ms = await page.evaluate(({ d, step }) => {
          const P = (window as any).__stimpy; const a = performance.now(); let n = 0;
          for (let t = 0; t < d; t += step) { P.still(t, 1); n++; }
          return (performance.now() - a) / n;
        }, { d: f.duration, step });
        const e = await errs();
        console.log(`${e.length ? 'FAIL' : 'ok  '} ${slug(f).padEnd(22)} ${f.duration.toFixed(2)}s  ${ms.toFixed(1)} ms/frame${e.length ? '\n' + e.slice(0, 3).join('\n') : ''}`);
        if (e.length) code = 1;
      }
    }
    const e = await errs();
    if (e.length && mode !== 'check') { console.error('SCENE ERRORS:\n' + e.slice(0, 10).join('\n')); code = 1; }
    if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 30).join('\n'));
  } finally {
    await close();
  }
} catch (e) { console.error(e); code = 1; }
stop();
process.exit(code);
