import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type PlacedOrder, type TrackedOrder } from '@stimpy/api-client';
import { resetMemoryStorage } from '@/lib/storage';

let postImpl: (path: string, opts: { body: Record<string, unknown> }) => Promise<unknown> = async () => ({});
const posts: { path: string; body: Record<string, unknown> }[] = [];
vi.mock('@/lib/api-browser', () => ({
  browserApi: () => ({
    POST: (path: string, opts: { body: Record<string, unknown> }) => {
      posts.push({ path, body: opts.body });
      return postImpl(path, opts);
    },
    GET: async () => ({ data: undefined }),
  }),
}));

import { ThanksView, trackPath } from '@/features/order/ThanksView';
import { saveOrderHandoff, readOrderHandoff, lastOrderNumber, isValidOrderNumber, ORDER_KEY_PREFIX } from '@/features/order/handoff';
import { TrackView } from '@/features/track/TrackView';
import { visibleSteps } from '@/features/track/logic';

const business = { name: 'Stimpy', whatsappNumber: '+96170123456', supportEmail: 'hello@stimpy.local', instagramUrl: null, timezone: 'Asia/Beirut' };

const placed = (over: Partial<PlacedOrder> = {}): PlacedOrder => ({
  order: {
    number: 'STP-1042',
    status: 'NEW',
    placedAt: '2026-10-14T09:30:00.000Z',
    customerName: 'Rami Haddad',
    contactEmail: 'rami@example.com',
    items: [{ id: 1, kind: 'PACK', name: 'Hoodie + 2 Stimpies', qty: 1, unitPriceCents: 4500, lineTotalCents: 4500, details: { hoodie: 'Stimpy Hoodie', color: 'Black', size: 'M', stimpies: ['THE VOID', 'THE ORBIT'] } }],
    subtotalCents: 4500,
    deliveryFeeCents: 300,
    totalCents: 4800,
    estimateText: '2-3 working days',
  },
  whatsappUrl: 'https://wa.me/96170123456?text=Hi',
  trackUrl: 'http://localhost:3000/track?order=STP-1042',
  ...over,
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  resetMemoryStorage();
  posts.length = 0;
  postImpl = async () => ({});
  window.history.replaceState({}, '', '/');
});
afterEach(() => vi.useRealTimers());

