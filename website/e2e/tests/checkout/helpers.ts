import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { ADMIN, API, DATABASE, MAILPIT, WEB, mysql } from '../runtime';

export { API, WEB };
const API_V1 = `${API}/api/v1`;
export const ADMIN_ORIGIN = ADMIN;
export const DB_NAME = DATABASE;
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS = process.env.E2E_SHOTS_DIR ?? path.resolve(HERE, '../../screenshots/checkout');

/* ------------------------------------------------------------------------------------------ console */

/** Collect console errors and page errors; `assertClean()` at the end of a test. Deliberate API 4xx are not console errors of ours. */
export function watchConsole(page: Page, options: { ignoreFailedResourceLoads?: boolean } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Chrome logs every non-2xx fetch as "Failed to load resource": expected product flow (404 track, 409, 422, 429...).
    if (options.ignoreFailedResourceLoads !== false && /Failed to load resource/.test(text)) return;
    errors.push(text.slice(0, 2500));
  });
  page.on('pageerror', (e) => {
    errors.push(`pageerror at ${page.url()}: ${e.message.slice(0, 300)}`);
  });
  return {
    errors,
    assertClean() {
      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    },
  };
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

export async function shot(page: Page, info: TestInfo, name: string, opts: { fullPage?: boolean } = {}) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`), fullPage: opts.fullPage ?? true });
}

/* ---------------------------------------------------------------------------------------------- SQL */

/** Run SQL through the portable mysql client; returns tab-separated rows (no header). */
export function sql(query: string): string {
  return mysql(query);
}

export function sqlRows(query: string): string[][] {
  const out = sql(query);
  return out === '' ? [] : out.split('\n').map((l) => l.split('\t'));
}

export function orderCountFor(email: string): number {
  return Number(sql(`SELECT COUNT(*) FROM orders WHERE contact_email = '${email.replace(/'/g, '')}'`));
}

/* ----------------------------------------------------------------------------------------- admin API */

export class AdminClient {
  private constructor(private cookie: string) {}

  private static cached: Promise<AdminClient> | null = null;

  /** One dashboard login per worker: the API limits logins to 5 per 15 minutes. */
  static shared(): Promise<AdminClient> {
    AdminClient.cached ??= AdminClient.login();
    return AdminClient.cached;
  }

  static async login(): Promise<AdminClient> {
    const res = await fetch(`${API_V1}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN, 'X-Forwarded-For': '198.18.2.11' },
      body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL ?? 'owner@stimpy.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'Stimpy-Dev-Password-1' }),
    });
    if (!res.ok) throw new Error(`admin login failed: ${res.status} ${await res.text()}`);
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    return new AdminClient(cookie);
  }

  async request<T = unknown>(method: string, url: string, body?: unknown): Promise<{ status: number; json: T }> {
    const res = await fetch(`${API_V1}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: ADMIN_ORIGIN, Cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
  }

  async ok<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
    const r = await this.request<T>(method, url, body);
    if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.json)}`);
    return r.json;
  }
}

interface AdminOrderListItem {
  id: number;
  number: string;
}

/** Find an order by its number through the admin list (the admin API addresses orders by id). */
export async function adminOrderId(admin: AdminClient, number: string): Promise<number> {
  const list = await admin.ok<{ items: AdminOrderListItem[] }>('GET', `/admin/orders?q=${encodeURIComponent(number)}`);
  const hit = list.items.find((o) => o.number === number);
  if (!hit) throw new Error(`order ${number} not found in the admin list`);
  return hit.id;
}

export async function setStatus(admin: AdminClient, id: number, to: string, extra: Record<string, unknown> = {}) {
  return admin.ok('POST', `/admin/orders/${id}/status`, { to, ...extra });
}

/* ------------------------------------------------------------------------------------------ Mailpit */

export interface MailSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Snippet: string;
}

export async function mailFor(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`);
  const json = (await res.json()) as { messages: MailSummary[] };
  return json.messages ?? [];
}

