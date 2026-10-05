import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Select, cn } from '@stimpy/ui';
import { useIsMdUp } from '../lib/hooks';

export const PAGE_SIZES = [25, 50, 100] as const;

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Page numbers to show with gaps: `[1, 'gap', 4, 5, 6, 'gap', 12]`. Pure, for tests. */
export function pageWindow(page: number, count: number, siblings = 1): Array<number | 'gap'> {
  const first = 1;
  const last = count;
  const from = Math.max(first + 1, page - siblings);
  const to = Math.min(last - 1, page + siblings);
  const out: Array<number | 'gap'> = [first];
  if (from > first + 1) out.push('gap');
  for (let p = from; p <= to; p += 1) out.push(p);
  if (to < last - 1) out.push('gap');
  if (last > first) out.push(last);
  return out;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  /** `Page<T>.total`. */
  total: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the page-size select. Changing the size should reset `page` to 1 (useUrlState does). */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: readonly number[];
  /** Disable the controls while a page is loading. */
  busy?: boolean;
  className?: string;
}

/**
 * Pager for `Page<T>` responses (`page`, `pageSize`, `total`). `full` from `md` (numbers, prev/next,
 * page size 25 / 50 / 100); `compact` on phones (prev/next and "Page 2 of 7"). Hidden controls when
 * everything fits on one page of the smallest size.
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES, busy, className }: PaginationProps) {
  const isMd = useIsMdUp();
  const count = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), count);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(total, current * pageSize);
  const smallest = pageSizes[0] ?? 25;
  const fits = total <= smallest && current === 1;

  const summary = (
    <p className="text-body-sm tabular-nums text-fg-muted" aria-live="polite">
      {total === 0 ? 'No results' : fits ? `${total} ${total === 1 ? 'result' : 'results'}` : `${start}–${end} of ${total}`}
    </p>
  );
  if (total === 0 || fits) {
    return <div className={cn('flex min-h-11 items-center', className)}>{summary}</div>;
  }

  const prev = (
    <Button variant="secondary" iconOnly aria-label="Previous page" onClick={() => onPageChange(current - 1)} disabled={busy || current <= 1}>
      <ChevronLeft size={20} aria-hidden="true" />
    </Button>
  );
  const next = (
    <Button variant="secondary" iconOnly aria-label="Next page" onClick={() => onPageChange(current + 1)} disabled={busy || current >= count}>
      <ChevronRight size={20} aria-hidden="true" />
    </Button>
  );

  if (!isMd) {
    return (
      <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3', className)}>
        {prev}
        <p className="text-body-sm tabular-nums" aria-live="polite">
          Page {current} of {count}
        </p>
        {next}
      </nav>
    );
  }

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {summary}
      <div className="flex items-center gap-1">
        {prev}
        <ul className="flex items-center gap-1">
          {pageWindow(current, count).map((p, i) =>
            p === 'gap' ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-fg-muted">
                &hellip;
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onPageChange(p)}
                  disabled={busy}
                  aria-label={`Page ${p}`}
                  aria-current={p === current ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-body-sm font-medium tabular-nums',
                    p === current ? 'bg-fg text-fg-inverse' : 'text-fg hover:bg-surface',
                  )}
                >
                  {p}
                </button>
              </li>
            ),
          )}
        </ul>
        {next}
      </div>
      {onPageSizeChange ? (
        <label className="flex items-center gap-2 text-body-sm text-fg-muted">
          Per page
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            options={pageSizes.map((s) => ({ value: String(s), label: String(s) }))}
            className="!w-24"
            aria-label="Rows per page"
          />
        </label>
      ) : null}
    </nav>
  );
}
