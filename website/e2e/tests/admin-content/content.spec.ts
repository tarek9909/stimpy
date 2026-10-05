import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, API, AUTH_FILE, WEB, adminApi, ensureAuthState, mailpitFor, noHScroll, shot, watchConsole } from './helpers';
import { mysql } from '../runtime';

test.use({ storageState: AUTH_FILE });
test.beforeAll(ensureAuthState);
test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
let api: APIRequestContext;
const originals: Record<string, unknown> = {};

const publicText = async (page: Page, path: string): Promise<string> => {
  const p = await page.context().newPage();
  await p.goto(`${WEB}${path}`);
  await p.waitForLoadState('networkidle');
  const t = await p.locator('body').innerText();
  await p.close();
  return t;
};
const getJson = async (path: string) => (await api.get(path)).json();

test.beforeAll(async () => {
  api = await adminApi();
  originals.announcement = await getJson('admin/content/announcement');
  originals.homepage = await getJson('admin/content/homepage');
  originals.policies = await getJson('admin/content/policies');
  originals.templates = await getJson('admin/email-templates');
  originals.whatsapp = await getJson('admin/whatsapp-templates');
});

test.afterAll(async () => {
  await api.put('admin/content/announcement', { data: originals.announcement });
  await api.put('admin/content/homepage', { data: originals.homepage });
  await api.put('admin/content/policies', { data: originals.policies });
  for (const t of originals.templates as Array<{ key: string; subject: string; body: string; enabled: boolean }>) {
    await api.put(`admin/email-templates/${t.key}`, { data: { subject: t.subject, body: t.body, enabled: t.enabled } });
  }
  await api.put('admin/whatsapp-templates', { data: originals.whatsapp });
  await api?.dispose();
});

