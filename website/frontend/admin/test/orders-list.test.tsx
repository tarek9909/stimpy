import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OrdersList } from '../src/pages/orders/OrdersList';
import { bulkFailureReason, tabCount, TAB_STATUSES } from '../src/pages/orders/status';
import { json, stubFetch, TestApp } from './helpers';
import { emptyPage, forceDesktop, makeSummary } from './orderFixtures';

let restore: () => void = () => undefined;
beforeEach(() => forceDesktop());
afterEach(() => restore());

const COUNTS = { ALL: 30, NEW: 8, CONFIRMED: 4, PACKED: 2, OUT_FOR_DELIVERY: 2, DELIVERED: 10, CANCELLED: 2, RETURNED: 2 };
const ROWS = [
  makeSummary({ id: 1, number: 'STP-1001', status: 'NEW' }),
  makeSummary({ id: 2, number: 'STP-1002', status: 'NEW', holdExpired: true }),
  makeSummary({ id: 3, number: 'STP-1003', status: 'CONFIRMED' }),
];

function setup(entry = '/orders', extra: Record<string, (req: Request) => Response | Promise<Response>> = {}) {
  const stub = stubFetch({
    'GET /api/v1/admin/orders': () => json(emptyPage(ROWS)),
    'GET /api/v1/admin/orders/counts': () => json(COUNTS),
    'GET /api/v1/admin/areas': () => json(emptyPage([{ id: 1, name: 'Beirut', feeCents: null, estDays: null, active: true }], 100)),
    'GET /api/v1/admin/drops': () => json(emptyPage()),
    ...extra,
  });
  restore = stub.restore;
  render(<TestApp routes={[{ path: '/orders', element: <OrdersList /> }, { path: '/orders/:id', element: <p>Order detail</p> }]} entries={[entry]} />);
  return stub;
}

const listCalls = (calls: Array<{ method: string; url: string; path: string }>) => calls.filter((c) => c.method === 'GET' && c.path === '/api/v1/admin/orders').map((c) => new URL(c.url).searchParams);

describe('status tab helpers', () => {
  it('To pack and Returned & cancelled are sums of counts', () => {
    expect(tabCount('TO_PACK', COUNTS)).toBe(6);
    expect(tabCount('CLOSED', COUNTS)).toBe(4);
    expect(tabCount('ALL', COUNTS)).toBe(30);
    expect(tabCount('NEW', undefined)).toBeUndefined();
    expect(TAB_STATUSES.TO_PACK.join(',')).toBe('CONFIRMED,PACKED');
  });
  it('maps failure codes to plain reasons', () => {
    expect(bulkFailureReason('INVALID_TRANSITION')).toBe('Not in the right status');
    expect(bulkFailureReason('NOT_FOUND')).toBe('Order no longer exists');
  });
});

