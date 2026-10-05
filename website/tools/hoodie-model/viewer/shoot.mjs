// Usage: node shoot.mjs outDir name:view:color:light[:ext] ...   (throwaway static server on port 4195)
// The test texture (stimpie-003 downscaled to 1024x1600) path comes from HOODIE_TEX or the default below.
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const require = createRequire(resolve(root, 'package.json'));
const { chromium } = require('playwright-core');
const TEX = process.env.HOODIE_TEX || 'C:/Users/aswad/AppData/Local/Temp/claude/c--Projects-motion/99618d8d-09e8-472c-a16a-0936866fc26c/scratchpad/tex.png';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u === '/tex.png' ? TEX : u === '/' ? resolve(here, 'index.html') : resolve(root, '.' + u);
  if (!f.startsWith(root) && f !== TEX && !f.startsWith(resolve(here))) { res.writeHead(403); return res.end(); }
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4195, r));
const [outDir, ...jobs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1250 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
for (const j of jobs) {
  const [name, view, color, light, ext, fl] = j.split(':');
  const url = `http://localhost:4195/?view=${view}&color=${encodeURIComponent(color || 'black')}&light=${light || 'STUDIO'}&fl=${fl || 0}`;
  await page.goto(url);
  await page.waitForFunction('window.__ready||window.__err', null, { timeout: 60000 });
  const err = await page.evaluate('window.__err');
  if (err) { console.log('ERR', name, err); continue; }
  const file = resolve(outDir, `${name}.${ext || 'png'}`);
  await page.screenshot({ path: file, type: ext === 'jpg' ? 'jpeg' : 'png', ...(ext === 'jpg' ? { quality: 82 } : {}) });
  console.log('shot', file);
}
await browser.close();
server.close();
