import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Banner, Button, EmptyState, ProgressBar, TextLink, useToast } from '@stimpy/ui';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { unitsPerHour } from '../../lib/ranges';
import { paginationParams, useUrlState } from '../../lib/urlState';
import { Skeleton } from '@stimpy/ui';
import { useDropMutations, useDrops, type AdminDrop } from './api';
import { hoursToSellOut, formatDuration } from './dropForm';
import { AccentChip, StateBadge, remainingText, useNow } from './parts';

const params = { ...paginationParams };

function EditLink({ drop }: { drop: AdminDrop }) {
  return (
    <Button href={`/drops/${drop.id}`} variant="secondary" size="sm" aria-label={`${drop.state === 'UPCOMING' ? 'Edit' : 'Open'} ${drop.name}`}>
      {drop.state === 'UPCOMING' ? 'Edit' : 'Open'}
    </Button>
  );
}

/** Upcoming tab (dashboard-pages 9.1): name, accent chip, launch, Stimpies count, units, Edit. */
export function UpcomingTab() {
  const f = useFormatters();
  const q = useDrops('UPCOMING', 1, 100);
  const columns: Column<AdminDrop>[] = [
    { id: 'name', header: 'Drop', priority: 'primary', cell: (d) => <TextLink href={`/drops/${d.id}`} className="font-medium">{d.name}</TextLink> },
    { id: 'launch', header: 'Launch', priority: 'primary', mobileLabel: '', cell: (d) => <time dateTime={d.startsAt} className="tabular-nums">{f.dateTime(d.startsAt)}</time> },
    { id: 'accent', header: 'Accent', cell: (d) => <AccentChip accentHex={d.accentHex} /> },
    { id: 'stimpies', header: 'Stimpies', numeric: true, cell: (d) => d.stimpies.length },
    { id: 'units', header: 'Total units', numeric: true, cell: (d) => d.unitsTotal },
    { id: 'edit', header: 'Edit', mobileLabel: '', cell: (d) => <EditLink drop={d} /> },
  ];
  return (
    <DataTable
      caption="Upcoming drops"
      columns={columns}
      rows={q.data?.items}
      getRowId={(d) => d.id}
      rowLabel={(d) => d.name}
      loading={q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      empty={<EmptyState title="No upcoming drops" text="Plan the next drop: pick a launch time and assign its Stimpies." action={<Button href="/drops/new" variant="primary" leftIcon={<Plus size={18} aria-hidden="true" />}>New drop</Button>} />}
    />
  );
}

function LiveDropPanel({ drop }: { drop: AdminDrop }) {
  const f = useFormatters();
  const now = useNow();
  const toast = useToast();
  const { end } = useDropMutations();
  const [confirm, setConfirm] = useState(false);
  const pct = drop.unitsTotal > 0 ? Math.round((drop.unitsSold / drop.unitsTotal) * 100) : 0;
  const rate = unitsPerHour(drop.unitsSold, drop.startsAt, now);
  const columns: Column<AdminDrop['stimpies'][number]>[] = [
    { id: 'name', header: 'Stimpie', priority: 'primary', cell: (s) => <span className="font-medium">{s.name}</span> },
    { id: 'remaining', header: 'Remaining', numeric: true, priority: 'primary', mobileLabel: 'Left', cell: (s) => (s.remaining === 0 ? <span className="inline-flex items-center gap-2 font-medium">0 <span className="rounded-sm bg-ink px-1.5 py-0.5 text-body-sm font-medium text-white">Sold out</span></span> : s.remaining) },
    { id: 'quantity', header: 'Quantity', numeric: true, cell: (s) => s.quantity },
    { id: 'sold', header: 'Sold', numeric: true, cell: (s) => s.sold },
  ];
  return (
    <section aria-labelledby={`live-${drop.id}`} className="flex flex-col gap-4 rounded-lg border border-base p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={`live-${drop.id}`} className="text-h4">
            <TextLink href={`/drops/${drop.id}`}>{drop.name}</TextLink>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <StateBadge state={drop.state} />
            <AccentChip accentHex={drop.accentHex} />
            <span className="text-body-sm text-fg-muted" data-testid="drop-ends">
              {drop.endsAt ? `Ends in ${remainingText(drop.endsAt, now)} (${f.dateTime(drop.endsAt)})` : 'No end date'}
            </span>
          </div>
        </div>
        <Button variant="secondary" className="!border-danger !text-fg-danger" onClick={() => setConfirm(true)}>
          End drop now
        </Button>
      </div>
      <div>
        <p className="mb-1 text-body font-medium tabular-nums">
          {drop.unitsSold} of {drop.unitsTotal} sold ({pct}%)
        </p>
        <ProgressBar value={pct} aria-label={`${drop.name}: ${drop.unitsSold} of ${drop.unitsTotal} units sold`} />
        <p className="mt-1 text-body-sm text-fg-muted tabular-nums">
          {rate === null ? 'Sell-through speed shows after the first minutes.' : `${rate} units per hour (avg since launch)`} &middot; {drop.unitsRemaining} left
        </p>
      </div>
      <DataTable caption={`${drop.name} Stimpies`} columns={columns} rows={drop.stimpies} getRowId={(s) => s.id} layout="auto" />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="destructive"
        title={`End '${drop.name}' now?`}
        description="The website stops selling its Stimpies immediately. Open orders are not cancelled."
        notUndoable
        requireText={drop.name}
        confirmLabel="End drop now"
        onConfirm={async () => {
          await end.mutateAsync(drop.id);
          toast.success(`${drop.name} ended. It is now in the archive.`);
        }}
      />
    </section>
  );
}

/** Live tab (dashboard-pages 9.2): refreshes every 30 s. */
export function LiveTab() {
  const q = useDrops('LIVE', 1, 100, 30_000);
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-64" />}>
      {(data) =>
        data.items.length === 0 ? (
          <EmptyState title="No drop is live right now" action={<Button href="/drops?tab=upcoming" variant="secondary">See upcoming drops</Button>} />
        ) : (
          <div className="flex flex-col gap-6">
            {data.items.length > 1 ? (
              <Banner variant="warning" title="More than one drop is live">
                The website shows the one that started most recently as the live drop.
              </Banner>
            ) : null}
            {data.items.map((d) => (
              <LiveDropPanel key={d.id} drop={d} />
            ))}
          </div>
        )
      }
    </QueryBoundary>
  );
}

