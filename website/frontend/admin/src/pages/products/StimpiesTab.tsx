import { useMemo } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { Badge, Button, EmptyState, Select, Skeleton, TextLink } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { Pagination } from '../../components/Pagination';
import { QueryBoundary } from '../../components/QueryBoundary';
import { SearchField } from '../../components/SearchField';
import { Tooltip } from '../../components/Tooltip';
import { useFormatters } from '../../lib/format';
import { artworkAspectWarning } from '../../lib/upload';
import { enumParam, intParam, optionalIntParam, paginationParams, stringParam, useUrlState } from '../../lib/urlState';
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

/** Products -> Stimpies: filters (type, drop, show, search), pagination, active switch, artwork-aspect flag (dashboard-pages 7.2). */
export function StimpiesTab() {
  const [p, setP] = useUrlState(params);
  const f = useFormatters();
  const toggle = useActiveToggle('stimpies');
  const drops = useAllDrops();
  const dropName = useMemo(() => new Map((drops.data?.items ?? []).map((d) => [d.id, d.name])), [drops.data]);
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

  const columns: Column<AdminStimpie>[] = [
    { id: 'art', header: 'Artwork', width: '4.5rem', priority: 'hidden-on-phone', cell: (s) => <img src={s.artworkUrl} alt="" className="h-14 w-9 rounded-md bg-cream object-cover" /> },
    {
      id: 'name',
      header: 'Name',
      priority: 'primary',
      cell: (s) => (
        <span className={s.active ? undefined : 'text-fg-muted'}>
          <TextLink href={`/products/stimpies/${s.id}`} className="font-medium">{s.name}</TextLink>
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
    { id: 'stock', header: 'Avail. / reserved', numeric: true, mobileLabel: 'Stock', cell: (s) => `${s.available} / ${s.reserved}` },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (s) => <ActiveCell active={s.active} name={s.name} onChange={(active) => toggle.mutate({ id: s.id, active })} /> },
  ];

  const total = q.data?.total ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={<SearchField label="Search Stimpies" placeholder="Search by name" value={p.q} onChange={(q2) => setP({ q: q2 }, { replace: true })} shortcut />}
        activeCount={activeFilters}
        onClear={() => setP({ q: '', type: 'all', drop: null, active: 'all' })}
        actions={
          <Button href="/products/stimpies/new" variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />}>
            New Stimpie
          </Button>
        }
      >
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Type
          <Select value={p.type} onChange={(e) => setP({ type: e.target.value as 'all' | 'CORE' | 'LIMITED' })} options={[{ value: 'all', label: 'All types' }, { value: 'CORE', label: 'Core' }, { value: 'LIMITED', label: 'Limited' }]} />
        </label>
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Drop
          <Select
            value={p.drop === null ? '' : String(p.drop)}
            onChange={(e) => setP({ drop: e.target.value === '' ? null : Number(e.target.value) })}
            options={[{ value: '', label: 'All drops' }, ...(drops.data?.items ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
          />
        </label>
        <div className="flex flex-col gap-1 text-body-sm font-medium">
          Show
          <ActiveFilter value={p.active as ActiveView} onChange={(v) => setP({ active: v })} />
        </div>
      </FilterBar>
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {(data) => (
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
                action={activeFilters > 0 ? <Button variant="secondary" onClick={() => setP({ q: '', type: 'all', drop: null, active: 'all' })}>Clear filters</Button> : <Button href="/products/stimpies/new" variant="primary">New Stimpie</Button>}
              />
            }
            footer={<Pagination page={p.page} pageSize={p.pageSize} total={total} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={q.isFetching} />}
          />
        )}
      </QueryBoundary>
    </div>
  );
}
