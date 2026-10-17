import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from 'lucide-react';
import { Button, Checkbox, ErrorState, Skeleton, SkeletonGroup, cn, useSkeletonDelay, SlowLoadingHint, Banner } from '@stimpy/ui';
import { describeError } from '../api/errors';
import { useIsMdUp } from '../lib/hooks';

export type ColumnPriority = 'primary' | 'secondary' | 'hidden-on-phone';

export interface Column<Row> {
  id: string;
  /** Visible header text. */
  header: string;
  cell: (row: Row) => ReactNode;
  /** API sort field (`placedAt`). Makes the header a sort button with `aria-sort`. */
  sortKey?: string;
  /** Direction applied the first time the column is clicked. Default `asc`. */
  defaultSortDirection?: 'asc' | 'desc';
  align?: 'left' | 'right' | 'center';
  /** Tabular numerals + right aligned (money, counts). */
  numeric?: boolean;
  /** CSS width for the table layout, e.g. `8rem`. */
  width?: string;
  /**
   * Card layout below `md`. The first `primary` column is the card title, the second `primary`
   * is the value shown top-right (e.g. total), further `primary` columns are sub-lines under the
   * title; `secondary` columns are "Label: value" lines; `hidden-on-phone` is omitted. Default `secondary`.
   */
  priority?: ColumnPriority;
  /** Label of this value in the card layout. Default: the header. `''` shows the value alone. */
  mobileLabel?: string;
  className?: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

type RowId = string | number;

export interface BulkContext<Row> {
  selectedIds: ReadonlySet<RowId>;
  selectedRows: Row[];
  clear: () => void;
}

export interface ReorderConfig {
  /** Move one step. The parent computes the full id list and calls `PUT .../order`. */
  onMove: (id: RowId, delta: -1 | 1) => void;
  /** Drag and drop (desktop table): move `fromId` to where `toId` is. Omit for buttons only. */
  onDragMove?: (fromId: RowId, toId: RowId) => void;
  /** Reordering unavailable right now (a save is in flight). */
  disabled?: boolean;
}

export interface DataTableProps<Row> {
  /** Required accessible name of the table. */
  caption: string;
  columns: Column<Row>[];
  rows: Row[] | undefined;
  getRowId: (row: Row) => RowId;
  /** Accessible name of a row checkbox / card, e.g. the order number: "Select STP-1042". */
  rowLabel?: (row: Row) => string;

  /** First load, no data yet: skeleton rows (shown after 150 ms, kept 300 ms). */
  loading?: boolean;
  /** Refetch while data is on screen (page change, filters): rows dim. */
  refreshing?: boolean;
  /** A failed query. With no rows: error panel with Try again. With rows: a stale banner. */
  error?: unknown;
  onRetry?: () => void;
  /** Shown when `rows` is an empty array. Use `EmptyState`; say "No orders match these filters" for filtered-empty. */
  empty?: ReactNode;

  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;

  selectable?: boolean;
  selectedIds?: ReadonlySet<RowId>;
  onSelectionChange?: (ids: Set<RowId>) => void;
  /** Sticky bar shown while something is selected. */
  bulkBar?: (ctx: BulkContext<Row>) => ReactNode;

  /** Mouse convenience: clicking a row (outside buttons/links) calls this. Keyboard users use the links inside cells. */
  onRowClick?: (row: Row) => void;
  /**
   * Adds Move up / Move down buttons (keyboard and touch) and, in the table, a drag handle to
   * every row. Rows must be the COMPLETE list in its saved order.
   */
  reorder?: ReorderConfig;
  /** Per-row "..." menu slot (last column / card corner). */
  rowActions?: (row: Row) => ReactNode;
  rowClassName?: (row: Row) => string | undefined;

