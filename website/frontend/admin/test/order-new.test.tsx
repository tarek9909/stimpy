import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NewOrder } from '../src/pages/orders/NewOrder';
import { NotificationsProvider } from '../src/layout/notifications';
import { apiError, json, stubFetch, TestApp } from './helpers';
import { emptyPage, forceDesktop, makeOrder } from './orderFixtures';

let restore: () => void = () => undefined;
beforeEach(() => forceDesktop());
afterEach(() => restore());

const STIMPIE = { id: 9, slug: 'the-void', name: 'THE VOID', type: 'CORE', priceCents: 1000, story: '', images: [], artworkUrl: 'x', artworkWidth: null, artworkHeight: null, drop: null, status: 'AVAILABLE', remaining: null, purchasable: true };
const SOLD = { ...STIMPIE, id: 10, slug: 'static', name: 'THE STATIC', status: 'SOLD_OUT', purchasable: false };

function setup(post: (req: Request) => Response | Promise<Response>) {
  const stub = stubFetch({
    'GET /api/v1/admin/orders/counts': () => json({ ALL: 0, NEW: 0, CONFIRMED: 0, PACKED: 0, OUT_FOR_DELIVERY: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0 }),
    'GET /api/v1/admin/orders': () => json(emptyPage()),
    'GET /api/v1/admin/areas': () => json(emptyPage([{ id: 1, name: 'Beirut', feeCents: null, estDays: null, active: true }], 100)),
    'GET /api/v1/products/hoodies': () => json({ items: [], page: 1, pageSize: 100, total: 0 }),
    'GET /api/v1/products/stimpies': () => json({ items: [STIMPIE, SOLD], page: 1, pageSize: 100, total: 2 }),
    'GET /api/v1/packs': () => json({ items: [], page: 1, pageSize: 100, total: 0 }),
    'GET /api/v1/delivery/fees': () => json({ defaultFeeCents: 300, areas: [], estimateText: '2-3 working days' }),
    'POST /api/v1/admin/orders': post,
  });
  restore = stub.restore;
  render(
    <TestApp
      routes={[
        {
          path: '/orders/new',
          element: (
            <NotificationsProvider>
              <NewOrder />
            </NotificationsProvider>
          ),
        },
        { path: '/orders/:id', element: <p>Created order page</p> },
      ]}
      entries={['/orders/new']}
    />,
  );
  return stub;
}

function fillValid() {
  const set = (name: string, value: string) => fireEvent.change(document.querySelector(`[name="${name}"]`) as Element, { target: { value } });
  set('customer.name', 'Layla Testi');
  set('customer.phone', '03 123 456');
  set('delivery.areaName', 'Beirut');
  set('delivery.address', 'Hamra street 5');
  fireEvent.click(screen.getByRole('radio', { name: 'Extra Stimpie' }));
}

describe('manual order form', () => {
  it('validates required fields and shows inline messages without calling the API', async () => {
    const { calls } = setup(() => json({}));
    await screen.findByRole('heading', { name: 'New order' });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    expect(await screen.findAllByText("Enter the customer's name (at least 2 characters).")).not.toHaveLength(0);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('disables sold-out Stimpies with the text "Sold out"', async () => {
    setup(() => json({}));
    await screen.findByRole('heading', { name: 'New order' });
    fireEvent.click(screen.getByRole('radio', { name: 'Extra Stimpie' }));
    const option = await screen.findByRole('option', { name: 'THE STATIC (Sold out)' });
    expect(option).toBeDisabled();
  });

  it('SOLD_OUT: lists name, requested and available, flags the line, and creates nothing', async () => {
    setup(() =>
      apiError(409, 'SOLD_OUT', 'Sorry, THE VOID just sold out.', { details: { items: [{ kind: 'STIMPIE', stimpieId: 9, itemIndex: 0, name: 'THE VOID', requested: 1, available: 0 }] } }),
    );
    await screen.findByRole('heading', { name: 'New order' });
    fillValid();
    await screen.findByRole('option', { name: 'THE VOID' });
    fireEvent.change(screen.getByRole('combobox', { name: /^Stimpie/ }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    const dialog = await screen.findByRole('dialog', { name: 'Some items are sold out' });
    expect(dialog).toHaveTextContent('THE VOID');
    expect(dialog).toHaveTextContent('Requested 1, available 0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the form' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('THE VOID: Requested 1, available 0');
    expect(screen.queryByText('Created order page')).toBeNull();
  });

  it('NOT_PURCHASABLE: explains the reason in words', async () => {
    setup(() =>
      apiError(409, 'NOT_PURCHASABLE', 'Not available.', { details: { items: [{ kind: 'STIMPIE', stimpieId: 9, itemIndex: 0, name: 'THE VOID', reason: 'DROP_NOT_STARTED' }] } }),
    );
    await screen.findByRole('heading', { name: 'New order' });
    fillValid();
    await screen.findByRole('option', { name: 'THE VOID' });
    fireEvent.change(screen.getByRole('combobox', { name: /^Stimpie/ }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    const dialog = await screen.findByRole('dialog', { name: "Some items can't be sold right now" });
    expect(dialog).toHaveTextContent("Drop hasn't started");
  });

  it('sends the contract body (no prices), navigates to the new order and never announces it', async () => {
    let body: Record<string, unknown> | null = null;
    setup(async (req) => {
      body = (await req.json()) as Record<string, unknown>;
      return json(makeOrder({ id: 42, number: 'STP-1043' }), 201);
    });
    await screen.findByRole('heading', { name: 'New order' });
    fillValid();
    await screen.findByRole('option', { name: 'THE VOID' });
    fireEvent.change(screen.getByRole('combobox', { name: /^Stimpie/ }), { target: { value: '9' } });
    expect(screen.getByTestId('order-estimate')).toHaveTextContent('$13.00');
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    expect(await screen.findByText('Created order page')).toBeInTheDocument();
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      source: 'WHATSAPP',
      initialStatus: 'CONFIRMED',
      sendEmail: false,
      customer: { name: 'Layla Testi', phone: '03 123 456', whatsappSameAsPhone: true },
      delivery: { areaName: 'Beirut', address: 'Hamra street 5' },
      items: [{ kind: 'stimpie', stimpieId: 9, qty: 1 }],
    });
    expect(JSON.stringify(body)).not.toMatch(/priceCents|totalCents/);
  });

  it('maps API validation fields onto the inputs', async () => {
    setup(() => apiError(400, 'VALIDATION_ERROR', 'Check the fields.', { fields: { 'customer.phone': 'That does not look like a Lebanese phone number.' } }));
    await screen.findByRole('heading', { name: 'New order' });
    fillValid();
    await screen.findByRole('option', { name: 'THE VOID' });
    fireEvent.change(screen.getByRole('combobox', { name: /^Stimpie/ }), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    expect((await screen.findAllByText('That does not look like a Lebanese phone number.')).length).toBeGreaterThan(0);
  });
});
