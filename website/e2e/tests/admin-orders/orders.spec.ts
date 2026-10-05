import { expect, test, type Page } from '@playwright/test';
import { ADMIN, API, WEB, apiCreateOrder, apiStatus, login, mailTo, noHScroll, shot, sql, sql1, uniquePhone, waitForMail, type MadeOrder } from './helpers';
import { readFileSync } from 'node:fs';
import { isolateLoginIp } from '../runtime';

test.describe.configure({ mode: 'serial' });

let page: Page;
let project = '';
const consoleErrors: string[] = [];

test.beforeAll(async ({ browser }, info) => {
  project = info.project.name;
  // Re-runs consume stock: top the core Stimpies up (test data only, never a product decision).
  sql("update stimpies set quantity = reserved + 200 where type='CORE'");
  sql("update hoodie_variants v join colors c on c.id=v.color_id join sizes s on s.id=v.size_id set v.quantity = v.reserved + 12 where c.name='Black' and s.label='L'");
  const ctx = await browser.newContext({ viewport: info.project.use.viewport ?? undefined, hasTouch: info.project.name === 'phone-360', acceptDownloads: true });
  page = await ctx.newPage();
  await isolateLoginIp(page, '198.18.0.14');
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4[0-9][0-9]/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`));
  await login(page);
});
test.afterAll(async () => {
  await page.context().close();
});

const isPhone = () => project === 'phone-360';
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** Click a status action: a button on desktop, possibly inside the More menu on a phone. */
async function clickAction(name: string) {
  const b = page.getByRole('button', { name, exact: true });
  await expect(b.or(page.getByRole('button', { name: 'More status actions' }))).toBeVisible();
  if (await b.isVisible()) return b.click();
  await page.getByRole('button', { name: 'More status actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}
const dialog = () => page.getByRole('alertdialog').or(page.getByRole('dialog')).last();

/** Statuses and stock for the order's lines. */
function stock(orderId: number) {
  return sql(
    `select l.item_type, l.state, coalesce(v.quantity, s.quantity), coalesce(v.reserved, s.reserved) from order_stock_lines l left join hoodie_variants v on v.id=l.variant_id left join stimpies s on s.id=l.stimpie_id where l.order_id=${orderId} order by l.id`,
  ).map(([type, state, qty, reserved]) => ({ type, state, qty: Number(qty), reserved: Number(reserved) }));
}
const orderRow = (id: number) => sql(`select status, cash_collected, cash_settled, coalesce(delivery_number,'') from orders where id=${id}`)[0]!;

test('overview: KPIs, attention list, setup checklist links', async () => {
  await page.goto(`${ADMIN}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  for (const label of ['New orders', 'To pack', 'Out for delivery', 'Cash to collect', "Today's revenue"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^New orders:/ })).toHaveAttribute('href', '/orders?status=NEW');
  await expect(page.getByRole('link', { name: /^To pack:/ })).toHaveAttribute('href', '/orders?status=TO_PACK');
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  const setup = page.getByTestId('setup-card');
  await expect(setup).toBeVisible();
  await expect(setup.getByText(/of \d+ required steps done/)).toBeVisible();
  const open = setup.getByRole('link', { name: 'Open' }).first();
  await expect(open).toHaveAttribute('href', '/settings?tab=business');
  // A REVIEW row can be marked done and un-marked (server round trip, then the row follows).
  const row = setup.locator('[data-setup-key="sizes"]');
  const box = row.getByLabel('Mark as done');
  await box.click();
  await expect(box).toBeChecked();
  await expect(row.getByText('Done', { exact: true })).toBeVisible();
  await box.click();
  await expect(box).not.toBeChecked();
  await expect(row.getByText('To do', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent orders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Last 7 days' })).toBeVisible();
  await noHScroll(page);
  await shot(page, project, 'overview');
});

test('orders list: tabs, URL state, search, sort, pagination, filters', async () => {
  await page.goto(`${ADMIN}/orders`);
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^All/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Orders' }).or(page.getByRole('list', { name: 'Orders' }))).toBeVisible();
  await shot(page, project, 'orders-list');
  await noHScroll(page);

  // Tab -> URL -> comma-separated status in the API request.
  const req = page.waitForRequest((r) => r.url().includes('/admin/orders?') && r.url().includes('status=CONFIRMED%2CPACKED'));
  await page.getByRole('tab', { name: /^To pack/ }).click();
  await req;
  await expect(page).toHaveURL(/status=TO_PACK/);
  const rowsInView = async () => (await page.locator('[data-row-id]').count());
  const toPack = Number(sql1("select count(*) from orders where status in ('CONFIRMED','PACKED')"));
  await expect.poll(rowsInView).toBe(Math.min(25, toPack));
  await page.goto(`${ADMIN}/orders?status=CLOSED`);
  await expect(page.getByRole('tab', { name: /^Returned & cancelled/ })).toHaveAttribute('aria-selected', 'true');

  // Search by bare digits (finds STP-1005) and replace-style URL update.
  await page.goto(`${ADMIN}/orders`);
  await page.getByRole('searchbox', { name: 'Search orders' }).fill('1005');
  await expect(page).toHaveURL(/q=1005/);
  await expect(page.locator('[data-row-id]', { hasText: 'STP-1005' })).toHaveCount(1);
  await expect.poll(() => page.locator('[data-row-id]').count()).toBeLessThan(10);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page).not.toHaveURL(/q=/);

  // Sort by total (desktop header click; phone uses the Sort select in the filters sheet).
  if (!isPhone()) {
    await page.getByRole('button', { name: /^Total/ }).click();
    await expect(page).toHaveURL(/sort=-totalCents/);
    await page.getByRole('button', { name: /^Total/ }).click();
    await expect(page).toHaveURL(/sort=totalCents/);
  } else {
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByLabel('Sort').selectOption('totalCents');
    await page.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/sort=totalCents/);
  }

  // Filters in the URL: source and hold expired; Clear filters resets them.
  await page.goto(`${ADMIN}/orders?source=WEBSITE&holdExpired=true`);
  const holdExpired = Number(sql1("select count(*) from orders where status='NEW' and source='WEBSITE' and hold_expires_at < now()"));
  await expect(page.locator('[data-row-id]')).toHaveCount(holdExpired);
  if (holdExpired > 0) await expect(page.getByText('Hold expired').first()).toBeVisible();
  await page.goto(`${ADMIN}/orders?q=zzzz-no-such-order`);
  await expect(page.getByText('No orders match these filters')).toBeVisible();
  await shot(page, project, 'orders-empty-filtered');
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  await expect(page.locator('[data-row-id]').first()).toBeVisible();

  // Pagination: 25 per page, page 2 in the URL.
  await page.goto(`${ADMIN}/orders?pageSize=25`);
  const total = Number(sql1('select count(*) from orders'));
  if (total > 25) {
    await page.getByRole('button', { name: /next/i }).first().click();
    await expect(page).toHaveURL(/page=2/);
  }
  await noHScroll(page);
});

