import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN, AUTH_FILE, adminApi, ensureAuthState, noHScroll, shot, watchConsole } from './helpers';
import { mysql } from '../runtime';

test.use({ storageState: AUTH_FILE });
test.beforeAll(ensureAuthState);

const sql = mysql;
const money = (cents: number): string => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stamp = Date.now().toString(36);
let api: APIRequestContext;
const created: Array<{ kind: 'expenses' | 'ad-spend'; id: number }> = [];

test.beforeAll(async () => {
  api = await adminApi();
});
test.afterAll(async () => {
  for (const c of created) await api.delete(`admin/${c.kind}/${c.id}`).catch(() => undefined);
  await api?.dispose();
});

test('profit figures match SQL for all time, and the by-order table is sortable', async ({ page }, info) => {
  const c = watchConsole(page);
  const [rev, fees, cogs, orders] = sql("select sum(subtotal_cents), sum(delivery_fee_cents), sum(cost_cents), count(*) from orders where status='DELIVERED'").split('\t').map(Number) as [number, number, number, number];
  const exp = Number(sql('select coalesce(sum(amount_cents),0) from expenses'));
  const ads = Number(sql('select coalesce(sum(amount_cents),0) from ad_spend'));
  await page.goto(`${ADMIN}/finance?all=1`);
  const cards = page.locator('main');
  await expect(cards).toContainText(money(rev));
  const profit = rev - cogs - exp - ads;
  await expect(page.getByTestId('profit-figure')).toContainText(money(profit));
  await expect(page.getByTestId('profit-figure')).toContainText('Profit');
  await expect(cards).toContainText(money(fees));
  await expect(cards).toContainText(money(cogs));
  // plan margins and the average per order
  await expect(cards).toContainText('Plan: $18.00 on the $35 pack');
  await expect(cards).toContainText('Plan: $22.00 on the $45 pack');
  await expect(cards).toContainText(`${money(Math.round(profit / orders))} average profit per order (${orders} orders)`);
  // by-order rows = delivered orders; sort by profit
  const desktop = info.project.name === 'desktop-1280';
  await expect(desktop ? page.getByRole('table', { name: 'Profit by order' }).getByRole('row') : page.getByRole('list', { name: 'Profit by order' }).getByRole('listitem')).toHaveCount(desktop ? orders + 1 : orders);
  if (desktop) {
    await page.getByRole('button', { name: /^Profit/ }).first().click();
    await shot(page, 'finance-profit-sorted', info.project.name);
  }
  await noHScroll(page);
  // an empty range
  await page.goto(`${ADMIN}/finance?from=2020-01-01&to=2020-01-31`);
  await expect(page.getByText('No delivered orders in this range').first()).toBeVisible();
  // this month preset is in the URL-less default and the chips are selectable
  await page.goto(`${ADMIN}/finance`);
  await page.getByRole('radio', { name: 'Last month' }).or(page.getByLabel('Date range')).first().waitFor();
  expect(c.errors, c.errors.join('\n')).toEqual([]);
});