  density?: 'dense' | 'comfortable';
  /** `auto` = table from `md`, cards below. Tests and wide secondary tables can force one. */
  layout?: 'auto' | 'table' | 'cards';
  /** Keep the header visible while the page scrolls (default). Turn off when `scroll` is on. */
  stickyHeader?: boolean;
  /** Let the table scroll sideways inside its own box (wide secondary tables only). Disables the sticky header. */
  scroll?: boolean;
  skeletonRows?: number;
  /** Pagination goes here. */
  footer?: ReactNode;
  className?: string;
}

const EMPTY_SET: ReadonlySet<RowId> = new Set();

function alignClass(c: Pick<Column<unknown>, 'align' | 'numeric'>): string {
  const a = c.align ?? (c.numeric ? 'right' : 'left');
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
}

/**
 * Dashboard table (design-system 13.2). One column definition renders a real `<table>` from `md`
 * (sortable headers with `aria-sort`, selection, sticky header) and a card list below it.
 * It is presentational: sorting, selection and data live in the parent (URL state + query).
 *
 * States: loading (skeleton rows), empty (your `empty` node), error (retry panel, or a stale
 * banner when rows are still on screen), refreshing (dimmed rows, never an empty flash).
 */
export function DataTable<Row>(props: DataTableProps<Row>) {
  const {
    caption,
    columns,
    rows,
    getRowId,
    rowLabel,
    loading,
    refreshing,
    error,
    onRetry,
    empty,
    sort,
    onSortChange,
    selectable,
    selectedIds = EMPTY_SET,
    onSelectionChange,
    bulkBar,
    onRowClick,
    rowActions,
    rowClassName,
    reorder,
    density = 'comfortable',
    layout = 'auto',
    stickyHeader = true,
    scroll,
    skeletonRows = 8,
    footer,
    className,
  } = props;

  const isMd = useIsMdUp();
  const asTable = layout === 'table' || (layout === 'auto' && isMd);
  const showSkeleton = useSkeletonDelay(!!loading);
  const hasRows = !!rows && rows.length > 0;
  const idsOnPage = useMemo(() => (rows ?? []).map(getRowId), [rows, getRowId]);
  const allSelected = idsOnPage.length > 0 && idsOnPage.every((id) => selectedIds.has(id));
  const someSelected = idsOnPage.some((id) => selectedIds.has(id));
  const selectedRows = useMemo(() => (rows ?? []).filter((r) => selectedIds.has(getRowId(r))), [rows, selectedIds, getRowId]);

  const setSelection = (next: Set<RowId>) => onSelectionChange?.(next);
  const toggleRow = (id: RowId) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  };
  const toggleAll = () => {
    const next = new Set(selectedIds);
    if (allSelected) idsOnPage.forEach((id) => next.delete(id));
    else idsOnPage.forEach((id) => next.add(id));
    setSelection(next);
  };
  const clear = () => setSelection(new Set());