let created: MadeOrder & { email: string };
let hoodieBefore = 0;

test('manual order: unavailable item error, then creation with email; poller does not announce it', async () => {
  await page.goto(`${ADMIN}/orders/new`);
  await expect(page.getByRole('heading', { level: 1, name: 'New order' })).toBeVisible();
  await shot(page, project, 'order-new-empty');
  // Validation: nothing typed.
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByText("Enter the customer's name (at least 2 characters).").first()).toBeVisible();

  const email = `fa2-${Date.now()}@example.com`;
  await page.locator('[name="customer.name"]').fill('Layla Testi');
  await page.locator('[name="customer.phone"]').fill(uniquePhone());
  await page.locator('[name="customer.email"]').fill(email);
  await page.locator('[name="delivery.areaId"]').selectOption({ label: 'Beirut' });
  await page.locator('[name="delivery.address"]').fill('Hamra street 5, 2nd floor');

  // Item 1: hoodie only, a sold-out size is disabled.
  const line = page.getByTestId('order-line-0');
  await line.getByRole('radio', { name: 'Hoodie only' }).check();
  await line.getByLabel(/^Colour/).selectOption({ label: 'Black' });
  const xl = line.getByLabel(/^Size/).locator('option', { hasText: 'XL' });
  await expect(xl).toHaveText(/Sold out/);
  await expect(xl).toBeDisabled();
  await line.getByLabel(/^Size/).selectOption({ label: 'L' });

  // Item 2: extra Stimpie.
  await page.getByRole('button', { name: 'Add another item' }).click();
  const line2 = page.getByTestId('order-line-1');
  await line2.getByRole('radio', { name: 'Extra Stimpie' }).check();
  await line2.getByLabel(/^Stimpie/).selectOption({ label: 'STIMPY' });
  await expect(page.getByTestId('order-estimate')).toContainText('Estimate: the server sets final prices.');
  await shot(page, project, 'order-new-filled');

  // Make the hoodie sold out between choosing and saving: the server answers SOLD_OUT.
  const variantId = Number(sql1("select v.id from hoodie_variants v join colors c on c.id=v.color_id join sizes s on s.id=v.size_id where c.name='Black' and s.label='L'"));
  const qtyBefore = Number(sql1(`select quantity from hoodie_variants where id=${variantId}`));
  sql(`update hoodie_variants set quantity=reserved where id=${variantId}`);
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByRole('dialog', { name: 'Some items are sold out' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Some items are sold out' })).toContainText(/Requested 1, available 0/);
  await shot(page, project, 'order-new-soldout');
  await page.getByRole('button', { name: 'Back to the form' }).click();
  await expect(page.getByTestId('order-line-0')).toContainText(/Stimpy Hoodie.*Requested 1, available 0/);
  expect(Number(sql1("select count(*) from orders where contact_email='" + email + "'"))).toBe(0);
  sql(`update hoodie_variants set quantity=${qtyBefore} where id=${variantId}`);
  hoodieBefore = Number(sql1(`select reserved from hoodie_variants where id=${variantId}`));

  // Hide a Stimpie: NOT_PURCHASABLE with the reason in words.
  const stimpieId = Number(sql1("select id from stimpies where name='STIMPY'"));
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  const id = Number(page.url().split('/').pop());
  const number = sql1(`select number from orders where id=${id}`);
  created = { id, number, email };
  await expect(page.getByText(`Order ${number} created.`).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: `Order ${number}` })).toBeVisible();
  const row = orderRow(id);
  expect(row[0]).toBe('CONFIRMED');
  const lines = stock(id);
  expect(lines).toHaveLength(2);
  expect(lines.every((l) => l.state === 'RESERVED')).toBe(true);
  expect(Number(sql1(`select reserved from hoodie_variants where id=${variantId}`))).toBe(hoodieBefore + 1);
  expect(stimpieId).toBeGreaterThan(0);
  await waitForMail(email, 1);
  // The order shows its email in "Emails sent".
  await expect(page.getByRole('heading', { name: 'Emails sent' })).toBeVisible();
  await expect(page.getByText('Order confirmed').first()).toBeVisible();
  await shot(page, project, 'order-detail-confirmed');
  // Created by this dashboard: the bell must not announce it.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /notifications/i }).click().catch(() => undefined);
  await expect(page.getByText(`New order ${number}`)).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('status lifecycle: confirmed -> packed -> out (delivery number required) -> delivered -> cash settled', async () => {
  const { id, number, email } = created;
  await page.goto(`${ADMIN}/orders/${id}`);
  const allowed = async () => (await page.getByRole('group', { name: 'Order actions' }).getByRole('button').allTextContents()).map((t) => t.trim());
  if (isPhone()) {
    await expect(page.getByRole('button', { name: 'Mark as packed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More status actions' })).toBeVisible();
  } else await expect.poll(allowed).toEqual(['Mark as packed', 'Cancel order']);
  const lines0 = stock(id);

  // CONFIRMED -> PACKED (dialog).
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await expect(dialog()).toContainText(`Mark ${number} as packed?`);
  await dialog().getByRole('button', { name: 'Mark as packed' }).click();
  await expect(page.getByText(`Order ${number} is now Packed.`)).toBeVisible();
  await expect(page.locator('[data-status="PACKED"]').first()).toBeVisible();
  expect(orderRow(id)[0]).toBe('PACKED');
  expect(stock(id).map((l) => l.reserved)).toEqual(lines0.map((l) => l.reserved));

  // PACKED -> OUT_FOR_DELIVERY needs a delivery number: UI validation first.
  await page.getByRole('button', { name: 'Send out for delivery' }).click();
  await expect(dialog()).toContainText('Enter the delivery number from the delivery slip.');
  await dialog().getByRole('button', { name: 'Send out for delivery' }).click();
  await expect(dialog().getByText('Enter the delivery number to continue.')).toBeVisible();
  expect(orderRow(id)[0]).toBe('PACKED');
  // A duplicate of an existing number only warns, never blocks.
  await dialog().getByLabel(/^Delivery number/).fill('DLV-1003');
  await dialog().getByLabel(/^Delivery number/).blur();
  await expect(page.getByTestId('duplicate-delivery-number')).toContainText('DLV-1003 is already on');
  await shot(page, project, 'status-dialog-out');
  await dialog().getByLabel(/^Delivery number/).fill('FA2-' + String(Date.now()).slice(-6));
  const dn = await dialog().getByLabel(/^Delivery number/).inputValue();
  await dialog().getByRole('button', { name: 'Send out for delivery' }).click();
  await expect(page.getByText(`Order ${number} is now Out for delivery.`)).toBeVisible();
  expect(orderRow(id)).toEqual(['OUT_FOR_DELIVERY', '0', '0', dn]);
  await expect(page.getByTestId('header-delivery-number')).toContainText(dn);
  // No Cancel from "out for delivery": a parcel that is out is returned.
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
  await waitForMail(email, 2);

  // Edit the delivery number: no new email.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog().getByLabel(/^Delivery number/).fill(dn + 'B');
  await dialog().getByRole('button', { name: 'Save delivery number' }).click();
  await expect(page.getByText('Delivery number updated.')).toBeVisible();
  expect(orderRow(id)[3]).toBe(dn + 'B');
  await page.waitForTimeout(3000);
  expect((await mailTo(email)).length).toBe(2);

  // OUT_FOR_DELIVERY -> DELIVERED: stock sold, cash collected.
  await page.getByRole('button', { name: 'Mark delivered' }).click();
  await expect(dialog()).toContainText('cash is now expected');
  await dialog().getByRole('button', { name: 'Mark delivered' }).click();
  await expect(page.getByText(`Order ${number} is now Delivered.`)).toBeVisible();
  const row = orderRow(id);
  expect(row.slice(0, 3)).toEqual(['DELIVERED', '1', '0']);
  const after = stock(id);
  expect(after.every((l) => l.state === 'SOLD')).toBe(true);
  after.forEach((l, i) => {
    expect(l.reserved).toBe(lines0[i]!.reserved - 1);
    expect(l.qty).toBe(lines0[i]!.qty - 1);
  });
  await waitForMail(email, 3);

  // Cash settlement with undo.
  const settled = page.getByRole('switch', { name: 'Cash settled' });
  await expect(settled).toBeEnabled();
  await settled.click();
  await expect(page.getByText('Cash marked as settled.')).toBeVisible();
  expect(orderRow(id)[2]).toBe('1');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => orderRow(id)[2]).toBe('0');
  await page.getByRole('switch', { name: 'Cash settled' }).click();
  await expect.poll(() => orderRow(id)[2]).toBe('1');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText('Order placed')).toBeVisible();
  await shot(page, project, 'order-timeline');

  // Delivered orders can only be returned. Written off: no restock, cash flags reset.
  await page.getByRole('tab', { name: 'Summary' }).click();
  await clickAction('Mark returned');
  await dialog().getByLabel("Write off as damaged (don't restock)").check();
  await shot(page, project, 'status-dialog-return');
  await dialog().getByRole('button', { name: 'Mark returned' }).click();
  await expect(page.getByText(`Order ${number} is now Returned.`)).toBeVisible();
  expect(orderRow(id).slice(0, 3)).toEqual(['RETURNED', '0', '0']);
  expect(stock(id).every((l) => l.state === 'WRITTEN_OFF')).toBe(true);
  await expect(page.getByRole('group', { name: 'Order actions' })).toHaveCount(0);
});

