import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button, EmptyState, Skeleton, useToast } from '@stimpy/ui';
import { api } from '../../api/client';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { PageHeader } from '../../components/PageHeader';
import { QueryBoundary } from '../../components/QueryBoundary';
import { filenameFromDisposition, saveBlob, todayStamp } from '../../lib/download';
import { useFormatters } from '../../lib/format';
import { useDrop, useDropMutations, useDropSubscribers, type AdminDrop, type Subscriber } from './api';
import { DropEditor } from './DropEditor';
import { dropControls, formatDuration, hoursToSellOut } from './dropForm';
import { AccentChip, StateBadge } from './parts';

/** Subscribers of one drop (people who asked to be notified) with the CSV export for that drop. */
function DropSubscribers({ drop }: { drop: AdminDrop }) {
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const q = useDropSubscribers(drop.id, page, pageSize);
  const exportCsv = useMutation({
    mutationFn: async () => {
      const r = await api.GET('/api/v1/admin/subscribers', { params: { query: { format: 'csv', dropId: drop.id } }, parseAs: 'blob' });
      return { blob: r.data as unknown as Blob, filename: filenameFromDisposition(r.response.headers.get('content-disposition'), `subscribers-${todayStamp()}.csv`) };
    },
    onSuccess: ({ blob, filename }) => {
      saveBlob(blob, filename);
      toast.success('Export downloaded.');
    },
    onError: (e) => notify(e, { fallback: 'Export failed. Try again.' }),
  });
  const columns: Column<Subscriber>[] = [
    { id: 'contact', header: 'Contact', priority: 'primary', cell: (s) => <span className="break-all font-medium">{s.contact}</span> },
    { id: 'type', header: 'Type', cell: (s) => (s.type === 'EMAIL' ? 'Email' : 'WhatsApp') },
    { id: 'at', header: 'Signed up', cell: (s) => <span className="tabular-nums">{f.dateTime(s.createdAt)}</span> },
  ];
  return (
    <section aria-labelledby="subs-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="subs-title" className="text-h4">Subscribers</h2>
          <p className="text-body-sm text-fg-muted">Only people who asked to be notified about this drop. Use the CSV for WhatsApp broadcasts.</p>
        </div>
        <Button variant="secondary" loading={exportCsv.isPending} leftIcon={<Download size={18} aria-hidden="true" />} onClick={() => exportCsv.mutate()}>
          Export CSV
        </Button>
      </div>
      <DataTable
        caption={`${drop.name} subscribers`}
        columns={columns}
        rows={q.data?.items}
        getRowId={(s) => s.id}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={<EmptyState title="No subscribers yet" text="'Notify me' sign-ups for this drop appear here." headingLevel={3} />}
        footer={<Pagination page={page} pageSize={pageSize} total={q.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} busy={q.isFetching} />}
      />
    </section>
  );
}

/** Results of a drop: totals and per-Stimpie sold / remaining. */
function DropResults({ drop }: { drop: AdminDrop }) {
  const f = useFormatters();
  const h = hoursToSellOut(drop.startsAt, drop.sellOutAt);
  const columns: Column<AdminDrop['stimpies'][number]>[] = [
    { id: 'name', header: 'Stimpie', priority: 'primary', cell: (s) => <span className="font-medium">{s.name}{!s.active ? ' (hidden)' : ''}</span> },
    { id: 'remaining', header: 'Remaining', numeric: true, priority: 'primary', mobileLabel: 'Left', cell: (s) => s.remaining },
    { id: 'quantity', header: 'Quantity', numeric: true, cell: (s) => s.quantity },
    { id: 'sold', header: 'Sold', numeric: true, cell: (s) => s.sold },
  ];
  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-3">
      <h2 id="results-title" className="text-h4">Results</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Units sold', `${drop.unitsSold} / ${drop.unitsTotal}`],
          ['Remaining', String(drop.unitsRemaining)],
          ['Revenue', f.money(drop.revenueCents)],
          ['Sold out', drop.sellOutAt ? `${f.dateTime(drop.sellOutAt)}${h !== null ? ` (${formatDuration(h)} after launch)` : ''}` : 'Not sold out'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-base p-3">
            <dt className="text-body-sm text-fg-muted">{k}</dt>
            <dd className="text-body font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <DataTable caption={`${drop.name} Stimpies`} columns={columns} rows={drop.stimpies} getRowId={(s) => s.id} />
    </section>
  );
}

function EndDropButton({ drop }: { drop: AdminDrop }) {
  const toast = useToast();
  const { end } = useDropMutations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" className="!border-danger !text-fg-danger" onClick={() => setOpen(true)}>End drop now</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        tone="destructive"
        title={`End '${drop.name}' now?`}
        description="The website stops selling its Stimpies immediately. Open orders are not cancelled."
        notUndoable
        requireText={drop.name}
        confirmLabel="End drop now"
        onConfirm={async () => {
          await end.mutateAsync(drop.id);
          toast.success(`${drop.name} ended.`);
        }}
      />
    </>
  );
}

function DropView({ drop }: { drop: AdminDrop }) {
  const navigate = useNavigate();
  const f = useFormatters();
  const ctl = dropControls(drop.state);
  const archived = drop.state === 'ENDED' || drop.state === 'SOLD_OUT';
  return (
    <>
      <PageHeader
        title={drop.name}
        breadcrumbs={[{ label: 'Drops', to: '/drops' }, { label: drop.name }]}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StateBadge state={drop.state} />
            <AccentChip accentHex={drop.accentHex} />
            <span className="tabular-nums">Launch {f.dateTime(drop.startsAt)}</span>
          </span>
        }
        actions={ctl.canEnd ? <EndDropButton drop={drop} /> : undefined}
      />
      <div className="flex max-w-3xl flex-col gap-8">
        {drop.state !== 'UPCOMING' ? <DropResults drop={drop} /> : null}
        <DropEditor key={`${drop.id}-${drop.state}-${drop.endedAt ?? ''}`} initial={drop} onDone={() => navigate(archived ? '/drops?tab=archive' : drop.state === 'LIVE' ? '/drops?tab=live' : '/drops')} />
        <DropSubscribers drop={drop} />
      </div>
    </>
  );
}

/** `/drops/:id` for every state; `/drops/new` creates. */
export function DropDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const numeric = id === undefined || id === 'new' ? null : Number(id);
  const q = useDrop(numeric !== null && Number.isFinite(numeric) ? numeric : null);
  if (id === 'new' || id === undefined) {
    return (
      <>
        <PageHeader title="New drop" breadcrumbs={[{ label: 'Drops', to: '/drops' }, { label: 'New drop' }]} />
        <div className="max-w-3xl">
          <DropEditor initial={null} onDone={() => navigate('/drops')} />
        </div>
      </>
    );
  }
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />} notFoundWhat="drop" notFoundBackTo="/drops" notFoundBackLabel="Back to drops">
      {(drop) => <DropView drop={drop} />}
    </QueryBoundary>
  );
}

