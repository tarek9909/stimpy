// Offline renderer: headless Chrome draws each frame, ffmpeg encodes it.
//
//   node scripts/render.mjs video  [--fps 30] [--samples 4] [--shutter 0.5] [--from 0] [--to 49.75] [--crf 16] [--out ../out/stimpy.mp4]
//   node scripts/render.mjs sheet  [--every 1.5 | --times 1,2,3] [--cols 6] [--out ../out/sheet.jpg]
//   node scripts/render.mjs stills --times 1,2,3 [--dir ../out/stills]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'video';
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const py = path.resolve(root, '../song/.venv/Scripts/python.exe');
  if (existsSync(py)) return execFileSync(py, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  return 'ffmpeg';
}

process.env.STIMPY_NO_HMR = '1';
const server = await createServer({ root, logLevel: 'error', server: { port: 5191 } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/?render=1${process.argv.includes('--avatar') ? '&avatar' : ''}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__stimpy?.ready, null, { timeout: 60000 });
const duration = await page.evaluate(() => window.__stimpy.duration);

const b64 = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

try {
  if (mode === 'stills') {
    const dir = path.resolve(root, arg('dir', '../out/stills'));
    mkdirSync(dir, { recursive: true });
    for (const t of arg('times', '1').split(',').map(Number)) {
      const d = await page.evaluate((t) => window.__stimpy.still(t), t);
      const f = path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`);
      writeFileSync(f, b64(d));
      console.log(f);
    }
  } else if (mode === 'cards') {
    const dir = path.resolve(root, arg('dir', '../out/stimpies'));
    mkdirSync(dir, { recursive: true });
    const scale = Number(arg('scale', 4));
    for (let n = 0; n <= 16; n++) {
      const d = await page.evaluate(([n, s]) => window.__stimpy.card(n, s), [n, scale]);
      writeFileSync(path.join(dir, `stimpie-${String(n).padStart(3, '0')}.png`), b64(d));
    }
    writeFileSync(path.join(dir, 'lookbook.jpg'), b64(await page.evaluate(() => window.__stimpy.lookbook())));
    console.log(dir);
  } else if (mode === 'sheet') {
    const every = Number(arg('every', 1.5));
    const from = Number(arg('from', 0)), to = Number(arg('to', duration));
    const times = arg('times') ? arg('times').split(',').map(Number) : Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => from + i * every);
    const d = await page.evaluate(([ts, cols, w]) => window.__stimpy.sheet(ts, cols, w), [times, Number(arg('cols', 6)), Number(arg('cell', 240))]);
    const f = path.resolve(root, arg('out', '../out/sheet.jpg'));
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, b64(d));
    console.log(f);
  } else {
    const fps = Number(arg('fps', 30));
    const samples = Number(arg('samples', 1));
    const shutter = Number(arg('shutter', 0.5));
    const from = Number(arg('from', 0));
    const to = Math.min(duration, Number(arg('to', duration)));
    const outFile = path.resolve(root, arg('out', '../out/stimpy.mp4'));
    mkdirSync(path.dirname(outFile), { recursive: true });
    const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
    const ff = spawn(ffmpegPath(), [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-ss', String(from), '-t', String(to - from), '-i', path.join(root, 'public/stimpy.wav'),
      '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', arg('crf', '18'), '-maxrate', arg('maxrate', '24M'), '-bufsize', '48M', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
    const t0 = Date.now();
    for (let n = n0; n < n1; n++) {
      const d = await page.evaluate(([t, fps, s, sh]) => window.__stimpy.frame(t, fps, s, sh), [n / fps, fps, samples, shutter]);
      if (!ff.stdin.write(b64(d))) await new Promise((r) => ff.stdin.once('drain', r));
      if ((n - n0) % fps === 0) {
        const el = (Date.now() - t0) / 1000;
        const rate = (n - n0 + 1) / el;
        process.stdout.write(`\r${(n / fps).toFixed(1)}s / ${to.toFixed(1)}s  ${rate.toFixed(1)} fps  eta ${((n1 - n) / rate).toFixed(0)}s   `);
      }
    }
    ff.stdin.end();
    await done;
    console.log(`\nwrote ${outFile} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close();
  await server.close();
}