/** Archive tab (dashboard-pages 9.3): sold-out and ended drops with results. */
export function ArchiveTab() {
  const f = useFormatters();
  const [p, setP] = useUrlState(params);
  const navigate = useNavigate();
  const q = useDrops('ARCHIVE', p.page, p.pageSize);
  const columns: Column<AdminDrop>[] = [
    { id: 'name', header: 'Drop', priority: 'primary', cell: (d) => <TextLink href={`/drops/${d.id}`} className="font-medium">{d.name}</TextLink> },
    { id: 'state', header: 'State', priority: 'primary', mobileLabel: '', cell: (d) => <StateBadge state={d.state} /> },
    { id: 'sold', header: 'Units sold', numeric: true, cell: (d) => `${d.unitsSold} / ${d.unitsTotal}` },
    { id: 'revenue', header: 'Revenue', numeric: true, cell: (d) => f.money(d.revenueCents) },
    {
      id: 'sellout',
      header: 'Sold out at',
      cell: (d) => {
        if (!d.sellOutAt) return <span className="text-fg-muted">&mdash;</span>;
        const h = hoursToSellOut(d.startsAt, d.sellOutAt);
        return (
          <span className="tabular-nums">
            {f.dateTime(d.sellOutAt)}
            {h !== null ? <span className="block text-body-sm text-fg-muted">{formatDuration(h)} after launch</span> : null}
          </span>
        );
      },
    },
    { id: 'dates', header: 'Dates', className: 'whitespace-nowrap', cell: (d) => <span className="tabular-nums">{f.date(d.startsAt)}{d.endedAt ?? d.endsAt ? ` to ${f.date(d.endedAt ?? d.endsAt)}` : ''}</span> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-fg-muted">Fast sell-outs are a signal to raise prices on the next drop.</p>
      <DataTable
        caption="Archived drops"
        columns={columns}
        rows={q.data?.items}
        getRowId={(d) => d.id}
        rowLabel={(d) => d.name}
        onRowClick={(d) => navigate(`/drops/${d.id}`)}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={<EmptyState title="No past drops yet" text="Drops that sell out or end appear here." />}
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={q.data?.total ?? 0} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={q.isFetching} />}
      />
    </div>
  );
}

