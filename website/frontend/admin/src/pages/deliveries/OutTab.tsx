import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Send } from 'lucide-react';
import { Button, EmptyState, Switch, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, useRowSelection, type Column } from '../../components/DataTable';
import { Menu } from '../../components/Menu';
import { Pagination } from '../../components/Pagination';
import { SearchField } from '../../components/SearchField';
import { useFormatters } from '../../lib/format';
import { useIsMdUp } from '../../lib/hooks';
import { telHref } from '../../lib/links';
import { paginationParams, stringParam, useUrlState } from '../../lib/urlState';
import { useBulkStatus, useOrder } from '../orders/api';
import { BulkResultDialog, type BulkFailure } from '../orders/BulkResultDialog';
import { OrderNumber } from '../orders/parts';
import { OrderStatusDialog } from '../orders/StatusActions';
import { EditDeliveryNumberDialog } from '../orders/OrderDialogs';
import { useDeliveries, type DeliveryRow } from './api';
import { DispatchDialog } from './DispatchDialog';

const params = { q: stringParam(), ...paginationParams };

function EditNumberById({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const query = useOrder(orderId);
  if (!query.data) return null;
  return <EditDeliveryNumberDialog order={query.data} open onClose={onClose} />;
}

/** Orders -> Out for delivery. Groups orders by delivery number on the loaded page. */
export function OutTab() {
  const [p, setP] = useUrlState(params);
  const navigate = useNavigate();
  const isMd = useIsMdUp();
  const f = useFormatters();
  const toast = useToast();
  const query = useDeliveries({ tab: 'OUT', q: p.q, page: p.page, pageSize: p.pageSize });
  const selection = useRowSelection();
  const bulk = useBulkStatus();
  const [grouped, setGrouped] = useState<boolean | null>(null);
  const showGrouped = grouped ?? isMd;
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dialog, setDialog] = useState<{ kind: 'status'; orderId: number; to: 'DELIVERED' | 'RETURNED' } | { kind: 'number'; orderId: number } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [result, setResult] = useState<{ updated: number; failed: BulkFailure[] } | null>(null);

  const rows = query.data?.items;
  const numberOf = useMemo(() => new Map((rows ?? []).map((r) => [r.orderId, r.orderNumber])), [rows]);
  const selectedIds = [...selection.selectedIds].map(Number);

  const groups = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>();
    for (const r of rows ?? []) {
      const key = r.deliveryNumber ?? '';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([deliveryNumber, items]) => ({ deliveryNumber, items, due: items.reduce((s, r) => s + r.cashDueCents, 0) }));
  }, [rows]);

  const columns: Column<DeliveryRow>[] = [
    { id: 'order', header: 'Order no.', priority: 'primary', className: 'whitespace-nowrap', cell: (r) => <a href={`/orders/${r.orderId}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(`/orders/${r.orderId}`); }} className="underline underline-offset-4"><OrderNumber number={r.orderNumber} /></a> },
    { id: 'due', header: 'Cash due', numeric: true, priority: 'primary', cell: (r) => <span className="font-bold">{f.money(r.cashDueCents)}</span> },
    { id: 'delivery', header: 'Delivery no.', priority: 'primary', className: 'whitespace-nowrap', cell: (r) => (r.deliveryNumber ? <span className="font-mono">{r.deliveryNumber}</span> : <span className="text-fg-muted">—</span>) },
    { id: 'customer', header: 'Customer', cell: (r) => r.customerName },
    { id: 'phone', header: 'Phone', cell: (r) => (telHref(r.phone) ? <a href={telHref(r.phone) ?? undefined} className="tabular-nums underline underline-offset-4">{r.phone}</a> : r.phone) },
    { id: 'area', header: 'Area', cell: (r) => r.areaName },
    { id: 'address', header: 'Address', className: 'max-w-[14rem]', cell: (r) => <span className="block whitespace-pre-wrap break-words">{r.address}</span> },
    {
      id: 'deliver',
      header: 'Delivered',
      mobileLabel: '',
      cell: (r) => (
        <Button variant="primary" size={isMd ? 'sm' : 'md'} className="w-full md:w-auto" onClick={() => setDialog({ kind: 'status', orderId: r.orderId, to: 'DELIVERED' })}>
          Mark delivered
        </Button>
      ),
    },
  ];

  const table = (items: DeliveryRow[] | undefined, caption: string, extra?: Partial<React.ComponentProps<typeof DataTable<DeliveryRow>>>) => (
    <DataTable
      caption={caption}
      columns={columns}
      rows={items}
      getRowId={(r) => r.orderId}
      rowLabel={(r) => r.orderNumber}
      selectable
      selectedIds={selection.selectedIds}
      onSelectionChange={selection.onSelectionChange}
      rowActions={(r) => (
        <Menu
          label={`Actions for ${r.orderNumber}`}
          items={[
            { id: 'open', label: 'Open order', href: `/orders/${r.orderId}` },
            { id: 'edit', label: 'Edit delivery number', onSelect: () => setDialog({ kind: 'number', orderId: r.orderId }) },
            { id: 'ret', label: 'Mark failed / returned', tone: 'danger', onSelect: () => setDialog({ kind: 'status', orderId: r.orderId, to: 'RETURNED' }) },
          ]}
        />
      )}
      {...extra}
    />
  );

  const runBulk = async () => {
    const res = await bulk.mutateAsync({ ids: selectedIds, to: 'DELIVERED' });
    if (res.failed.length === 0) {
      toast.success(`${res.updated.length} ${res.updated.length === 1 ? 'order' : 'orders'} marked Delivered.`);
      selection.clear();
    } else {
      setResult({ updated: res.updated.length, failed: res.failed.map((x) => ({ id: x.id, label: numberOf.get(x.id) ?? `Order ${x.id}`, code: x.code })) });
      selection.onSelectionChange(new Set(res.failed.map((x) => x.id)));
    }
  };

  const printIds = selectedIds.length > 0 ? selectedIds : (rows ?? []).map((r) => r.orderId);
  const total = query.data?.total ?? 0;
  const empty = (
    <EmptyState title={p.q ? 'No orders match this search' : 'Nothing is out for delivery'} action={!p.q ? <Button variant="primary" onClick={() => setDispatchOpen(true)}>Send out packed orders</Button> : undefined} />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 md:max-w-sm">
          <SearchField label="Search orders" placeholder="Search order, delivery no., name, phone" value={p.q} onChange={(q) => setP({ q }, { replace: true })} />
        </div>
        <Switch label="Group by delivery number" checked={showGrouped} onChange={setGrouped} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" leftIcon={<Printer size={18} aria-hidden="true" />} disabled={printIds.length === 0} href={`/orders/print?ids=${printIds.slice(0, 100).join(',')}`}>
            Print delivery sheet
          </Button>
          <Button variant="primary" leftIcon={<Send size={18} aria-hidden="true" />} onClick={() => setDispatchOpen(true)}>
            Send out packed orders
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div role="region" aria-label="Bulk actions" className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-lg border-2 border-fg bg-surface-base px-4 py-2 md:top-16">
          <span className="text-body-sm font-medium tabular-nums">{selectedIds.length} selected</span>
          <Button variant="primary" size="sm" disabled={bulk.isPending} onClick={() => setConfirmBulk(true)}>
            {`Mark ${selectedIds.length} delivered`}
          </Button>
          <Button variant="ghost" size="sm" onClick={selection.clear} className="ml-auto">
            Clear selection
          </Button>
        </div>
      ) : null}

      {query.isPending || query.isError || (rows ?? []).length === 0 || !showGrouped ? (
        table(rows, 'Orders out for delivery', {
          loading: query.isPending,
          refreshing: query.isFetching && !query.isPending,
          error: query.error,
          onRetry: () => void query.refetch(),
          empty,
        })
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.deliveryNumber || 'none'} aria-label={g.deliveryNumber ? `Delivery ${g.deliveryNumber}` : 'No delivery number'}>
              <h2 className="mb-2 text-h5 tabular-nums">
                {g.deliveryNumber ? <span className="font-mono">{g.deliveryNumber}</span> : 'No delivery number'} · {g.items.length} {g.items.length === 1 ? 'order' : 'orders'} · {f.money(g.due)}
              </h2>
              {table(g.items, `Delivery ${g.deliveryNumber || 'without a number'}`)}
            </section>
          ))}
        </div>
      )}
      <Pagination page={p.page} pageSize={p.pageSize} total={total} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={query.isFetching} />

      <DispatchDialog open={dispatchOpen} onClose={() => setDispatchOpen(false)} />
      {dialog?.kind === 'status' ? <OrderStatusDialog key={`${dialog.orderId}-${dialog.to}`} orderId={dialog.orderId} to={dialog.to} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'number' ? <EditNumberById orderId={dialog.orderId} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={`Mark ${selectedIds.length} ${selectedIds.length === 1 ? 'order' : 'orders'} as Delivered?`}
        description={`Mark ${selectedIds.length} orders as Delivered? Customers with an email are emailed "Delivered" and cash is now expected.`}
        notUndoable
        confirmLabel={`Mark ${selectedIds.length} as Delivered`}
        onConfirm={runBulk}
      />
      <BulkResultDialog open={result !== null} updated={result?.updated ?? 0} failed={result?.failed ?? []} onClose={() => setResult(null)} onSelectFailed={() => setResult(null)} />
    </div>
  );
}

export { useNotifyError };
