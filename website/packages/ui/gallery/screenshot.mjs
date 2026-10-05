/**
 * Screenshots the built gallery with the system Chrome (no browser download).
 *   npm run gallery:build -w @stimpy/ui && npm run gallery:shots -w @stimpy/ui
 * Output: $SHOTS_DIR or <os tmp>/stimpy-ui-shots, as slices of 1400px height per viewport width.
 * Env: SHOTS_WIDTHS="360,1280"  SHOTS_MOTION="reduce|no-preference"
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = process.env.SHOTS_DIR ?? join(tmpdir(), 'stimpy-ui-shots');
const widths = (process.env.SHOTS_WIDTHS ?? '360,1280').split(',').map(Number);
const motion = process.env.SHOTS_MOTION ?? 'reduce';
const port = Number(process.env.SHOTS_PORT ?? 5291);
mkdirSync(outDir, { recursive: true });

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(port, r));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // scroll through so in-view effects (ZipWipe) have played and lazy images loaded
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 600) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`width ${width}: page height ${height}px, horizontal overflow ${overflow}px, console errors ${errors.length}`);
    errors.forEach((e) => console.log('  error:', e));
    const slice = 1400;
    for (let y = 0, i = 0; y < height; y += slice, i += 1) {
      const file = join(outDir, `gallery-${width}-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width, height: Math.min(slice, height - y) } });
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log('screenshots in', outDir);
