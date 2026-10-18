import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LayoutGrid, List, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, Modal, Pill, Skeleton, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { MAX_ORDERABLE_ITEMS, moveItem, moveToPosition } from '../../lib/reorder';
import { ActiveCell, ActiveFilter, matchesActive, type ActiveView } from './shared';
import { useActiveToggle, useHoodies, useReorder, type AdminHoodie } from './api';

type ViewMode = 'grid' | 'table';

/** Products -> Hoodies: visual card grid and reorderable table with picture previews and active switches. */
export function HoodiesTab({ view, onViewChange }: { view: ActiveView; onViewChange: (v: ActiveView) => void }) {
  const q = useHoodies();
  const navigate = useNavigate();
  const f = useFormatters();
  const toggle = useActiveToggle('hoodies');
  const reorder = useReorder('hoodies');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewItem, setPreviewItem] = useState<AdminHoodie | null>(null);

  const all = q.data?.items;
  const rows = useMemo(() => all?.filter((h) => matchesActive(h.active, view)), [all, view]);
  const ids = useMemo(() => (all ?? []).map((h) => h.id), [all]);

  const columns: Column<AdminHoodie>[] = [
    {
      id: 'image',
      header: 'Picture',
      width: '4.5rem',
      priority: 'primary',
      cell: (h) => (
        <button
          type="button"
          onClick={() => setPreviewItem(h)}
          title={`Inspect ${h.name}`}
          className="group/art relative block h-14 w-11 overflow-hidden rounded-md border border-base bg-cream/40 transition hover:ring-2 hover:ring-coral"
        >
          {h.images[0] ? (
            <img src={h.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="block h-full w-full bg-cream" aria-hidden="true" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover/art:opacity-100">
            <Eye size={14} className="text-white" />
          </span>
        </button>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      priority: 'primary',
      cell: (h) => (
        <span className={h.active ? undefined : 'text-fg-muted'}>
          <a
            href={`/products/hoodies/${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/products/hoodies/${h.id}`);
            }}
            className="font-semibold text-fg hover:text-coral transition-colors"
          >
            {h.name}
          </a>
          {h.active ? null : <span className="ml-2 text-caption">Hidden</span>}
        </span>
      ),
    },
    { id: 'price', header: 'Price', numeric: true, priority: 'primary', cell: (h) => f.money(h.priceCents) },
    { id: 'available', header: 'Available', numeric: true, mobileLabel: 'Available', cell: (h) => h.available },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (h) => <ActiveCell active={h.active} name={h.name} onChange={(active) => toggle.mutate({ id: h.id, active })} /> },
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
            href="/products/hoodies/new"
            variant="primary"
            size="sm"
            leftIcon={<Plus size={18} aria-hidden="true" />}
          >
            New hoodie
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {() => {
          if (!rows || rows.length === 0) {
            return (
              <EmptyState
                title={view === 'all' ? 'No hoodies yet' : 'No hoodies match this filter'}
                text={view === 'all' ? 'Add your hoodie so it can be sold.' : 'Change the filter to see the others.'}
                action={
                  view === 'all' ? (
                    <Button href="/products/hoodies/new" variant="primary">
                      New hoodie
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => onViewChange('all')}>
                      Show all
                    </Button>
                  )
                }
              />
            );
          }

          if (viewMode === 'grid') {
            return (
              <div
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                aria-label="Products Hoodies grid"
              >
                {rows.map((h) => {
                  const imageSrc = h.images[0];
                  return (
                    <article
                      key={h.id}
                      className={cn(
                        'group relative flex flex-col justify-between rounded-2xl border bg-surface-base p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                        h.active ? 'border-base hover:border-fg/30' : 'border-base/70 bg-surface/40 opacity-80 hover:opacity-100',
                      )}
                    >
                      {/* Top: Picture & Badges */}
                      <div>
                        <div className="relative aspect-[0.72] w-full overflow-hidden rounded-xl border border-line/60 bg-gradient-to-b from-surface to-cream/20 p-2">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={h.name}
                              className="h-full w-full object-cover rounded-lg drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-fg-muted">
                              <span className="text-h3 font-black tracking-widest text-fg-muted/40">
                                {h.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="text-caption">No photo</span>
                            </div>
                          )}

                          {/* Top-Left: Product Type */}
                          <div className="absolute left-2.5 top-2.5">
                            <Pill tone="cream" shape="pill" size="sm">
                              Hoodie
                            </Pill>
                          </div>

                          {/* Top-Right: Active Pill */}
                          <div className="absolute right-2.5 top-2.5">
                            <Pill tone={h.active ? 'success' : 'cream'} shape="pill" size="sm">
                              {h.active ? 'Active' : 'Hidden'}
                            </Pill>
                          </div>

                          {/* Quick Inspect Button */}
                          {imageSrc ? (
                            <button
                              type="button"
                              onClick={() => setPreviewItem(h)}
                              className="absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition hover:bg-black group-hover:opacity-100"
                              title="Inspect picture"
                              aria-label={`Inspect ${h.name} photo`}
                            >
                              <Eye size={14} />
                            </button>
                          ) : null}
                        </div>

                        {/* Title */}
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/products/hoodies/${h.id}`)}
                            className="truncate text-left text-base font-bold tracking-tight text-fg hover:text-coral transition-colors block w-full"
                            title={h.name}
                          >
                            {h.name}
                          </button>
                          <p className="truncate text-xs font-medium text-fg-muted">Essential Hoodie</p>
                        </div>
                      </div>

                      {/* Bottom: Metrics & Actions */}
                      <div className="mt-3.5">
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-surface px-3 py-2 text-center">
                          <div className="border-r border-line/50 pr-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                              Price
                            </span>
                            <span className="block text-base font-black text-fg">{f.money(h.priceCents)}</span>
                          </div>
                          <div className="pl-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                              Available
                            </span>
                            <span className={cn('block text-base font-black', h.available <= 0 ? 'text-danger' : 'text-fg')}>
                              {h.available}
                            </span>
                          </div>
                        </div>

                        {/* Active Switch */}
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/40 pt-2 px-1">
                          <span className="text-[11px] font-medium text-fg-muted">On website</span>
                          <ActiveCell active={h.active} name={h.name} onChange={(active) => toggle.mutate({ id: h.id, active })} />
                        </div>

                        {/* Edit Button */}
                        <Button
                          href={`/products/hoodies/${h.id}`}
                          variant="secondary"
                          size="sm"
                          fullWidth
                          className="mt-2.5 font-semibold"
                          aria-label={`Edit ${h.name}`}
                        >
                          Edit hoodie
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          }

          return (
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
                  action={
                    view === 'all' ? (
                      <Button href="/products/hoodies/new" variant="primary">
                        New hoodie
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => onViewChange('all')}>
                        Show all
                      </Button>
                    )
                  }
                />
              }
            />
          );
        }}
      </QueryBoundary>

      {/* Picture Lightbox / Inspection Modal */}
      {previewItem ? (
        <Modal
          open
          onClose={() => setPreviewItem(null)}
          title={previewItem.name}
          size="md"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <div className="text-body-sm font-medium text-fg">
                Price: <span className="font-bold">{f.money(previewItem.priceCents)}</span> · Available: <span className="font-bold">{previewItem.available}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setPreviewItem(null)}>
                  Close
                </Button>
                <Button
                  href={`/products/hoodies/${previewItem.id}`}
                  variant="primary"
                  onClick={() => setPreviewItem(null)}
                >
                  Edit hoodie
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative aspect-[0.72] max-h-[460px] w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface to-cream/30 p-2 shadow-inner">
              {previewItem.images[0] ? (
                <img
                  src={previewItem.images[0]}
                  alt={previewItem.name}
                  className="h-full w-full object-cover rounded-lg drop-shadow"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-muted">No photo available</div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {previewItem.active ? (
                <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Active on website
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg-muted">
                  Hidden
                </span>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
