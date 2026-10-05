import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, TextLink } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { MAX_ORDERABLE_ITEMS, moveItem, moveToPosition } from '../../lib/reorder';
import { ActiveCell, ActiveFilter, matchesActive, type ActiveView } from './shared';
import { useActiveToggle, usePacks, useReorder, type AdminPack } from './api';

/** Products -> Packs (dashboard-pages 7.3). */
export function PacksTab({ view, onViewChange }: { view: ActiveView; onViewChange: (v: ActiveView) => void }) {
  const q = usePacks();
  const f = useFormatters();
  const toggle = useActiveToggle('packs');
  const reorder = useReorder('packs');
  const all = q.data?.items;
  const rows = useMemo(() => all?.filter((p) => matchesActive(p.active, view)), [all, view]);
  const ids = useMemo(() => (all ?? []).map((p) => p.id), [all]);

  const columns: Column<AdminPack>[] = [
    {
      id: 'name',
      header: 'Name',
      priority: 'primary',
      cell: (p) => (
        <span className={p.active ? undefined : 'text-fg-muted'}>
          <TextLink href={`/products/packs/${p.id}`} className="font-medium">{p.name}</TextLink>
          {p.active ? null : <span className="ml-2 text-caption">Hidden</span>}
        </span>
      ),
    },
    { id: 'price', header: 'Price', numeric: true, priority: 'primary', cell: (p) => f.money(p.priceCents) },
    { id: 'count', header: 'Stimpies', numeric: true, cell: (p) => p.stimpieCount },
    { id: 'badge', header: 'Badge', cell: (p) => p.badge ?? '—' },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (p) => <ActiveCell active={p.active} name={p.name} onChange={(active) => toggle.mutate({ id: p.id, active })} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilter value={view} onChange={onViewChange} />
        <Button href="/products/packs/new" variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />}>New pack</Button>
      </div>
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-48" />}>
        {() => (
          <DataTable
            caption="Packs"
            columns={columns}
            rows={rows}
            getRowId={(p) => p.id}
            rowLabel={(p) => p.name}
            refreshing={q.isFetching && !q.isPending}
            reorder={{
              disabled: view !== 'all' || reorder.isPending || ids.length > MAX_ORDERABLE_ITEMS,
              onMove: (id, d) => reorder.mutate(moveItem(ids, Number(id), d)),
              onDragMove: (a, b) => reorder.mutate(moveToPosition(ids, Number(a), Number(b))),
            }}
            empty={<EmptyState title="No packs yet" text="Packs bundle a hoodie with Stimpies at one price." action={<Button href="/products/packs/new" variant="primary">New pack</Button>} />}
          />
        )}
      </QueryBoundary>
      {view !== 'all' ? <p className="text-body-sm text-fg-muted">Reordering is available when the filter is set to All.</p> : ids.length > MAX_ORDERABLE_ITEMS ? <p className="text-body-sm text-fg-muted">Reordering is unavailable because the full list exceeds the 5,000-item API limit.</p> : null}
    </div>
  );
}