/** Poll Mailpit until a message for `address` whose subject matches arrives (the worker sends every few seconds). */
export async function waitForMail(address: string, subject: RegExp, timeoutMs = 45_000): Promise<MailSummary> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = (await mailFor(address)).find((m) => subject.test(m.Subject));
    if (hit) return hit;
    if (Date.now() > end) {
      const subjects = (await mailFor(address)).map((m) => m.Subject).join(' | ');
      throw new Error(`no mail matching ${subject} for ${address} (have: ${subjects || 'none'})`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export async function mailBody(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const json = (await res.json()) as { Text?: string; HTML?: string };
  return `${json.Text ?? ''}\n${json.HTML ?? ''}`;
}

/* --------------------------------------------------------------------------------------------- data */

export interface ApiStimpie {
  id: number;
  slug: string;
  name: string;
  status: string;
  type: 'CORE' | 'LIMITED';
  remaining: number | null;
  purchasable: boolean;
  priceCents: number;
}

export async function publicGet<T>(url: string): Promise<T> {
  const res = await fetch(`${API_V1}${url}`);
  return (await res.json()) as T;
}

export async function purchasableStimpies(): Promise<ApiStimpie[]> {
  const all = await publicGet<ApiStimpie[]>('/products/stimpies');
  return all.filter((s) => s.purchasable && s.status === 'AVAILABLE');
}

/* ------------------------------------------------------------------------------------------- the UI */

export function isPhone(info: TestInfo): boolean {
  return info.project.name.startsWith('phone');
}

/** Unique customer so parallel/previous runs never collide in Mailpit or the DB; a fresh phone each time (3 orders per hour per phone). */
export function uniqueCustomer(tag: string) {
  const id = `${tag}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
  const digits = String(Math.floor(100000 + Math.random() * 899999));
  return { email: `${id}@fw2.example.com`, name: 'Rami Haddad', phone: `03 ${digits.slice(0, 3)} ${digits.slice(3)}`, normalizedPhone: `+9613${digits}`, id };
}

/**
 * Give this page its own client IP towards the API (the API runs with TRUST_PROXY=true): the per-IP limits
 * (5 orders / 10 min, 20 lookups / 10 min) would otherwise be shared by the whole suite. Passing the same ip
 * to several pages shares a bucket on purpose (rate-limit tests).
 */
export async function spoofIp(
  page: Page,
  ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`,
): Promise<string> {
  await page.route(`${API}/api/v1/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
  return ip;
}

/** Add a pack to the cart through the real hoodie page: pick the set, colour, size and N Stimpies by name. */
export async function addPackViaUi(
  page: Page,
  opts: { pack?: RegExp; color?: string; size?: string; stimpies: string[]; hoodie?: string } = { stimpies: [] },
): Promise<void> {
  await page.goto(`/shop/hoodie/${opts.hoodie ?? 'stimpy-hoodie'}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Stimpy Hoodie' })).toBeVisible();
  const add = page.getByRole('button', { name: 'Add to cart' }).filter({ visible: true });
  await page.getByRole('radio', { name: opts.pack ?? /Hoodie \+ 2 Stimpies/ }).click({ force: true });
  await page.getByRole('radio', { name: new RegExp(`^${opts.color ?? 'Black'}`) }).click({ force: true });
  const size = page.getByRole('radiogroup', { name: 'Size' }).getByRole('radio', { name: new RegExp(`^${opts.size ?? 'L'}\\b`) });
  await size.click({ force: true });
  for (const name of opts.stimpies) {
    await page.getByTestId('stimpie-picker').getByRole('button', { name: new RegExp(name, 'i'), pressed: false }).first().click();
  }
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeVisible();
}

export async function addStimpieViaUi(page: Page, slug: string): Promise<void> {
  await page.goto(`/shop/stimpie/${slug}`);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('dialog', { name: 'Your cart' })).toBeVisible();
}

export async function openCheckoutFromDrawer(page: Page): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Your cart' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
}

export interface FillOptions {
  name?: string;
  email: string;
  phone?: string;
  area?: string;
  address?: string;
  notes?: string;
}

export async function fillCheckout(page: Page, o: FillOptions): Promise<void> {
  await page.getByLabel(/^Full name/).fill(o.name ?? 'Rami Haddad');
  await page.getByLabel(/^Email/).fill(o.email);
  await page.getByLabel(/^Phone/).fill(o.phone ?? '03 123 456');
  if (o.area !== undefined) {
    const area = page.getByLabel(/^(Area|Your area or town)/);
    await expect(area).toBeVisible();
    const tag = await area.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      await area.selectOption({ label: o.area });
    } else {
      // Delivery fees can be unavailable; checkout then accepts a free-text area.
      await area.fill(o.area);
    }
  }
  await page.getByLabel(/^Address/).fill(o.address ?? 'Main street, building 5, 2nd floor');
  if (o.notes) await page.getByLabel(/^Notes/).fill(o.notes);
}