test('announcement bar: validation, save, preview, and the public site follows', async ({ page }, info) => {
  const c = watchConsole(page);
  const text = `E2E sale ${stamp}`;
  await page.goto(`${ADMIN}/content`);
  await page.getByRole('switch', { name: /Show on the website/ }).click();
  await page.getByLabel(/^Text/).fill('');
  await page.getByRole('button', { name: 'Save announcement' }).click();
  await expect(page.getByText('Enter the announcement text, or switch it off.').first()).toBeVisible();
  await page.getByLabel(/^Text/).fill(text);
  await expect(page.getByTestId('announcement-preview')).toHaveText(text);
  await page.getByLabel(/^Link/).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save announcement' }).click();
  await expect(page.getByText('Use an https:// link or a path starting with /.').first()).toBeVisible();
  await page.getByLabel(/^Link/).fill('/shop');
  await shot(page, 'announcement-filled', info.project.name);
  await page.getByRole('button', { name: 'Save announcement' }).click();
  await expect(page.getByText('Announcement saved.')).toBeVisible();
  expect(await getJson('admin/content/announcement')).toMatchObject({ enabled: true, text, linkUrl: '/shop' });
  expect(await publicText(page, '/')).toContain(text);
  // switching it off hides the bar
  await page.getByRole('switch', { name: /Show on the website/ }).click();
  await page.getByRole('button', { name: 'Save announcement' }).click();
  await expect(page.getByText('Announcement saved.').last()).toBeVisible();
  // The homepage is ISR-cached for 10 seconds; poll its documented refresh window after disabling the bar.
  await expect.poll(async () => !(await publicText(page, '/')).includes(text), {
    timeout: 20_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(true);
  await noHScroll(page);
  expect(c.errors, c.errors.join('\n')).toEqual([]);
});

test('unsaved changes are guarded when leaving a tab', async ({ page }) => {
  await page.goto(`${ADMIN}/content`);
  await page.getByLabel(/^Text/).fill('unsaved text');
  await page.getByRole('tab', { name: 'FAQ' }).click();
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/content$/);
});

test('FAQ: add with a new group, filter, reorder, and /help reflects it', async ({ page }, info) => {
  const q = `E2E question ${stamp}`;
  const group = `E2E Group ${stamp}`;
  await page.goto(`${ADMIN}/content?tab=faq`);
  await page.getByRole('button', { name: 'Add question' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Question/).fill(q);
  await dlg.getByLabel('Answer').first().fill('First paragraph.\n\n**Bold** answer.');
  await dlg.getByLabel(/^Group/).fill(group);
  await dlg.getByRole('button', { name: 'Add question' }).click();
  await expect(page.getByText('Question added.')).toBeVisible();
  await expect(page.getByText(q, { exact: true })).toBeVisible();
  await shot(page, 'faq-list', info.project.name);
  // group filter
  await page.getByLabel('Group').selectOption(group);
  await expect(page.getByTestId('faq-group')).toHaveCount(1);
  await page.getByLabel('Group').selectOption('all');
  // move the new (last) question up twice: one global order
  const before = ((await getJson('admin/faqs?pageSize=100')).items as Array<{ id: number; question: string }>).map((f) => f.id);
  await page.getByRole('button', { name: `Move ${q} up` }).click();
  await expect.poll(async () => ((await getJson('admin/faqs?pageSize=100')).items as Array<{ id: number }>).map((f) => f.id)).not.toEqual(before);
  const after = (await getJson('admin/faqs?pageSize=100')).items as Array<{ id: number; question: string; group: string | null }>;
  expect(after.length).toBe(before.length);
  expect([...after.map((f) => f.id)].sort()).toEqual([...before].sort());
  expect(after.find((f) => f.question === q)?.group).toBe(group);
  const txt = await publicText(page, '/help?tab=faq');
  expect(txt).toContain(q);
  expect(txt).toContain(group);
  // delete (confirmed)
  const id = after.find((f) => f.question === q)!.id;
  await page.getByRole('button', { name: `Delete ${q}` }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete this question?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete question' }).click();
  await expect(page.getByText('Question deleted.')).toBeVisible();
  const gone = (await getJson('admin/faqs?pageSize=100')).items as Array<{ id: number }>;
  expect(gone.some((f) => f.id === id)).toBe(false);
});

test('policies: edit the delivery & returns text with preview; the public page shows it', async ({ page }, info) => {
  const marker = `E2E policy line ${stamp}`;
  await page.goto(`${ADMIN}/content?tab=policies`);
  const section = page.locator('details', { hasText: 'Delivery & returns' }).first();
  await section.locator('summary').click();
  const area = section.locator('textarea');
  await area.fill(`${marker}\n\n- first item\n- second item\n\n**Bold** text`);
  const previewTab = section.getByRole('button', { name: 'Preview', exact: true });
  const editTab = section.getByRole('button', { name: 'Edit', exact: true });
  if (await previewTab.isVisible()) await previewTab.click();
  await expect(section.getByRole('region', { name: 'Preview' })).toContainText(marker);
  await shot(page, 'policies-editing', info.project.name);
  if (await editTab.isVisible()) await editTab.click();
  await section.getByRole('button', { name: 'Save Delivery & returns' }).click();
  await expect(page.getByText('Delivery & returns saved.')).toBeVisible();
  const saved = await getJson('admin/content/policies');
  expect(saved.deliveryReturns).toContain(marker);
  expect(saved.care).toBe((originals.policies as { care: string }).care);
  expect(await publicText(page, '/delivery-returns')).toContain(marker);
});

test('homepage: hero headline and a review', async ({ page }, info) => {
  const headline = `E2E headline ${stamp}`;
  await page.goto(`${ADMIN}/content?tab=homepage`);
  await page.getByLabel(/^Headline/).fill('');
  await page.getByRole('button', { name: 'Save homepage' }).click();
  await expect(page.getByText('Enter a headline.').first()).toBeVisible();
  await page.getByLabel(/^Headline/).fill(headline);
  await page.getByRole('button', { name: 'Save homepage' }).click();
  await expect(page.getByText('Homepage saved.')).toBeVisible();
  expect(await publicText(page, '/')).toContain(headline);
  // review: add, hide, delete
  await page.getByRole('button', { name: 'Add review' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Name/).fill(`Rima ${stamp}`);
  await dlg.getByLabel(/^Review/).fill('E2E review text');
  await dlg.getByRole('button', { name: 'Add review' }).click();
  await expect(page.getByText('Review added.')).toBeVisible();
  const content = await (await page.request.get(`${API}/api/v1/content`)).json();
  expect(content.reviews.some((r: { name: string }) => r.name === `Rima ${stamp}`)).toBe(true);
  await page.getByRole('switch', { name: `Show Rima ${stamp}'s review` }).click();
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/content`)).json()).reviews as Array<{ name: string }>).some((r) => r.name === `Rima ${stamp}`)).toBe(false);
  await shot(page, 'homepage-reviews', info.project.name);
  await page.getByRole('button', { name: `Delete review by Rima ${stamp}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete review' }).click();
  await expect(page.getByText('Review deleted.')).toBeVisible();
});

test('emails: chips, unknown placeholder flagged and rejected, server preview, test send reaches Mailpit', async ({ page }, info) => {
  test.setTimeout(120_000);
  const c = watchConsole(page);
  const to = `e2e-${stamp}@example.com`;
  await page.goto(`${ADMIN}/content?tab=emails&template=order_received`);
  const subject = page.getByLabel(/^Subject/);
  await expect(subject).toHaveValue(/We got your order/);
  // only this template's placeholders are offered
  const chips = await page.getByRole('list', { name: 'Placeholders' }).getByRole('button').allInnerTexts();
  const tpl = (originals.templates as Array<{ key: string; placeholders: string[] }>).find((t) => t.key === 'order_received')!;
  expect(chips).toEqual(tpl.placeholders.map((p) => `{${p}}`));
  // unknown placeholder is flagged amber and the server rejects it on save
  await subject.fill(`Hello {foo} ${stamp}`);
  await expect(page.getByTestId('unknown-placeholder').first()).toContainText('{foo}');
  await page.getByRole('button', { name: /^Save template$/ }).click();
  await expect(page.getByText(/placeholder/i).first()).toBeVisible();
  expect((await getJson('admin/email-templates')).find((t: { key: string }) => t.key === 'order_received').subject).toBe((tpl as unknown as { subject: string }).subject);
  // a chip inserts at the cursor of the last focused field (subject)
  await subject.fill(`E2E subject ${stamp} for `);
  await subject.focus();
  await page.getByTestId('chip-order_number').click();
  await expect(subject).toHaveValue(`E2E subject ${stamp} for {order_number}`);
  await expect(page.getByTestId('unknown-placeholder')).toHaveCount(0);
  // server preview (debounced) shows the unsaved subject with sample data
  await expect(page.getByTestId('preview-subject')).toContainText(`E2E subject ${stamp} for STP-`, { timeout: 15_000 });
  const frame = page.frameLocator('[data-testid="preview-frame"]');
  await expect(frame.locator('body')).toContainText('Thanks for your order', { timeout: 15_000 });
  await page.getByRole('radio', { name: 'Plain text' }).click();
  await expect(page.getByTestId('preview-text')).toContainText('Thanks for your order');
  await page.getByRole('radio', { name: 'Formatted' }).click();
  await shot(page, 'email-editor', info.project.name);
  await page.getByRole('button', { name: /^Save template$/ }).click();
  await expect(page.getByText('Template saved.')).toBeVisible();
  // test send: validation, then queued; it arrives in Mailpit
  await page.getByRole('button', { name: 'Send test email' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Send to').fill('not-an-email');
  await dlg.getByRole('button', { name: 'Send test email' }).click();
  await expect(dlg.getByText('Enter a valid email address.')).toBeVisible();
  await dlg.getByLabel('Send to').fill(to);
  await dlg.getByRole('button', { name: 'Send test email' }).click();
  await expect(page.getByText(`Test email queued to ${to}. It appears in the email log.`)).toBeVisible();
  await expect.poll(async () => (await mailpitFor(to)).map((m) => m.Subject), { timeout: 30_000 }).toEqual([expect.stringContaining(`E2E subject ${stamp} for`)]);
  // the log shows it
  await page.goto(`${ADMIN}/content?tab=emails&section=log`);
  await expect(page.getByText(to).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 'email-log', info.project.name);
  await noHScroll(page);
  expect(
    c.errors.filter(
      (e) =>
        !/400|422/.test(e) &&
        !/Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./.test(e),
    ),
    c.errors.join('\n'),
  ).toEqual([]);
});

test('test send ignores the master email switch', async ({ page }) => {
  const settings = await getJson('admin/settings');
  const to = `e2e-off-${stamp}@example.com`;
  await api.patch('admin/settings', { data: { email: { enabled: false } } });
  try {
    const res = await api.post('admin/email-templates/order_confirmed/test', { data: { to } });
    expect(res.status()).toBe(202);
    await expect.poll(async () => (await mailpitFor(to)).length, { timeout: 30_000 }).toBe(1);
  } finally {
    await api.patch('admin/settings', { data: { email: { enabled: settings.email.enabled } } });
  }
  void page;
});

test('email log: a failed row is highlighted and Retry queues it', async ({ page }, info) => {
  const run = (sql: string) => mysql(sql);
  const id = run("select id from email_log where status='SENT' and template_key='order_received' order by id limit 1");
  run(`update email_log set status='FAILED', error='SMTP 421 simulated by e2e', attempts=4 where id=${id}`);
  await page.goto(`${ADMIN}/content?tab=emails&section=log`);
  await expect(page.getByText(/\d+ emails? failed\./)).toBeVisible();
  await page.getByRole('button', { name: 'Show failed' }).click();
  await expect(page).toHaveURL(/status=FAILED/);
  await page.getByText('Show error').first().click();
  await expect(page.getByText('SMTP 421 simulated by e2e')).toBeVisible();
  await shot(page, 'email-log-failed', info.project.name);
  await page.getByRole('button', { name: /^Retry email to/ }).first().click();
  await expect(page.getByText('Retry queued.')).toBeVisible();
  const status = run(`select status from email_log where id=${id}`);
  expect(['PENDING', 'SENT']).toContain(status);
});

test('WhatsApp templates: chips, sample preview, save', async ({ page }, info) => {
  await page.goto(`${ADMIN}/content?tab=emails&section=whatsapp`);
  const first = page.getByRole('region').first();
  const area = first.getByRole('textbox');
  await area.fill(`Hi {customer_name} ${stamp}: `);
  await area.focus();
  await first.getByTestId('chip-order_number').click();
  await expect(area).toHaveValue(`Hi {customer_name} ${stamp}: {order_number}`);
  await expect(first.getByTestId(/wa-sample-/)).toContainText(`Hi Rima ${stamp}: STP-1042`);
  await shot(page, 'whatsapp', info.project.name);
  await page.getByRole('button', { name: 'Save WhatsApp templates' }).click();
  await expect(page.getByText('WhatsApp templates saved.')).toBeVisible();
  const saved = await getJson('admin/whatsapp-templates');
  expect(saved[0].body).toBe(`Hi {customer_name} ${stamp}: {order_number}`);
});