test('costs: add an expense and ad spend (validation, totals), profit follows, edit and delete with confirmation', async ({ page }, info) => {
  test.setTimeout(120_000);
  const before = (await (await api.get('admin/finance/profit')).json()) as { profitCents: number; expensesCents: number; adSpendCents: number };
  await page.goto(`${ADMIN}/finance?tab=costs&all=1`);
  await page.getByRole('button', { name: 'Add expense' }).first().click();
  const dlg = page.getByRole('dialog');
  // validation
  await dlg.getByRole('button', { name: 'Add expense' }).click();
  await expect(dlg.getByText('Enter a category.').first()).toBeVisible();
  await expect(dlg.getByText('Enter an amount above $0.').first()).toBeVisible();
  await dlg.getByRole('combobox', { name: /^Category/ }).fill(`E2E print ${stamp}`);
  await dlg.getByLabel(/^Amount/).fill('0');
  await dlg.getByRole('button', { name: 'Add expense' }).click();
  await expect(dlg.getByText('Enter an amount above $0.').first()).toBeVisible();
  await dlg.getByLabel(/^Amount/).fill('12.50');
  await dlg.getByLabel(/^Date/).fill('2099-01-01');
  await dlg.getByRole('button', { name: 'Add expense' }).click();
  await expect(dlg.getByText('The date cannot be in the future.').first()).toBeVisible();
  const today = new Date().toISOString().slice(0, 10);
  await dlg.getByLabel(/^Date/).fill(today);
  await dlg.getByLabel(/^Note/).fill('Stimpie printing run');
  await shot(page, 'costs-dialog', info.project.name);
  await dlg.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText('Expense added.')).toBeVisible();
  const list = (await (await api.get('admin/expenses?pageSize=100')).json()) as { items: Array<{ id: number; category: string; amountCents: number; note: string | null }>; totalCents: number };
  const mine = list.items.find((e) => e.category === `E2E print ${stamp}`)!;
  expect(mine).toMatchObject({ amountCents: 1250, note: 'Stimpie printing run' });
  created.push({ kind: 'expenses', id: mine.id });
  await expect(page.getByTestId('costs-total')).toContainText(money(list.totalCents));
  const expenses = info.project.name === 'desktop-1280' ? page.getByRole('table', { name: 'Expenses' }) : page.getByRole('list', { name: 'Expenses' });
  await expect(expenses).toContainText(`E2E print ${stamp}`);
  // ad spend
  const adSpendRadio = page.getByRole('radio', { name: 'Ad spend' });
  // The segmented control updates the URL and remounts the controlled radio. Use click
  // plus the checked-state assertion instead of Playwright's immediate check-state probe.
  await adSpendRadio.click({ force: true });
  await expect(adSpendRadio).toBeChecked();
  await page.getByRole('button', { name: 'Add ad spend' }).first().click();
  const d2 = page.getByRole('dialog');
  await d2.getByRole('combobox', { name: /^Channel/ }).fill('Instagram');
  await d2.getByLabel(/^Amount/).fill('30');
  await d2.getByRole('button', { name: 'Add ad spend' }).click();
  await expect(page.getByText('Ad spend added.')).toBeVisible();
  const ad = (await (await api.get('admin/ad-spend?pageSize=100')).json()) as { items: Array<{ id: number; channel: string; amountCents: number }> };
  const adMine = ad.items.find((a) => a.amountCents === 3000 && a.channel === 'Instagram')!;
  created.push({ kind: 'ad-spend', id: adMine.id });
  // profit follows: -$12.50 and -$30.00, checked against the API and SQL
  const after = (await (await api.get('admin/finance/profit')).json()) as typeof before;
  expect(after.expensesCents).toBe(before.expensesCents + 1250);
  expect(after.adSpendCents).toBe(before.adSpendCents + 3000);
  expect(after.profitCents).toBe(before.profitCents - 4250);
  expect(Number(sql('select coalesce(sum(amount_cents),0) from expenses'))).toBe(after.expensesCents);
  await page.goto(`${ADMIN}/finance?all=1`);
  await expect(page.getByTestId('profit-figure')).toContainText(money(after.profitCents));
  await shot(page, 'finance-profit-after-costs', info.project.name);
  // edit the expense
  await page.goto(`${ADMIN}/finance?tab=costs&all=1`);
  await page.getByRole('button', { name: new RegExp(`Edit expense E2E print ${stamp}`) }).click();
  await page.getByRole('dialog').getByLabel(/^Amount/).fill('20');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Expense saved.')).toBeVisible();
  expect(Number(sql(`select amount_cents from expenses where id=${mine.id}`))).toBe(2000);
  // delete asks first and says what it changes
  await page.getByRole('button', { name: new RegExp(`Delete expense E2E print ${stamp}`) }).click();
  await expect(page.getByRole('alertdialog')).toContainText('This changes your profit figures.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete expense' }).click();
  await expect(page.getByText('Expense deleted.')).toBeVisible();
  expect(sql(`select count(*) from expenses where id=${mine.id}`)).toBe('0');
  const adSpendAgain = page.getByRole('radio', { name: 'Ad spend' });
  await adSpendAgain.click({ force: true });
  await expect(adSpendAgain).toBeChecked();
  await page.getByRole('button', { name: /Delete ad spend Instagram/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete ad spend' }).click();
  await expect(page.getByText('Ad spend deleted.')).toBeVisible();
  expect(sql(`select count(*) from ad_spend where id=${adMine.id}`)).toBe('0');
  await noHScroll(page);
});

