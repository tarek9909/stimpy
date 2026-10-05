import { topUpStock } from './helpers';
import { expect, test } from '@playwright/test';
import {
  cartWithStimpie,
  expectNoHorizontalScroll,
  fillCheckout,
  orderCountFor,
  placeOrderButton,
  recordOrders,
  shot,
  spoofIp,
  sql,
  submitAndWaitForThanks,
  uniqueCustomer,
  watchConsole,
} from './helpers';

test.beforeAll(async () => {
  test.setTimeout(90_000);
  await topUpStock();
});
test.beforeEach(async ({ page }) => {
  await spoofIp(page);
});

test.describe('checkout form', () => {
  test('validation matrix: per-field errors, phone formats, live validation after blur, error summary links', async ({ page }, info) => {
    const c = watchConsole(page);
    await cartWithStimpie(page, 'after-dark');
    // nothing is shown on an untouched empty field
    await expect(page.getByTestId('error-summary')).toHaveCount(0);
    await placeOrderButton(page).click();
    const summary = page.getByTestId('error-summary');
    await expect(summary).toBeVisible();
    for (const text of ['Enter your full name.', 'Enter a valid email address.', 'Enter a Lebanese phone number, like 03 123 456.', 'Choose your area.', 'Enter your delivery address: street, building, floor.']) {
      await expect(summary.getByText(text)).toBeVisible();
      await expect(page.locator('p', { hasText: text }).first()).toBeVisible();
    }
    await expect(page.getByLabel(/^Full name/)).toBeFocused();
    // summary link jumps to the field
    await summary.getByText('Enter a valid email address.').click();
    await expect(page.getByLabel(/^Email/)).toBeFocused();
    // inputs have the documented maxlength / autocomplete / inputmode
    await expect(page.getByLabel(/^Full name/)).toHaveAttribute('maxlength', '80');
    await expect(page.getByLabel(/^Full name/)).toHaveAttribute('autocomplete', 'name');
    await expect(page.getByLabel(/^Email/)).toHaveAttribute('maxlength', '190');
    await expect(page.getByLabel(/^Phone/)).toHaveAttribute('inputmode', 'tel');
    await expect(page.getByLabel(/^Address/)).toHaveAttribute('maxlength', '300');
    await expect(page.getByLabel(/^Address/)).toHaveAttribute('autocomplete', 'street-address');
    // phone formats: valid ones clear the error, "123" does not
    const phone = page.getByLabel(/^Phone/);
    for (const ok of ['03 123 456', '03123456', '+961 3 123 456', '00961 3 123 456']) {
      await phone.fill(ok);
      await phone.blur();
      await expect(page.locator('#field-customer\\.phone-error')).toHaveCount(0);
    }
    await phone.fill('123');
    await phone.blur();
    await expect(page.locator('#field-customer\\.phone-error')).toContainText('Enter a Lebanese phone number');
    await phone.fill('03 123 456');
    await expect(page.locator('#field-customer\\.phone-error')).toHaveCount(0);
    // limits: 81 characters in the name and 301 in the address stop at maxlength
    await page.getByLabel(/^Full name/).fill('x'.repeat(120));
    expect(await page.getByLabel(/^Full name/).inputValue()).toHaveLength(80);
    await page.getByLabel(/^Address/).fill('y'.repeat(400));
    expect(await page.getByLabel(/^Address/).inputValue()).toHaveLength(300);
    await expect(page.getByTestId('char-counter').first()).toHaveText('300/300');
    await expectNoHorizontalScroll(page);
    c.assertClean();
    void info;
  });

  test('WhatsApp same-as-phone, area fee logic, "Other" area, draft restore, request body', async ({ page }) => {
    const me = uniqueCustomer('form');
    await cartWithStimpie(page, 'the-orbit');
    // area fee logic: before choosing, "from $3" and an estimated total
    await expect(page.getByTestId('summary-delivery')).toHaveText('from $3');
    await expect(page.getByTestId('summary-total-label')).toHaveText('Estimated total');
    await page.getByLabel(/^Area/).selectOption({ label: 'Mount Lebanon' });
    await expect(page.getByTestId('summary-delivery-label')).toHaveText('Delivery to Mount Lebanon');
    await expect(page.getByTestId('summary-total')).toHaveText('$13');
    await expect(page.getByTestId('summary-total-label')).toHaveText('Total');

    await page.getByLabel(/^Full name/).fill(me.name);
    await page.getByLabel(/^Email/).fill(me.email);
    await page.getByLabel(/^Phone/).fill(me.phone);
    await expect(page.getByTestId('whatsapp-hint')).toContainText(me.phone);
    // unticking pre-fills the phone and moves focus; re-ticking discards the value
    await page.getByLabel('WhatsApp is the same as my phone number').uncheck({ force: true });
    const wa = page.getByLabel(/^WhatsApp number/);
    await expect(wa).toBeFocused();
    await expect(wa).toHaveValue(me.phone);
    await wa.fill('70 123 456');
    await page.getByLabel('WhatsApp is the same as my phone number').check({ force: true });
    await expect(page.getByLabel(/^WhatsApp number/)).toHaveCount(0);
    await page.getByLabel('WhatsApp is the same as my phone number').uncheck({ force: true });
    await expect(page.getByLabel(/^WhatsApp number/)).toHaveValue(me.phone);
    await page.getByLabel(/^WhatsApp number/).fill('70 123 456');

    // "Other": default fee, typed area, no areaId
    await page.getByLabel(/^Area/).selectOption({ label: 'Other (type it below)' });
    await expect(page.getByTestId('summary-delivery')).toHaveText('$3');
    await page.getByLabel(/^Your area or town/).fill('Jounieh');
    await page.getByLabel(/^Address/).fill('Main street, building 5, 2nd floor');

    // draft survives a reload (and never stores the honeypot)
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByLabel(/^Full name/)).toHaveValue(me.name);
    await expect(page.getByLabel(/^WhatsApp number/)).toHaveValue('70 123 456');
    await expect(page.getByLabel(/^Your area or town/)).toHaveValue('Jounieh');
    expect(await page.evaluate(() => sessionStorage.getItem('stimpy.checkout.draft'))).not.toContain('website_url');
    await expect(page.getByTestId('summary-total')).toHaveText('$13', { timeout: 15_000 });

    const seen = recordOrders(page);
    const number = await submitAndWaitForThanks(page);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body.customer).toMatchObject({ whatsapp: '70 123 456', whatsappSameAsPhone: false });
    expect(seen[0]!.body.delivery).toEqual({ areaName: 'Jounieh', address: 'Main street, building 5, 2nd floor', notes: null });
    expect(seen[0]!.body.expectedTotalCents).toBe(1300);
    expect(seen[0]!.body.hp).toBe('');
    expect(seen[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`SELECT contact_whatsapp, area_name, delivery_fee_cents, total_cents FROM orders WHERE number='${number}'`)).toBe('+96170123456\tJounieh\t300\t1300');
  });

  test('UTM attribution is sent as three keys only, and the order shows it in the database', async ({ page }) => {
    const me = uniqueCustomer('utm');
    await page.goto('/?utm_source=instagram&utm_medium=story&utm_campaign=drop02&utm_content=ignored&utm_term=ignored');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('stimpy.utm'))).not.toBeNull();
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('stimpy.utm') ?? 'null'));
    expect(stored).toMatchObject({ utm_source: 'instagram', utm_medium: 'story', utm_campaign: 'drop02', utm_content: 'ignored', landingPath: '/' });
    await cartWithStimpie(page, 'the-wave');
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    const seen = recordOrders(page);
    const number = await submitAndWaitForThanks(page);
    expect(seen[0]!.body.attribution).toEqual({ utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'drop02' });
    expect(sql(`SELECT utm_source, utm_medium, utm_campaign FROM orders WHERE number='${number}'`)).toBe('instagram\tstory\tdrop02');
  });

  test('honeypot: a filled hp is rejected with a generic message, no field flagged, no order', async ({ page }) => {
    const me = uniqueCustomer('hp');
    await cartWithStimpie(page, 'the-eye');
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    // the hidden input is off-screen, not display:none, and uses a non-obvious name
    const hp = page.locator('input[name="website_url"]');
    await expect(hp).toHaveAttribute('tabindex', '-1');
    await expect(hp).toHaveAttribute('autocomplete', 'off');
    expect(await hp.evaluate((el) => getComputedStyle(el.closest('div[aria-hidden]')!).display)).not.toBe('none');
    await hp.evaluate((el: HTMLInputElement) => (el.value = 'bot'));
    const seen = recordOrders(page);
    await placeOrderButton(page).click();
    await expect(page.getByTestId('generic-error')).toContainText('Something went wrong. Please try again.');
    await expect(page.getByTestId('support-line')).toBeVisible();
    await expect(page.getByTestId('error-summary')).toHaveCount(0);
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    expect(seen[0]!.body.hp).toBe('bot');
    expect(orderCountFor(me.email)).toBe(0);
  });

  test('double click and double Enter create exactly one order', async ({ page }) => {
    const me = uniqueCustomer('dbl');
    await cartWithStimpie(page, 'the-cedar');
    await fillCheckout(page, { email: me.email, phone: me.phone, area: 'Beirut' });
    const seen = recordOrders(page);
    const btn = placeOrderButton(page);
    await btn.dblclick();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    expect(seen).toHaveLength(1);
    expect(orderCountFor(me.email)).toBe(1);
  });

  test('fees endpoint down: free-text area fallback, order still placed without areaId', async ({ page }) => {
    const me = uniqueCustomer('nofees');
    await page.route('**/api/v1/delivery/fees', (r) => r.abort());
    await page.goto('/shop/stimpie/the-orbit');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.keyboard.press('Escape');
    await page.goto('/checkout');
    await expect(page.getByTestId('fees-error')).toContainText("couldn't load delivery areas", { timeout: 20_000 });
    await expect(page.getByTestId('summary-delivery-label')).toHaveText('Delivery fee confirmed on WhatsApp');
    await expect(page.getByLabel(/^Area/)).toHaveCount(1); // the free-text field, not a select
    await page.getByLabel(/^Full name/).fill(me.name);
    await page.getByLabel(/^Email/).fill(me.email);
    await page.getByLabel(/^Phone/).fill(me.phone);
    await page.getByLabel(/^Area or town/).fill('Zahle');
    await page.getByLabel(/^Address/).fill('Main street, building 5');
    const seen = recordOrders(page);
    await submitAndWaitForThanks(page);
    expect(seen[0]!.body.delivery).not.toHaveProperty('areaId');
    expect(seen[0]!.body.delivery.areaName).toBe('Zahle');
  });

  test('keyboard only: complete checkout with Tab, arrows and Enter', async ({ page }, info) => {
    test.skip(info.project.name.startsWith('phone'), 'keyboard run is desktop');
    const me = uniqueCustomer('kbd');
    await cartWithStimpie(page, 'the-orbit');
    await page.getByLabel(/^Full name/).focus();
    await page.keyboard.type(me.name);
    await page.keyboard.press('Tab');
    await page.keyboard.type(me.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(me.phone);
    await page.keyboard.press('Tab'); // WhatsApp checkbox (stays ticked)
    await page.keyboard.press('Tab'); // area select
    const area = page.getByRole('button', { name: 'Choose your area' });
    await expect(area).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Main street, building 5, 2nd floor');
    // an empty required field first: Enter on the button shows the summary and focus goes to the field
    await page.keyboard.press('Tab'); // notes
    await page.keyboard.press('Tab'); // Place order
    await expect(placeOrderButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/thanks$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Order placed' })).toBeFocused();
  });
});
