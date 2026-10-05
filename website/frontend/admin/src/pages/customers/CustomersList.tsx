import { useState } from 'react';
import { Download, Mail, MessageCircle, TriangleAlert } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button, EmptyState, Input, Pill, Select, Skeleton, TextLink, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { DataTable, useRowSelection, type Column } from '../../components/DataTable';
import { DateTimeInput } from '../../components/DateTimeInput';
import { FilterBar } from '../../components/FilterBar';
import { Pagination } from '../../components/Pagination';
import { SearchField } from '../../components/SearchField';
import { saveBlob } from '../../lib/download';
import { useFormatters } from '../../lib/format';
import { mailtoHref, telHref, whatsappDigitsLink } from '../../lib/links';
import { useAreas } from '../../lib/refdata';
import { countActive, enumParam, optionalIntParam, optionalStringParam, paginationParams, stringParam, useUrlState } from '../../lib/urlState';
import { BulkMessageDialog } from './BulkMessageDialog';
import { exportSubscribersCsv, toFilterBody, useCustomers, useSubscribers, type BulkChannel, type BulkTarget, type CustomerRow, type Subscriber } from './api';

const YES_NO = ['any', 'yes', 'no'] as const;
const params = {
  q: stringParam(),
  areaId: optionalIntParam(),
  ordersMin: optionalIntParam(),
  ordersMax: optionalIntParam(),
  spentMin: optionalIntParam(),
  spentMax: optionalIntParam(),
  lastOrderBefore: optionalStringParam(),
  lastOrderAfter: optionalStringParam(),
  hasEmail: enumParam(YES_NO, 'any'),
  returned: enumParam(YES_NO, 'any'),
  optedOut: enumParam(YES_NO, 'any'),
  ...paginationParams,
};
const subscriberParams = { q: stringParam(), ...paginationParams };
const FILTER_KEYS = ['areaId', 'ordersMin', 'ordersMax', 'spentMin', 'spentMax', 'lastOrderBefore', 'lastOrderAfter', 'hasEmail', 'returned', 'optedOut'] as const;
const RESET = { areaId: null, ordersMin: null, ordersMax: null, spentMin: null, spentMax: null, lastOrderBefore: null, lastOrderAfter: null, hasEmail: 'any', returned: 'any', optedOut: 'any' } as const;

/** A whole-number text box that writes `null` when empty. */
function NumberFilter({ label, value, onChange, prefix }: { label: string; value: number | null; onChange: (v: number | null) => void; prefix?: string }) {
  return (
    <label className="flex w-28 flex-col gap-1 text-body-sm font-medium">
      {label}
      <Input
        inputMode="numeric"
        prefixText={prefix}
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
          onChange(digits === '' ? null : Number(digits));
        }}
      />
    </label>
  );
}

function YesNoFilter({ label, value, onChange, yes, no }: { label: string; value: (typeof YES_NO)[number]; onChange: (v: (typeof YES_NO)[number]) => void; yes: string; no: string }) {
  return (
    <label className="flex flex-col gap-1 text-body-sm font-medium">
      {label}
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value as (typeof YES_NO)[number])}
        options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: yes }, { value: 'no', label: no }]}
      />
    </label>
  );
}

