import { useState } from 'react';
import { Button } from '@stimpy/ui';
import { Combobox } from '../../../components/Combobox';
import { Skeleton } from '@stimpy/ui';

/** Display-only values mapped from the generated API models by the page adapter. */
export interface CustomerTagChip {
  key: string;
  label: string;
  color?: string | null;
}

export function CustomerTagsPanel({
  tags,
  options,
  onAdd,
  onRemove,
  loading = false,
  loadError,
  onRetry,
  optionsLoading = false,
  saving = false,
}: {
  tags: readonly CustomerTagChip[];
  options: readonly string[];
  onAdd: (name: string) => Promise<unknown> | unknown;
  onRemove: (key: string) => Promise<unknown> | unknown;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  optionsLoading?: boolean;
  saving?: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(tags.map((tag) => tag.label.trim().toLocaleLowerCase()));
  const available = options.filter((name) => !existing.has(name.trim().toLocaleLowerCase()));

  const add = async (name: string) => {
    const clean = name.trim();
    if (!clean || existing.has(clean.toLocaleLowerCase()) || saving || adding) return;
    if (clean.length > 80) {
      setError('Use at most 80 characters for a tag.');
      return;
    }
    setError(null);
    setAdding(true);
    try {
      await onAdd(clean);
      setValue(null);
    } catch {
      setError('The tag could not be added. Try again.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (tag: CustomerTagChip) => {
    if (saving) return;
    setBusyKey(tag.key);
    setError(null);
    try {
      await onRemove(tag.key);
    } catch {
      setError('The tag could not be removed. Try again.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section aria-labelledby="customer-tags-heading" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="customer-tags-heading" className="mb-3 text-h5">Tags</h2>
      {loadError ? (
        <p role="alert" className="mb-3 text-body-sm text-fg-danger">
          {loadError} {onRetry ? <Button type="button" variant="ghost" size="sm" onClick={onRetry}>Retry</Button> : null}
        </p>
      ) : loading ? (
        <div aria-label="Loading customer tags" className="mb-3 flex gap-2"><Skeleton variant="text" className="w-20" /><Skeleton variant="text" className="w-24" /></div>
      ) : tags.length ? (
        <ul aria-label="Customer tags" className="mb-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-body-sm">
              {tag.color ? <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: tag.color }} /> : null}
              <span className="truncate">{tag.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving || busyKey === tag.key}
                aria-label={`Remove ${tag.label} tag`}
                onClick={() => void remove(tag)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="mb-3 text-body-sm text-fg-muted">No tags yet.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Combobox
          label="Add or create a tag"
          options={available.map((name) => ({ value: name, label: name }))}
          value={value}
          onChange={(next) => setValue(next)}
          allowCustom
          placeholder="Choose or type a tag"
          disabled={saving || adding || optionsLoading || loading || !!loadError}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" disabled={saving || adding || optionsLoading || loading || !!loadError || !value?.trim()} loading={adding} onClick={() => value && void add(value)}>
          Add tag
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-body-sm text-fg-danger">{error}</p> : null}
    </section>
  );
}