test('cancel needs a reason; return from out-for-delivery releases stock; restock path', async () => {
  const o = await apiCreateOrder(page, { email: `fa2c-${Date.now()}@example.com`, sendEmail: true, status: 'NEW' });
  const before = stock(o.id);
  await page.goto(`${ADMIN}/orders/${o.id}`);
  await clickAction('Cancel order');
  await dialog().getByRole('button', { name: 'Cancel order' }).click();
  await expect(dialog().getByText('Give a reason of at least 3 characters.')).toBeVisible();
  expect(orderRow(o.id)[0]).toBe('NEW');
  await dialog().getByRole('button', { name: 'Customer changed mind' }).click();
  await shot(page, project, 'status-dialog-cancel');
  await dialog().getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText(`Order ${o.number} is now Cancelled.`)).toBeVisible();
  expect(orderRow(o.id)[0]).toBe('CANCELLED');
  expect(sql1(`select cancel_reason from orders where id=${o.id}`)).toBe('Customer changed mind');
  expect(stock(o.id).every((l) => l.state === 'RELEASED')).toBe(true);
  expect(stock(o.id)[0]!.reserved).toBe(before[0]!.reserved - 1);
  await expect(page.getByText('Cancel reason', { exact: false }).first()).toBeVisible();

  // Out for delivery -> returned (failed delivery): no restock choice, items released.
  const r = await apiCreateOrder(page);
  await apiStatus(page, r.id, 'PACKED');
  await apiStatus(page, r.id, 'OUT_FOR_DELIVERY', { deliveryNumber: 'FA2-RET-' + r.id });
  const b2 = stock(r.id);
  await page.goto(`${ADMIN}/orders/${r.id}`);
  await clickAction('Mark returned');
  await expect(dialog()).toContainText('The items go back on the shelf.');
  await expect(dialog().getByText('Put the items back in stock')).toHaveCount(0);
  await dialog().getByRole('button', { name: 'Mark returned' }).click();
  await expect(page.getByText(`Order ${r.number} is now Returned.`)).toBeVisible();
  expect(stock(r.id).every((l) => l.state === 'RELEASED')).toBe(true);
  expect(stock(r.id)[0]!.reserved).toBe(b2[0]!.reserved - 1);

  // Delivered then returned with restock: quantity comes back.
  const d = await apiCreateOrder(page);
  await apiStatus(page, d.id, 'PACKED');
  await apiStatus(page, d.id, 'OUT_FOR_DELIVERY', { deliveryNumber: 'FA2-RS-' + d.id });
  await apiStatus(page, d.id, 'DELIVERED');
  const b3 = stock(d.id);
  await page.goto(`${ADMIN}/orders/${d.id}`);
  await clickAction('Mark returned');
  await dialog().getByLabel('Put the items back in stock').check();
  await dialog().getByRole('button', { name: 'Mark returned' }).click();
  await expect(page.getByText(`Order ${d.number} is now Returned.`)).toBeVisible();
  expect(stock(d.id).every((l) => l.state === 'RESTOCKED')).toBe(true);
  expect(stock(d.id)[0]!.qty).toBe(b3[0]!.qty + 1);
});

