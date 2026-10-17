import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Download, MessageCircle, Plus, Printer } from 'lucide-react';
import { Button, EmptyState, Select, Skeleton, Switch, Tabs, TextLink, useToast, type OrderStatus } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, useRowSelection, type Column } from '../../components/DataTable';
import { DateTimeInput } from '../../components/DateTimeInput';
import { FilterBar } from '../../components/FilterBar';
import { Menu } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { SearchField } from '../../components/SearchField';
import { Tooltip } from '../../components/Tooltip';
import { saveBlob } from '../../lib/download';
import { useFormatters } from '../../lib/format';
import { useIsMdUp } from '../../lib/hooks';
import { telHref } from '../../lib/links';
import { useAreas } from '../../lib/refdata';
import { StatusPill } from '@stimpy/ui';
import {
  boolParam,
  countActive,
  enumParam,
  fromSortParam,
  intParam,
  optionalIntParam,
  optionalStringParam,
  paginationParams,
  stringParam,
  toSortParam,
  useUrlState,
} from '../../lib/urlState';
import { useAllDrops } from '../products/api';
import { exportOrdersCsv, useBulkStatus, useOrderCounts, useOrdersList, type AdminOrderSummary, type ExportBody, type OrderListFilters } from './api';
import { BulkResultDialog, type BulkFailure } from './BulkResultDialog';
import { printPath, type PrintGroup, type PrintView } from './printPath';
import { HoldExpiredBadge, OrderNumber, PaymentState, RowWhatsappButton, ordersListMemory, useOpenWhatsapp } from './parts';
import {
  BULK_ACTIONS,
  ORDER_TABS,
  SOURCES,
  SOURCE_LABEL,
  STATUS_LABEL,
  TAB_LABEL,
  TAB_STATUSES,
  defaultWhatsappTemplate,
  tabCount,
  type BulkTarget,
  type OrderTab,
} from './status';

const params = {
  status: enumParam(ORDER_TABS, 'ALL'),
  q: stringParam(),
  source: enumParam(['all', ...SOURCES] as const, 'all'),
  areaId: optionalIntParam(),
  dropId: optionalIntParam(),
  from: optionalStringParam(),
  to: optionalStringParam(),
  deliveryNumber: stringParam(),
  holdExpired: boolParam(false),
  sort: stringParam('-placedAt'),
  ...paginationParams,
  page: intParam(1, { min: 1 }),
};

const FILTER_KEYS = ['q', 'source', 'areaId', 'dropId', 'from', 'to', 'deliveryNumber', 'holdExpired'] as const;
const SORTABLE = ['placedAt', 'totalCents', 'number', 'status'] as const;

const SORT_OPTIONS = [
  { value: '-placedAt', label: 'Newest first' },
  { value: 'placedAt', label: 'Oldest first' },
  { value: '-totalCents', label: 'Total, high to low' },
  { value: 'totalCents', label: 'Total, low to high' },
  { value: '-number', label: 'Order number, high to low' },
  { value: 'number', label: 'Order number, low to high' },
  { value: 'status', label: 'Status' },
];

