import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AdjustDialog, parseWholeNumber, type AdjustTarget } from '../src/pages/stock/AdjustDialog';
import { cellState } from '../src/pages/stock/HoodiesTab';
import { FeesTab } from '../src/pages/deliveries/FeesTab';
import { DeliveredTab } from '../src/pages/deliveries/DeliveredTab';
import { CashTab } from '../src/pages/finance/CashTab';
import { CustomersList } from '../src/pages/customers/CustomersList';
import { CustomerDetailPage } from '../src/pages/customers/CustomerDetail';
import { apiError, json, stubFetch, TestApp, Wrapper } from './helpers';
import { emptyPage, forceDesktop, makeSummary } from './orderFixtures';

let restore: () => void = () => undefined;
beforeEach(() => forceDesktop());
afterEach(() => restore());

/* ----------------------------------------------------------------------------------- stock */

const TARGET: AdjustTarget = { itemType: 'HOODIE_VARIANT', itemId: 11, name: 'Stimpy Hoodie, Black, M', quantity: 5, reserved: 2, available: 3 };

function renderAdjust(handlers: Record<string, (req: Request) => Response | Promise<Response>> = {}) {
  const stub = stubFetch(handlers);
  restore = stub.restore;
  let closed = 0;
  render(
    <Wrapper>
      <AdjustDialog target={TARGET} onClose={() => (closed += 1)} />
    </Wrapper>,
  );
  return { ...stub, closed: () => closed };
}

