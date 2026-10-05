import { useMemo, useState } from 'react';
import { CheckCheck, Wallet } from 'lucide-react';
import { Button, EmptyState, Pill, SegmentedControl, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { SearchField } from '../../components/SearchField';
import { useFormatters } from '../../lib/format';
import { enumParam, paginationParams, stringParam, useUrlState } from '../../lib/urlState';
import { OrderNumber } from '../orders/parts';
import { getDeliveredOrdersForDelivery, groupSettlementConfirmation, useDeliveries, useSettleDelivery, useSettleOrder, type DeliveryRow } from './api';

const params = { q: stringParam(), cash: enumParam(['all', 'open', 'settled'] as const, 'all'), ...paginationParams };

function CashState({ settled }: { settled: boolean }) {
  return settled ? (
    <Pill tone="success" size="sm" icon={<CheckCheck size={14} aria-hidden="true" />}>
      Settled
    </Pill>
  ) : (
    <Pill tone="cream" size="sm" icon={<Wallet size={14} aria-hidden="true" />}>
      Collected
    </Pill>
  );
}

/** Deliveries -> Delivered (dashboard-pages 14.2): grouped by delivery number with "Mark delivery settled" per group. */
export function DeliveredTab() {
  const [p, setP] = useUrlState(params);
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const query = useDeliveries({ tab: 'DELIVERED', q: p.q, page: p.page, pageSize: p.pageSize });
  const settleGroup = useSettleDelivery();
  const settleOrder = useSettleOrder();
  const [confirm, setConfirm] = useState<{ deliveryNumber: string; totalOrders: number; receivedCents: number } | null>(null);
  const [preparingDelivery, setPreparingDelivery] = useState<string | null>(null);

  const all = query.data?.items;
  const rows = useMemo(() => (all ?? []).filter((r) => (p.cash === 'all' ? true : p.cash === 'settled' ? r.cashSettled : !r.cashSettled)), [all, p.cash]);
  const groups = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>();
    for (const r of rows) map.set(r.deliveryNumber ?? '', [...(map.get(r.deliveryNumber ?? '') ?? []), r]);
    return [...map.entries()].map(([deliveryNumber, items]) => ({
      deliveryNumber,
      items,
      due: items.filter((r) => !r.cashSettled).reduce((s, r) => s + r.cashDueCents, 0),
      allSettled: items.every((r) => r.cashSettled),
    }));
  }, [rows]);

  /** Settle (or unsettle) with an Undo toast calling the inverse. */
  const settle = async (deliveryNumber: string, settled: boolean) => {
    await settleGroup.mutateAsync({ deliveryNumber, settled });
    toast.success(settled ? `Delivery ${deliveryNumber} marked settled.` : `Delivery ${deliveryNumber} is no longer settled.`, {
      durationMs: 6000,
      action: { label: 'Undo', onClick: () => settleGroup.mutateAsync({ deliveryNumber, settled: !settled }).catch((e) => notify(e)) },
    });
  };
  const settleOne = async (r: DeliveryRow, settled: boolean) => {
    try {
      await settleOrder.mutateAsync({ id: r.orderId, settled });
      toast.success(settled ? `${r.orderNumber} marked settled.` : `${r.orderNumber} is no longer settled.`, {
        durationMs: 6000,
        action: { label: 'Undo', onClick: () => settleOrder.mutateAsync({ id: r.orderId, settled: !settled }).catch((e) => notify(e)) },
      });
    } catch (e) {
      notify(e);
    }
  };

  const prepareSettlement = async (deliveryNumber: string) => {
    if (preparingDelivery !== null) return;
    setPreparingDelivery(deliveryNumber);
    try {
      const orders = await getDeliveredOrdersForDelivery(deliveryNumber);
      if (orders.length === 0) throw new Error(`No delivered orders were found for delivery ${deliveryNumber}. Refresh and try again.`);
      setConfirm({
        deliveryNumber,
        totalOrders: orders.length,
        receivedCents: orders.reduce((sum, order) => sum + order.cashDueCents, 0),
      });
    } catch (e) {
      notify(e);
    } finally {
      setPreparingDelivery(null);
    }
  };

  const columns: Column<DeliveryRow>[] = [
    { id: 'order', header: 'Order no.', priority: 'primary', className: 'whitespace-nowrap', cell: (r) => <a href={`/orders/${r.orderId}`} className="underline underline-offset-4"><OrderNumber number={r.orderNumber} /></a> },
    { id: 'due', header: 'Cash due', numeric: true, priority: 'primary', cell: (r) => <span className="font-bold">{f.money(r.cashDueCents)}</span> },
    { id: 'delivery', header: 'Delivery no.', priority: 'primary', className: 'whitespace-nowrap', cell: (r) => (r.deliveryNumber ? <span className="font-mono">{r.deliveryNumber}</span> : <span className="text-fg-muted">—</span>) },
    { id: 'customer', header: 'Customer', cell: (r) => r.customerName },
    { id: 'area', header: 'Area', cell: (r) => r.areaName },
    { id: 'cash', header: 'Cash', mobileLabel: 'Cash', cell: (r) => <CashState settled={r.cashSettled} /> },
    {
      id: 'single',
      header: 'Settle',
      mobileLabel: '',
      cell: (r) =>
        r.deliveryNumber ? null : (
          <Button variant="secondary" size="sm" loading={settleOrder.isPending} onClick={() => void settleOne(r, !r.cashSettled)}>
            {r.cashSettled ? 'Undo settled' : 'Mark settled'}
          </Button>
        ),
    },
  ];

  const total = query.data?.total ?? 0;
  const filtered = p.cash !== 'all' || p.q !== '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 md:max-w-sm">
          <SearchField label="Search deliveries" placeholder="Search order, delivery no., name, phone" value={p.q} onChange={(q) => setP({ q }, { replace: true })} />
        </div>
        <SegmentedControl
          aria-label="Cash state"
          value={p.cash}
          onChange={(v) => setP({ cash: v as 'all' | 'open' | 'settled' })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Not settled' },
            { value: 'settled', label: 'Settled' },
          ]}
        />
      </div>
      {query.isPending || query.isError || rows.length === 0 ? (
        <DataTable
          caption="Delivered orders"
          columns={columns}
          rows={all === undefined ? undefined : rows}
          getRowId={(r) => r.orderId}
          rowLabel={(r) => r.orderNumber}
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={<EmptyState title={filtered ? 'No delivered orders match' : 'No delivered orders yet'} text={filtered ? undefined : 'Orders you mark as delivered appear here with their cash state.'} />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.deliveryNumber || 'none'} aria-label={g.deliveryNumber ? `Delivery ${g.deliveryNumber}` : 'No delivery number'}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-h5 tabular-nums">
                  {g.deliveryNumber ? <span className="font-mono">{g.deliveryNumber}</span> : 'No delivery number'} · {g.items.length} {g.items.length === 1 ? 'order' : 'orders'} · {f.money(g.due)} {g.allSettled ? 'settled' : 'to settle'}
                </h2>
                {g.deliveryNumber ? (
                  g.allSettled ? (
                    <Button variant="ghost" size="sm" onClick={() => void settle(g.deliveryNumber, false).catch((e) => notify(e))}>
                      Undo settlement
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" loading={preparingDelivery === g.deliveryNumber} disabled={preparingDelivery !== null} onClick={() => void prepareSettlement(g.deliveryNumber)}>
                      Mark delivery settled
                    </Button>
                  )
                ) : null}
              </div>
              <DataTable caption={`Delivery ${g.deliveryNumber || 'without a number'}`} columns={columns} rows={g.items} getRowId={(r) => r.orderId} rowLabel={(r) => r.orderNumber} />
            </section>
          ))}
        </div>
      )}
      <Pagination page={p.page} pageSize={p.pageSize} total={total} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={query.isFetching} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Mark delivery settled?"
        description={confirm ? groupSettlementConfirmation(confirm.deliveryNumber, confirm.totalOrders, f.money(confirm.receivedCents)) : null}
        confirmLabel="Mark settled"
        reportErrors={false}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await settle(confirm.deliveryNumber, true);
          } catch (e) {
            notify(e);
            throw e;
          }
        }}
      />
    </div>
  );
}