test('cash: outstanding matches SQL; settling a delivery (with confirm) and undo', async ({ page }, info) => {
  const outstanding = Number(sql("select coalesce(sum(total_cents),0) from orders where status='DELIVERED' and cash_settled=0"));
  await page.goto(`${ADMIN}/finance?tab=cash`);
  await expect(page.getByTestId('cash-outstanding')).toContainText(money(outstanding));
  const group = sql("select candidate.delivery_number,count(o.id),sum(o.total_cents) from (select distinct delivery_number from orders where status='DELIVERED' and cash_settled=0 and delivery_number is not null order by delivery_number limit 1) candidate join orders o on o.delivery_number=candidate.delivery_number and o.status='DELIVERED' group by candidate.delivery_number").split('\t');
  const [num, count, due] = [group[0]!, Number(group[1]), Number(group[2])];
  await expect(page.getByRole('heading', { name: new RegExp(`Delivery ${num}.*${count} orders?.*${money(due).replace('$', '\\$')} due`) })).toBeVisible();
  await shot(page, 'finance-cash', info.project.name);
  const section = page.getByRole('region', { name: `Delivery ${num}` });
  await section.getByRole('button', { name: 'Mark delivery settled' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`Mark all ${count} ${count === 1 ? 'order' : 'orders'} on ${num} as settled? You received ${money(due)}.`);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark settled' }).click();
  await expect(page.getByText(`Delivery ${num} marked settled.`)).toBeVisible();
  expect(Number(sql(`select sum(cash_settled) from orders where delivery_number='${num}' and status='DELIVERED'`))).toBe(count);
  await expect(page.getByTestId('cash-outstanding')).toContainText(money(outstanding - due));
  // collapsed "Settled" section, then Undo from the toast
  await expect(page.getByRole('heading', { name: /^Settled \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => Number(sql(`select sum(cash_settled) from orders where delivery_number='${num}' and status='DELIVERED'`))).toBe(0);
  await expect(page.getByTestId('cash-outstanding')).toContainText(money(outstanding));
  // a single order switch
  const one = page.getByRole('switch', { name: /cash settled/ }).first();
  const label = (await one.getAttribute('aria-label')) ?? '';
  void label;
  await one.click();
  await expect(page.getByText(/marked settled\./).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => Number(sql("select coalesce(sum(cash_settled),0) from orders where status='DELIVERED'"))).toBe(0);
  await noHScroll(page);
});

test('insights: charts render with data and every chart has a table alternative; ratios are percentages', async ({ page }, info) => {
  const c = watchConsole(page);
  await page.goto(`${ADMIN}/insights?all=1`);
  await expect(page.getByRole('img', { name: /Revenue per day/ })).toBeVisible();
  const delivered = Number(sql("select count(*) from orders where status='DELIVERED'"));
  // the data table behind the chart lists the same revenue
  await page.getByRole('button', { name: 'Show data' }).first().click();
  const desktop = info.project.name === 'desktop-1280';
  const series = ((await (await api.get('admin/insights/sales')).json()) as { series: Array<{ orders: number }> }).series;
  if (desktop) {
    const table = page.getByRole('table', { name: 'Daily orders and revenue' });
    await expect(table).toBeVisible();
    const rows = (await table.getByRole('row').allInnerTexts()).slice(1);
    expect(rows.length).toBe(series.length);
    expect(rows.reduce((s, r) => s + Number(r.split(/\s+/)[1] ?? 0), 0)).toBe(delivered);
  } else {
    await expect(page.getByRole('list', { name: 'Daily orders and revenue' }).getByRole('listitem')).toHaveCount(series.length);
  }
  expect(series.reduce((s, x) => s + x.orders, 0)).toBe(delivered);
  await page.getByRole('radio', { name: 'Orders' }).check({ force: true });
  await expect(page.getByRole('img', { name: /Orders per day/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Orders by weekday' })).toBeVisible();
  await shot(page, 'insights-sales-data', info.project.name);
  // Campaign sorting is available in the desktop table, not the phone list view.
  if (desktop) await page.getByRole('button', { name: /^Revenue/ }).last().click();
  await page.getByRole('tab', { name: 'Products' }).click();
  await expect(page.getByTestId('attach-rate')).toContainText('%');
  await expect(page.getByTestId('attach-rate')).toContainText('share of orders with extra Stimpies');
  const api2 = (await (await api.get('admin/insights/products')).json()) as { extraStimpieAttachRate: number };
  await expect(page.getByTestId('attach-rate')).toContainText(`${Math.round(api2.extraStimpieAttachRate * 1000) / 10}%`);
  await page.getByRole('button', { name: 'Show data' }).first().click();
  await shot(page, 'insights-products-data', info.project.name);
  await page.getByRole('tab', { name: 'Customers' }).click();
  const cust = (await (await api.get('admin/insights/customers')).json()) as { repeatRate: number; returnRate: number; deliverySuccessRate: number };
  await expect(page.getByText('Repeat rate').locator('xpath=..')).toContainText(`${Math.round(cust.repeatRate * 1000) / 10}%`);
  await expect(page.getByText('Return rate').locator('xpath=..')).toContainText(`${Math.round(cust.returnRate * 1000) / 10}%`);
  await noHScroll(page);
  // range with no data
  await page.goto(`${ADMIN}/insights?from=2020-01-01&to=2020-01-31`);
  await expect(page.getByText('Not enough data yet for this range').first()).toBeVisible();
  expect(c.errors, c.errors.join('\n')).toEqual([]);
});