/** Orders list (dashboard-pages 5): tabs with live counts, filters in the URL, sort, bulk actions, export. */
export function OrdersList() {
  const [p, setP] = useUrlState(params);
  const navigate = useNavigate();
  const location = useLocation();
  const f = useFormatters();
  const isMd = useIsMdUp();
  const toast = useToast();
  const notify = useNotifyError();
  const counts = useOrderCounts();
  const areas = useAreas();
  const drops = useAllDrops();
  const bulk = useBulkStatus();
  const selection = useRowSelection();
  const whatsapp = useOpenWhatsapp();

  // The detail page's Esc / back link returns to this exact view.
  useEffect(() => {
    ordersListMemory.search = location.search;
  }, [location.search]);

  const sort = SORTABLE.includes(fromSortParam(p.sort)?.field as (typeof SORTABLE)[number]) ? p.sort : '-placedAt';
  const filters: OrderListFilters = {
    status: TAB_STATUSES[p.status].join(',') || undefined,
    source: p.source === 'all' ? undefined : p.source,
    areaId: p.areaId ?? undefined,
    dropId: p.dropId ?? undefined,
    from: p.from ?? undefined,
    to: p.to ?? undefined,
    deliveryNumber: p.deliveryNumber || undefined,
    q: p.q || undefined,
    holdExpired: p.holdExpired || undefined,
    sort,
    page: p.page,
    pageSize: p.pageSize,
  };
  const query = useOrdersList(filters);
  const rows = query.data?.items;
  const activeFilters = countActive(p, params, [...FILTER_KEYS]);
  const clearFilters = (alsoTab = false) =>
    setP({ q: '', source: 'all', areaId: null, dropId: null, from: null, to: null, deliveryNumber: '', holdExpired: false, ...(alsoTab ? { status: 'ALL' as const } : {}) });

  // Remember what we have seen of every selected order (status, number) so a selection can span pages.
  const seen = useRef(new Map<number, { status: OrderStatus; number: string }>());
  useEffect(() => {
    for (const r of rows ?? []) seen.current.set(r.id, { status: r.status, number: r.number });
  }, [rows]);

  const [confirm, setConfirm] = useState<{ to: BulkTarget; ids: number[] } | null>(null);
  const [result, setResult] = useState<{ updated: number; failed: BulkFailure[] } | null>(null);

  const runBulk = async () => {
    if (!confirm) return;
    const { to, ids } = confirm;
    const res = await bulk.mutateAsync({ ids, to });
    const action = BULK_ACTIONS.find((a) => a.to === to);
    if (res.failed.length === 0) {
      toast.success(`${res.updated.length} ${res.updated.length === 1 ? 'order' : 'orders'} marked ${action?.done ?? STATUS_LABEL[to]}.`);
      selection.clear();
    } else {
      setResult({
        updated: res.updated.length,
        failed: res.failed.map((x) => ({ id: x.id, label: seen.current.get(x.id)?.number ?? `Order ${x.id}`, code: x.code })),
      });
      // Selection is cleared except for the failed ids.
      selection.onSelectionChange(new Set(res.failed.map((x) => x.id)));
    }
  };

  const exportCsv = useMutation({
    mutationFn: async (ids: number[]) => {
      const body: ExportBody =
        ids.length > 0
          ? { ids }
          : {
              status: TAB_STATUSES[p.status].length > 0 ? TAB_STATUSES[p.status] : undefined,
              source: filters.source,
              areaId: filters.areaId,
              dropId: filters.dropId,
              from: filters.from,
              to: filters.to,
              deliveryNumber: filters.deliveryNumber,
              q: filters.q,
              holdExpired: filters.holdExpired,
            };
      return exportOrdersCsv(body);
    },
    onSuccess: ({ blob, filename }) => {
      saveBlob(blob, filename);
      toast.success('Export downloaded.');
    },
    onError: (e) => notify(e, { fallback: 'Export failed. Try again.' }),
  });

  /** Print every order matching the current tab and filters (selection is ignored; use "Print selected" for that). */
  const printAll = (view: PrintView, group?: PrintGroup) =>
    printPath({
      view,
      group,
      filters: {
        status: filters.status,
        source: filters.source,
        areaId: filters.areaId,
        dropId: filters.dropId,
        from: filters.from,
        to: filters.to,
        deliveryNumber: filters.deliveryNumber,
        q: filters.q,
        holdExpired: filters.holdExpired,
        // An unfiltered "All" tab still needs one filter key so the print page runs by filter, not by ids.
        ...(!filters.status && !filters.source && filters.areaId === undefined && !filters.dropId && !filters.from && !filters.to && !filters.deliveryNumber && !filters.q && !filters.holdExpired
          ? { status: [...new Set(Object.values(TAB_STATUSES).flat())].join(',') }
          : {}),
      },
    });

  const columns: Column<AdminOrderSummary>[] = [
    {
      id: 'number',
      header: 'Order no.',
      sortKey: 'number',
      defaultSortDirection: 'desc',
      priority: 'primary',
      className: 'whitespace-nowrap',
      width: '8rem',
      cell: (o) => (
        <a href={`/orders/${o.id}`} className="font-mono tabular-nums underline underline-offset-4" onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          navigate(`/orders/${o.id}`);
        }}>
          {o.number}
        </a>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      sortKey: 'totalCents',
      defaultSortDirection: 'desc',
      numeric: true,
      priority: 'primary',
      width: '6rem',
      cell: (o) => f.money(o.totalCents),
    },
    {
      id: 'status',
      header: 'Status',
      sortKey: 'status',
      priority: 'primary',
      width: '11rem',
      cell: (o) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={o.status} size="sm" />
          {o.holdExpired ? <HoldExpiredBadge /> : null}
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Date',
      sortKey: 'placedAt',
      defaultSortDirection: 'desc',
      priority: 'primary',
      width: '8rem',
      cell: (o) => (
        <time dateTime={o.placedAt} title={f.dateTime(o.placedAt)} className="whitespace-nowrap tabular-nums text-fg-muted">
          {f.relative(o.placedAt)}
        </time>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      mobileLabel: '',
      cell: (o) => {
        const tel = telHref(o.contactPhone);
        return (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{o.customerName}</span>
            <span className="truncate text-fg-muted">
              {tel ? (
                <a href={tel} className="tabular-nums underline underline-offset-4">
                  {o.contactPhone}
                </a>
              ) : (
                o.contactPhone
              )}
              {o.areaName ? <span> · {o.areaName}</span> : null}
            </span>
          </span>
        );
      },
    },
    {
      id: 'items',
      header: 'Items',
      mobileLabel: '',
      className: 'max-w-[8rem]',
      cell: (o) => (
        <span className="block truncate" title={o.itemsSummary}>
          {o.itemsSummary}
        </span>
      ),
    },
    {
      id: 'delivery',
      header: 'Delivery no.',
      mobileLabel: 'Delivery no.',
      cell: (o) => (o.deliveryNumber ? <span className="whitespace-nowrap font-mono">{o.deliveryNumber}</span> : <span className="text-fg-muted">—</span>),
    },
    { id: 'payment', header: 'Payment', mobileLabel: 'Payment', cell: (o) => <PaymentState order={o} /> },
  ];

  const selectedIds = [...selection.selectedIds].map(Number);
  const selectedStatuses = selectedIds.map((id) => seen.current.get(id)?.status);

  const total = query.data?.total ?? 0;
  const noOrdersAtAll = counts.data?.ALL === 0 && activeFilters === 0 && p.status === 'ALL';

  const tabs = ORDER_TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: tabCount(t, counts.data) }));

  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <Button href="/orders/new" variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />}>
            New order
          </Button>
        }
      />
      <Tabs aria-label="Order status" tabs={tabs} value={p.status} onChange={(t) => { setP({ status: t as OrderTab }); selection.clear(); }} />
      <div className="flex flex-col gap-4 pt-4">
        <FilterBar
          search={<SearchField label="Search orders" placeholder="Search orders, customers, or delivery number..." value={p.q} onChange={(q) => setP({ q }, { replace: true })} shortcut />}
          activeCount={activeFilters}
          onClear={() => clearFilters()}
          actions={
            <>
              <Menu
                label="Print orders matching the current tab and filters"
                trigger={
                  <span className="inline-flex items-center gap-1.5">
                    <Printer size={20} aria-hidden="true" />
                    Print all{total > 0 ? ` (${total})` : ''}
                  </span>
                }
                items={[
                  { id: 'sheet', label: 'Delivery sheet', href: printAll('sheet'), disabled: total === 0 },
                  { id: 'labels', label: 'Labels', href: printAll('labels'), disabled: total === 0 },
                  { id: 'invoices', label: 'Invoices (one per order)', href: printAll('invoices'), disabled: total === 0 },
                  { id: 'invoices-area', label: 'Invoices, by area', href: printAll('invoices', 'area'), disabled: total === 0 },
                  { id: 'sheet-area', label: 'Delivery sheet, by area', href: printAll('sheet', 'area'), disabled: total === 0, separatorBefore: true },
                  { id: 'sheet-status', label: 'Delivery sheet, by status', href: printAll('sheet', 'status'), disabled: total === 0 },
                  { id: 'sheet-delivery', label: 'Delivery sheet, by delivery number', href: printAll('sheet', 'delivery'), disabled: total === 0 },
                  { id: 'labels-area', label: 'Labels, by area', href: printAll('labels', 'area'), disabled: total === 0, separatorBefore: true },
                  { id: 'labels-status', label: 'Labels, by status', href: printAll('labels', 'status'), disabled: total === 0 },
                ]}
              />
              <Button
                variant="secondary"
                loading={exportCsv.isPending}
                leftIcon={<Download size={20} aria-hidden="true" />}
                onClick={() => exportCsv.mutate(selectedIds)}
              >
                {selectedIds.length > 0 ? `Export selected (${selectedIds.length})` : 'Export CSV'}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Source
            <Select
              value={p.source}
              onChange={(e) => setP({ source: e.target.value as (typeof params.source)['defaultValue'] })}
              options={[{ value: 'all', label: 'All sources' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]}
            />
          </label>
          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Area
            <Select
              value={p.areaId === null ? '' : String(p.areaId)}
              onChange={(e) => setP({ areaId: e.target.value === '' ? null : Number(e.target.value) })}
              options={[{ value: '', label: 'All areas' }, ...(areas.data?.items ?? []).map((a) => ({ value: String(a.id), label: a.name }))]}
            />
          </label>
          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Drop
            <Select
              value={p.dropId === null ? '' : String(p.dropId)}
              onChange={(e) => setP({ dropId: e.target.value === '' ? null : Number(e.target.value) })}
              options={[{ value: '', label: 'All drops' }, ...(drops.data?.items ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
            />
          </label>
          <div className="w-52 shrink-0"><DateTimeInput kind="date" label="From" value={p.from} onChange={(v) => setP({ from: v })} max={p.to ?? undefined} /></div>
          <div className="w-52 shrink-0"><DateTimeInput kind="date" label="To" value={p.to} onChange={(v) => setP({ to: v })} min={p.from ?? undefined} /></div>
          <div className="flex min-w-40 flex-col gap-1 text-body-sm font-medium">
            Delivery number
            <SearchField label="Delivery number" placeholder="e.g. D-88231" value={p.deliveryNumber} onChange={(deliveryNumber) => setP({ deliveryNumber }, { replace: true })} />
          </div>
          <Switch label="Hold expired only" checked={p.holdExpired} onChange={(holdExpired) => setP({ holdExpired })} />
          {!isMd ? (
            <label className="flex flex-col gap-1 text-body-sm font-medium">
              Sort
              <Select value={sort} onChange={(e) => setP({ sort: e.target.value })} options={SORT_OPTIONS} />
            </label>
          ) : null}
        </FilterBar>

        <DataTable
          caption="Orders"
          columns={columns}
          rows={rows}
          getRowId={(o) => o.id}
          rowLabel={(o) => o.number}
          loading={query.isPending}
          refreshing={query.isFetching && !query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          sort={fromSortParam(sort)}
          onSortChange={(s) => setP({ sort: toSortParam(s.field, s.direction) })}
          selectable
          selectedIds={selection.selectedIds}
          onSelectionChange={selection.onSelectionChange}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
          rowClassName={(o) => (o.holdExpired ? 'border-l-4 border-l-danger' : undefined)}
          rowActions={(o) => (
            <span className="flex items-center justify-end">
              {isMd ? <RowWhatsappButton order={o} /> : null}
              <Menu
                label={`Actions for ${o.number}`}
                items={[
                  { id: 'open', label: 'Open', href: `/orders/${o.id}` },
                  { id: 'label', label: 'Print label', icon: <Printer size={18} aria-hidden="true" />, href: `/orders/${o.id}/label` },
                  { id: 'invoice', label: 'Print invoice', icon: <Printer size={18} aria-hidden="true" />, href: `/orders/${o.id}/invoice` },
                  ...(defaultWhatsappTemplate(o.status)
                    ? [{ id: 'wa', label: 'Message on WhatsApp', icon: <MessageCircle size={18} aria-hidden="true" />, onSelect: () => void whatsapp.open(o.id, defaultWhatsappTemplate(o.status)!) }]
                    : []),
                  { id: 'copy', label: 'Copy order number', onSelect: () => void navigator.clipboard?.writeText(o.number).then(() => toast.success('Copied')).catch(() => toast.error("Couldn't copy. Select the number and copy it.")) },
                ]}
              />
            </span>
          )}
          empty={
            noOrdersAtAll ? (
              <EmptyState
                title="No orders yet"
                text="Orders from the website appear here within seconds."
                action={<Button href="/orders/new" variant="primary">New order</Button>}
              />
            ) : (
              <EmptyState
                title="No orders match these filters"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => clearFilters(true)}
                  >
                    Clear filters
                  </Button>
                }
              />
            )
          }
          bulkBar={() => {
            const allIn = (s: OrderStatus) => selectedStatuses.length > 0 && selectedStatuses.every((x) => x === s);
            const hasSelection = selectedIds.length > 0;
            return (
              <>
                {BULK_ACTIONS.map((a) => {
                  const ok = allIn(a.from);
                  const button = (
                    <Button variant="secondary" size="sm" disabled={!ok || bulk.isPending} onClick={() => setConfirm({ to: a.to, ids: selectedIds })}>
                      {a.label}
                    </Button>
                  );
                  return ok ? <span key={a.to}>{button}</span> : (
                    <Tooltip key={a.to} content={a.onlyHint}>
                      <span tabIndex={0} className="inline-flex">{button}</span>
                    </Tooltip>
                  );
                })}
                <Menu
                  label="Print selected orders"
                  align="start"
                  trigger={
                    <span className="inline-flex items-center gap-1.5">
                      <Printer size={16} aria-hidden="true" />
                      Print selected ({selectedIds.length})
                    </span>
                  }
                  items={[
                    { id: 'sheet', label: 'Delivery sheet', href: printPath({ view: 'sheet', ids: selectedIds }), disabled: !hasSelection },
                    { id: 'labels', label: 'Labels', href: printPath({ view: 'labels', ids: selectedIds }), disabled: !hasSelection },
                    { id: 'invoices', label: 'Invoices (one per order)', href: printPath({ view: 'invoices', ids: selectedIds }), disabled: !hasSelection },
                    { id: 'sheet-area', label: 'Delivery sheet, grouped by area', href: printPath({ view: 'sheet', group: 'area', ids: selectedIds }), disabled: !hasSelection },
                    { id: 'labels-area', label: 'Labels, grouped by area', href: printPath({ view: 'labels', group: 'area', ids: selectedIds }), disabled: !hasSelection },
                  ]}
                />
              </>
            );
          }}
          footer={<Pagination page={p.page} pageSize={p.pageSize} total={total} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={query.isFetching} />}
        />
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `Mark ${confirm.ids.length} ${confirm.ids.length === 1 ? 'order' : 'orders'} as ${STATUS_LABEL[confirm.to]}?` : ''}
        description={
          confirm?.to === 'DELIVERED'
            ? `Mark ${confirm.ids.length} orders as Delivered? Customers with an email are emailed "Delivered" and cash is now expected.`
            : confirm
              ? `Mark ${confirm.ids.length} ${confirm.ids.length === 1 ? 'order' : 'orders'} as ${STATUS_LABEL[confirm.to]}?${confirm.to === 'CONFIRMED' ? ' Customers with an email are emailed "Order confirmed".' : ''}`
              : null
        }
        notUndoable
        confirmLabel={confirm ? `Mark ${confirm.ids.length} as ${STATUS_LABEL[confirm.to]}` : 'Confirm'}
        onConfirm={runBulk}
      />
      <BulkResultDialog
        open={result !== null}
        updated={result?.updated ?? 0}
        failed={result?.failed ?? []}
        onClose={() => setResult(null)}
        onSelectFailed={() => {
          selection.onSelectionChange(new Set((result?.failed ?? []).map((x) => x.id)));
          setResult(null);
        }}
      />
    </>
  );
}
