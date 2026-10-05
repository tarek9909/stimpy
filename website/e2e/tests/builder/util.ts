import { expect, type Page } from '@playwright/test';
import { ADMIN, API } from '../runtime';

export { API };
export const SHOTS = process.env.E2E_SHOTS_DIR ?? 'D:/stimpy-cache/fb-shots/e2e';

/** Software GL is fine for tests: the explicit override (?builder3d=force) bypasses the SwiftShader check. */
export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export async function adminSession() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN, 'x-forwarded-for': '198.18.3.11' },
    body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1' }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const h = { 'content-type': 'application/json', origin: ADMIN, cookie };
  return {
    async get(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- admin payload is large and only partly used
      return (await fetch(`${API}/api/v1/admin/builder`, { headers: h })).json();
    },
    async put(body: unknown): Promise<{ status: number; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
      const r = await fetch(`${API}/api/v1/admin/builder`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    },
  };
}

export async function publicConfig(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (await fetch(`${API}/api/v1/builder/config`)).json();
}

/** Collects URLs of JavaScript responses that contain three.js (it registers `webglcontextlost`). */
export function watchThree(page: Page) {
  const hits: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (r) => {
    const url = r.url();
    if (!/\.js(\?|$)/.test(url) || !url.includes('/_next/')) return;
    pending.push(
      r
        .text()
        .then((t) => {
          if (t.includes('webglcontextlost')) hits.push(url);
        })
        .catch(() => undefined),
    );
  });
  return {
    hits,
    async settled() {
      await Promise.all(pending);
      return hits;
    },
  };
}

export async function open3d(page: Page, qs = '') {
  await page.goto(`/builder?builder3d=force${qs}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-builder-3d="ready"]', { timeout: 90_000 });
  await idle3d(page);
}

export async function idle3d(page: Page) {
  await page.waitForFunction(() => {
    const d = (window as any).__stimpyBuilder3d; // eslint-disable-line @typescript-eslint/no-explicit-any
    return !!d && !d.busy();
  }, null, { timeout: 60_000 });
}

export const option = (page: Page, name: RegExp | string) => page.getByRole('listbox', { name: 'Stimpies' }).getByRole('option', { name });