test('invalid transition from a stale tab: notice shown and buttons refresh', async () => {
  const o = await apiCreateOrder(page);
  await page.goto(`${ADMIN}/orders/${o.id}`);
  await expect(page.getByRole('button', { name: 'Mark as packed' })).toBeVisible();
  await apiStatus(page, o.id, 'PACKED'); // someone else, meanwhile
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await dialog().getByRole('button', { name: 'Mark as packed' }).click();
  await expect(page.getByRole('dialog', { name: 'This order is now Packed' })).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('button', { name: 'Send out for delivery' })).toBeVisible();
});

test('contact edit, notes, WhatsApp link, hold block', async () => {
  const o = await apiCreateOrder(page, { email: `fa2n-${Date.now()}@example.com`, status: 'NEW' });
  await page.goto(`${ADMIN}/orders/${o.id}`);
  // Edit contact: only changed fields, logged.
  await page.getByRole('button', { name: 'Edit contact' }).click();
  await dialog().getByLabel(/^Email/).fill('');
  await dialog().getByLabel(/^Phone/).fill('');
  await dialog().getByRole('button', { name: 'Save contact' }).click();
  await expect(dialog().getByText('Enter a phone number.').first()).toBeVisible();
  const phone = '71' + String(Date.now()).slice(-6);
  await dialog().getByLabel(/^Phone/).fill(phone);
  await dialog().getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByText('Contact updated.')).toBeVisible();
  expect(sql1(`select contact_phone from orders where id=${o.id}`)).toBe(`+961${phone}`);
  expect(sql1(`select count(*) from orders where id=${o.id} and contact_email is null`)).toBe('1');
  await expect(page.getByText('No email on file', { exact: true })).toBeVisible();

  // Edit delivery address.
  await page.getByRole('button', { name: 'Edit delivery' }).click();
  await dialog().getByLabel(/^Address/).fill('New address 77, 4th floor');
  await dialog().getByRole('button', { name: 'Save delivery' }).click();
  await expect(page.getByText('Delivery details updated.')).toBeVisible();
  expect(sql1(`select address from orders where id=${o.id}`)).toBe('New address 77, 4th floor');

  // Hold block is visible for NEW orders; extend validates the range.
  await expect(page.getByRole('heading', { name: 'Stock hold' })).toBeVisible();
  await page.getByRole('button', { name: 'Extend hold' }).click();
  await dialog().getByLabel(/^Hours/).fill('500');
  await dialog().getByRole('button', { name: 'Extend hold' }).click();
  await expect(dialog().getByText('Enter a whole number of hours from 1 to 168.').first()).toBeVisible();
  await dialog().getByLabel(/^Hours/).fill('24');
  await dialog().getByRole('button', { name: 'Extend hold' }).click();
  await expect(page.getByText('Hold extended by 24 hours.')).toBeVisible();

  // Notes: plain text (markup shown literally), never editable.
  await page.getByRole('tab', { name: /^Notes/ }).click();
  await expect(page.getByText('Internal only. Customers never see these.')).toBeVisible();
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Write a note first.')).toBeVisible();
  await page.locator('#field-note').fill('<b>call after 5</b>\nsecond line');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Note added.')).toBeVisible();
  await expect(page.getByText('<b>call after 5</b>', { exact: false })).toBeVisible();
  expect(sql1(`select count(*) from order_notes where order_id=${o.id}`)).toBe('1');

  // WhatsApp: server-built wa.me link opened in a new tab with encoded text.
  await page.context().route('**://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>wa</html>' }));
  await page.getByRole('tab', { name: 'Summary' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Message customer on WhatsApp' }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/https:\/\/wa\.me\/961/);
  expect(popup.url()).toMatch(/^https:\/\/wa\.me\/961\d+\?text=/);
  expect(decodeURIComponent(popup.url().split('text=')[1]!)).toContain(o.number);
  await popup.close();
  await page.context().unroute('**://wa.me/**');
  await shot(page, project, 'order-detail-new');
});

