import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationBell } from '../src/layout/NotificationBell';
import { NotificationsProvider, useNotifications } from '../src/layout/notifications';
import { queryKeys } from '../src/api/queryKeys';
import { apiError, json, stubFetch, TestApp } from './helpers';
import { makeSummary } from './orderFixtures';

let restore: () => void = () => undefined;
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

const counts = (ALL: number) => ({ ALL, NEW: ALL, CONFIRMED: 0, PACKED: 0, OUT_FOR_DELIVERY: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0 });

function Harness() {
  const client = useQueryClient();
  const notifications = useNotifications();
  return (
    <>
      <NotificationBell />
      <button type="button" onClick={() => client.setQueryData(queryKeys.ordersCounts, counts(21))}>Simulate new orders</button>
      <output aria-label="Unread count">{notifications.unread}</output>
    </>
  );
}

function renderBell(orders: (req: Request) => Response | Promise<Response>) {
  const stub = stubFetch({
    'GET /api/v1/admin/orders/counts': () => json(counts(0)),
    'GET /api/v1/admin/orders': orders,
  });
  restore = stub.restore;
  render(
    <TestApp
      routes={[{
        path: '/',
        element: <NotificationsProvider><Harness /></NotificationsProvider>,
      }]}
    />,
  );
  return stub;
}

describe('new order notifications', () => {
  it('reads every page of more than 20 arrivals before advancing the cursor', async () => {
    const newcomerPages = [
      Array.from({ length: 20 }, (_, index) => {
        const id = 31 - index;
        return makeSummary({ id, number: `STP-${1000 + id}` });
      }),
      [makeSummary({ id: 11, number: 'STP-1011' })],
    ];
    const stub = renderBell((req) => {
      const query = new URL(req.url).searchParams;
      if (query.has('afterId')) {
        const page = Number(query.get('page') ?? 1);
        return json({ items: newcomerPages[page - 1] ?? [], page, pageSize: 20, total: 21 });
      }
      return json({ items: [makeSummary({ id: 10 })], page: 1, pageSize: 20, total: 10 });
    });

    await waitFor(() => expect(stub.calls.some((call) => call.path === '/api/v1/admin/orders' && !new URL(call.url).searchParams.has('afterId'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Simulate new orders' }));

    await waitFor(() => expect(screen.getByLabelText('Unread count')).toHaveTextContent('21'));
    const newcomerCalls = stub.calls
      .filter((call) => new URL(call.url).searchParams.has('afterId'))
      .map((call) => new URL(call.url).searchParams.get('page'));
    expect(newcomerCalls).toEqual(['1', '2', '1']);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 21 new' }));
    expect(await screen.findByRole('link', { name: /STP-1031/ })).toHaveAttribute('href', '/orders/31');
  });

  it('retries a failed newcomer lookup without requiring another count increase', async () => {
    let failed = false;
    const stub = renderBell((req) => {
      const query = new URL(req.url).searchParams;
      if (query.has('afterId')) {
        if (!failed) {
          failed = true;
          return apiError(503, 'UNAVAILABLE', 'Try again.');
        }
        return json({ items: [makeSummary({ id: 11, number: 'STP-1011' })], page: 1, pageSize: 20, total: 1 });
      }
      return json({ items: [makeSummary({ id: 10 })], page: 1, pageSize: 20, total: 10 });
    });

    await waitFor(() => expect(stub.calls.some((call) => call.path === '/api/v1/admin/orders' && !new URL(call.url).searchParams.has('afterId'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Simulate new orders' }));
    await waitFor(() => expect(stub.calls.filter((call) => new URL(call.url).searchParams.has('afterId'))).toHaveLength(1));

    // A successful count refresh with the same total must retry the preserved afterId cursor.
    const clientButton = screen.getByRole('button', { name: 'Simulate new orders' });
    fireEvent.click(clientButton);
    await waitFor(() => expect(screen.getByLabelText('Unread count')).toHaveTextContent('1'));
    const retryCalls = stub.calls.filter((call) => new URL(call.url).searchParams.has('afterId'));
    expect(retryCalls).toHaveLength(3); // failed page, successful page, stability check of page 1
    expect(retryCalls.map((call) => new URL(call.url).searchParams.get('afterId'))).toEqual(['10', '10', '10']);
  });
});
