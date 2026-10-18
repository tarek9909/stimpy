import { useMemo, useState } from 'react';
import { Eye, LayoutGrid, List, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, EmptyState, Modal, Pill, Select, Skeleton, TextLink, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { QueryBoundary } from '../../components/QueryBoundary';
import { Tooltip } from '../../components/Tooltip';
import { useFormatters } from '../../lib/format';
import { artworkAspectWarning } from '../../lib/upload';
import { enumParam, optionalIntParam, paginationParams, stringParam, useUrlState } from '../../lib/urlState';
import { ActiveCell, ActiveFilter, type ActiveView } from './shared';
import { useActiveToggle, useAllDrops, useStimpies, type AdminStimpie } from './api';

const params = {
  q: stringParam(),
  type: enumParam(['all', 'CORE', 'LIMITED'] as const, 'all'),
  drop: optionalIntParam(),
  active: enumParam(['all', 'true', 'false'] as const, 'all'),
  sort: stringParam('position'),
  ...paginationParams,
};

type ViewMode = 'grid' | 'table';

/** Products -> Stimpies: visual card grid and table view with filters, artwork previews, and quick actions. */
export function StimpiesTab() {
  const [p, setP] = useUrlState(params);
  const f = useFormatters();
  const toggle = useActiveToggle('stimpies');
  const drops = useAllDrops();
  const dropName = useMemo(() => new Map((drops.data?.items ?? []).map((d) => [d.id, d.name])), [drops.data]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewItem, setPreviewItem] = useState<AdminStimpie | null>(null);

  const q = useStimpies({
    q: p.q || undefined,
    type: p.type === 'all' ? undefined : p.type,
    dropId: p.drop ?? undefined,
    active: p.active === 'all' ? undefined : p.active,
    page: p.page,
    pageSize: p.pageSize,
    sort: p.sort,
  });

  const activeFilters = (p.q ? 1 : 0) + (p.type !== 'all' ? 1 : 0) + (p.drop !== null ? 1 : 0) + (p.active !== 'all' ? 1 : 0);
  const total = q.data?.total ?? 0;

  const columns: Column<AdminStimpie>[] = [
    {
      id: 'art',
      header: 'Picture',
      width: '4.5rem',
      priority: 'primary',
      cell: (s) => (
        <button
          type="button"
          onClick={() => setPreviewItem(s)}
          title={`Inspect ${s.name}`}
          className="group/art relative block h-14 w-10 overflow-hidden rounded-md border border-base bg-cream/40 transition hover:ring-2 hover:ring-coral"
        >
          <img src={s.artworkUrl} alt="" className="h-full w-full object-contain" />
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
      cell: (s) => (
        <span className={s.active ? undefined : 'text-fg-muted'}>
          <TextLink href={`/products/stimpies/${s.id}`} className="font-semibold text-fg hover:text-coral transition-colors">{s.name}</TextLink>
          {s.active ? null : <span className="ml-2 text-caption">Hidden</span>}
          {artworkAspectWarning(s.artworkWidth, s.artworkHeight) ? (
            <Tooltip content="The artwork is not 0.64 wide to tall, so the Builder will crop it.">
              <span tabIndex={0} className="ml-2 inline-flex items-center gap-1 rounded-sm bg-butter px-1.5 text-caption text-ink">
                <TriangleAlert size={12} aria-hidden="true" /> Check artwork
              </span>
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    { id: 'price', header: 'Price', numeric: true, priority: 'primary', cell: (s) => f.money(s.priceCents) },
    { id: 'type', header: 'Type', cell: (s) => <Badge kind={s.type === 'CORE' ? 'CORE' : 'LIMITED'} /> },
    { id: 'drop', header: 'Drop', cell: (s) => (s.dropId ? (dropName.get(s.dropId) ?? `Drop ${s.dropId}`) : '—') },
    { id: 'cost', header: 'Cost', numeric: true, priority: 'hidden-on-phone', cell: (s) => f.money(s.costCents) },
    { id: 'stock', header: 'Available', numeric: true, mobileLabel: 'Stock', cell: (s) => s.available },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (s) => <ActiveCell active={s.active} name={s.name} onChange={(active) => toggle.mutate({ id: s.id, active })} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls Bar: Filters, Search, View Switcher, and Actions */}
      <div className="flex flex-col gap-3 rounded-xl border border-base bg-surface-base p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
            <input
              type="text"
              value={p.q}
              onChange={(e) => setP({ q: e.target.value }, { replace: true })}
              placeholder="Search Stimpies..."
              className="h-9 w-full rounded-lg border border-base bg-surface pl-9 pr-8 text-body-sm text-fg placeholder:text-fg-muted focus:border-fg focus:outline-none focus:ring-1 focus:ring-fg"
            />
            {p.q ? (
              <button
                type="button"
                onClick={() => setP({ q: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {/* Quick Type Filter */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setP({ type: 'all' })}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                p.type === 'all'
                  ? 'bg-ink text-white dark:bg-white dark:text-ink font-semibold'
                  : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
              )}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setP({ type: 'CORE' })}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                p.type === 'CORE'
                  ? 'bg-ink text-white dark:bg-white dark:text-ink font-semibold'
                  : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
              )}
            >
              Core
            </button>
            <button
              type="button"
              onClick={() => setP({ type: 'LIMITED' })}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                p.type === 'LIMITED'
                  ? 'bg-ink text-white dark:bg-white dark:text-ink font-semibold'
                  : 'bg-surface text-fg-muted hover:bg-line/40 hover:text-fg',
              )}
            >
              Limited
            </button>
          </div>

          {/* Drop Selector */}
          <Select
            value={p.drop === null ? '' : String(p.drop)}
            onChange={(e) => setP({ drop: e.target.value === '' ? null : Number(e.target.value) })}
            options={[{ value: '', label: 'All drops' }, ...(drops.data?.items ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
            className="h-9 text-xs"
          />

          {/* Active Filter */}
          <ActiveFilter value={p.active as ActiveView} onChange={(v) => setP({ active: v })} />

          {activeFilters > 0 ? (
            <button
              type="button"
              onClick={() => setP({ q: '', type: 'all', drop: null, active: 'all' })}
              className="text-xs text-fg-muted hover:text-fg underline ml-1"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* View Switcher & Action Button */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
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
            href="/products/stimpies/new"
            variant="primary"
            size="sm"
            leftIcon={<Plus size={18} aria-hidden="true" />}
          >
            New Stimpie
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {(data) => {
          if (data.items.length === 0) {
            return (
              <EmptyState
                title={activeFilters > 0 ? 'No Stimpies match these filters' : 'No Stimpies yet'}
                text={activeFilters > 0 ? undefined : 'Add the first design so it can be sold.'}
                action={
                  activeFilters > 0 ? (
                    <Button variant="secondary" onClick={() => setP({ q: '', type: 'all', drop: null, active: 'all' })}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button href="/products/stimpies/new" variant="primary">
                      New Stimpie
                    </Button>
                  )
                }
              />
            );
          }

          if (viewMode === 'grid') {
            return (
              <div className="flex flex-col gap-5">
                <div
                  className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  aria-label="Products Stimpies grid"
                >
                  {data.items.map((s) => {
                    const hasAspectWarning = artworkAspectWarning(s.artworkWidth, s.artworkHeight);
                    return (
                      <article
                        key={s.id}
                        className={cn(
                          'group relative flex flex-col justify-between rounded-2xl border bg-surface-base p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                          s.active ? 'border-base hover:border-fg/30' : 'border-base/70 bg-surface/40 opacity-80 hover:opacity-100',
                        )}
                      >
                        {/* Top: Picture & Badges */}
                        <div>
                          <div className="relative aspect-[0.68] w-full overflow-hidden rounded-xl border border-line/60 bg-gradient-to-b from-surface to-cream/20 p-2">
                            {s.artworkUrl || s.images?.[0] ? (
                              <img
                                src={s.artworkUrl || s.images?.[0]}
                                alt={s.name}
                                className="h-full w-full object-contain drop-shadow-sm transition-transform duration-300 group-hover:scale-105"
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

                            {/* Top-Right: Active Pill */}
                            <div className="absolute right-2.5 top-2.5">
                              <Pill tone={s.active ? 'success' : 'cream'} shape="pill" size="sm">
                                {s.active ? 'Active' : 'Hidden'}
                              </Pill>
                            </div>

                            {/* Aspect Ratio Warning Pill */}
                            {hasAspectWarning ? (
                              <div className="absolute bottom-2.5 left-2.5">
                                <Tooltip content="The artwork is not 0.64 wide to tall, so the Builder will crop it.">
                                  <span tabIndex={0} className="inline-flex items-center gap-1 rounded-sm bg-butter px-1.5 py-0.5 text-[10px] font-bold text-ink shadow-sm">
                                    <TriangleAlert size={11} aria-hidden="true" /> 0.64 crop
                                  </span>
                                </Tooltip>
                              </div>
                            ) : null}

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
                            <TextLink
                              href={`/products/stimpies/${s.id}`}
                              className="truncate text-base font-bold tracking-tight text-fg hover:text-coral transition-colors block"
                              title={s.name}
                            >
                              {s.name}
                            </TextLink>
                            <p className="truncate text-xs font-medium text-fg-muted" title={s.dropId ? (dropName.get(s.dropId) ?? `Drop ${s.dropId}`) : 'Core Collection'}>
                              {s.dropId ? (dropName.get(s.dropId) ?? `Drop ${s.dropId}`) : 'Core Collection'}
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
                              <span className="block text-base font-black text-fg">{f.money(s.priceCents)}</span>
                            </div>
                            <div className="pl-1">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                Available
                              </span>
                              <span className={cn('block text-base font-black', s.available <= 0 ? 'text-danger' : 'text-fg')}>
                                {s.available}
                              </span>
                            </div>
                          </div>

                          {/* Active Switch */}
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/40 pt-2 px-1">
                            <span className="text-[11px] font-medium text-fg-muted">On website</span>
                            <ActiveCell active={s.active} name={s.name} onChange={(active) => toggle.mutate({ id: s.id, active })} />
                          </div>

                          {/* Edit Button */}
                          <Button
                            href={`/products/stimpies/${s.id}`}
                            variant="secondary"
                            size="sm"
                            fullWidth
                            className="mt-2.5 font-semibold"
                            aria-label={`Edit ${s.name}`}
                          >
                            Edit Stimpie
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-2 flex justify-center">
                  <Pagination
                    page={p.page}
                    pageSize={p.pageSize}
                    total={total}
                    onPageChange={(page) => setP({ page })}
                    onPageSizeChange={(pageSize) => setP({ pageSize })}
                    busy={q.isFetching}
                  />
                </div>
              </div>
            );
          }

          return (
            <DataTable
              caption="Stimpies"
              columns={columns}
              rows={data.items}
              getRowId={(s) => s.id}
              rowLabel={(s) => s.name}
              refreshing={q.isFetching}
              rowClassName={(s) => (s.active ? undefined : 'bg-surface')}
              empty={
                <EmptyState
                  title={activeFilters > 0 ? 'No Stimpies match these filters' : 'No Stimpies yet'}
                  text={activeFilters > 0 ? undefined : 'Add the first design so it can be sold.'}
                  action={
                    activeFilters > 0 ? (
                      <Button variant="secondary" onClick={() => setP({ q: '', type: 'all', drop: null, active: 'all' })}>
                        Clear filters
                      </Button>
                    ) : (
                      <Button href="/products/stimpies/new" variant="primary">
                        New Stimpie
                      </Button>
                    )
                  }
                />
              }
              footer={
                <Pagination
                  page={p.page}
                  pageSize={p.pageSize}
                  total={total}
                  onPageChange={(page) => setP({ page })}
                  onPageSizeChange={(pageSize) => setP({ pageSize })}
                  busy={q.isFetching}
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
                  href={`/products/stimpies/${previewItem.id}`}
                  variant="primary"
                  onClick={() => setPreviewItem(null)}
                >
                  Edit Stimpie
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative aspect-[0.68] max-h-[460px] w-full max-w-[320px] overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface to-cream/30 p-3 shadow-inner">
              <img
                src={previewItem.artworkUrl || previewItem.images?.[0] || ''}
                alt={previewItem.name}
                className="h-full w-full object-contain drop-shadow"
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge kind={previewItem.type === 'CORE' ? 'CORE' : 'LIMITED'} />
              {previewItem.dropId ? <Pill tone="neutral" size="sm">{dropName.get(previewItem.dropId) ?? `Drop ${previewItem.dropId}`}</Pill> : null}
              {previewItem.active ? (
                <Pill tone="neutral" size="sm">Active on website</Pill>
              ) : (
                <Pill tone="danger" size="sm">Hidden</Pill>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