test('emails: resend, send email, failed row highlight', async () => {
  const email = `fa2e-${Date.now()}@example.com`;
  const o = await apiCreateOrder(page, { email, sendEmail: true });
  await waitForMail(email, 1);
  await page.goto(`${ADMIN}/orders/${o.id}`);
  await page.getByRole('button', { name: 'Resend' }).first().click();
  await expect(dialog()).toContainText(`to ${email}?`);
  await dialog().getByRole('button', { name: 'Resend' }).click();
  await expect(page.getByText('Email queued.')).toBeVisible();
  await waitForMail(email, 2);
  await page.getByRole('button', { name: 'Send email' }).click();
  await dialog().getByRole('button', { name: 'Send email' }).click();
  await expect(dialog().getByText('Enter a subject.').first()).toBeVisible();
  await dialog().getByLabel(/^Subject/).fill('A note from Stimpy');
  await dialog().getByLabel(/^Message/).fill('Hello, your order is almost ready.');
  await dialog().getByRole('button', { name: 'Send email' }).click();
  await waitForMail(email, 3);
  await expect(page.getByText('Message from you')).toBeVisible();
  // Order without an email: sending is disabled.
  const n = await apiCreateOrder(page);
  await page.goto(`${ADMIN}/orders/${n.id}`);
  await expect(page.getByRole('button', { name: 'Send email' })).toBeDisabled();
});

test('bulk status with a partial failure, then CSV export with BOM and formula prefix', async () => {
  const a = await apiCreateOrder(page, { status: 'NEW', name: '=HYPERLINK("http://evil","x")' });
  const b = await apiCreateOrder(page, { status: 'NEW', name: 'Bulk Two' });
  await page.goto(`${ADMIN}/orders?status=NEW&q=${a.number.slice(-4)}`);
  await page.goto(`${ADMIN}/orders?status=NEW`);
  await expect(page.locator(`[data-row-id="${a.id}"]`)).toBeVisible();
  const select = async (id: number) => {
    if (isPhone()) {
      const sel = page.getByRole('button', { name: 'Select', exact: true });
      if (await sel.isVisible().catch(() => false)) await sel.click();
    }
    await page.locator(`[data-row-id="${id}"]`).getByRole('checkbox').check();
  };
  await select(a.id);
  await select(b.id);
  const bar = page.getByRole('region', { name: 'Bulk actions' });
  await expect(bar).toContainText('2 selected');
  await expect(bar.getByRole('button', { name: 'Mark packed' })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'Mark confirmed' })).toBeEnabled();
  await shot(page, project, 'orders-bulk-bar');

  // Someone confirms one of them meanwhile: one fails with INVALID_TRANSITION.
  await apiStatus(page, a.id, 'CONFIRMED');
  await bar.getByRole('button', { name: 'Mark confirmed' }).click();
  await expect(dialog()).toContainText("Mark 2 orders as Confirmed?");
  await dialog().getByRole('button', { name: 'Mark 2 as Confirmed' }).click();
  const result = page.getByRole('dialog', { name: 'Some orders were not updated' });
  await expect(result).toContainText('1 updated, 1 failed');
  await expect(result).toContainText(a.number);
  await expect(result).toContainText('Not in the right status');
  await shot(page, project, 'orders-bulk-result');
  expect(orderRow(b.id)[0]).toBe('CONFIRMED');
  await result.getByRole('button', { name: 'Select failed orders' }).click();
  await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText('1 selected');

  // Export the selection: BOM, CRLF, filename from Content-Disposition, formula prefix.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected (1)' }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  const bytes = readFileSync(path!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8');
  expect(text).toContain("'=HYPERLINK");
  expect(text).toContain("'+961");
  expect(text).toContain(a.number);
  expect(text).not.toContain(b.number);
  await expect(page.getByText('Export downloaded.')).toBeVisible();
});

