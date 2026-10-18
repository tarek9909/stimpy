import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, LayoutGrid, List, Search, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, EmptyState, Modal, Pill, Skeleton, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { AdjustDialog, type AdjustTarget } from './AdjustDialog';
import { useStockStimpies, type StockStimpie } from './api';

type FilterType = 'all' | 'low' | 'sold-out' | 'CORE' | 'LIMITED';
type ViewMode = 'grid' | 'table';

/** Stock -> Stimpies: visual card grid and detailed table with pictures, stock metrics, and adjustments. */
export function StimpiesTab({ highlight }: { highlight: number | null }) {
  const query = useStockStimpies();
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [previewItem, setPreviewItem] = useState<StockStimpie | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const allItems = useMemo(
    () => [...(query.data?.items ?? [])].sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)),
    [query.data],
  );

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDrop = (item.dropName ?? '').toLowerCase().includes(q);
        if (!matchesName && !matchesDrop) return false;
      }
      if (filter === 'low') return item.low && item.available > 0;
      if (filter === 'sold-out') return item.available <= 0;
      if (filter === 'CORE') return item.type === 'CORE';
      if (filter === 'LIMITED') return item.type === 'LIMITED';
      return true;
    });
  }, [allItems, search, filter]);

  const counts = useMemo(() => {
    let low = 0;
    let soldOut = 0;
    let core = 0;
    let limited = 0;
    for (const item of allItems) {
      if (item.available <= 0) soldOut++;
      else if (item.low) low++;
      if (item.type === 'CORE') core++;
      else if (item.type === 'LIMITED') limited++;
    }
    return { total: allItems.length, low, soldOut, core, limited };
  }, [allItems]);

  const done = useRef(false);
  useEffect(() => {
    if (highlight === null || done.current) return;
    const el = document.querySelector<HTMLElement>(`[data-row-id="${highlight}"]`);
    if (el) {
      done.current = true;
      el.scrollIntoView({ block: 'center' });
    }
  });

  const adjust = (s: StockStimpie) =>
    setTarget({ itemType: 'STIMPIE', itemId: s.stimpieId, name: s.name, quantity: s.quantity, available: s.available });

  const columns: Column<StockStimpie>[] = [
    {
      id: 'art',
      header: 'Picture',
      width: '4.5rem',
      priority: 'primary',
      cell: (s) => {
        const imgSrc = s.imageUrl ?? s.artworkUrl;
        return (
          <button
            type="button"
            onClick={() => setPreviewItem(s)}
            title={`Inspect ${s.name}`}
            className="group/art relative block h-14 w-10 overflow-hidden rounded-md border border-base bg-cream/40 transition hover:ring-2 hover:ring-coral"
          >
            {imgSrc ? (
              <img src={imgSrc} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface text-caption font-bold text-fg-muted">
                {s.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover/art:opacity-100">
              <Eye size={14} className="text-white" />
            </span>
          </button>
        );
      },
    },
    { id: 'name', header: 'Name', priority: 'primary', cell: (s) => <span className="font-semibold text-fg">{s.name}</span> },
    {
      id: 'available',
      header: 'Available',
      numeric: true,
      priority: 'primary',
      cell: (s) => (
        <span className={cn('font-bold', s.available <= 0 ? 'text-danger' : s.low ? 'text-amber-600 dark:text-amber-400' : 'text-fg')}>
          {s.available}
        </span>
      ),
    },
    { id: 'type', header: 'Type', cell: (s) => <Badge kind={s.type === 'CORE' ? 'CORE' : 'LIMITED'} /> },
    { id: 'drop', header: 'Drop', cell: (s) => s.dropName ?? '—' },
    { id: 'quantity', header: 'Quantity', numeric: true, mobileLabel: 'On hand', cell: (s) => s.quantity },
    {
      id: 'low',
      header: 'Level',
      mobileLabel: '',
      cell: (s) =>
        s.available <= 0 ? (
          <Pill tone="danger" size="sm" icon={<TriangleAlert size={14} aria-hidden="true" />}>Sold out</Pill>
        ) : s.low ? (
          <Pill tone="butter" size="sm" icon={<TriangleAlert size={14} aria-hidden="true" />}>Low stock</Pill>
        ) : (
          <span className="text-fg-muted">OK</span>
        ),
    },
    {
      id: 'adjust',
      header: 'Adjust',
      mobileLabel: '',
      align: 'right',
      cell: (s) => (
        <Button variant="secondary" size="sm" onClick={() => adjust(s)} aria-label={`Adjust ${s.name}`}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls Bar: Filters, Search, and View Switcher */}
      <div className="flex flex-col gap-3 rounded-xl border border-base bg-surface-base p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Search Field */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or drop..."
            className="h-9 w-full rounded-lg border border-base bg-surface pl-9 pr-8 text-body-sm text-fg placeholder:text-fg-muted focus:border-fg focus:outline-none focus:ring-1 focus:ring-fg"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filter === 'all'
                ? 'bg-ink text-white dark:bg-white dark:text-ink'
                : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
            )}
          >
            All ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setFilter('low')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
              filter === 'low'
                ? 'bg-amber-500 text-ink font-semibold'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
            )}
          >
            <TriangleAlert size={12} /> Low stock ({counts.low})
          </button>
          <button
            type="button"
            onClick={() => setFilter('sold-out')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
              filter === 'sold-out'
                ? 'bg-danger text-white font-semibold'
                : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
            )}
          >
            Sold out ({counts.soldOut})
          </button>
          <button
            type="button"
            onClick={() => setFilter('CORE')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filter === 'CORE'
                ? 'bg-ink text-white dark:bg-white dark:text-ink'
                : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
            )}
          >
            Core ({counts.core})
          </button>
          <button
            type="button"
            onClick={() => setFilter('LIMITED')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              filter === 'LIMITED'
                ? 'bg-ink text-white dark:bg-white dark:text-ink'
                : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
            )}
          >
            Limited ({counts.limited})
          </button>
        </div>

        {/* View Toggle */}
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
      </div>

      {/* Main Content Area */}
      <QueryBoundary
        query={query}
        skeleton={
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 8 }, (_, i) => (
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
            <Skeleton variant="rect" className="h-64" />
          )
        }
      >
        {() => {
          if (filteredItems.length === 0) {
            return (
              <EmptyState
                title="No Stimpies found"
                text={search || filter !== 'all' ? 'Try adjusting your search or filters.' : 'Create one in Products.'}
                action={
                  search || filter !== 'all' ? (
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>
                      Reset filters
                    </Button>
                  ) : (
                    <Button href="/products?tab=stimpies" variant="secondary">
                      Go to Products
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
                aria-label="Stimpie stock grid"
              >
                {filteredItems.map((s) => {
                  const imgSrc = s.imageUrl ?? s.artworkUrl;
                  const isHighlighted = highlight === s.stimpieId;
                  const isSoldOut = s.available <= 0;
                  const isLow = s.low && !isSoldOut;

                  return (
                    <article
                      key={s.stimpieId}
                      data-row-id={s.stimpieId}
                      className={cn(
                        'group relative flex flex-col justify-between rounded-2xl border bg-surface-base p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                        isHighlighted && 'ring-4 ring-coral ring-offset-2',
                        isSoldOut
                          ? 'border-danger/40 bg-danger/[0.015]'
                          : isLow
                          ? 'border-amber-400/50 bg-amber-500/[0.015]'
                          : 'border-base hover:border-fg/30',
                      )}
                    >
                      {/* Top: Picture & Badges */}
                      <div>
                        <div className="relative aspect-[0.68] w-full overflow-hidden rounded-xl border border-line/60 bg-gradient-to-b from-surface to-cream/20 p-2">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={s.name}
                              className="h-full w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-fg-muted">
                              <span className="text-h3 font-black tracking-widest text-fg-muted/40">
                                {s.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="text-caption">No preview</span>
                            </div>
                          )}

                          {/* Top-Left: Type Badge */}
                          <div className="absolute left-2.5 top-2.5">
                            <Badge kind={s.type === 'CORE' ? 'CORE' : 'LIMITED'} />
                          </div>

                          {/* Top-Right: Stock Level Badge */}
                          <div className="absolute right-2.5 top-2.5">
                            {isSoldOut ? (
                              <Pill tone="danger" size="sm" icon={<TriangleAlert size={12} aria-hidden="true" />}>
                                Sold out
                              </Pill>
                            ) : isLow ? (
                              <Pill tone="butter" size="sm" icon={<TriangleAlert size={12} aria-hidden="true" />}>
                                Low stock
                              </Pill>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 backdrop-blur-sm dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                OK
                              </span>
                            )}
                          </div>

                          {/* Quick Inspect Button */}
                          <button
                            type="button"
                            onClick={() => setPreviewItem(s)}
                            className="absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition hover:bg-black group-hover:opacity-100"
                            title="Inspect picture"
                            aria-label={`Inspect ${s.name} artwork`}
                          >
                            <Eye size={14} />
                          </button>
                        </div>

                        {/* Title and Drop */}
                        <div className="mt-3">
                          <h3 className="truncate text-base font-bold tracking-tight text-fg" title={s.name}>
                            {s.name}
                          </h3>
                          <p className="truncate text-xs font-medium text-fg-muted" title={s.dropName ?? 'Core Collection'}>
                            {s.dropName ? s.dropName : 'Core Collection'}
                          </p>
                        </div>
                      </div>

                      {/* Bottom: Stock Data Metrics & Adjust Button */}
                      <div className="mt-3.5">
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line/60 bg-surface px-3 py-2 text-center">
                          <div className="border-r border-line/50 pr-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                              Available
                            </span>
                            <span
                              className={cn(
                                'block text-lg font-black',
                                isSoldOut
                                  ? 'text-danger'
                                  : isLow
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-fg',
                              )}
                            >
                              {s.available}
                            </span>
                          </div>
                          <div className="pl-1">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                              On hand
                            </span>
                            <span className="block text-lg font-black text-fg">{s.quantity}</span>
                          </div>
                        </div>

                        {s.reserved && s.reserved > 0 ? (
                          <p className="mt-1.5 text-center text-[11px] font-medium text-fg-muted">
                            <span className="font-semibold text-fg">{s.reserved}</span> committed to orders
                          </p>
                        ) : null}

                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          className="mt-3 font-semibold"
                          onClick={() => adjust(s)}
                          aria-label={`Adjust ${s.name}`}
                        >
                          Adjust stock
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
              caption="Stimpie stock"
              columns={columns}
              rows={filteredItems}
              getRowId={(s) => s.stimpieId}
              rowLabel={(s) => s.name}
              refreshing={query.isFetching}
              rowClassName={(s) =>
                cn(
                  highlight === s.stimpieId && 'ring-4 ring-inset ring-coral',
                  s.available <= 0 && 'bg-danger/[0.02]',
                  s.low && s.available > 0 && 'bg-amber-500/[0.02]',
                )
              }
              empty={
                <EmptyState
                  title="No Stimpies found"
                  text="Try adjusting your search or filters."
                  action={
                    <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>
                      Reset filters
                    </Button>
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
                Available: <span className="font-bold">{previewItem.available}</span> · On hand: <span className="font-bold">{previewItem.quantity}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setPreviewItem(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const item = previewItem;
                    setPreviewItem(null);
                    adjust(item);
                  }}
                >
                  Adjust stock
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative aspect-[0.68] max-h-[460px] w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface to-cream/30 p-3 shadow-inner">
              {previewItem.imageUrl ?? previewItem.artworkUrl ? (
                <img
                  src={previewItem.imageUrl ?? previewItem.artworkUrl ?? ''}
                  alt={previewItem.name}
                  className="h-full w-full object-contain drop-shadow"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-muted">No picture available</div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge kind={previewItem.type === 'CORE' ? 'CORE' : 'LIMITED'} />
              {previewItem.dropName ? <Pill tone="neutral" size="sm">{previewItem.dropName}</Pill> : null}
              {previewItem.available <= 0 ? (
                <Pill tone="danger" size="sm" icon={<TriangleAlert size={12} />}>Sold out</Pill>
              ) : previewItem.low ? (
                <Pill tone="butter" size="sm" icon={<TriangleAlert size={12} />}>Low stock</Pill>
              ) : (
                <Pill tone="neutral" size="sm">OK</Pill>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Adjust Stock Dialog */}
      <AdjustDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