/** Customers -> All / Repeat (dashboard-pages 10.1). Repeat = customers with 2+ orders. */
export function CustomersList({ filter }: { filter: 'all' | 'repeat' }) {
  const [p, setP] = useUrlState(params);
  const f = useFormatters();
  const areas = useAreas();
  const selection = useRowSelection();
  const [message, setMessage] = useState<{ channel: BulkChannel; scope: 'selected' | 'all' } | null>(null);
  const query = useCustomers({ filter, ...p });
  const activeFilters = countActive(p, params, [...FILTER_KEYS]);
  const clearFilters = () => setP({ ...RESET });
  const total = query.data?.total ?? 0;
  const selectedIds = [...selection.selectedIds].map(Number);
  const target: BulkTarget =
    message?.scope === 'selected'
      ? { ids: selectedIds }
      : { filters: toFilterBody({ filter, q: p.q, areaId: p.areaId, ordersMin: p.ordersMin, ordersMax: p.ordersMax, spentMin: p.spentMin, spentMax: p.spentMax, lastOrderBefore: p.lastOrderBefore, lastOrderAfter: p.lastOrderAfter, hasEmail: p.hasEmail, returned: p.returned, optedOut: p.optedOut }) };
  const targetLabel = message?.scope === 'selected' ? `${selectedIds.length} selected ${selectedIds.length === 1 ? 'customer' : 'customers'}` : `all ${total} matching ${total === 1 ? 'customer' : 'customers'}`;

  const columns: Column<CustomerRow>[] = [
    {
      id: 'name',
      header: 'Name',
      priority: 'primary',
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          <TextLink href={`/customers/${c.id}`} className="font-medium">
            {c.name}
          </TextLink>
          {c.optedOut ? (
            <Pill tone="neutral" size="sm" title="Asked not to receive bulk messages">
              Opted out
            </Pill>
          ) : null}
          {c.warning ? (
            <Pill tone="danger" size="sm" icon={<TriangleAlert size={12} aria-hidden="true" />} title={`${c.returnedCount} returned orders`}>
              {c.returnedCount} returns
            </Pill>
          ) : null}
        </span>
      ),
    },
    { id: 'spent', header: 'Total spent', numeric: true, priority: 'primary', cell: (c) => f.money(c.totalSpentCents) },
    { id: 'email', header: 'Email', cell: (c) => (mailtoHref(c.email) ? <a href={mailtoHref(c.email) ?? undefined} className="break-all underline underline-offset-4">{c.email}</a> : <span className="text-fg-muted">—</span>) },
    { id: 'phone', header: 'Phone', cell: (c) => (telHref(c.phone) ? <a href={telHref(c.phone) ?? undefined} className="tabular-nums underline underline-offset-4">{c.phone}</a> : c.phone) },
    {
      id: 'whatsapp',
      header: 'WhatsApp',
      cell: (c) => {
        const link = whatsappDigitsLink(c.whatsapp);
        return link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 tabular-nums underline underline-offset-4">
            <MessageCircle size={14} aria-hidden="true" /> {c.whatsapp}
          </a>
        ) : (
          c.whatsapp
        );
      },
    },
    { id: 'area', header: 'Area', cell: (c) => c.areaName ?? <span className="text-fg-muted">—</span> },
    { id: 'orders', header: 'Orders', numeric: true, cell: (c) => c.ordersCount },
    { id: 'last', header: 'Last order', cell: (c) => (c.lastOrderAt ? <time dateTime={c.lastOrderAt} title={f.dateTime(c.lastOrderAt)} className="tabular-nums">{f.relative(c.lastOrderAt)}</time> : <span className="text-fg-muted">—</span>) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={<SearchField label="Search customers" placeholder="Search name, phone, email or WhatsApp" value={p.q} onChange={(q) => setP({ q }, { replace: true })} shortcut />}
        activeCount={activeFilters}
        onClear={clearFilters}
        actions={
          <>
            <Button variant="secondary" leftIcon={<Mail size={20} aria-hidden="true" />} disabled={total === 0} onClick={() => setMessage({ channel: 'EMAIL', scope: 'all' })}>
              Email all{total > 0 ? ` (${total})` : ''}
            </Button>
            <Button variant="secondary" leftIcon={<MessageCircle size={20} aria-hidden="true" />} disabled={total === 0} onClick={() => setMessage({ channel: 'WHATSAPP', scope: 'all' })}>
              WhatsApp all
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Area
          <Select
            value={p.areaId === null ? '' : String(p.areaId)}
            onChange={(e) => setP({ areaId: e.target.value === '' ? null : Number(e.target.value) })}
            options={[{ value: '', label: 'All areas' }, ...(areas.data?.items ?? []).map((a) => ({ value: String(a.id), label: a.name }))]}
          />
        </label>
        <NumberFilter label="Orders from" value={p.ordersMin} onChange={(v) => setP({ ordersMin: v })} />
        <NumberFilter label="Orders to" value={p.ordersMax} onChange={(v) => setP({ ordersMax: v })} />
        <NumberFilter label="Spent from" prefix="$" value={p.spentMin} onChange={(v) => setP({ spentMin: v })} />
        <NumberFilter label="Spent to" prefix="$" value={p.spentMax} onChange={(v) => setP({ spentMax: v })} />
        <div className="w-52 shrink-0"><DateTimeInput kind="date" label="Last order after" value={p.lastOrderAfter} onChange={(v) => setP({ lastOrderAfter: v })} max={p.lastOrderBefore ?? undefined} /></div>
        <div className="w-52 shrink-0"><DateTimeInput kind="date" label="Last order before" value={p.lastOrderBefore} onChange={(v) => setP({ lastOrderBefore: v })} min={p.lastOrderAfter ?? undefined} /></div>
        <YesNoFilter label="Has email" value={p.hasEmail} onChange={(hasEmail) => setP({ hasEmail })} yes="With email" no="No email" />
        <YesNoFilter label="Returns" value={p.returned} onChange={(returned) => setP({ returned })} yes="Has returns" no="No returns" />
        <YesNoFilter label="Bulk messages" value={p.optedOut} onChange={(optedOut) => setP({ optedOut })} yes="Opted out" no="Not opted out" />
      </FilterBar>
      <DataTable
        selectable
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.onSelectionChange}
        bulkBar={() => (
          <>
            <Button variant="secondary" size="sm" leftIcon={<Mail size={16} aria-hidden="true" />} onClick={() => setMessage({ channel: 'EMAIL', scope: 'selected' })}>
              Email selected ({selectedIds.length})
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<MessageCircle size={16} aria-hidden="true" />} onClick={() => setMessage({ channel: 'WHATSAPP', scope: 'selected' })}>
              WhatsApp selected ({selectedIds.length})
            </Button>
          </>
        )}
        caption={filter === 'repeat' ? 'Repeat customers' : 'Customers'}
        columns={columns}
        rows={query.data?.items}
        getRowId={(c) => c.id}
        rowLabel={(c) => c.name}
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={
          <EmptyState
            title={p.q || activeFilters > 0 ? 'No customers match these filters' : filter === 'repeat' ? 'No repeat customers yet' : 'No customers yet'}
            text={p.q || activeFilters > 0 ? undefined : filter === 'repeat' ? 'Customers with two or more orders appear here.' : 'Customers are created automatically when they order.'}
            action={p.q || activeFilters > 0 ? <Button variant="secondary" onClick={() => { setP({ q: '' }); clearFilters(); }}>Clear filters</Button> : undefined}
          />
        }
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={query.data?.total ?? 0} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={query.isFetching} />}
      />
      {message ? (
        <BulkMessageDialog
          open
          onClose={() => {
            if (message.scope === 'selected') selection.clear();
            setMessage(null);
          }}
          channel={message.channel}
          target={target}
          targetLabel={targetLabel}
        />
      ) : null}
    </div>
  );
}

