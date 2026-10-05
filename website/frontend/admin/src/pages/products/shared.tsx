import { useState, type ReactNode } from 'react';
import { Button, Drawer, SegmentedControl, Switch } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Breadcrumbs, type Crumb } from '../../components/PageHeader';
import { useIsLgUp, useOnline } from '../../lib/hooks';

export type ActiveView = 'all' | 'true' | 'false';

/** Show: All / Active / Hidden. Maps to omitting `active`, `active=true`, `active=false`. */
export function ActiveFilter({ value, onChange }: { value: ActiveView; onChange: (v: ActiveView) => void }) {
  return (
    <SegmentedControl
      aria-label="Show"
      value={value}
      onChange={(v) => onChange(v as ActiveView)}
      options={[
        { value: 'all', label: 'All' },
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Hidden' },
      ]}
    />
  );
}

export function matchesActive(active: boolean, view: ActiveView): boolean {
  return view === 'all' || (view === 'true') === active;
}

/** Switch cell for lists: "On"/"Off" text, optimistic via the parent's mutation. */
export function ActiveCell({ active, name, onChange }: { active: boolean; name: string; onChange: (active: boolean) => void }) {
  const online = useOnline();
  return <Switch label={<span className="sr-only">{`${name} is shown on the website`}</span>} checked={active} onChange={onChange} disabled={!online} className="!min-h-0 !py-0" />;
}

/**
 * Editor surface: a right drawer from `lg`, a full page below it (dashboard-pages 7: "right drawer
 * on desktop, full page on phone"). `actions` sit in the drawer footer / a sticky bar above the
 * phone bottom navigation.
 */
export function EditorFrame({ title, crumbs, onClose, actions, children }: { title: string; crumbs: Crumb[]; onClose: () => void; actions: ReactNode; children: ReactNode }) {
  const isLg = useIsLgUp();
  if (isLg) {
    return (
      <Drawer open onClose={onClose} title={title} className="!max-w-xl" closeOnBackdrop={false} footer={actions}>
        {children}
      </Drawer>
    );
  }
  return (
    <div>
      <Breadcrumbs items={crumbs} className="mb-3" />
      <h2 className="mb-4 text-h3">{title}</h2>
      {children}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex flex-col-reverse gap-2 border-t border-base bg-surface-base px-4 py-3 md:bottom-0 md:flex-row md:justify-end">{actions}</div>
    </div>
  );
}

/**
 * Delete with the "hide it instead" fallback (dashboard-pages 7): a referenced record returns
 * `409 CONFLICT`; the dialog then offers to hide it (`active: false`) instead.
 */
export function DeleteOrHide({
  noun,
  onDelete,
  onHide,
  disabled,
}: {
  noun: string;
  onDelete: () => Promise<unknown>;
  onHide: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const notify = useNotifyError();
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => { setConflict(false); setOpen(true); }} className="!border-danger !text-fg-danger">
        Delete {noun}
      </Button>
      <ConfirmDialog
        open={open}
        title={conflict ? `Hide this ${noun} instead?` : `Delete this ${noun}?`}
        description={conflict ? 'This is used by past orders, so it cannot be deleted. Hiding it removes it from the website and keeps your order history.' : `This removes the ${noun} for good.`}
        notUndoable={!conflict}
        tone={conflict ? 'default' : 'destructive'}
        confirmLabel={conflict ? 'Hide it' : `Delete ${noun}`}
        reportErrors={false}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          if (conflict) {
            try {
              return await onHide();
            } catch (e) {
              notify(e);
              throw e;
            }
          }
          try {
            await onDelete();
          } catch (e) {
            if (asApiError(e)?.code === 'CONFLICT') setConflict(true);
            else notify(e);
            // rethrow: the dialog stays open (with the hide wording after a conflict)
            throw e;
          }
          return undefined;
        }}
      />
    </>
  );
}