describe('confirmation page (5)', () => {
  it('renders the stored response: number, estimate, totals, WhatsApp button, email notice, track link', async () => {
    saveOrderHandoff(placed());
    render(<ThanksView number="STP-1042" business={business} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Order placed' })).toHaveFocus();
    expect(screen.getByTestId('order-number')).toHaveTextContent('STP-1042');
    expect(screen.getByTestId('estimate')).toHaveTextContent('Delivery: 2-3 working days.');
    expect(screen.getByTestId('total')).toHaveTextContent('$48');
    expect(screen.getByTestId('delivery-fee')).toHaveTextContent('$3');
    const wa = screen.getByTestId('confirm-whatsapp');
    expect(wa).toHaveAttribute('href', 'https://wa.me/96170123456?text=Hi');
    expect(wa).toHaveAttribute('target', '_blank');
    expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByTestId('email-notice')).toHaveTextContent('rami@example.com');
    expect(screen.getByRole('link', { name: 'Wrong email? Contact us (opens in a new tab)' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/96170123456/);
    expect(screen.getByTestId('track-link')).toHaveAttribute('href', '/track?order=STP-1042');
    expect(screen.getByText('Pay cash at the door.', { selector: 'p' })).toBeInTheDocument();
  });

  it('whatsappUrl null: no WhatsApp button, the "we will message you" text instead (QA 5.3)', async () => {
    saveOrderHandoff(placed({ whatsappUrl: null }));
    render(<ThanksView number="STP-1042" business={business} />);
    await screen.findByTestId('order-number');
    expect(screen.queryByTestId('confirm-whatsapp')).toBeNull();
    expect(screen.getAllByText(/We'll message you on WhatsApp to confirm\./).length).toBeGreaterThan(0);
  });

  it('shows the estimate text exactly as returned (QA 57)', async () => {
    saveOrderHandoff(placed({ order: { ...placed().order, estimateText: '4 working days' } }));
    render(<ThanksView number="STP-1042" business={business} />);
    expect(await screen.findByTestId('estimate')).toHaveTextContent('Delivery: 4 working days.');
  });

  it('nothing stored (another tab/device): reduced view with Track and WhatsApp, never items or personal data (QA 34)', async () => {
    render(<ThanksView number="STP-1042" business={business} />);
    const reduced = await screen.findByTestId('thanks-reduced');
    expect(reduced).toHaveTextContent("We can't show the full details here. Track your order with your phone number.");
    expect(screen.getByTestId('track-this-order')).toHaveAttribute('href', '/track?order=STP-1042');
    expect(screen.getByRole('link', { name: /Contact us on WhatsApp/ })).toHaveAttribute('href', expect.stringContaining('wa.me/96170123456'));
    expect(screen.queryByText(/Hoodie/)).toBeNull();
    expect(screen.queryByText(/rami@example.com/)).toBeNull();
  });

  it('corrupt or mismatching stored data falls back to the reduced view', async () => {
    window.sessionStorage.setItem(`${ORDER_KEY_PREFIX}STP-1042`, '{not json');
    const { unmount } = render(<ThanksView number="STP-1042" business={business} />);
    expect(await screen.findByTestId('thanks-reduced')).toBeInTheDocument();
    unmount();
    saveOrderHandoff(placed({ order: { ...placed().order, number: 'STP-9999' } }));
    window.sessionStorage.setItem(`${ORDER_KEY_PREFIX}STP-1042`, window.sessionStorage.getItem(`${ORDER_KEY_PREFIX}STP-9999`)!);
    render(<ThanksView number="STP-1042" business={business} />);
    expect(await screen.findByTestId('thanks-reduced')).toBeInTheDocument();
  });

  it('copy button: "Copied" after a successful copy, "Press and hold to copy" when the clipboard is blocked (QA 36)', async () => {
    saveOrderHandoff(placed());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ThanksView number="STP-1042" business={business} />);
    const copy = await screen.findByTestId('copy-order-number');
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalledWith('STP-1042');
    expect(copy).toHaveTextContent('Copied');
    // blocked: no async API and execCommand fails
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    await act(async () => {
      fireEvent.click(copy);
    });
    await waitFor(() => expect(copy).toHaveTextContent('Press and hold to copy'));
    // the number is plain selectable text too
    expect(screen.getByTestId('order-number')).toHaveTextContent('STP-1042');
  });

  it('handoff helpers: number pattern, last order, track path', () => {
    expect(isValidOrderNumber('STP-1042')).toBe(true);
    expect(isValidOrderNumber('ab')).toBe(false);
    expect(isValidOrderNumber('x'.repeat(21))).toBe(false);
    expect(isValidOrderNumber('STP 1042')).toBe(false);
    expect(isValidOrderNumber('../etc')).toBe(false);
    saveOrderHandoff(placed());
    expect(lastOrderNumber()).toBe('STP-1042');
    expect(readOrderHandoff('stp-1042')?.order.number).toBe('STP-1042');
    expect(trackPath('http://x/track?order=STP-1', 'STP-1')).toBe('/track?order=STP-1');
    expect(trackPath(null, 'STP-1')).toBe('/track?order=STP-1');
    expect(trackPath('https://evil.example/phish', 'STP-1')).toBe('/track?order=STP-1');
  });
});

/* ------------------------------------------------------------------------------- tracking */

const tracked = (over: Partial<TrackedOrder> = {}): TrackedOrder => ({
  number: 'STP-1042',
  status: 'NEW',
  placedAt: '2026-10-14T09:30:00.000Z',
  customerName: 'Rami Haddad',
  items: placed().order.items,
  subtotalCents: 4500,
  deliveryFeeCents: 300,
  totalCents: 4800,
  deliveryNumber: null,
  timeline: [{ status: 'NEW', at: '2026-10-14T09:30:00.000Z' }],
  estimateText: '2-3 working days',
  whatsappNumber: '+96170123456',
  ...over,
});

const apiError = (code: ApiError['code'], status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status, code, message: 'm', requestId: 'req-1', ...extra });

function fillTrack(order: string, phone: string) {
  fireEvent.change(screen.getByLabelText(/^Order number/), { target: { value: order } });
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: phone } });
  fireEvent.click(screen.getByTestId('track-submit'));
}

