import { useMemo, useState } from 'react';
import { LayoutGrid, List, Package, Plus, Sparkles } from 'lucide-react';
import { Badge, Button, EmptyState, Pill, Skeleton, TextLink, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { MAX_ORDERABLE_ITEMS, moveItem, moveToPosition } from '../../lib/reorder';
import { ActiveCell, ActiveFilter, matchesActive, type ActiveView } from './shared';
import { useActiveToggle, usePacks, useReorder, type AdminPack } from './api';

type ViewMode = 'grid' | 'table';

/** Products -> Packs: visual card grid and reorderable table with bundle metrics and active switches. */
export function PacksTab({ view, onViewChange }: { view: ActiveView; onViewChange: (v: ActiveView) => void }) {
  const q = usePacks();
  const f = useFormatters();
  const toggle = useActiveToggle('packs');
  const reorder = useReorder('packs');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

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
          <TextLink href={`/products/packs/${p.id}`} className="font-semibold">{p.name}</TextLink>
          {p.active ? null : <span className="ml-2 text-caption">Hidden</span>}
        </span>
      ),
    },
    { id: 'price', header: 'Price', numeric: true, priority: 'primary', cell: (p) => f.money(p.priceCents) },
    { id: 'count', header: 'Stimpies', numeric: true, cell: (p) => `${p.stimpieCount} Stimpies` },
    {
      id: 'badge',
      header: 'Badge',
      cell: (p) => (p.badge ? <Badge kind="POPULAR" label={p.badge} /> : <span className="text-fg-muted">—</span>),
    },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (p) => <ActiveCell active={p.active} name={p.name} onChange={(active) => toggle.mutate({ id: p.id, active })} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls Bar: Filters, View Switcher, and Add Button */}
      <div className="flex flex-col gap-3 rounded-xl border border-base bg-surface-base p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <ActiveFilter value={view} onChange={onViewChange} />
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* View Switcher */}
          <div className="flex items-center rounded-lg border border-base bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition',
                viewMode === 'grid'
                  ? 'bg-surface-base text-fg shadow-sm font-semibold'
                  : 'text-fg-muted hover:text-fg',
              )}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition',
                viewMode === 'table'
                  ? 'bg-surface-base text-fg shadow-sm font-semibold'
                  : 'text-fg-muted hover:text-fg',
              )}
              aria-label="Table view"
              title="Table view"
            >
              <List size={15} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <Button
            href="/products/packs/new"
            variant="primary"
            size="sm"
            leftIcon={<Plus size={18} aria-hidden="true" />}
          >
            New pack
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <QueryBoundary
        query={q}
        skeleton={
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-2xl border border-base bg-surface-base p-4">
                  <Skeleton variant="rect" className="aspect-[0.68] w-full rounded-xl" />
                  <Skeleton variant="text" className="h-5 w-3/4" />
                  <Skeleton variant="text" className="h-4 w-1/2" />
                  <Skeleton variant="rect" className="h-14 w-full rounded-lg" />
                  <Skeleton variant="rect" className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <Skeleton variant="rect" className="h-48" />
          )
        }
      >
        {() => {
          if (!rows || rows.length === 0) {
            return (
              <EmptyState
                title="No packs yet"
                text="Packs bundle a hoodie with Stimpies at one price."
                action={
                  <Button href="/products/packs/new" variant="primary">
                    New pack
                  </Button>
                }
              />
            );
          }

          if (viewMode === 'grid') {
            return (
              <div
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                aria-label="Products Packs grid"
              >
                {rows.map((p) => (
                  <article
                    key={p.id}
                    className={cn(
                      'group relative flex flex-col justify-between rounded-2xl border bg-surface-base p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                      p.active ? 'border-base hover:border-fg/30' : 'border-base/70 bg-surface/40 opacity-80 hover:opacity-100',
                    )}
                  >
                    {/* Top: Pack Graphic & Badges */}
                    <div>
                      <div className="relative aspect-[0.68] w-full overflow-hidden rounded-xl border border-line/60 bg-gradient-to-b from-surface via-surface-base to-cream/30 p-3 flex flex-col items-center justify-center">
                        {/* Top-Left: Badge if any (e.g. "Most popular") or "Bundle" */}
                        <div className="absolute left-2.5 top-2.5">
                          {p.badge ? (
                            <Badge kind="POPULAR" label={p.badge} />
                          ) : (
                            <Pill tone="cream" shape="pill" size="sm">
                              Bundle
                            </Pill>
                          )}
                        </div>

                        {/* Top-Right: Active Pill */}
                        <div className="absolute right-2.5 top-2.5">
                          <Pill tone={p.active ? 'success' : 'cream'} shape="pill" size="sm">
                            {p.active ? 'Active' : 'Hidden'}
                          </Pill>
                        </div>

                        {/* Center Visual: Layered pack representation */}
                        <div className="relative flex flex-col items-center justify-center text-center">
                          <div className="relative flex items-center justify-center">
                            <div className="h-20 w-16 -rotate-6 rounded-lg border border-line/70 bg-surface shadow-sm transition-transform duration-300 group-hover:-rotate-12" />
                            <div className="absolute h-20 w-16 rotate-6 rounded-lg border border-line bg-surface-base shadow-md transition-transform duration-300 group-hover:rotate-12" />
                            <div className="relative flex h-24 w-20 flex-col items-center justify-center rounded-xl border border-base bg-surface-base p-2 shadow-lg transition-transform duration-300 group-hover:scale-105">
                              <Package size={26} className="text-coral" strokeWidth={1.75} />
                              <span className="mt-1.5 text-[11px] font-black tracking-tight text-fg">
                                {p.stimpieCount} {p.stimpieCount === 1 ? 'Stimpie' : 'Stimpies'}
                              </span>
                              <span className="text-[9px] font-semibold text-fg-muted uppercase tracking-wider">
                                + 1 Hoodie
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div className="mt-3">
                        <TextLink
                          href={`/products/packs/${p.id}`}
                          className="truncate text-base font-bold tracking-tight text-fg hover:text-coral transition-colors block"
                          title={p.name}
                        >
                          {p.name}
                        </TextLink>
                        <p
                          className="line-clamp-2 min-h-[2.5rem] text-xs font-medium text-fg-muted mt-0.5"
                          title={p.description}
                        >
                          {p.description || 'Bundle the hoodie with interchangeable Stimpies at a special price.'}
                        </p>
                      </div>
                    </div>

                    {/* Bottom: Metrics & Actions */}
                    <div className="mt-3.5">
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-surface px-3 py-2 text-center">
                        <div className="border-r border-line/50 pr-1">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            Price
                          </span>
                          <span className="block text-base font-black text-fg">{f.money(p.priceCents)}</span>
                        </div>
                        <div className="pl-1">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            Included
                          </span>
                          <span className="block text-base font-black text-fg">
                            {p.stimpieCount} {p.stimpieCount === 1 ? 'Stimpie' : 'Stimpies'}
                          </span>
                        </div>
                      </div>

                      {/* Active Switch */}
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/40 pt-2 px-1">
                        <span className="text-[11px] font-medium text-fg-muted">On website</span>
                        <ActiveCell active={p.active} name={p.name} onChange={(active) => toggle.mutate({ id: p.id, active })} />
                      </div>

                      {/* Edit Button */}
                      <Button
                        href={`/products/packs/${p.id}`}
                        variant="secondary"
                        size="sm"
                        fullWidth
                        className="mt-2.5 font-semibold"
                        aria-label={`Edit ${p.name}`}
                      >
                        Edit pack
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            );
          }

          return (
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
              empty={
                <EmptyState
                  title="No packs yet"
                  text="Packs bundle a hoodie with Stimpies at one price."
                  action={
                    <Button href="/products/packs/new" variant="primary">
                      New pack
                    </Button>
                  }
                />
              }
            />
          );
        }}
      </QueryBoundary>
      {view !== 'all' ? (
        <p className="text-body-sm text-fg-muted">Reordering is available when the filter is set to All.</p>
      ) : ids.length > MAX_ORDERABLE_ITEMS ? (
        <p className="text-body-sm text-fg-muted">Reordering is unavailable because the full list exceeds the 5,000-item API limit.</p>
      ) : null}
    </div>
  );
}