  const cycleSort = (col: Column<Row>) => {
    if (!col.sortKey || !onSortChange) return;
    if (sort && sort.field === col.sortKey) onSortChange({ field: col.sortKey, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    else onSortChange({ field: col.sortKey, direction: col.defaultSortDirection ?? 'asc' });
  };

  const errorInfo = error ? describeError(error, 'read') : null;
  const showErrorPanel = !!error && !hasRows;
  const showStale = !!error && hasRows;
  const showLoading = !!loading && !hasRows && !error;

  const [dragId, setDragId] = useState<RowId | null>(null);
  const [overId, setOverId] = useState<RowId | null>(null);

  const selectionActive = !!selectable && selectedIds.size > 0;
  const bar =
    selectionActive && bulkBar ? (
      <div
        role="region"
        aria-label="Bulk actions"
        className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-lg border-2 border-fg bg-surface-base px-4 py-2 md:top-16"
      >
        <span className="text-body-sm font-medium tabular-nums">{selectedIds.size} selected</span>
        <div className="flex flex-wrap items-center gap-2">{bulkBar({ selectedIds, selectedRows, clear })}</div>
        <Button variant="ghost" size="sm" onClick={clear} className="ml-auto">
          Clear selection
        </Button>
      </div>
    ) : null;

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
      {showStale ? (
        <Banner
          variant="warning"
          live
          action={
            onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
        >
          Showing saved data. Couldn&apos;t refresh.
        </Banner>
      ) : null}
      {bar}

      {showErrorPanel ? (
        <ErrorState
          title="Couldn't load this list"
          text={errorInfo?.message}
          requestId={errorInfo?.unexpected ? errorInfo.reference : null}
          onRetry={onRetry}
        />
      ) : showLoading ? (
        <LoadingBody asTable={asTable} columns={columns} rows={skeletonRows} visible={showSkeleton} onRetry={onRetry} />
      ) : !hasRows ? (
        <div className="rounded-lg border border-base">{empty}</div>
      ) : asTable ? (
        <div className={cn(scroll ? 'overflow-x-auto' : 'overflow-x-clip', 'admin-table rounded-lg border border-base')}>
          <table className={cn('w-full border-collapse text-left', refreshing && 'opacity-60 transition-opacity')} aria-busy={refreshing || undefined}>
            <caption className="sr-only">{caption}</caption>
            <thead className={cn('bg-surface text-body-sm', stickyHeader && !scroll && 'sticky top-14 z-10 md:top-16')}>
              <tr className="border-b border-base">
                {selectable ? (
                  <th scope="col" className="w-12 px-3 py-1">
                    <Checkbox
                      label={<span className="sr-only">Select all on this page</span>}
                      checked={allSelected}
                      indeterminate={!allSelected && someSelected}
                      onChange={toggleAll}
                      className="!min-h-0 !py-0"
                    />
                  </th>
                ) : null}
                {reorder ? (
                  <th scope="col" className="w-36 px-2 py-2 text-body-sm font-medium text-fg-muted">
                    Order
                  </th>
                ) : null}
                {columns.map((col) => {
                  const sorted = sort && col.sortKey && sort.field === col.sortKey ? sort.direction : null;
                  const ariaSort = col.sortKey ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={ariaSort}
                      style={col.width ? { width: col.width } : undefined}
                      className={cn('px-3 py-2 text-body-sm font-medium text-fg-muted', alignClass(col), col.className)}
                    >
                      {col.sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => cycleSort(col)}
                          className={cn(
                            'inline-flex min-h-9 items-center gap-1 rounded-sm font-medium hover:text-fg',
                            sorted && 'text-fg',
                            alignClass(col) === 'text-right' && 'flex-row-reverse',
                          )}
                        >
                          {col.header}
                          {sorted === 'asc' ? (
                            <ArrowUp size={16} aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={16} aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown size={16} aria-hidden="true" className="opacity-60" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {rowActions ? (
                  <th scope="col" className="w-12 px-2">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row, index, all) => {
                const id = getRowId(row);
                const selected = selectedIds.has(id);
                return (
                  <tr
                    key={id}
                    data-row-id={id}
                    onDragOver={
                      reorder?.onDragMove && dragId !== null
                        ? (e) => {
                            e.preventDefault();
                            if (overId !== id) setOverId(id);
                          }
                        : undefined
                    }
                    onDrop={
                      reorder?.onDragMove && dragId !== null
                        ? (e) => {
                            e.preventDefault();
                            if (dragId !== id) reorder.onDragMove?.(dragId, id);
                            setDragId(null);
                            setOverId(null);
                          }
                        : undefined
                    }
                    aria-selected={selectable ? selected : undefined}
                    onClick={
                      onRowClick
                        ? (e) => {
                            if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[role="menuitem"]')) return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                    className={cn(
                      'border-b border-base last:border-b-0',
                      selected && 'bg-cream',
                      onRowClick && 'cursor-pointer hover:bg-surface',
                      dragId === id && 'opacity-50',
                      overId === id && dragId !== id && 'bg-cream',
                      rowClassName?.(row),
                    )}
                  >
                    {reorder ? (
                      <td className="w-36 px-2">
                        <ReorderControls
                          id={id}
                          label={rowLabel?.(row) ?? `row ${id}`}
                          first={index === 0}
                          last={index === all.length - 1}
                          reorder={reorder}
                          draggable
                          onDragStartRow={(rowId) => setDragId(rowId)}
                          onDragEndRow={() => {
                            setDragId(null);
                            setOverId(null);
                          }}
                        />
                      </td>
                    ) : null}
                    {selectable ? (
                      <td className="w-12 px-3">
                        <Checkbox
                          label={<span className="sr-only">{`Select ${rowLabel?.(row) ?? `row ${id}`}`}</span>}
                          checked={selected}
                          onChange={() => toggleRow(id)}
                          className="!min-h-0 !py-0"
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          'px-3 align-middle text-body-sm',
                          density === 'dense' ? 'py-1.5' : 'py-3',
                          alignClass(col),
                          col.numeric && 'tabular-nums',
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {rowActions ? <td className="w-12 px-2 text-right">{rowActions(row)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <CardList
          rows={rows ?? []}
          columns={columns}
          getRowId={getRowId}
          rowLabel={rowLabel}
          selectable={selectable}
          selectedIds={selectedIds}
          toggleRow={toggleRow}
          toggleAll={toggleAll}
          allSelected={allSelected}
          caption={caption}
          refreshing={refreshing}
          onRowClick={onRowClick}
          rowActions={rowActions}
          rowClassName={rowClassName}
          reorder={reorder}
        />
      )}

      {footer}
    </div>
  );
}

/* ------------------------------------------------------------------------------- loading body */

function LoadingBody<Row>({
  asTable,
  columns,
  rows,
  visible,
  onRetry,
}: {
  asTable: boolean;
  columns: Column<Row>[];
  rows: number;
  visible: boolean;
  onRetry?: () => void;
}) {
  return (
    <SkeletonGroup label="Loading list" className="rounded-lg border border-base">
      {visible ? (
        asTable ? (
          Array.from({ length: rows }, (_, i) => <Skeleton key={i} variant="table-row" cells={Math.max(2, columns.length)} className="px-3" />)
        ) : (
          <div className="space-y-3 p-3">
            {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
              <Skeleton key={i} variant="rect" className="h-24" />
            ))}
          </div>
        )
      ) : (
        <div className="h-12" />
      )}
      <SlowLoadingHint loading onRetry={onRetry} className="p-3" />
    </SkeletonGroup>
  );
}

/* ---------------------------------------------------------------------------------- card list */

interface CardListProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => RowId;
  rowLabel?: (row: Row) => string;
  selectable?: boolean;
  selectedIds: ReadonlySet<RowId>;
  toggleRow: (id: RowId) => void;
  toggleAll: () => void;
  allSelected: boolean;
  caption: string;
  refreshing?: boolean;
  onRowClick?: (row: Row) => void;
  rowActions?: (row: Row) => ReactNode;
  rowClassName?: (row: Row) => string | undefined;
  reorder?: ReorderConfig;
}

/** Below `md`: one card per row. Selection mode is entered with **Select** (or when something is selected). */
function CardList<Row>({
  rows,
  columns,
  getRowId,
  rowLabel,
  selectable,
  selectedIds,
  toggleRow,
  toggleAll,
  allSelected,
  caption,
  refreshing,
  onRowClick,
  rowActions,
  rowClassName,
  reorder,
}: CardListProps<Row>) {
  const [selectMode, setSelectMode] = useState(false);
  const showChecks = !!selectable && (selectMode || selectedIds.size > 0);
  const primary = columns.filter((c) => c.priority === 'primary');
  const secondary = columns.filter((c) => (c.priority ?? 'secondary') === 'secondary');
  const title = primary[0];
  const trailing = primary[1];
  const subs = primary.slice(2);

  return (
    <div className={cn('flex flex-col gap-3', refreshing && 'opacity-60 transition-opacity')} aria-busy={refreshing || undefined}>
      {selectable ? (
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSelectMode((v) => !v)} aria-pressed={showChecks}>
            {showChecks ? 'Done' : 'Select'}
          </Button>
          {showChecks ? (
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? 'Clear page' : 'Select page'}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ul aria-label={caption} className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const id = getRowId(row);
          const selected = selectedIds.has(id);
          return (
            <li
              key={id}
              data-row-id={id}
              onClick={
                onRowClick
                  ? (e) => {
                      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[role="menuitem"]')) return;
                      onRowClick(row);
                    }
                  : undefined
              }
              className={cn('rounded-lg border bg-surface-base p-4', selected ? 'border-2 border-fg bg-cream' : 'border-base', onRowClick && 'cursor-pointer', rowClassName?.(row))}
            >
              <div className="flex items-start gap-3">
                {showChecks ? (
                  <Checkbox
                    label={<span className="sr-only">{`Select ${rowLabel?.(row) ?? `row ${id}`}`}</span>}
                    checked={selected}
                    onChange={() => toggleRow(id)}
                    className="!min-h-0 !py-0"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-body font-medium">{title ? title.cell(row) : null}</div>
                    <div className="flex shrink-0 items-start gap-1">
                      {trailing ? <div className="text-body font-medium tabular-nums">{trailing.cell(row)}</div> : null}
                      {rowActions ? <div className="-mr-2 -mt-2">{rowActions(row)}</div> : null}
                    </div>
                  </div>
                  {subs.map((c) => (
                    <div key={c.id} className="mt-1 min-w-0 text-body-sm text-fg-muted">
                      {c.cell(row)}
                    </div>
                  ))}
                  {reorder ? (
                    <div className="mt-2">
                      <ReorderControls id={id} label={rowLabel?.(row) ?? `row ${id}`} first={index === 0} last={index === rows.length - 1} reorder={reorder} />
                    </div>
                  ) : null}
                  {secondary.length > 0 ? (
                    <dl className="mt-2 space-y-1 text-body-sm">
                      {secondary.map((c) => {
                        const label = c.mobileLabel ?? c.header;
                        return (
                          <div key={c.id} className="flex min-w-0 gap-2">
                            {label ? <dt className="shrink-0 text-fg-muted">{label}</dt> : null}
                            <dd className={cn('min-w-0 flex-1', c.numeric && 'tabular-nums')}>{c.cell(row)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReorderControls({
  id,
  label,
  first,
  last,
  reorder,
  draggable,
  onDragStartRow,
  onDragEndRow,
}: {
  id: RowId;
  label: string;
  first: boolean;
  last: boolean;
  reorder: ReorderConfig;
  draggable?: boolean;
  onDragStartRow?: (id: RowId) => void;
  onDragEndRow?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {draggable && reorder.onDragMove && !reorder.disabled ? (
        <span
          draggable
          aria-hidden="true"
          title="Drag to reorder"
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', String(id));
            e.dataTransfer.effectAllowed = 'move';
            const rowEl = (e.currentTarget as HTMLElement).closest('tr');
            if (rowEl) e.dataTransfer.setDragImage(rowEl, 16, 16);
            onDragStartRow?.(id);
          }}
          onDragEnd={() => onDragEndRow?.()}
          className="inline-flex h-11 w-8 cursor-grab items-center justify-center text-fg-muted active:cursor-grabbing"
        >
          <GripVertical size={18} />
        </span>
      ) : null}
      <Button variant="ghost" iconOnly aria-label={`Move ${label} up`} disabled={first || reorder.disabled} onClick={() => reorder.onMove(id, -1)}>
        <ArrowUp size={18} aria-hidden="true" />
      </Button>
      <Button variant="ghost" iconOnly aria-label={`Move ${label} down`} disabled={last || reorder.disabled} onClick={() => reorder.onMove(id, 1)}>
        <ArrowDown size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Convenience for pages: keeps a stable Set in state. */
export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<RowId>>(new Set());
  return {
    selectedIds,
    /** Pass straight to `onSelectionChange`. */
    onSelectionChange: (ids: Set<RowId>) => setSelectedIds(ids),
    clear: () => setSelectedIds(new Set()),
  };
}
