import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { BottomSheet, Button, cn } from '@stimpy/ui';
import { useIsMdUp } from '../lib/hooks';

export interface FilterBarProps {
  /** Search box (usually `<SearchField />`). Always visible, also on phones. */
  search?: ReactNode;
  /** The filter controls (selects, toggles, date range). Rendered in a row from `md`, in a bottom sheet below. */
  children?: ReactNode;
  /** Number of non-default filters: drives the "Filters (2)" badge and the **Clear filters** button. */
  activeCount?: number;
  onClear?: () => void;
  /** Extra controls pinned to the right of the bar (a Sort select on phones, Export). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Filter row for list pages (dashboard-pages 5.3): search + filters + **Clear filters** on
 * desktop; on phones the filters collapse behind a **Filters** button that opens a bottom sheet
 * with an active-count badge. Filters live in the URL (see `useUrlState`); this component only lays
 * them out. Changing a filter should reset `page` to 1 (`useUrlState` does it).
 */
export function FilterBar({ search, children, activeCount = 0, onClear, actions, className }: FilterBarProps) {
  const isMd = useIsMdUp();
  const [open, setOpen] = useState(false);
  const hasFilters = children !== undefined && children !== null && children !== false;

  if (isMd) {
    return (
      <div className={cn('flex flex-wrap items-end gap-3', className)} role="group" aria-label="Filters">
        {search ? <div className="min-w-60 flex-1 md:max-w-sm">{search}</div> : null}
        {hasFilters ? <div className="flex flex-wrap items-end gap-3">{children}</div> : null}
        {activeCount > 0 && onClear ? (
          <Button variant="ghost" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)} role="group" aria-label="Filters">
      <div className="flex items-center gap-2">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}
        {hasFilters ? (
          <Button variant="secondary" onClick={() => setOpen(true)} leftIcon={<SlidersHorizontal size={20} aria-hidden="true" />}>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      {hasFilters ? (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Filters"
          footer={
            <>
              {activeCount > 0 && onClear ? (
                <Button variant="secondary" onClick={onClear}>
                  Clear filters
                </Button>
              ) : null}
              <Button variant="dark" onClick={() => setOpen(false)}>
                Show results
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 pb-2">{children}</div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
