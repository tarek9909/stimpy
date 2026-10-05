import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { MAX_ORDERABLE_ITEMS, moveItem, moveToPosition } from '../../lib/reorder';
import { ActiveCell, ActiveFilter, matchesActive, type ActiveView } from './shared';
import { useActiveToggle, useHoodies, useReorder, type AdminHoodie } from './api';

/** Products -> Hoodies: list with reorder, Show filter and the active switch (dashboard-pages 7.1). */
export function HoodiesTab({ view, onViewChange }: { view: ActiveView; onViewChange: (v: ActiveView) => void }) {
  const q = useHoodies();
  const navigate = useNavigate();
  const f = useFormatters();
  const toggle = useActiveToggle('hoodies');
  const reorder = useReorder('hoodies');
  const all = q.data?.items;
  const rows = useMemo(() => all?.filter((h) => matchesActive(h.active, view)), [all, view]);
  const ids = useMemo(() => (all ?? []).map((h) => h.id), [all]);

  const columns: Column<AdminHoodie>[] = [
    {
      id: 'image',
      header: 'Image',
      width: '4.5rem',
      priority: 'hidden-on-phone',
      cell: (h) => (h.images[0] ? <img src={h.images[0]} alt="" className="h-14 w-11 rounded-md bg-cream object-cover" /> : <span className="block h-14 w-11 rounded-md bg-cream" aria-hidden="true" />),
    },
    {
      id: 'name',
      header: 'Name',
      priority: 'primary',
      cell: (h) => (
        <span className={h.active ? undefined : 'text-fg-muted'}>
          <a href={`/products/hoodies/${h.id}`} onClick={(e) => { e.preventDefault(); navigate(`/products/hoodies/${h.id}`); }} className="font-medium underline-offset-4 hover:underline">
            {h.name}
          </a>
          {h.active ? null : <span className="ml-2 text-caption">Hidden</span>}
        </span>
      ),
    },
    { id: 'price', header: 'Price', numeric: true, priority: 'primary', cell: (h) => f.money(h.priceCents) },
    { id: 'available', header: 'Available', numeric: true, mobileLabel: 'Available', cell: (h) => `${h.available}${h.reserved ? ` (${h.reserved} reserved)` : ''}` },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (h) => <ActiveCell active={h.active} name={h.name} onChange={(active) => toggle.mutate({ id: h.id, active })} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilter value={view} onChange={onViewChange} />
        <Button href="/products/hoodies/new" variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />}>
          New hoodie
        </Button>
      </div>
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {() => (
          <DataTable
            caption="Hoodies"
            columns={columns}
            rows={rows}
            getRowId={(h) => h.id}
            rowLabel={(h) => h.name}
            refreshing={q.isFetching && !q.isPending}
            rowClassName={(h) => (h.active ? undefined : 'bg-surface')}
            reorder={{
              disabled: view !== 'all' || reorder.isPending || ids.length > MAX_ORDERABLE_ITEMS,
              onMove: (id, delta) => reorder.mutate(moveItem(ids, Number(id), delta)),
              onDragMove: (from, to) => reorder.mutate(moveToPosition(ids, Number(from), Number(to))),
            }}
            empty={
              <EmptyState
                title={view === 'all' ? 'No hoodies yet' : 'No hoodies match this filter'}
                text={view === 'all' ? 'Add your hoodie so it can be sold.' : 'Change the filter to see the others.'}
                action={view === 'all' ? <Button href="/products/hoodies/new" variant="primary">New hoodie</Button> : <Button variant="secondary" onClick={() => onViewChange('all')}>Show all</Button>}
              />
            }
          />
        )}
      </QueryBoundary>
      {view !== 'all' ? <p className="text-body-sm text-fg-muted">Reordering is available when the filter is set to All.</p> : ids.length > MAX_ORDERABLE_ITEMS ? <p className="text-body-sm text-fg-muted">Reordering is unavailable because the full list exceeds the 5,000-item API limit.</p> : null}
    </div>
  );
}
