import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@stimpy/api-client';
import { cartStore } from '@/features/cart/store';
import { resetMemoryStorage } from '@/lib/storage';
import { stimpie } from './fixtures';
import { stimpieLine } from './fixtures-checkout';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/checkout' }));

type Handler = (path: string, opts: { body?: Record<string, unknown>; headers?: Record<string, string> }) => unknown | Promise<unknown>;
let post: Handler = async () => ({});
let get: Handler = async () => ({ data: undefined });
const sent: { path: string; body?: Record<string, unknown>; key?: string }[] = [];
vi.mock('@/lib/api-browser', () => ({
  browserApi: () => ({
    POST: async (path: string, opts: { body?: Record<string, unknown>; headers?: Record<string, string> }) => {
      sent.push({ path, body: opts.body, key: opts.headers?.['Idempotency-Key'] });
      const out = await post(path, opts);
      if (out instanceof Error) throw out;
      return out;
    },
    GET: async (path: string, opts: never) => {
      const out = await get(path, opts);
      if (out instanceof Error) throw out;
      return out;
    },
  }),
}));

import { CheckoutView } from '@/features/checkout/CheckoutView';

const fees = {
  defaultFeeCents: 300,
  estimateText: '2-3 working days',
  areas: [
    { id: 1, name: 'Beirut', feeCents: null, estDays: null },
    { id: 2, name: 'North', feeCents: 500, estDays: 4 },
  ],
};

const apiError = (code: ApiError['code'], status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status, code, message: 'm', requestId: 'req-77', ...extra });

function validation() {
  const lines = cartStore.getState().lines;
  const subtotal = lines.reduce((n, l) => n + l.ui.unitPriceCents * l.item.qty, 0);
  return {
    ok: true,
    lines: lines.map((l, i) => ({ itemIndex: i, ok: true, unitPriceCents: l.ui.unitPriceCents, lineTotalCents: l.ui.unitPriceCents * l.item.qty, problems: [] })),
    subtotalCents: subtotal,
    deliveryFeeCents: 300,
    totalCents: subtotal + 300,
    estimateText: '2-3 working days',
  };
}

const placedBody = {
  order: { number: 'STP-1042', status: 'NEW', placedAt: '2026-10-14T09:30:00.000Z', customerName: 'Rami Haddad', contactEmail: 'rami@example.com', items: [], subtotalCents: 1000, deliveryFeeCents: 300, totalCents: 1300, estimateText: '2-3 working days' },
  whatsappUrl: null,
  trackUrl: 'http://localhost:3000/track?order=STP-1042',
};

const defaultPost: Handler = (path) => {
  if (path.endsWith('/cart/validate')) return { data: validation() };
  return { data: placedBody, response: { status: 201, headers: new Headers() } };
};
const defaultGet: Handler = (path) => (path.endsWith('/delivery/fees') ? { data: fees } : { data: undefined });

function resetCart(withLine = true) {
  cartStore.setState({ lines: [], hydrated: false, validation: null, drawerOpen: false, notices: [] });
  cartStore.getState().hydrate();
  if (withLine) {
    const l = stimpieLine();
    cartStore.getState().add(l.item, l.ui);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetMemoryStorage();
  sent.length = 0;
  replace.mockReset();
  post = defaultPost;
  get = defaultGet;
});
afterEach(() => vi.useRealTimers());

const field = (re: RegExp) => screen.getByLabelText(re);

async function ready() {
  render(<CheckoutView />);
  await screen.findByTestId('checkout-form');
  await waitFor(() => expect(screen.getByLabelText(/^Area/)).toBeInTheDocument());
  await waitFor(() => expect(sent.some((s) => s.path.endsWith('/cart/validate'))).toBe(true));
}

async function fillValid() {
  fireEvent.change(field(/^Full name/), { target: { value: 'Rami Haddad' } });
  fireEvent.change(field(/^Email/), { target: { value: 'rami@example.com' } });
  fireEvent.change(field(/^Phone/), { target: { value: '03 123 456' } });
  fireEvent.change(field(/^Area/), { target: { value: '1' } });
  fireEvent.change(field(/^Address/), { target: { value: 'Main street, building 5' } });
  await waitFor(() => expect(screen.getByTestId('summary-total-label')).toHaveTextContent('Total'));
}

const placeButton = () => screen.getAllByRole('button', { name: /^(Place order|Placing order|Try again in)/ })[0]!;
const orderPosts = () => sent.filter((s) => s.path.endsWith('/orders'));

