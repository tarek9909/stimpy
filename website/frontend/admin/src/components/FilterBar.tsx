import { useId, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { BottomSheet, Button, cn } from '@stimpy/ui';
import { useIsMdUp } from '../lib/hooks';

export interface FilterBarProps {
  /** Search box (usually `<SearchField />`). Always visible, also on phones. */
  search?: ReactNode;
  /** Advanced controls: an expandable grid on desktop, a bottom sheet on phones. */
  children?: ReactNode;
  /** Number of non-default filters: drives the "Filters (2)" badge and the **Clear filters** button. */
  activeCount?: number;
  onClear?: () => void;
  /** Extra controls pinned to the right of the bar (a Sort select on phones, Export). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Search and actions stay visible while advanced filters can be expanded independently.
 * Filter values live in the parent URL state, so closing either view never resets a selection.
 */
export function FilterBar({ search, children, activeCount = 0, onClear, actions, className }: FilterBarProps) {
  const isMd = useIsMdUp();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const filterId = useId();
  const hasFilters = children !== undefined && children !== null && children !== false;

  if (isMd) {
    return (
      <div className={cn('admin-filters flex flex-col gap-3', className)} role="group" aria-label="Filters">
        <div className="flex flex-wrap items-center gap-2">
          {search ? <div className="min-w-60 flex-1 md:max-w-sm">{search}</div> : null}
          {hasFilters ? (
            <Button
              variant="secondary"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={filterId}
              leftIcon={<SlidersHorizontal size={16} aria-hidden="true" />}
            >
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          ) : null}
          {activeCount > 0 && onClear ? <Button variant="ghost" onClick={onClear}>Clear filters</Button> : null}
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </div>
        {hasFilters ? (
          <div id={filterId} hidden={!expanded}>
            <div className="admin-filter-fields">{children}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('admin-filters flex flex-col gap-3', className)} role="group" aria-label="Filters">
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