/** The visible Place order button (the sticky bar on phones, the form button on desktop). */
export function placeOrderButton(page: Page): Locator {
  return page.getByRole('button', { name: /^(Place order|Placing order|Try again in)/ }).filter({ visible: true });
}

export async function wait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------------------- scenario helpers */

export type Customer = ReturnType<typeof uniqueCustomer>;

/** Put one extra Stimpie in the cart through its real product page, then open /checkout and wait for server totals. */
export async function cartWithStimpie(page: Page, slug: string, qty = 1): Promise<void> {
  await addStimpieViaUi(page, slug);
  for (let i = 1; i < qty; i++) await page.getByRole('dialog', { name: 'Your cart' }).getByRole('button', { name: 'Increase quantity' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stimpy.cart') !== null)).toBe(true);
  await page.goto('/checkout');
  await expect(page.getByTestId('summary-total')).toBeVisible();
  await expect(page.getByText('Checking availability...')).toHaveCount(0, { timeout: 15_000 });
}

/** Record every POST /orders body and Idempotency-Key header seen by the page. */
export function recordOrders(page: Page) {
  const seen: { body: Record<string, any>; key: string | undefined }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- test capture
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/v1\/orders$/.test(r.url())) seen.push({ body: r.postDataJSON() as Record<string, any>, key: r.headers()['idempotency-key'] }); // eslint-disable-line @typescript-eslint/no-explicit-any -- test capture
  });
  return seen;
}

export async function submitAndWaitForThanks(page: Page): Promise<string> {
  await placeOrderButton(page).click();
  await expect(page).toHaveURL(/\/order\/STP-\d+\/thanks$/, { timeout: 30_000 });
  return (await page.getByTestId('order-number').innerText()).trim();
}

/** Restore a Stimpie's stock/active/price after a test that changed them. */
export function snapshotStimpie(id: number) {
  const [r] = sqlRows(`SELECT quantity, active, price_cents FROM stimpies WHERE id=${id}`);
  const saved = { quantity: Number(r![0]), active: Number(r![1]), price: Number(r![2]) };
  return () => sql(`UPDATE stimpies SET quantity=${saved.quantity}, active=${saved.active}, price_cents=${saved.price} WHERE id=${id}`);
}

/** Create an order through the public API (a customer who ordered earlier). Returns its number. */
export async function placeOrderViaApi(me: Customer, stimpieId: number, ip = `10.9.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`): Promise<string> {
  const res = await fetch(`${API_V1}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB, 'X-Forwarded-For': ip },
    body: JSON.stringify({
      customer: { name: me.name, email: me.email, phone: me.phone, whatsapp: null, whatsappSameAsPhone: true },
      delivery: { areaName: 'Jounieh', address: 'Main street, building 5' },
      items: [{ kind: 'stimpie', stimpieId, qty: 1 }],
    }),
  });
  if (!res.ok) throw new Error(`order via API failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { order: { number: string } }).order.number;
}

/** Navigate and wait until the page has finished loading and hydrating (no request in flight) before the test moves on. */
export async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** The suite places many orders against one database: make sure the Stimpies and hoodie variants it uses never run dry. */
export async function topUpStock(): Promise<void> {
  const out = sql(
    "UPDATE stimpies SET quantity = reserved + 40 WHERE slug IN ('after-dark','the-orbit','the-wave','the-eye','the-cedar','the-signal','stimpy','the-void') AND quantity - reserved < 20; SELECT ROW_COUNT();",
  );
  const out2 = sql(
    "UPDATE hoodie_variants hv JOIN colors c ON c.id=hv.color_id JOIN sizes s ON s.id=hv.size_id SET hv.quantity = hv.reserved + 40 WHERE c.name IN ('Black','Stone') AND s.label IN ('L','M') AND hv.quantity - hv.reserved < 20; SELECT ROW_COUNT();",
  );
  // The storefront caches catalog pages for up to 30 s (revalidate): after a top-up wait until they show the new stock.
  if (Number(out) > 0 || Number(out2) > 0) await wait(35_000);
}