/** Customers -> Subscribers (dashboard-pages 10.3): drop "notify me" sign-ups with CSV export. */
export function SubscribersTab() {
  const [p, setP] = useUrlState(subscriberParams);
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const query = useSubscribers({ q: p.q, page: p.page, pageSize: p.pageSize });
  const exportCsv = useMutation({
    mutationFn: exportSubscribersCsv,
    onSuccess: ({ blob, filename }) => {
      saveBlob(blob, filename);
      toast.success('Export downloaded.');
    },
    onError: (e) => notify(e, { fallback: 'Export failed. Try again.' }),
  });
  const columns: Column<Subscriber>[] = [
    { id: 'contact', header: 'Contact', priority: 'primary', cell: (s) => <span className="break-all font-medium">{s.contact}</span> },
    { id: 'type', header: 'Type', cell: (s) => (s.type === 'EMAIL' ? 'Email' : 'WhatsApp') },
    { id: 'drop', header: 'Drop', cell: (s) => s.dropName ?? 'Any drop' },
    { id: 'at', header: 'Signed up', cell: (s) => <time dateTime={s.createdAt} title={f.dateTime(s.createdAt)} className="tabular-nums">{f.dateTime(s.createdAt)}</time> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-fg-muted">Use this list for WhatsApp broadcasts about drops. Only people who asked to be notified are listed.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1 md:max-w-md">
          <SearchField label="Search subscribers" placeholder="Search contact" value={p.q} onChange={(q) => setP({ q }, { replace: true })} />
        </div>
        <Button variant="secondary" loading={exportCsv.isPending} leftIcon={<Download size={18} aria-hidden="true" />} onClick={() => exportCsv.mutate()}>
          Export CSV
        </Button>
      </div>
      <DataTable
        caption="Subscribers"
        columns={columns}
        rows={query.data?.items}
        getRowId={(s) => s.id}
        loading={query.isPending}
        refreshing={query.isFetching && !query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={<EmptyState title={p.q ? 'No subscribers match this search' : 'No subscribers yet'} text={p.q ? undefined : "'Notify me' sign-ups appear here."} />}
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={query.data?.total ?? 0} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={query.isFetching} />}
      />
      {query.isPending ? <Skeleton variant="text" className="sr-only" /> : null}
    </div>
  );
}