describe('stock helpers', () => {
  it('cell states: sold out at 0, low at the threshold, ok above', () => {
    expect(cellState(0, 10)).toBe('sold-out');
    expect(cellState(10, 10)).toBe('low');
    expect(cellState(11, 10)).toBe('ok');
  });
  it('parses whole numbers with an optional minus only', () => {
    expect(parseWholeNumber('-3')).toBe(-3);
    expect(parseWholeNumber(' 12 ')).toBe(12);
    expect(parseWholeNumber('1.5')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
  });
});

describe('adjust stock dialog', () => {
  it('requires a non-zero change and a note', () => {
    const { calls } = renderAdjust();
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(screen.getByText(/Enter a whole number other than 0/)).toBeInTheDocument();
    expect(screen.getByText('Add a note so we know why the stock changed.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('a restock must be positive and damaged must be negative', () => {
    renderAdjust();
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '-2' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'count' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(screen.getByText('A restock adds units: enter a positive number.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'DAMAGED' } });
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(screen.getByText('Damaged units are removed: enter a negative number.')).toBeInTheDocument();
  });

  it('shows the preview line and the "Sold out" notice when available would be 0', () => {
    renderAdjust();
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '-3' } });
    const preview = screen.getByTestId('stock-preview');
    expect(preview).toHaveTextContent('On hand 5 → 2. Available 0.');
    expect(preview).toHaveTextContent('This will show as Sold out on the website.');
  });

  it('refuses to go below reserved on the client and maps the server CONFLICT', async () => {
    renderAdjust({ 'POST /api/v1/admin/stock/adjust': () => apiError(409, 'CONFLICT', 'Reserved.') });
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '-4' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'CORRECTION' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'recount' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(screen.getByText('That would lower stock below the quantity committed to open orders.')).toBeInTheDocument();
  });

  it('the server CONFLICT is shown on the field and the dialog stays open', async () => {
    const { closed } = renderAdjust({ 'POST /api/v1/admin/stock/adjust': () => apiError(409, 'CONFLICT', 'Reserved.') });
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '-3' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'DAMAGED' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'water damage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(await screen.findByText('That would lower stock below the quantity committed to open orders.')).toBeInTheDocument();
    expect(closed()).toBe(0);
  });

  it('a large change asks for a second confirmation, then sends the adjust body', async () => {
    let body: unknown = null;
    const { closed } = renderAdjust({
      'POST /api/v1/admin/stock/adjust': async (req) => {
        body = await req.json();
        return json({ quantity: 205, reserved: 2, available: 203 });
      },
    });
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'new delivery from the factory' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    expect(await screen.findByText('Add 200 units?')).toBeInTheDocument();
    expect(body).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, save adjustment' }));
    await waitFor(() => expect(closed()).toBe(1));
    expect(body).toEqual({ itemType: 'HOODIE_VARIANT', itemId: 11, delta: 200, reason: 'RESTOCK', note: 'new delivery from the factory' });
  });

  it('Set total sends quantity and note to /stock/set', async () => {
    let body: unknown = null;
    renderAdjust({
      'POST /api/v1/admin/stock/set': async (req) => {
        body = await req.json();
        return json({ quantity: 9, reserved: 2, available: 7 });
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Set total' }));
    fireEvent.change(screen.getByLabelText(/^New total/), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'stock take' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    await waitFor(() => expect(body).toEqual({ itemType: 'HOODIE_VARIANT', itemId: 11, quantity: 9, note: 'stock take' }));
  });

  it('keeps reserved counts read-only and only sends on-hand stock adjustments', async () => {
    let body: unknown = null;
    const { closed } = renderAdjust({
      'POST /api/v1/admin/stock/adjust': async (req) => {
        body = await req.json();
        return json({ quantity: 4, reserved: 2, available: 2 });
      },
    });
    expect(screen.queryByRole('tab', { name: 'Reserved' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Adjust reserved/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Change/), { target: { value: '-1' } });
    expect(screen.getByTestId('stock-preview')).toHaveTextContent('On hand 5 → 4. Available 2.');
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'damaged unit' } });
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'DAMAGED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    await waitFor(() => expect(closed()).toBe(1));
    expect(body).toEqual({
      itemType: 'HOODIE_VARIANT',
      itemId: 11,
      delta: -1,
      reason: 'DAMAGED',
      note: 'damaged unit',
    });
  });
});
/* ------------------------------------------------------------------------------ deliveries */

const AREA = { id: 3, name: 'Jounieh', feeCents: 500, estDays: 2, active: true };

function renderFees(extra: Record<string, (req: Request) => Response | Promise<Response>> = {}) {
  const stub = stubFetch({
    'GET /api/v1/admin/settings/delivery': () => json({ defaultFeeCents: 300, estimateText: '2-3 working days' }),
    'GET /api/v1/admin/areas': () => json(emptyPage([AREA, { id: 4, name: 'Beirut', feeCents: null, estDays: null, active: true }], 100)),
    ...extra,
  });
  restore = stub.restore;
  render(<TestApp routes={[{ path: '/', element: <FeesTab /> }]} />);
  return stub;
}

describe('delivery fees', () => {
  it('shows the default fee and "Uses default fee" for areas without one', async () => {
    renderFees();
    expect(await screen.findByDisplayValue('3.00')).toBeInTheDocument();
    expect(await screen.findByText('Uses default fee')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('validates the default fee and sends cents', async () => {
    let body: unknown = null;
    renderFees({
      'PATCH /api/v1/admin/settings/delivery': async (req) => {
        body = await req.json();
        return json({ defaultFeeCents: 350, estimateText: '3 days' });
      },
    });
    const fee = await screen.findByLabelText(/^Default delivery fee/);
    fireEvent.change(fee, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery settings' }));
    expect((await screen.findAllByText('Enter an amount like 12.50.')).length).toBeGreaterThan(0);
    expect(body).toBeNull();
    fireEvent.change(fee, { target: { value: '3.50' } });
    fireEvent.change(screen.getByLabelText(/^Delivery estimate/), { target: { value: '3 days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery settings' }));
    await waitFor(() => expect(body).toEqual({ defaultFeeCents: 350, estimateText: '3 days' }));
  });

  it('adds an area with a blank fee as null (default fee) and validates the name', async () => {
    let body: unknown = null;
    renderFees({
      'POST /api/v1/admin/areas': async (req) => {
        body = await req.json();
        return json({ id: 9, name: 'Saida', feeCents: null, estDays: 3, active: true }, 201);
      },
    });
    const form = await screen.findByRole('form', { name: 'Add an area' });
    fireEvent.click(within(form).getByRole('button', { name: 'Add area' }));
    expect(within(form).getByText('Enter the area name.')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Area name/), { target: { value: 'Saida' } });
    fireEvent.change(within(form).getByLabelText(/^Estimated days/), { target: { value: '3' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add area' }));
    await waitFor(() => expect(body).toEqual({ name: 'Saida', feeCents: null, estDays: 3, active: true }));
  });

  it('shows the placeholder with the current default and rejects a bad fee or day count', async () => {
    renderFees();
    const form = await screen.findByRole('form', { name: 'Add an area' });
    expect(within(form).getByPlaceholderText('Default ($3.00)')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Area name/), { target: { value: 'X' } });
    fireEvent.change(within(form).getByLabelText(/^Fee/), { target: { value: '1.234' } });
    fireEvent.change(within(form).getByLabelText(/^Estimated days/), { target: { value: '99' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add area' }));
    expect(within(form).getByText('Enter an amount like 3.00, or leave it blank.')).toBeInTheDocument();
    expect(within(form).getByText('Enter a whole number from 0 to 30, or leave it blank.')).toBeInTheDocument();
  });

  it('deleting an area used by orders offers to hide it instead', async () => {
    let patched: unknown = null;
    renderFees({
      'DELETE /api/v1/admin/areas/3': () => apiError(409, 'CONFLICT', 'Used by past orders. Hide it instead.'),
      'PATCH /api/v1/admin/areas/3': async (req) => {
        patched = await req.json();
        return json({ ...AREA, active: false });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Jounieh' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete area' }));
    const next = await screen.findByText('Used by past orders. Hide it instead.');
    expect(next).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide instead' }));
    await waitFor(() => expect(patched).toEqual({ active: false }));
  });
});

describe('cash settlement per delivery number', () => {
  const rows = [
    { orderId: 1, orderNumber: 'STP-1001', deliveryNumber: 'D-88231', customerName: 'A', phone: '+9611', areaName: 'Beirut', address: 'x', cashDueCents: 5800, status: 'DELIVERED', cashSettled: false },
    { orderId: 2, orderNumber: 'STP-1002', deliveryNumber: 'D-88231', customerName: 'B', phone: '+9612', areaName: 'Beirut', address: 'y', cashDueCents: 4800, status: 'DELIVERED', cashSettled: false },
  ];

  it('confirms with the amount, settles the whole delivery number and offers Undo', async () => {
    const bodies: unknown[] = [];
    const stub = stubFetch({
      'GET /api/v1/admin/deliveries': (req) => {
        const query = new URL(req.url).searchParams;
        return json({ items: rows, page: Number(query.get('page') ?? 1), pageSize: Number(query.get('pageSize') ?? 25), total: rows.length });
      },
      'POST /api/v1/admin/deliveries/D-88231/settle': async (req) => {
        bodies.push(await req.json());
        return json({ orderIds: [1, 2] });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <DeliveredTab /> }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark delivery settled' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Mark all 2 orders on D-88231 as settled? You received $106.00.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark settled' }));
    await waitFor(() => expect(bodies).toEqual([{ settled: true }]));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(bodies).toEqual([{ settled: true }, { settled: false }]));
  });

  it('confirms the complete delivery group when it spans more than one visible page', async () => {
    const allRows = Array.from({ length: 101 }, (_, index) => ({
      ...rows[0]!,
      orderId: index + 1,
      orderNumber: `STP-${1100 + index}`,
      customerName: `Customer ${index + 1}`,
      cashDueCents: 100,
    }));
    let settleBody: unknown = null;
    const stub = stubFetch({
      'GET /api/v1/admin/deliveries': (req) => {
        const query = new URL(req.url).searchParams;
        const page = Number(query.get('page') ?? 1);
        const pageSize = Number(query.get('pageSize') ?? 25);
        if (!query.has('q')) return json({ items: [allRows[0]], page, pageSize, total: allRows.length });
        const start = (page - 1) * pageSize;
        return json({ items: allRows.slice(start, start + pageSize), page, pageSize, total: allRows.length });
      },
      'POST /api/v1/admin/deliveries/D-88231/settle': async (req) => {
        settleBody = await req.json();
        return json({ orderIds: allRows.map((row) => row.orderId) });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <DeliveredTab /> }]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark delivery settled' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Mark all 101 orders on D-88231 as settled? You received $101.00.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark settled' }));
    await waitFor(() => expect(settleBody).toEqual({ settled: true }));
    const groupPages = stub.calls.filter((call) => new URL(call.url).searchParams.has('q')).map((call) => new URL(call.url).searchParams.get('page'));
    expect(groupPages).toEqual(['1', '2', '1']);
  });

  it('Finance cash confirmation resolves the full delivery group beyond recent cash rows', async () => {
    const delivered = Array.from({ length: 101 }, (_, index) => ({
      ...rows[0]!,
      orderId: index + 1,
      orderNumber: `STP-${1200 + index}`,
      cashDueCents: 100,
      cashSettled: index < 100,
    }));
    const groupBodies: unknown[] = [];
    const orderBodies: unknown[] = [];
    const order101 = { id: 101 };
    const stub = stubFetch({
      'GET /api/v1/admin/finance/cash': () => json({
        outstandingCents: 100,
        groups: { items: [{ deliveryNumber: 'D-88231', orders: [{ orderId: 101, orderNumber: 'STP-1300', cashDueCents: 100, settled: false }], totalDueCents: 100 }], page: 1, pageSize: 100, total: 1 },
      }),
      'GET /api/v1/admin/deliveries': (req) => {
        const query = new URL(req.url).searchParams;
        const page = Number(query.get('page') ?? 1);
        const pageSize = Number(query.get('pageSize') ?? 100);
        const start = (page - 1) * pageSize;
        return json({ items: delivered.slice(start, start + pageSize), page, pageSize, total: delivered.length });
      },
      'POST /api/v1/admin/deliveries/D-88231/settle': async (req) => {
        groupBodies.push(await req.json());
        // The server flips only the unsettled order (deliveries service `settleDelivery`).
        return json({ orderIds: [101] });
      },
      'POST /api/v1/admin/orders/101/cash': async (req) => {
        orderBodies.push(await req.json());
        return json({ ...order101 });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <CashTab /> }]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark delivery settled' }));
    const dialog = await screen.findByRole('alertdialog');
    // 100 orders were settled earlier: only the remaining one is marked, and only its cash is received
    // (DECISIONS.md: a group's due amount is the sum of its UNSETTLED orders).
    expect(dialog).toHaveTextContent('Mark 1 unsettled order on D-88231 as settled? You received $1.00.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark settled' }));
    await waitFor(() => expect(groupBodies).toEqual([{ settled: true }]));
    // Undo reverts only the order this action changed, never the 100 settled before it.
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(orderBodies).toEqual([{ settled: false }]));
    expect(groupBodies).toEqual([{ settled: true }]);
  });

  it('orders without a delivery number are settled one by one through /cash', async () => {
    const bodies: unknown[] = [];
    const stub = stubFetch({
      'GET /api/v1/admin/deliveries': () => json(emptyPage([{ ...rows[0]!, deliveryNumber: null }])),
      'POST /api/v1/admin/orders/1/cash': async (req) => {
        bodies.push(await req.json());
        return json({ ...makeSummary(), id: 1 });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <DeliveredTab /> }]} />);
    expect(screen.queryByRole('button', { name: 'Mark delivery settled' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark settled' }));
    await waitFor(() => expect(bodies).toEqual([{ settled: true }]));
  });
});

/* ------------------------------------------------------------------------------- customers */

const CUSTOMER = { id: 7, name: 'Rami Haddad', email: 'rami@example.com', phone: '+9613123456', whatsapp: '+9613123456', ordersCount: 3, totalSpentCents: 14400, lastOrderAt: '2026-10-01T09:30:00.000Z', returnedCount: 3, warning: true };

describe('customers', () => {
  it('lists customers with safe contact links, totals and the returns warning; search goes to the API', async () => {
    const stub = stubFetch({ 'GET /api/v1/admin/customers': () => json(emptyPage([CUSTOMER])) });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <CustomersList filter="all" /> }]} />);
    expect(await screen.findByRole('link', { name: 'Rami Haddad' })).toHaveAttribute('href', '/customers/7');
    expect(screen.getByRole('link', { name: 'rami@example.com' })).toHaveAttribute('href', 'mailto:rami@example.com');
    expect(screen.getAllByRole('link', { name: /9613123456/ })[0]).toHaveAttribute('href', 'tel:+9613123456');
    expect(screen.getByText('$144.00')).toBeInTheDocument();
    expect(screen.getByText('3 returns')).toBeInTheDocument();
    const wa = document.querySelector('a[href^="https://wa.me/"]');
    expect(wa?.getAttribute('href')).toBe('https://wa.me/9613123456');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), { target: { value: 'rami' } });
    await waitFor(() => expect(stub.calls.some((c) => new URL(c.url).searchParams.get('q') === 'rami')).toBe(true));
  });

  it('empty states differ for All and Repeat', async () => {
    const stub = stubFetch({ 'GET /api/v1/admin/customers': () => json(emptyPage()) });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <CustomersList filter="repeat" /> }]} />);
    expect(await screen.findByText('No repeat customers yet')).toBeInTheDocument();
    const call = stub.calls.find((c) => new URL(c.url).pathname === '/api/v1/admin/customers');
    expect(new URL(call!.url).searchParams.get('filter')).toBe('repeat');
  });

  it('detail shows orders and totals, saves notes as plain text and the phone is not editable', async () => {
    let body: unknown = null;
    let detail = {
      ...CUSTOMER,
      areaId: null,
      area: null,
      notes: null as string | null,
      orders: [makeSummary({ id: 5, number: 'STP-1005' })],
      orderCount: 1,
      lifetimeValueCents: 4500,
      averageOrderValueCents: 4500,
      firstOrderAt: null,
      lastOrderAt: null,
      favouriteStimpie: null,
      favouriteStimpieType: null,
      favouriteColor: null,
      favouriteColorHex: null,
      recentOrders: [makeSummary({ id: 5, number: 'STP-1005' })],
    };
    const stub = stubFetch({
      'GET /api/v1/admin/customers/7/profile': () => json(detail),
      'GET /api/v1/admin/customers/7/timeline': () => json({ items: [], nextCursor: null }),
      'GET /api/v1/admin/customers/7': () => json(detail),
      'PATCH /api/v1/admin/customers/7': async (req) => {
        body = await req.json();
        detail = { ...detail, notes: 'Prefers <b>evenings</b>' };
        return json(detail);
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/customers/:id', element: <CustomerDetailPage /> }]} entries={['/customers/7']} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rami Haddad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'STP-1005' })).toHaveAttribute('href', '/orders/5');
    expect(screen.getByRole('link', { name: 'New order for this customer' })).toHaveAttribute('href', '/orders/new?customerId=7');
    fireEvent.click(screen.getByRole('button', { name: 'Edit customer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit customer' });
    expect(within(dialog).queryByLabelText(/^Phone/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), { target: { value: 'Prefers <b>evenings</b>' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save customer' }));
    await waitFor(() => expect(body).toEqual({ notes: 'Prefers <b>evenings</b>' }));
    const legacyNote = await screen.findByLabelText('Legacy note');
    expect(legacyNote).toHaveTextContent('Prefers <b>evenings</b>');
    expect(legacyNote.querySelector('b')).toBeNull();
  });

  it('a missing customer shows the in-page not-found state', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/customers/99/profile': () => apiError(404, 'NOT_FOUND', 'No.'),
      'GET /api/v1/admin/customers/99/timeline': () => apiError(404, 'NOT_FOUND', 'No.'),
      'GET /api/v1/admin/customers/99': () => apiError(404, 'NOT_FOUND', 'No.'),
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/customers/:id', element: <CustomerDetailPage /> }]} entries={['/customers/99']} />);
    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
  });
});
