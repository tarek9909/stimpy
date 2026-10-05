import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StatusActions } from '../src/pages/orders/StatusActions';
import { apiError, json, stubFetch, TestApp } from './helpers';
import { SETTINGS, emptyPage, forceDesktop, makeOrder, makeSummary } from './orderFixtures';
import type { AdminOrder } from '../src/pages/orders/api';

let restore: () => void = () => undefined;
beforeEach(() => forceDesktop());
afterEach(() => restore());

function setup(order: AdminOrder, handlers: Record<string, (req: Request) => Response | Promise<Response>> = {}) {
  const stub = stubFetch({
    'GET /api/v1/admin/settings': () => json(SETTINGS),
    'GET /api/v1/admin/orders': () => json(emptyPage()),
    ...handlers,
  });
  restore = stub.restore;
  render(<TestApp routes={[{ path: '/', element: <StatusActions order={order} /> }]} />);
  return stub;
}

const buttons = () => within(screen.getByRole('group', { name: 'Order actions' })).getAllByRole('button').map((b) => b.textContent);

describe('status action panel: buttons come only from allowedTransitions', () => {
  it('NEW offers Confirm and Cancel', () => {
    setup(makeOrder({ status: 'NEW', allowedTransitions: ['CONFIRMED', 'CANCELLED'] }));
    expect(buttons()).toEqual(['Confirm order', 'Cancel order']);
  });

  it('OUT_FOR_DELIVERY offers Delivered and Returned but never Cancel', () => {
    setup(makeOrder({ status: 'OUT_FOR_DELIVERY', allowedTransitions: ['DELIVERED', 'RETURNED'] }));
    expect(buttons()).toEqual(['Mark delivered', 'Mark returned']);
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('follows the server, not a client table: a PACKED order the server allows only to cancel shows only Cancel', () => {
    setup(makeOrder({ status: 'PACKED', allowedTransitions: ['CANCELLED'] }));
    expect(buttons()).toEqual(['Cancel order']);
  });

  it('terminal orders render no action bar', () => {
    setup(makeOrder({ status: 'CANCELLED', allowedTransitions: [] }));
    expect(screen.queryByRole('group', { name: 'Order actions' })).toBeNull();
  });

  it('never offers New, even if a server list contained it', () => {
    setup(makeOrder({ status: 'CONFIRMED', allowedTransitions: ['NEW', 'PACKED'] }));
    expect(buttons()).toEqual(['Mark as packed']);
  });
});

describe('status dialogs', () => {
  it('confirm dialog states the consequence and sends only { to }', async () => {
    const { calls } = setup(makeOrder({ status: 'NEW' }), {
      'POST /api/v1/admin/orders/1/status': async (req) => {
        const body = await req.json();
        return json(makeOrder({ status: 'CONFIRMED', allowedTransitions: ['PACKED', 'CANCELLED'], ...(body.to ? {} : {}) }));
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm order' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Confirm STP-1001?');
    await waitFor(() => expect(dialog).toHaveTextContent("The customer is emailed 'Order confirmed'."));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm order' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/status'))).toBe(true));
  });

  it('out for delivery: an empty delivery number is refused in the UI and nothing is sent', async () => {
    const { calls } = setup(makeOrder({ status: 'PACKED', allowedTransitions: ['OUT_FOR_DELIVERY', 'CANCELLED'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Send out for delivery' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send out for delivery' }));
    expect(await within(dialog).findByText('Enter the delivery number to continue.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // Whitespace only is the same as empty.
    fireEvent.change(within(dialog).getByLabelText(/Delivery number/), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send out for delivery' }));
    await waitFor(() => expect(within(dialog).getByText('Enter the delivery number to continue.')).toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('out for delivery: a duplicate number warns but does not block, and the number is sent trimmed', async () => {
    let posted: Record<string, unknown> | null = null;
    setup(makeOrder({ status: 'PACKED', allowedTransitions: ['OUT_FOR_DELIVERY', 'CANCELLED'] }), {
      'GET /api/v1/admin/orders': () => json(emptyPage([makeSummary({ id: 5, number: 'STP-1040', deliveryNumber: 'D-88231' }), makeSummary({ id: 6, number: 'STP-1041', deliveryNumber: 'D-88231' })])),
      'POST /api/v1/admin/orders/1/status': async (req) => {
        posted = (await req.json()) as Record<string, unknown>;
        return json(makeOrder({ status: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-88231', allowedTransitions: ['DELIVERED', 'RETURNED'], warnings: [{ code: 'DUPLICATE_DELIVERY_NUMBER', deliveryNumber: 'D-88231', orderIds: [5, 6] }] }));
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send out for delivery' }));
    const dialog = await screen.findByRole('alertdialog');
    const input = within(dialog).getByLabelText(/Delivery number/);
    fireEvent.change(input, { target: { value: '  D-88231  ' } });
    fireEvent.blur(input);
    const notice = await within(dialog).findByTestId('duplicate-delivery-number');
    expect(notice).toHaveTextContent('D-88231 is already on 2 other orders (STP-1040, STP-1041)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send out for delivery' }));
    await waitFor(() => expect(posted).toEqual({ to: 'OUT_FOR_DELIVERY', deliveryNumber: 'D-88231' }));
  });

  it('the API DELIVERY_NUMBER_REQUIRED error shows on the field and keeps the dialog open', async () => {
    setup(makeOrder({ status: 'PACKED', allowedTransitions: ['OUT_FOR_DELIVERY'] }), {
      'POST /api/v1/admin/orders/1/status': () => apiError(422, 'DELIVERY_NUMBER_REQUIRED', 'A delivery number is required.'),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send out for delivery' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Delivery number/), { target: { value: 'X1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send out for delivery' }));
    expect(await within(dialog).findByText('Enter the delivery number to continue.')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('cancel needs a reason of at least 3 characters; chips fill it; it is sent as cancelReason', async () => {
    let posted: Record<string, unknown> | null = null;
    const { calls } = setup(makeOrder({ status: 'NEW' }), {
      'POST /api/v1/admin/orders/1/status': async (req) => {
        posted = (await req.json()) as Record<string, unknown>;
        return json(makeOrder({ status: 'CANCELLED', allowedTransitions: [], cancelReason: 'Customer changed mind' }));
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    expect(await within(dialog).findByText('Give a reason of at least 3 characters.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Customer changed mind' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(posted).toEqual({ to: 'CANCELLED', cancelReason: 'Customer changed mind' }));
  });

  it('return after delivery asks restock yes/no and sends restock', async () => {
    let posted: Record<string, unknown> | null = null;
    setup(makeOrder({ status: 'DELIVERED', allowedTransitions: ['RETURNED'] }), {
      'POST /api/v1/admin/orders/1/status': async (req) => {
        posted = (await req.json()) as Record<string, unknown>;
        return json(makeOrder({ status: 'RETURNED', allowedTransitions: [] }));
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark returned' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByLabelText("Write off as damaged (don't restock)"));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark returned' }));
    await waitFor(() => expect(posted).toEqual({ to: 'RETURNED', restock: false }));
  });

  it('return from out for delivery hides the restock choice (items always go back on the shelf)', async () => {
    setup(makeOrder({ status: 'OUT_FOR_DELIVERY', allowedTransitions: ['DELIVERED', 'RETURNED'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark returned' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('The items go back on the shelf.');
    expect(within(dialog).queryByLabelText('Put the items back in stock')).toBeNull();
  });

  it('INVALID_TRANSITION shows where the order is now and re-reads it', async () => {
    const { calls } = setup(makeOrder({ status: 'CONFIRMED', allowedTransitions: ['PACKED', 'CANCELLED'] }), {
      'POST /api/v1/admin/orders/1/status': () => apiError(409, 'INVALID_TRANSITION', 'No.', { details: { from: 'PACKED', to: 'PACKED', allowed: ['OUT_FOR_DELIVERY'] } }),
      'GET /api/v1/admin/orders/1': () => json(makeOrder({ status: 'PACKED', allowedTransitions: ['OUT_FOR_DELIVERY'] })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as packed' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as packed' }));
    expect(await screen.findByRole('dialog', { name: 'This order is now Packed' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.path === '/api/v1/admin/orders/1')).toBe(false));
  });
});
