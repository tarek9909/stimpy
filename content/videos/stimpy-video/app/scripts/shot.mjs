// Screenshot the live preview the way a viewer sees it: node scripts/shot.mjs 20.6 16.8 ...
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const times = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
mkdirSync('../out/shots', { recursive: true });
for (const t of times) {
  await page.goto(`http://localhost:5190/?t=${t}${process.env.AVATAR ? '&avatar' : ''}`);
  await page.waitForFunction(() => window.__stimpy?.ready);
  await page.waitForTimeout(600);
  const f = `../out/shots/preview_${t}.png`;
  await page.locator('#out').screenshot({ path: f });
  console.log(f);
}
await browser.close();