describe('track page (6)', () => {
  it('prefills the order number from ?order= and from the last order in this tab', async () => {
    window.history.replaceState({}, '', '/track?order=stp-1042');
    const { unmount } = render(<TrackView business={business} />);
    await waitFor(() => expect(screen.getByLabelText(/^Order number/)).toHaveValue('STP-1042'));
    unmount();
    window.history.replaceState({}, '', '/track');
    saveOrderHandoff(placed({ order: { ...placed().order, number: 'STP-2000' } }));
    render(<TrackView business={business} />);
    await waitFor(() => expect(screen.getByLabelText(/^Order number/)).toHaveValue('STP-2000'));
    expect(screen.getByLabelText(/^Order number/)).toHaveAttribute('autocapitalize', 'characters');
    expect(screen.getByLabelText(/^Order number/)).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText(/^Phone/)).toHaveAttribute('inputmode', 'tel');
  });

  it('client validation: messages for a missing number and phone; nothing is sent', async () => {
    render(<TrackView business={business} />);
    fireEvent.click(screen.getByTestId('track-submit'));
    expect(await screen.findByText('Enter your order number.')).toBeInTheDocument();
    expect(screen.getByText('Enter the phone number you ordered with.')).toBeInTheDocument();
    fillTrack('STP-1', '123');
    expect(await screen.findByText(/Enter a Lebanese phone number/)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('sends the number as typed (trimmed) and the phone as typed; shows the result with the timeline', async () => {
    postImpl = async () => ({ data: tracked() });
    render(<TrackView business={business} />);
    fillTrack(' stp-1042 ', '+961 3 123 456');
    expect(await screen.findByTestId('track-heading')).toHaveTextContent("Hi Rami Haddad, here's order STP-1042");
    expect(posts[0]).toEqual({ path: '/api/v1/orders/track', body: { orderNumber: 'stp-1042', phone: '+961 3 123 456' } });
    const steps = within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Received'),
      expect.stringContaining('Confirmed'),
      expect.stringContaining('Packed'),
      expect.stringContaining('Out for delivery'),
      expect.stringContaining('Delivered'),
    ]);
    expect(screen.getByTestId('track-estimate')).toHaveTextContent('2-3 working days');
    expect(screen.getByText('Pay cash at the door.')).toBeInTheDocument();
    // delivery number card never appears (and the words are never used) before dispatch (QA 39)
    expect(screen.queryByTestId('delivery-number-card')).toBeNull();
    expect(screen.queryByText(/delivery number/i)).toBeNull();
  });

  it('delivery number card appears only when deliveryNumber is not null, with its copy button', async () => {
    postImpl = async () => ({
      data: tracked({
        status: 'OUT_FOR_DELIVERY',
        deliveryNumber: 'D-88231',
        timeline: ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].map((status) => ({ status: status as TrackedOrder['status'], at: '2026-10-14T09:30:00.000Z' })),
      }),
    });
    render(<TrackView business={business} />);
    fillTrack('1042', '03 123 456');
    const card = await screen.findByTestId('delivery-number-card');
    expect(within(card).getByTestId('delivery-number')).toHaveTextContent('D-88231');
    expect(card).toHaveTextContent('Your parcel is with delivery. Quote this number if the courier calls.');
    expect(within(card).getByRole('button', { name: 'Copy delivery number' })).toBeInTheDocument();
  });

  it('DELIVERED: no estimate and no "pay at the door" line', async () => {
    postImpl = async () => ({ data: tracked({ status: 'DELIVERED', deliveryNumber: 'D-1', timeline: ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].map((status) => ({ status: status as TrackedOrder['status'], at: '2026-10-14T09:30:00.000Z' })) }) });
    render(<TrackView business={business} />);
    fillTrack('1042', '03 123 456');
    await screen.findByTestId('track-heading');
    expect(screen.queryByTestId('track-estimate')).toBeNull();
    expect(screen.queryByText('Pay cash at the door.')).toBeNull();
  });

  it('cancelled: banner with a WhatsApp button, later steps hidden (QA 40)', async () => {
    const t = tracked({ status: 'CANCELLED', timeline: [{ status: 'NEW', at: '2026-10-14T09:30:00.000Z' }, { status: 'CANCELLED', at: '2026-10-14T10:30:00.000Z' }] });
    expect(visibleSteps(t).map((s) => s.status)).toEqual(['NEW']);
    postImpl = async () => ({ data: t });
    render(<TrackView business={business} />);
    fillTrack('1042', '03 123 456');
    const banner = await screen.findByTestId('track-terminal');
    expect(banner).toHaveTextContent('This order was cancelled.');
    expect(within(banner).getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent).join(' ')).not.toMatch(/Confirmed|Packed|Out for delivery|Delivered/);
    expect(screen.queryByTestId('track-estimate')).toBeNull();
  });

  it('returned: banner copy for returns', async () => {
    postImpl = async () => ({ data: tracked({ status: 'RETURNED', timeline: ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'].map((status) => ({ status: status as TrackedOrder['status'], at: '2026-10-14T09:30:00.000Z' })) }) });
    render(<TrackView business={business} />);
    fillTrack('1042', '03 123 456');
    expect(await screen.findByTestId('track-terminal')).toHaveTextContent('This order was returned.');
  });

  it('404 gives one identical message whatever was wrong, keeps both fields filled (QA 38)', async () => {
    postImpl = async () => {
      throw apiError('NOT_FOUND', 404);
    };
    render(<TrackView business={business} />);
    fillTrack('STP-1', '03 123 456');
    const first = (await screen.findByTestId('track-not-found')).textContent;
    expect(first).toContain("We couldn't find an order with those details. Check the order number and use the phone number you ordered with.");
    expect(screen.getByLabelText(/^Order number/)).toHaveValue('STP-1');
    expect(screen.getByLabelText(/^Phone/)).toHaveValue('03 123 456');
    // another wrong combination: the same message
    fillTrack('STP-999999', '70 111 222');
    await waitFor(() => expect(posts).toHaveLength(2));
    expect((await screen.findByTestId('track-not-found')).textContent).toBe(first);
  });

  it('429: "Too many tries. Please wait n seconds." and the button is disabled until the wait is over (QA 43)', async () => {
    postImpl = async () => {
      throw apiError('RATE_LIMITED', 429, { retryAfterSeconds: 12 });
    };
    render(<TrackView business={business} />);
    fillTrack('STP-1', '03 123 456');
    expect(await screen.findByTestId('track-rate-limited')).toHaveTextContent(/Too many tries\. Please wait \d+ seconds\./);
    expect(screen.getByTestId('track-submit')).toBeDisabled();
    expect(screen.getByTestId('track-submit')).toHaveTextContent(/Try again in \d+s/);
  });

  it('network or 5xx: "Couldn\'t reach the server. Try again." with Retry', async () => {
    let fail = true;
    postImpl = async () => {
      if (fail) throw apiError('NETWORK', 0);
      return { data: tracked() };
    };
    render(<TrackView business={business} />);
    fillTrack('STP-1', '03 123 456');
    const note = await screen.findByTestId('track-network');
    expect(note).toHaveTextContent("Couldn't reach the server. Try again.");
    fail = false;
    fireEvent.click(within(note).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('track-heading')).toBeInTheDocument();
  });

  it('server VALIDATION_ERROR fields land under the matching inputs', async () => {
    postImpl = async () => {
      throw apiError('VALIDATION_ERROR', 400, { fields: { phone: 'Enter a Lebanese phone number.' } });
    };
    render(<TrackView business={business} />);
    fillTrack('STP-1', '03 123 456');
    expect(await screen.findByText('Enter a Lebanese phone number.')).toBeInTheDocument();
  });

  it('"Track another order" resets the form and drops the result', async () => {
    postImpl = async () => ({ data: tracked() });
    render(<TrackView business={business} />);
    fillTrack('STP-1', '03 123 456');
    await screen.findByTestId('track-heading');
    fireEvent.click(screen.getByTestId('track-another'));
    expect(screen.queryByTestId('track-result')).toBeNull();
    expect(screen.getByLabelText(/^Phone/)).toHaveValue('');
  });
});

describe('"Lost your order number?" (6.3)', () => {
  const MESSAGE = "If we found orders for this email, we've emailed you the order numbers.";

  async function open() {
    render(<TrackView business={business} />);
    fireEvent.click(screen.getByTestId('lost-number-toggle'));
    return screen.findByTestId('lost-number-form');
  }

  it('validates the email shape, then shows exactly the response message for any email', async () => {
    postImpl = async () => ({ data: { message: MESSAGE } });
    const form = await open();
    fireEvent.click(within(form).getByRole('button', { name: /Email me/ }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.change(within(form).getByLabelText(/^Email/), { target: { value: 'known@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: /Email me/ }));
    const msg = await screen.findByTestId('lost-number-message');
    expect(msg).toHaveTextContent(MESSAGE);
    expect(msg).toHaveAttribute('role', 'status');
    expect(posts[0]).toEqual({ path: '/api/v1/orders/find', body: { email: 'known@example.com' } });
    expect(screen.queryByTestId('lost-number-form')).toBeNull(); // collapsed after success
  });

  it('an unknown email shows the identical message (no branching on the result)', async () => {
    postImpl = async () => ({ data: { message: MESSAGE } });
    const first = await open();
    fireEvent.change(within(first).getByLabelText(/^Email/), { target: { value: 'nobody@example.com' } });
    fireEvent.click(within(first).getByRole('button', { name: /Email me/ }));
    expect((await screen.findByTestId('lost-number-message')).textContent).toBe(MESSAGE);
    expect(screen.queryByText(/no orders/i)).toBeNull();
  });

  it('429 shows the generic wait message, a network failure a retry message', async () => {
    postImpl = async () => {
      throw apiError('RATE_LIMITED', 429, { retryAfterSeconds: 30 });
    };
    const form = await open();
    fireEvent.change(within(form).getByLabelText(/^Email/), { target: { value: 'a@b.co' } });
    fireEvent.click(within(form).getByRole('button', { name: /Email me/ }));
    expect(await screen.findByTestId('lost-rate-limited')).toHaveTextContent(/Too many tries\. Please wait \d+ seconds\./);
  });

  it('network failure: retry message and the form stays', async () => {
    postImpl = async () => {
      throw apiError('NETWORK', 0);
    };
    const form = await open();
    fireEvent.change(within(form).getByLabelText(/^Email/), { target: { value: 'a@b.co' } });
    fireEvent.click(within(form).getByRole('button', { name: /Email me/ }));
    expect(await screen.findByTestId('lost-network')).toHaveTextContent("Couldn't reach the server. Try again.");
    expect(screen.getByTestId('lost-number-form')).toBeInTheDocument();
  });
});
