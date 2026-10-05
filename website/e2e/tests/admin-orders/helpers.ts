import { expect, type Page } from '@playwright/test';
import { ADMIN, API, MAILPIT, WEB, mysql } from '../runtime';

export { ADMIN, API, WEB };
export const EMAIL = 'owner@stimpy.local';
export const PASSWORD = 'Stimpy-Dev-Password-1';
export const SHOTS = process.env.E2E_SHOTS_DIR ?? process.env.E2E_SHOTS ?? 'D:/stimpy-cache/fa2-shots';

/** One value from the database (tab separated, first row first column unless `all`). */
export function sql(query: string): string[][] {
  const out = mysql(query);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('\t'));
}
export const sql1 = (query: string): string => sql(query)[0]?.[0] ?? '';

export async function login(page: Page): Promise<void> {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
}

export async function noHScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

export async function shot(page: Page, project: string, name: string): Promise<void> {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: true });
}

export async function mailTo(address: string): Promise<Array<{ Subject: string }>> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  const json = (await res.json()) as { messages?: Array<{ Subject: string }> };
  return json.messages ?? [];
}

export async function waitForMail(address: string, count: number, timeoutMs = 45_000): Promise<Array<{ Subject: string }>> {
  const start = Date.now();
  for (;;) {
    const m = await mailTo(address);
    if (m.length >= count) return m;
    if (Date.now() - start > timeoutMs) throw new Error(`Expected ${count} mails to ${address}, got ${m.length}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

let seq = 0;
export function uniquePhone(): string {
  seq += 1;
  return `03${String(Date.now()).slice(-5)}${seq}`.slice(0, 8);
}

export function coreStimpieId(): number {
  return Number(sql1("select id from stimpies where active=1 and type='CORE' order by id limit 1"));
}

export interface MadeOrder {
  id: number;
  number: string;
}

/** Creates an order through the admin API as the logged-in owner (setup only; the UI is what the tests verify). */
export async function apiCreateOrder(
  page: Page,
  opts: { name?: string; email?: string; status?: 'NEW' | 'CONFIRMED'; sendEmail?: boolean; stimpieId?: number; phone?: string } = {},
): Promise<MadeOrder> {
  const res = await page.request.post(`${API}/api/v1/admin/orders`, {
    headers: { Origin: ADMIN },
    data: {
      source: 'MANUAL',
      initialStatus: opts.status ?? 'CONFIRMED',
      sendEmail: opts.sendEmail ?? false,
      customer: { name: opts.name ?? 'Test Person', phone: opts.phone ?? uniquePhone(), whatsappSameAsPhone: true, ...(opts.email ? { email: opts.email } : {}) },
      delivery: { areaName: 'Beirut', address: 'Test street 12, building 3' },
      items: [{ kind: 'stimpie', stimpieId: opts.stimpieId ?? coreStimpieId(), qty: 1 }],
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const o = (await res.json()) as { id: number; number: string };
  return { id: o.id, number: o.number };
}

export async function apiStatus(page: Page, id: number, to: string, extra: Record<string, unknown> = {}): Promise<void> {
  const res = await page.request.post(`${API}/api/v1/admin/orders/${id}/status`, { headers: { Origin: ADMIN }, data: { to, ...extra } });
  expect(res.status(), await res.text()).toBe(200);
}