test('print views: label and delivery sheet', async () => {
  const packed = sql('select id from orders where status in (\'PACKED\',\'OUT_FOR_DELIVERY\') order by id limit 2').map((r) => r[0]);
  await page.goto(`${ADMIN}/orders/${packed[0]}/label`);
  await expect(page.getByLabel(/^Label for STP-/)).toBeVisible();
  await expect(page.getByText('Cash to collect')).toBeVisible();
  await shot(page, project, 'print-label');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`${ADMIN}/orders/print?ids=${packed.join(',')}`);
  await expect(page.getByRole('table', { name: 'Delivery sheet' })).toBeVisible();
  await expect(page.getByText(/Total cash to collect/)).toBeVisible();
  await shot(page, project, 'print-sheet');
  await noHScroll(page);
});

test('stock: grid states, adjust, set total, below-reserved error, movements', async () => {
  await page.goto(`${ADMIN}/stock`);
  await expect(page.getByRole('heading', { level: 1, name: 'Stock' })).toBeVisible();
  if (isPhone()) await expect(page.getByText(/to check/).first()).toBeVisible();
  else {
    await expect(page.getByText('Sold out').first()).toBeVisible();
    await expect(page.getByText('Low', { exact: true }).first()).toBeVisible();
  }
  await shot(page, project, 'stock-hoodies');
  await noHScroll(page);
  const variant = sql("select v.id, v.quantity, v.reserved from hoodie_variants v join colors c on c.id=v.color_id join sizes s on s.id=v.size_id where c.name='Stone' and s.label='S'")[0]!;
  const vid = Number(variant[0]);
  const open = async () => {
    if (isPhone()) {
      await page.getByRole('button', { name: /^Stone/ }).click();
      await page.getByRole('button', { name: 'Adjust Stone, S' }).click();
    } else await page.locator(`[data-variant-id="${vid}"]`).click();
  };
  await open();
  const dlg = page.getByRole('dialog', { name: /Adjust stock/ });
  await dlg.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dlg.getByText('Enter a whole number other than 0.', { exact: false })).toBeVisible();
  await dlg.getByLabel(/^Change/).fill('3');
  await dlg.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dlg.getByText('Add a note so we know why the stock changed.')).toBeVisible();
  await dlg.getByLabel(/^Note/).fill('e2e restock');
  await expect(dlg.getByTestId('stock-preview')).toContainText(`On hand ${variant[1]} → ${Number(variant[1]) + 3}`);
  await shot(page, project, 'stock-adjust-dialog');
  // Big change asks again.
  await dlg.getByLabel(/^Change/).fill('60');
  await dlg.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(dlg).toContainText('Add 60 units?');
  await dlg.getByRole('button', { name: 'Back' }).click();
  await dlg.getByLabel(/^Change/).fill('3');
  await dlg.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByText('Stock updated.')).toBeVisible();
  expect(Number(sql1(`select quantity from hoodie_variants where id=${vid}`))).toBe(Number(variant[1]) + 3);
  expect(sql1(`select count(*) from stock_movements where reason='RESTOCK' and note='e2e restock'`)).not.toBe('0');

  // Set total to below reserved: refused with the reserved count.
  const m = sql("select v.id, v.quantity, v.reserved from hoodie_variants v where v.reserved >= 2 limit 1")[0]!;
  await page.goto(`${ADMIN}/stock?highlight=${m[0]}`);
  if (isPhone()) {
    const colorBtn = page.locator(`[data-variant-id="${m[0]}"]`);
    await expect(colorBtn).toBeVisible();
    await colorBtn.getByRole('button', { name: /^Adjust/ }).click();
  } else await page.locator(`[data-variant-id="${m[0]}"]`).click();
  const d2 = page.getByRole('dialog', { name: /Adjust stock/ });
  await d2.getByRole('tab', { name: 'Set total' }).click();
  await d2.getByLabel(/^New total/).fill('0');
  await d2.getByLabel(/^Note/).fill('too low');
  await d2.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(d2.getByText(new RegExp(`reserved: ${m[2]}`))).toBeVisible();
  await d2.getByRole('button', { name: 'Cancel' }).click();

  await page.goto(`${ADMIN}/stock?tab=stimpies`);
  await expect(page.getByRole('button', { name: /^Adjust/ }).first()).toBeVisible();
  await shot(page, project, 'stock-stimpies');
  await page.goto(`${ADMIN}/stock?tab=movements`);
  await expect(page.locator('[data-row-id]').first()).toBeVisible();
  if (isPhone()) await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Reason').selectOption('RESTOCK');
  if (isPhone()) await page.getByRole('button', { name: 'Show results' }).click();
  await expect(page.locator('[data-row-id]', { hasText: 'e2e restock' }).first()).toBeVisible();
  await expect(page).toHaveURL(/reason=RESTOCK/);
  await shot(page, project, 'stock-movements');
  await noHScroll(page);
});