describe('orders list', () => {
  it('shows rows, tab badges and the hold expired badge', async () => {
    setup();
    expect(await screen.findByText('STP-1001')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /To pack\s*6/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Returned & cancelled\s*4/ })).toBeInTheDocument();
    expect(screen.getByText('Hold expired')).toBeInTheDocument();
  });

  it('reads filters from the URL and sends them to the API (To pack = one comma separated status)', async () => {
    const { calls } = setup('/orders?status=TO_PACK&source=WEBSITE&holdExpired=true&deliveryNumber=D-1&q=rami&page=2&sort=totalCents');
    await screen.findByText('STP-1001');
    const q = listCalls(calls)[0]!;
    expect(q.get('status')).toBe('CONFIRMED,PACKED');
    expect(q.get('source')).toBe('WEBSITE');
    expect(q.get('holdExpired')).toBe('true');
    expect(q.get('deliveryNumber')).toBe('D-1');
    expect(q.get('q')).toBe('rami');
    expect(q.get('page')).toBe('2');
    expect(q.get('sort')).toBe('totalCents');
    expect(screen.getByRole('tab', { name: /To pack/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('an unknown sort field falls back to newest first', async () => {
    const { calls } = setup('/orders?sort=-customerName');
    await screen.findByText('STP-1001');
    expect(listCalls(calls)[0]!.get('sort')).toBe('-placedAt');
  });

  it('clicking a tab changes the request and resets the page', async () => {
    const { calls } = setup('/orders?page=2');
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('tab', { name: /^New/ }));
    await waitFor(() => expect(listCalls(calls).some((q) => q.get('status') === 'NEW' && q.get('page') === '1')).toBe(true));
  });

  it('sorting a header sends sort and toggles direction', async () => {
    const { calls } = setup();
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('button', { name: /^Total/ }));
    await waitFor(() => expect(listCalls(calls).some((q) => q.get('sort') === '-totalCents')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /^Total/ }));
    await waitFor(() => expect(listCalls(calls).some((q) => q.get('sort') === 'totalCents')).toBe(true));
  });

  it('search is debounced and sent as q', async () => {
    const { calls } = setup();
    await screen.findByText('STP-1001');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search orders' }), { target: { value: '1042' } });
    await waitFor(() => expect(listCalls(calls).some((q) => q.get('q') === '1042')).toBe(true));
  });

  it('empty and filtered-empty states', async () => {
    setup('/orders?q=zzz', { 'GET /api/v1/admin/orders': () => json(emptyPage()) });
    expect(await screen.findByText('No orders match these filters')).toBeInTheDocument();
  });

  it('bulk actions follow the selection: all New enables Confirm only; mixed disables all', async () => {
    setup();
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1002' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(bar).toHaveTextContent('2 selected');
    expect(within(bar).getByRole('button', { name: 'Mark confirmed' })).toBeEnabled();
    expect(within(bar).getByRole('button', { name: 'Mark packed' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: 'Mark delivered' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export selected (2)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1003' }));
    expect(within(bar).getByRole('button', { name: 'Mark confirmed' })).toBeDisabled();
  });

  it('bulk confirm reports a partial failure per order and can reselect the failed ones', async () => {
    let body: unknown = null;
    setup('/orders', {
      'POST /api/v1/admin/orders/bulk-status': async (req) => {
        body = await req.json();
        return json({ updated: [1], failed: [{ id: 2, code: 'INVALID_TRANSITION' }] });
      },
    });
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1002' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Mark confirmed' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Mark 2 orders as Confirmed?');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Mark 2 as Confirmed' }));
    const result = await screen.findByRole('dialog', { name: 'Some orders were not updated' });
    expect(body).toEqual({ ids: [1, 2], to: 'CONFIRMED' });
    expect(result).toHaveTextContent('1 updated, 1 failed');
    expect(result).toHaveTextContent('STP-1002');
    expect(result).toHaveTextContent('Not in the right status');
    fireEvent.click(within(result).getByRole('button', { name: 'Select failed orders' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('1 selected'));
    expect(screen.getByRole('checkbox', { name: 'Select STP-1002' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select STP-1001' })).not.toBeChecked();
  });

  it('an all-success bulk shows a toast, no result dialog, and clears the selection', async () => {
    setup('/orders', { 'POST /api/v1/admin/orders/bulk-status': () => json({ updated: [1, 2], failed: [] }) });
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1001' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1002' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Mark confirmed' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Mark 2 as Confirmed' }));
    expect(await screen.findByText('2 orders marked Confirmed.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });

  it('export sends { ids } for a selection and the filters otherwise; the filename comes from Content-Disposition', async () => {
    const bodies: unknown[] = [];
    const saved: string[] = [];
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      saved.push(this.download);
    };
    setup('/orders?status=TO_PACK&source=WEBSITE', {
      'POST /api/v1/admin/orders/export': async (req) => {
        bodies.push(await req.json());
        return new Response('﻿number\r\n', { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders-2026-10-14.csv"' } });
      },
    });
    await screen.findByText('STP-1001');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(saved).toEqual(['orders-2026-10-14.csv']));
    expect(bodies[0]).toMatchObject({ status: ['CONFIRMED', 'PACKED'], source: 'WEBSITE' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select STP-1001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected (1)' }));
    await waitFor(() => expect(bodies[1]).toEqual({ ids: [1] }));
    HTMLAnchorElement.prototype.click = origClick;
  });
});
