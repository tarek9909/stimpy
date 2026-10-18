import { EmptyState, Select, TextLink, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { DateTimeInput } from '../../components/DateTimeInput';
import { FilterBar } from '../../components/FilterBar';
import { Pagination } from '../../components/Pagination';
import { useFormatters } from '../../lib/format';
import { countActive, enumParam, optionalIntParam, optionalStringParam, paginationParams, useUrlState } from '../../lib/urlState';
import { REASONS, REASON_LABEL, useMovements, type MovementReason } from './api';

const params = {
  itemType: enumParam(['all', 'HOODIE_VARIANT', 'STIMPIE'] as const, 'all'),
  itemId: optionalIntParam(),
  reason: enumParam(['all', ...REASONS] as const, 'all'),
  from: optionalStringParam(),
  to: optionalStringParam(),
  orderId: optionalIntParam(),
  ...paginationParams,
};

type Row = NonNullable<ReturnType<typeof useMovements>['data']>['items'][number];

/** Stock -> Movements (dashboard-pages 8.3): read-only log, newest first. `?orderId=` deep links from an order. */
export function MovementsTab() {
  const [p, setP] = useUrlState(params);
  const f = useFormatters();
  const q = useMovements({
    itemType: p.itemType === 'all' ? undefined : p.itemType,
    itemId: p.itemType === 'all' ? undefined : (p.itemId ?? undefined),
    reason: p.reason === 'all' ? undefined : (p.reason as MovementReason),
    orderId: p.orderId ?? undefined,
    from: p.from ?? undefined,
    to: p.to ?? undefined,
    page: p.page,
    pageSize: p.pageSize,
  });
  const active = countActive(p, params, ['itemType', 'reason', 'from', 'to', 'orderId']);
  const clear = () => setP({ itemType: 'all', itemId: null, reason: 'all', from: null, to: null, orderId: null });

  const columns: Column<Row>[] = [
    { id: 'at', header: 'Date', priority: 'primary', cell: (m) => <time dateTime={m.at} title={f.dateTime(m.at)} className="tabular-nums">{f.dateTime(m.at)}</time> },
    {
      id: 'delta',
      header: 'Change',
      numeric: true,
      priority: 'primary',
      cell: (m) => (
        <span className={cn('font-bold', m.delta > 0 && 'text-success', m.delta < 0 && 'text-fg-danger')}>
          {m.delta > 0 ? `+${m.delta}` : m.delta < 0 ? `−${Math.abs(m.delta)}` : '0'}
        </span>
      ),
    },
    { id: 'item', header: 'Item', priority: 'primary', cell: (m) => <span className="font-medium">{m.itemName}</span> },
    { id: 'field', header: 'Field', mobileLabel: 'Field', cell: (m) => (m.field === 'QUANTITY' ? 'On hand' : 'Order hold') },
    { id: 'reason', header: 'Reason', cell: (m) => REASON_LABEL[m.reason] },
    {
      id: 'order',
      header: 'Order',
      cell: (m) => (m.orderNumber ? <TextLink href={`/orders?q=${encodeURIComponent(m.orderNumber)}`} className="font-mono">{m.orderNumber}</TextLink> : '—'),
    },
    { id: 'note', header: 'Note', className: 'max-w-[16rem]', cell: (m) => (m.note ? <span className="block whitespace-pre-wrap break-words">{m.note}</span> : '—') },
    { id: 'by', header: 'By', cell: (m) => m.by ?? 'System' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar activeCount={active} onClear={clear}>
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Item type
          <Select
            value={p.itemType}
            onChange={(e) => setP({ itemType: e.target.value as (typeof params.itemType)['defaultValue'], itemId: null })}
            options={[
              { value: 'all', label: 'All items' },
              { value: 'HOODIE_VARIANT', label: 'Hoodies' },
              { value: 'STIMPIE', label: 'Stimpies' },
            ]}
          />
        </label>
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Reason
          <Select
            value={p.reason}
            onChange={(e) => setP({ reason: e.target.value as (typeof params.reason)['defaultValue'] })}
            options={[{ value: 'all', label: 'All reasons' }, ...REASONS.map((r) => ({ value: r, label: REASON_LABEL[r] }))]}
          />
        </label>
        <DateTimeInput kind="date" label="From" value={p.from} onChange={(v) => setP({ from: v })} max={p.to ?? undefined} />
        <DateTimeInput kind="date" label="To" value={p.to} onChange={(v) => setP({ to: v })} min={p.from ?? undefined} />
        {p.orderId !== null ? (
          <p className="self-end rounded-md bg-cream px-3 py-2 text-body-sm">Showing one order&apos;s movements</p>
        ) : null}
      </FilterBar>
      <DataTable
        caption="Stock movements"
        columns={columns}
        rows={q.data?.items}
        getRowId={(m) => m.id}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={<EmptyState title={active > 0 ? 'No movements match these filters' : 'No stock movements yet'} />}
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={q.data?.total ?? 0} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={q.isFetching} />}
      />
    </div>
  );
}