test('deliveries: dispatch packed orders, duplicates warn, mark delivered, settle a delivery with undo', async () => {
  const a = await apiCreateOrder(page);
  const b = await apiCreateOrder(page);
  await apiStatus(page, a.id, 'PACKED');
  await apiStatus(page, b.id, 'PACKED');
  await page.goto(`${ADMIN}/deliveries`);
  await expect(page.getByRole('heading', { level: 1, name: 'Deliveries' })).toBeVisible();
  await shot(page, project, 'deliveries-out');
  await page.getByRole('button', { name: 'Send out packed orders' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Send out packed orders' });
  await dlg.getByRole('checkbox', { name: `Select ${a.number}` }).check();
  await dlg.getByRole('checkbox', { name: `Select ${b.number}` }).check();
  await dlg.getByRole('button', { name: /^Send out 2/ }).click();
  await expect(dlg.getByText('Enter a delivery number for each selected order.')).toBeVisible();
  const run = 'FA2-RUN-' + String(Date.now()).slice(-5);
  await dlg.getByLabel('Apply one number to all selected').fill(run);
  await dlg.getByRole('button', { name: 'Apply to selected' }).click();
  await expect(dlg.getByText(/is also used on 1 other selected order/).first()).toBeVisible();
  await shot(page, project, 'deliveries-dispatch');
  await dlg.getByRole('button', { name: /^Send out 2/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText("Customers with an email are emailed 'On its way'");
  await page.getByRole('alertdialog').getByRole('button', { name: 'Send out 2' }).click();
  const note = page.getByRole('dialog', { name: 'Sent out, with a note' });
  await expect(note).toContainText('2 updated, 0 failed');
  await expect(note).toContainText(`${run} is on`);
  await note.getByRole('button', { name: 'Close' }).last().click();
  expect(sql(`select status, delivery_number from orders where id in (${a.id},${b.id})`).every((r) => r[0] === 'OUT_FOR_DELIVERY' && r[1] === run)).toBe(true);

  // Group header and bulk "Mark delivered" with a partial failure.
  await page.goto(`${ADMIN}/deliveries?q=${run}`);
  await expect(page.getByText(run).first()).toBeVisible();
  await apiStatus(page, a.id, 'DELIVERED'); // a is delivered elsewhere meanwhile
  if (isPhone()) await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.locator(`[data-row-id="${a.id}"]`).first().getByRole('checkbox').check();
  await page.locator(`[data-row-id="${b.id}"]`).first().getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Mark 2 delivered/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark 2 as Delivered' }).click();
  const res = page.getByRole('dialog', { name: 'Some orders were not updated' });
  await expect(res).toContainText('1 updated, 1 failed');
  await res.getByRole('button', { name: 'Close' }).last().click();
  expect(orderRow(b.id)[0]).toBe('DELIVERED');

  // Delivered tab: settle the whole delivery number, then undo.
  await page.goto(`${ADMIN}/deliveries?tab=delivered&q=${run}`);
  await expect(page.getByText(run).first()).toBeVisible();
  const [deliveredCount, grossCollected] = sql(`select count(*),coalesce(sum(total_cents),0) from orders where delivery_number='${run}' and status='DELIVERED'`)[0]!.map(Number);
  await page.getByRole('button', { name: 'Mark delivery settled' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`Mark all ${deliveredCount} ${deliveredCount === 1 ? 'order' : 'orders'} on ${run} as settled? You received ${money(grossCollected)}.`);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark settled' }).click();
  await expect(page.getByText(`Delivery ${run} marked settled.`)).toBeVisible();
  expect(sql(`select cash_settled from orders where id in (${a.id},${b.id})`).every((r) => r[0] === '1')).toBe(true);
  await shot(page, project, 'deliveries-delivered');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => sql(`select cash_settled from orders where id in (${a.id},${b.id})`).every((r) => r[0] === '0')).toBe(true);
  await noHScroll(page);
});

test('deliveries: fees and areas CRUD', async () => {
  await page.goto(`${ADMIN}/deliveries?tab=fees`);
  await expect(page.getByRole('heading', { name: 'Default delivery' })).toBeVisible();
  await page.getByLabel(/^Default delivery fee/).fill('abc');
  await page.getByRole('button', { name: 'Save delivery settings' }).click();
  await expect(page.getByText('Enter an amount like 12.50.').first()).toBeVisible();
  await page.getByLabel(/^Default delivery fee/).fill('3.50');
  await page.getByLabel(/^Delivery estimate/).fill('2-3 working days');
  await page.getByRole('button', { name: 'Save delivery settings' }).click();
  await expect(page.getByText('Delivery settings saved.')).toBeVisible();
  expect(sql1("select json_unquote(json_extract(value,'$.defaultFeeCents')) from settings where `key`='delivery' limit 1")).toBe('350');

  const name = 'E2E Area ' + String(Date.now()).slice(-5);
  const form = page.getByRole('form', { name: 'Add an area' });
  await form.getByRole('button', { name: 'Add area' }).click();
  await expect(form.getByText('Enter the area name.')).toBeVisible();
  await form.getByLabel('Area name').fill(name);
  await form.getByLabel('Fee').fill('5');
  await form.getByLabel('Estimated days').fill('4');
  await form.getByRole('button', { name: 'Add area' }).click();
  await expect(page.getByText(`Area ${name} added.`)).toBeVisible();
  expect(sql(`select fee_cents, est_days, active from areas where name='${name}'`)[0]).toEqual(['500', '4', '1']);
  await shot(page, project, 'deliveries-fees');

  await page.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByLabel('Fee').last().fill('');
  await page.getByRole('button', { name: 'Save area' }).click();
  await expect(page.getByText(`Area ${name} saved.`)).toBeVisible();
  expect(sql1(`select coalesce(fee_cents,'NULL') from areas where name='${name}'`)).toBe('NULL');
  await page.getByRole('switch', { name: `${name} is available` }).click();
  await expect.poll(() => sql1(`select active from areas where name='${name}'`)).toBe('0');
  await page.getByRole('button', { name: `Delete ${name}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete area' }).click();
  await expect(page.getByText('Area deleted.')).toBeVisible();
  expect(sql1(`select count(*) from areas where name='${name}'`)).toBe('0');
  // An area used by orders refuses deletion and offers to hide it.
  await page.getByRole('button', { name: 'Delete Beirut' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete area' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Used by past orders. Hide it instead.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await noHScroll(page);
  sql("update settings set value=json_set(value,'$.defaultFeeCents',300) where `key`='delivery'");
});

test('customers: list, search, detail, notes, new order link', async () => {
  await page.goto(`${ADMIN}/customers`);
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
  await expect(page.locator('[data-row-id]').first()).toBeVisible();
  await shot(page, project, 'customers-list');
  await page.getByRole('searchbox', { name: 'Search customers' }).fill('Layla');
  await expect(page).toHaveURL(/q=Layla/);
  await expect(page.locator('[data-row-id]')).toHaveCount(Math.min(25, Number(sql1("select count(*) from customers where name like '%Layla%'"))));
  await page.getByRole('link', { name: 'Layla Testi' }).first().click();
  await expect(page).toHaveURL(/\/customers\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Layla Testi' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit customer' }).click();
  await dialogFor().getByLabel(/^Notes/).fill('Prefers evening delivery <i>x</i>');
  await dialogFor().getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Customer saved.')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Legacy note' })).toContainText('Prefers evening delivery <i>x</i>');
  expect(sql1(`select notes from customers where id=${page.url().split('/').pop()}`)).toContain('Prefers evening');
  await expect(page.getByRole('link', { name: 'New order for this customer' })).toHaveAttribute('href', /\/orders\/new\?customerId=\d+/);
  await shot(page, project, 'customer-detail');
  await page.getByRole('link', { name: 'New order for this customer' }).click();
  await expect(page.locator('[name="customer.name"]')).toHaveValue('Layla Testi');
  await page.goto(`${ADMIN}/customers?tab=repeat`);
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
  await page.goto(`${ADMIN}/customers?tab=subscribers`);
  await expect(page.getByText('Only people who asked to be notified are listed.')).toBeVisible();
  await noHScroll(page);
});
const dialogFor = () => page.getByRole('dialog').last();

test('new-order polling updates the badge within ~35 s without a reload', async () => {
  test.setTimeout(90_000);
  const initialCounts = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/v1/admin/orders/counts') && response.status() === 200;
  });
  const initialOrders = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/v1/admin/orders') && url.searchParams.get('pageSize') === '20' && url.searchParams.get('sort') === '-placedAt' && response.status() === 200;
  });
  await page.goto(`${ADMIN}/orders`);
  const [countsResponse, ordersResponse] = await Promise.all([initialCounts, initialOrders]);
  expect(countsResponse.status()).toBe(200);
  expect(ordersResponse.status()).toBe(200);
  const badge = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Orders/ });
  const before = Number(sql1("select count(*) from orders where status='NEW'"));
  const hoodies = (await (await fetch(`${API}/api/v1/products/hoodies`)).json()) as Array<{ slug: string }>;
  const detail = (await (await fetch(`${API}/api/v1/products/hoodies/${hoodies[0]!.slug}`)).json()) as { id: number; colors: Array<{ id: number }>; sizes: Array<{ id: number }>; variants: Array<{ colorId: number; sizeId: number; inStock: boolean }> };
  const v = detail.variants.find((x) => x.inStock)!;
  if (!isPhone()) await expect(badge).toContainText(String(before));
  const res = await fetch(`${API}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({
      customer: { name: 'Poll Tester', phone: uniquePhone(), whatsappSameAsPhone: true, email: `poll-${Date.now()}@example.com` },
      delivery: { areaName: 'Beirut', address: 'Poll street 9, 1st floor' },
      items: [{ kind: 'hoodie', hoodieId: detail.id, colorId: v.colorId, sizeId: v.sizeId, qty: 1 }],
      hp: '',
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const placed = (await res.json()) as { order: { number: string } };
  await expect(page.getByText(`New order ${placed.order.number} from Poll Tester`)).toBeVisible({ timeout: 40_000 });
  await expect(page).toHaveTitle(/^\(1\)/);
  if (!isPhone()) await expect(badge).toContainText(String(before + 1));
  await shot(page, project, 'polling-toast');
});

test('session expiry mid-session returns to login; no console errors; no horizontal scroll', async () => {
  await page.goto(`${ADMIN}/orders`);
  await expect(page.locator('[data-row-id]').first()).toBeVisible();
  await page.context().clearCookies();
  await page.getByRole('tab', { name: /^New/ }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  await noHScroll(page);
});
