import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = dirname(fileURLToPath(import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 1600)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 1600)); });
  for (const path of ['/', '/shop', '/shop/hoodie/stimpy-hoodie', '/shop/stimpie/stimpy', '/builder', '/drops', '/drops/drop-001', '/how-it-works', '/about', '/delivery-returns', '/help', '/legal', '/checkout', '/track']) {
    errors = [];
    try {
      const response = await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle', timeout: 30000 });
      const result = { path, status: response?.status(), title: await page.title(), headings: await page.locator('h1').allTextContents(), errorPage: await page.getByText('Something went wrong.', { exact: true }).count() > 0, overflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), errors: [...errors] };
      if (path === '/') {
        await page.screenshot({ path: resolve(output, 'homepage-observed.png') });
      }
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      results.push({ path, error: error.message, errors: [...errors] });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'browser-readonly-results.json'), JSON.stringify(results, null, 2));
}