describe('checkout view', () => {
  it('empty cart: empty state with Shop and Builder, and a link to the recent order in this tab', async () => {
    resetCart(false);
    window.sessionStorage.setItem('stimpy.order.last', 'STP-1042');
    render(<CheckoutView />);
    expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('link', { name: 'Try the Builder' })).toHaveAttribute('href', '/builder');
    expect(screen.getByTestId('recent-order-link')).toHaveAttribute('href', '/order/STP-1042/thanks');
  });

  it('submitting empty shows the error summary, per-field messages and focuses the first invalid field (QA 14)', async () => {
    resetCart();
    await ready();
    fireEvent.click(placeButton());
    const summary = await screen.findByTestId('error-summary');
    expect(within(summary).getAllByRole('link')).toHaveLength(5);
    await waitFor(() => expect(field(/^Full name/)).toHaveFocus());
    expect(field(/^Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(orderPosts()).toHaveLength(0);
  });

  it('shows the honeypot off-screen with a non-obvious name and always sends hp as ""', async () => {
    resetCart();
    await ready();
    const hp = document.querySelector<HTMLInputElement>('input[name="website_url"]')!;
    expect(hp).toHaveAttribute('tabindex', '-1');
    expect(hp).toHaveAttribute('autocomplete', 'off');
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull();
    await fillValid();
    await act(async () => {
      fireEvent.click(placeButton());
    });
    await waitFor(() => expect(orderPosts()).toHaveLength(1));
    expect(orderPosts()[0]!.body).toMatchObject({ hp: '' });
  });

  it('happy path: one POST with a key, handoff stored, cart/draft/attempt cleared, router.replace to the confirmation', async () => {
    resetCart();
    await ready();
    await fillValid();
    await act(async () => {
      fireEvent.click(placeButton());
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/order/STP-1042/thanks'));
    expect(orderPosts()).toHaveLength(1);
    expect(orderPosts()[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(orderPosts()[0]!.body).toMatchObject({ expectedTotalCents: 1300, delivery: { areaId: 1, areaName: 'Beirut' } });
    expect(JSON.parse(window.sessionStorage.getItem('stimpy.order.STP-1042')!).order.number).toBe('STP-1042');
    expect(cartStore.getState().lines).toHaveLength(0);
    expect(window.sessionStorage.getItem('stimpy.checkout.attempt')).toBeNull();
    expect(window.sessionStorage.getItem('stimpy.checkout.draft')).toBeNull();
  });

  it('double submit in the same frame sends exactly one order (lock before any await)', async () => {
    resetCart();
    await ready();
    await fillValid();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const inner = post;
    post = async (path, opts) => {
      if (path.endsWith('/orders')) await gate;
      return inner(path, opts);
    };
    const form = screen.getByTestId('checkout-form');
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(placeButton());
    });
    expect(placeButton()).toHaveTextContent('Placing order...');
    await act(async () => release());
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(orderPosts()).toHaveLength(1);
  });

  it('inputs go read-only while the order is in flight', async () => {
    resetCart();
    await ready();
    await fillValid();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const inner = post;
    post = async (path, opts) => {
      if (path.endsWith('/orders')) await gate;
      return inner(path, opts);
    };
    await act(async () => {
      fireEvent.click(placeButton());
    });
    await waitFor(() => expect(field(/^Full name/)).toHaveAttribute('readonly'));
    await act(async () => release());
  });

  it('an unavailable line disables Place order and nothing is sent (QA 9, 49)', async () => {
    resetCart();
    await ready();
    cartStore.getState().applyChecks(
      cartStore.getState().lines.map((l) => ({ ...l, check: { state: 'UNAVAILABLE' as const, reasons: ['THE VOID just sold out.'], checkedAt: null } })),
      null,
    );
    await waitFor(() => expect(placeButton()).toBeDisabled());
    expect(screen.getAllByText('THE VOID just sold out.').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cart-line').querySelector('p')).toHaveClass('line-through');
    expect(orderPosts()).toHaveLength(0);
  });

  it('fees failure: fallback free-text area with the WhatsApp fee line, order still sent without areaId (QA 31)', async () => {
    resetCart();
    get = () => apiError('NETWORK', 0);
    render(<CheckoutView />);
    expect(await screen.findByTestId('fees-error')).toHaveTextContent("We couldn't load delivery areas");
    expect(screen.getByTestId('summary-delivery-label')).toHaveTextContent('Delivery fee confirmed on WhatsApp');
    fireEvent.change(field(/^Full name/), { target: { value: 'Rami Haddad' } });
    fireEvent.change(field(/^Email/), { target: { value: 'rami@example.com' } });
    fireEvent.change(field(/^Phone/), { target: { value: '03 123 456' } });
    fireEvent.change(field(/^Area or town/), { target: { value: 'Zahle' } });
    fireEvent.change(field(/^Address/), { target: { value: 'Main street, building 5' } });
    await act(async () => {
      fireEvent.click(placeButton());
    });
    await waitFor(() => expect(orderPosts()).toHaveLength(1));
    expect(orderPosts()[0]!.body!.delivery).toEqual({ areaName: 'Zahle', address: 'Main street, building 5', notes: null });
  });

  it('server field errors go under their fields and focus the first (QA 30); "same as phone" is revealed for whatsapp errors', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    post = (path, opts) =>
      path.endsWith('/orders')
        ? apiError('VALIDATION_ERROR', 400, { fields: { 'customer.email': 'That email cannot receive mail.', 'customer.whatsapp': 'Enter your WhatsApp number.' } })
        : inner(path, opts);
    await act(async () => {
      fireEvent.click(placeButton());
    });
    await waitFor(() => expect(document.getElementById('field-customer.email-error')).toHaveTextContent('That email cannot receive mail.'));
    expect(await screen.findByLabelText(/^WhatsApp number/)).toBeInTheDocument();
    await waitFor(() => expect(field(/^Email/)).toHaveFocus());
    expect(field(/^Full name/)).toHaveValue('Rami Haddad'); // nothing typed is lost
  });

  it('VALIDATION_ERROR without fields (honeypot): generic banner with the support code, no field marked (QA 18)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    post = (path, opts) => (path.endsWith('/orders') ? apiError('VALIDATION_ERROR', 400) : inner(path, opts));
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const banner = await screen.findByTestId('generic-error');
    expect(banner).toHaveTextContent('Something went wrong. Please try again.');
    expect(banner).toHaveTextContent('req-77');
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });

  it('RATE_LIMITED: countdown banner from retryAfterSeconds, button disabled with the wait (QA 29, 55)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    post = (path, opts) => (path.endsWith('/orders') ? apiError('RATE_LIMITED', 429, { retryAfterSeconds: 42 }) : inner(path, opts));
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const banner = await screen.findByTestId('rate-limit-banner');
    expect(banner).toHaveTextContent("You're doing that too fast. Try again in");
    expect(Number(screen.getByTestId('rate-countdown').textContent)).toBeGreaterThan(38);
    expect(placeButton()).toBeDisabled();
    expect(placeButton()).toHaveTextContent(/Try again in \d+s/);
  });

  it('500 and network failure: the panel offers Retry with the SAME key; the code line only when there is one (QA 24, 54)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    let n = 0;
    post = (path, opts) => {
      if (!path.endsWith('/orders')) return inner(path, opts);
      return n++ === 0 ? apiError('INTERNAL', 500) : inner(path, opts);
    };
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const panel = await screen.findByTestId('network-panel');
    expect(panel).toHaveTextContent("We couldn't confirm your order");
    expect(panel).toHaveTextContent("You won't be charged twice");
    expect(within(panel).getByTestId('request-id')).toHaveTextContent('req-77');
    expect(within(panel).getByRole('link', { name: /Track it with your phone number/ })).toHaveAttribute('href', '/track');
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    });
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(orderPosts()).toHaveLength(2);
    expect(orderPosts()[1]!.key).toBe(orderPosts()[0]!.key);
    expect(orderPosts()[1]!.body).toEqual(orderPosts()[0]!.body);
  });

  it('replays the stored key and exact body after the checkout view reloads', async () => {
    resetCart();
    const firstView = render(<CheckoutView />);
    await screen.findByTestId('checkout-form');
    await waitFor(() => expect(screen.getByLabelText(/^Area/)).toBeInTheDocument());
    await waitFor(() => expect(sent.some((s) => s.path.endsWith('/cart/validate'))).toBe(true));
    await fillValid();
    await waitFor(() => expect(window.sessionStorage.getItem('stimpy.checkout.draft')).toContain('Rami Haddad'));
    const inner = post;
    let n = 0;
    post = (path, opts) => {
      if (!path.endsWith('/orders')) return inner(path, opts);
      return n++ === 0 ? apiError('NETWORK', 0, { requestId: null }) : inner(path, opts);
    };
    await act(async () => fireEvent.click(placeButton()));
    await screen.findByTestId('network-panel');
    const original = orderPosts()[0]!;
    firstView.unmount();
    render(<CheckoutView />);
    const panel = await screen.findByTestId('network-panel');
    expect(panel).toHaveTextContent("You won't be charged twice");
    await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Retry' })));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/order/STP-1042/thanks'));
    expect(orderPosts()).toHaveLength(2);
    expect(orderPosts()[1]!.key).toBe(original.key);
    expect(orderPosts()[1]!.body).toEqual(original.body);
  });

  it('network failure shows no support code and keeps the cart and draft', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    post = (path, opts) => (path.endsWith('/orders') ? apiError('NETWORK', 0, { requestId: null }) : inner(path, opts));
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const panel = await screen.findByTestId('network-panel');
    expect(within(panel).queryByTestId('support-line')).toBeNull();
    expect(cartStore.getState().lines).toHaveLength(1);
    expect(field(/^Address/)).toHaveValue('Main street, building 5');
  });

  it('SOLD_OUT: dialog names the item, the cart line is marked unavailable, alternatives load (QA 26)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const items = [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 1, available: 0 }];
    const inner = post;
    let stage = 0;
    post = (path, opts) => {
      if (path.endsWith('/orders')) return apiError('SOLD_OUT', 409, { details: { items } });
      if (path.endsWith('/cart/validate') && stage > 0) {
        return { data: { ...validation(), ok: false, subtotalCents: 0, totalCents: 300, lines: [{ itemIndex: 0, ok: false, unitPriceCents: 1000, lineTotalCents: 1000, problems: items }] } };
      }
      stage++;
      return inner(path, opts);
    };
    get = (path, opts) => {
      if (path.endsWith('/products/stimpies')) return { data: [stimpie({ id: 8, slug: 'alt', name: 'THE EYE' })] };
      return defaultGet(path, opts);
    };
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const dialog = await screen.findByRole('dialog', { name: 'Sorry, THE VOID just sold out.' });
    expect(dialog).toHaveTextContent('Nothing was charged and nothing was reserved.');
    expect(await within(dialog).findByRole('button', { name: 'Swap in' })).toBeInTheDocument();
    await waitFor(() => expect(cartStore.getState().lines[0]?.check.state).toBe('UNAVAILABLE'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Swap in' }));
    await waitFor(() => expect(cartStore.getState().lines[0]?.item).toMatchObject({ kind: 'stimpie', stimpieId: 8 }));
  });

  it('NOT_PURCHASABLE: dialog with the reason copy per code (QA 27)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    const items = [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', reason: 'DROP_NOT_STARTED' }];
    let ordered = false;
    post = (path, opts) => {
      if (path.endsWith('/orders')) {
        ordered = true;
        return apiError('NOT_PURCHASABLE', 409, { details: { items } });
      }
      // like the real server, the follow-up validation reports the same problem
      if (ordered && path.endsWith('/cart/validate')) {
        return { data: { ...validation(), ok: false, subtotalCents: 0, totalCents: 300, lines: [{ itemIndex: 0, ok: false, unitPriceCents: 1000, lineTotalCents: 1000, problems: items }] } };
      }
      return inner(path, opts);
    };
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const dialog = await screen.findByRole('dialog', { name: "Some items can't be ordered right now" });
    expect(dialog).toHaveTextContent("THE VOID isn't on sale yet. The drop hasn't started.");
    await waitFor(() => expect(cartStore.getState().lines[0]?.check.state).toBe('UNAVAILABLE'));
  });

  it('PRICE_CHANGED: dialog shows old and new grand total, does not auto-resubmit; confirming uses the new total (QA 28, 51)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const inner = post;
    let first = true;
    post = (path, opts) => {
      if (path.endsWith('/orders') && first) {
        first = false;
        return apiError('PRICE_CHANGED', 422, { details: { totalCents: 1800 } });
      }
      if (path.endsWith('/cart/validate') && !first) return { data: { ...validation(), totalCents: 1800, subtotalCents: 1500 } };
      return inner(path, opts);
    };
    await act(async () => {
      fireEvent.click(placeButton());
    });
    const dialog = await screen.findByRole('dialog', { name: 'The price changed' });
    expect(within(dialog).getByTestId('price-old')).toHaveTextContent('$13');
    expect(within(dialog).getByTestId('price-new')).toHaveTextContent('$18');
    expect(orderPosts()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Place order for $18' }));
    });
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(orderPosts()).toHaveLength(2);
    expect(orderPosts()[1]!.body).toMatchObject({ expectedTotalCents: 1800 });
    expect(orderPosts()[1]!.key).not.toBe(orderPosts()[0]!.key);
  });

  it('offline: message, no request, values kept; the message clears when the connection returns (QA 23)', async () => {
    resetCart();
    await ready();
    await fillValid();
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      fireEvent.click(placeButton());
    });
    expect(await screen.findByTestId('offline-message')).toHaveTextContent("You're offline. Connect to place your order.");
    expect(orderPosts()).toHaveLength(0);
    spy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(screen.queryByTestId('offline-message')).toBeNull());
    spy.mockRestore();
  });

  it('WhatsApp same-as-phone: hidden with a hint; unticking shows a pre-filled field; re-ticking discards it (QA 16)', async () => {
    resetCart();
    await ready();
    fireEvent.change(field(/^Phone/), { target: { value: '03 123 456' } });
    expect(screen.getByTestId('whatsapp-hint')).toHaveTextContent("We'll use 03 123 456 on WhatsApp.");
    expect(screen.queryByLabelText(/^WhatsApp number/)).toBeNull();
    fireEvent.click(screen.getByLabelText('WhatsApp is the same as my phone number'));
    const wa = await screen.findByLabelText(/^WhatsApp number/);
    expect(wa).toHaveValue('03 123 456');
    await waitFor(() => expect(wa).toHaveFocus());
    fireEvent.change(wa, { target: { value: '70 123 456' } });
    fireEvent.click(screen.getByLabelText('WhatsApp is the same as my phone number'));
    expect(screen.queryByLabelText(/^WhatsApp number/)).toBeNull();
    fireEvent.click(screen.getByLabelText('WhatsApp is the same as my phone number'));
    expect(await screen.findByLabelText(/^WhatsApp number/)).toHaveValue('03 123 456');
  });

  it('area choice updates the delivery line and total immediately; Other uses the default fee and sends no areaId (QA 17)', async () => {
    resetCart();
    await ready();
    expect(screen.getByTestId('summary-delivery')).toHaveTextContent('from $3');
    expect(screen.getByTestId('summary-total-label')).toHaveTextContent('Estimated total');
    fireEvent.change(field(/^Area/), { target: { value: '2' } });
    expect(screen.getByTestId('summary-delivery-label')).toHaveTextContent('Delivery to North');
    expect(screen.getByTestId('summary-delivery')).toHaveTextContent('$5');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('$15');
    expect(screen.getByTestId('summary-estimate')).toHaveTextContent('about 4 days');
    fireEvent.change(field(/^Area/), { target: { value: 'other' } });
    expect(screen.getByTestId('summary-delivery')).toHaveTextContent('$3');
    expect(field(/^Your area or town/)).toBeInTheDocument();
  });

  it('draft: restored after a reload (without the honeypot) and cleared on a successful order (QA 19)', async () => {
    resetCart();
    await ready();
    fireEvent.change(field(/^Full name/), { target: { value: 'Rami Haddad' } });
    fireEvent.change(field(/^Address/), { target: { value: 'Main street, building 5' } });
    await waitFor(() => expect(window.sessionStorage.getItem('stimpy.checkout.draft')).toContain('Rami Haddad'), { timeout: 2000 });
    expect(window.sessionStorage.getItem('stimpy.checkout.draft')).not.toMatch(/website_url|"hp"/);
    document.body.innerHTML = '';
    cleanupAndRender: {
      resetCart();
      render(<CheckoutView />);
      await waitFor(() => expect(field(/^Full name/)).toHaveValue('Rami Haddad'));
      expect(field(/^Address/)).toHaveValue('Main street, building 5');
      break cleanupAndRender;
    }
  });

  it('quantity changes and removing a line re-validate with the chosen area (1.6)', async () => {
    resetCart();
    await ready();
    fireEvent.change(field(/^Area/), { target: { value: '2' } });
    await waitFor(() => expect(sent.filter((s) => s.path.endsWith('/cart/validate')).some((s) => s.body?.areaId === 2)).toBe(true));
    const before = sent.filter((s) => s.path.endsWith('/cart/validate')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => expect(sent.filter((s) => s.path.endsWith('/cart/validate')).length).toBeGreaterThan(before), { timeout: 3000 });
    const last = sent.filter((s) => s.path.endsWith('/cart/validate')).at(-1)!;
    expect(last.body).toMatchObject({ areaId: 2, items: [{ kind: 'stimpie', stimpieId: 4, qty: 2 }] });
  });
});
