import { useState, type FormEvent } from 'react';
import { Button } from '@stimpy/ui';
import { Skeleton } from '@stimpy/ui';
import { useFormatters } from '../../../lib/format';

/** Display-only values mapped from generated customer-note API models. */
export interface CustomerNoteView {
  key: string;
  body: string;
  author: string;
  createdAt: string;
}

export function CustomerNotesPanel({
  notes,
  legacyNote,
  onAdd,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  loadError,
  onRetry,
  saving = false,
}: {
  notes: readonly CustomerNoteView[];
  legacyNote?: string | null;
  onAdd: (body: string) => Promise<unknown> | unknown;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  saving?: boolean;
}) {
  const f = useFormatters();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || saving || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(body);
      setDraft('');
    } catch {
      setError('The note could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="customer-notes-heading" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="customer-notes-heading" className="mb-1 text-h5">Notes</h2>
      <p className="mb-3 text-body-sm text-fg-muted">Internal notes. Customers never see these.</p>
      {legacyNote?.trim() ? (
        <aside aria-label="Legacy note" className="mb-3 rounded-md border border-line bg-surface p-3">
          <p className="mb-1 text-body-sm font-semibold">Legacy note</p>
          <p className="whitespace-pre-wrap break-words text-body-sm">{legacyNote}</p>
        </aside>
      ) : null}
      {loadError ? (
        <p role="alert" className="mb-3 text-body-sm text-fg-danger">{loadError} {onRetry ? <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : null}</p>
      ) : loading ? (
        <div aria-label="Loading customer notes" className="mb-4 flex flex-col gap-2"><Skeleton variant="text" className="w-3/4" /><Skeleton variant="text" className="w-1/2" /></div>
      ) : null}
      <ol aria-label="Customer notes" className="mb-4 flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.key} className="rounded-md border border-line p-3">
            <p className="whitespace-pre-wrap break-words text-body-sm">{note.body}</p>
            <p className="mt-2 text-xs text-fg-muted">
              {note.author} · <time dateTime={note.createdAt} title={f.dateTime(note.createdAt)}>{f.relative(note.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
      {hasMore && onLoadMore ? (
        <div className="mb-4 flex justify-center">
          <Button type="button" variant="secondary" size="sm" loading={loadingMore} disabled={loadingMore} onClick={onLoadMore}>Load older notes</Button>
        </div>
      ) : null}
      {!loading && !loadError && !notes.length && !legacyNote?.trim() ? <p className="mb-3 text-body-sm text-fg-muted">No notes yet.</p> : null}
      <form aria-label="Add customer note" onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <label htmlFor="customer-note-draft" className="text-body-sm font-medium">Add a note</label>
        <textarea
          id="customer-note-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Write an internal note"
          className="w-full rounded-md border border-control bg-surface-base px-3 py-2 text-body text-fg placeholder:text-fg-muted"
        />
        {error ? <p role="alert" className="text-body-sm text-fg-danger">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={saving || busy || !draft.trim()} loading={busy}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}
