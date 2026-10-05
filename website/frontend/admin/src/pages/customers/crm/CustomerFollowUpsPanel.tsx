import { useState, type FormEvent } from 'react';
import { Button } from '@stimpy/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useFormatters } from '../../../lib/format';
import { Skeleton } from '@stimpy/ui';

/** Display-only follow-up values mapped from generated API models. */
export interface CustomerFollowUpView {
  key: string;
  dueAt: string;
  note: string;
  done: boolean;
}

export function CustomerFollowUpsPanel({
  items,
  onCreate,
  onSetDone,
  onDelete,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  loadError,
  onRetry,
  saving = false,
}: {
  items: readonly CustomerFollowUpView[];
  onCreate: (dueDate: string, note: string) => Promise<unknown> | unknown;
  onSetDone: (key: string, done: boolean) => Promise<unknown> | unknown;
  onDelete: (key: string) => Promise<unknown> | unknown;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  saving?: boolean;
}) {
  const f = useFormatters();
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerFollowUpView | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = note.trim();
    if (!dueDate || !clean || saving || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(dueDate, clean);
      setDueDate('');
      setNote('');
    } catch {
      setError('The follow-up could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const setDone = async (item: CustomerFollowUpView, done: boolean) => {
    setError(null);
    try {
      await onSetDone(item.key, done);
    } catch {
      setError('The follow-up could not be updated. Try again.');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await onDelete(deleteTarget.key);
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError('The follow-up could not be deleted. Try again.');
      throw cause;
    }
  };

  return (
    <section aria-labelledby="customer-followups-heading" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="customer-followups-heading" className="mb-3 text-h5">Follow-ups</h2>
      {loadError ? (
        <p role="alert" className="mb-3 text-body-sm text-fg-danger">{loadError} {onRetry ? <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : null}</p>
      ) : loading ? (
        <div aria-label="Loading follow-ups" className="mb-4 flex flex-col gap-2"><Skeleton variant="text" className="w-3/4" /><Skeleton variant="text" className="w-1/2" /></div>
      ) : items.length ? (
        <ul aria-label="Customer follow-ups" className="mb-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium">{item.note}</p>
                <p className="mt-1 text-xs text-fg-muted">
                  {item.done ? 'Done · ' : ''}<time dateTime={item.dueAt} title={f.dateTime(item.dueAt)}>{f.date(item.dueAt)}</time>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void setDone(item, !item.done)}>
                  {item.done ? 'Reopen' : 'Mark done'}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDeleteTarget(item)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : !loadError ? <p className="mb-4 text-body-sm text-fg-muted">No follow-ups scheduled.</p> : null}
      {hasMore && onLoadMore ? (
        <div className="mb-4 flex justify-center">
          <Button type="button" variant="secondary" size="sm" loading={loadingMore} disabled={loadingMore} onClick={onLoadMore}>Load more follow-ups</Button>
        </div>
      ) : null}
      <form aria-label="Schedule follow-up" onSubmit={(event) => void create(event)} className="grid gap-3 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-body-sm font-medium">
          Due date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required className="min-h-11 rounded-md border border-control bg-surface-base px-3 py-2 text-body" />
        </label>
        <label className="flex flex-col gap-1.5 text-body-sm font-medium">
          Note
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} required placeholder="What needs a follow-up?" className="min-h-11 rounded-md border border-control bg-surface-base px-3 py-2 text-body" />
        </label>
        <Button type="submit" variant="secondary" disabled={saving || busy || !dueDate || !note.trim()} loading={busy}>
          Schedule
        </Button>
      </form>
      {error ? <p role="alert" className="mt-2 text-body-sm text-fg-danger">{error}</p> : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete follow-up?"
        description="This will permanently remove this follow-up from the customer record."
        confirmLabel="Delete follow-up"
        tone="destructive"
        onConfirm={remove}
        onClose={() => { setDeleteError(null); setDeleteTarget(null); }}
      >
        {deleteError ? <p role="alert" className="text-body-sm text-fg-danger">{deleteError}</p> : null}
      </ConfirmDialog>
    </section>
  );
}
