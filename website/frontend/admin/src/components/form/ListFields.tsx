import { useController, useFormContext, get } from 'react-hook-form';
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, FormField, Input, cn } from '@stimpy/ui';
import type { UploadFn, UploadResult } from '../../lib/upload';
import { FileUpload } from '../FileUpload';

/**
 * Bullet list editor bound to a `string[]` form field (hoodie `details`, How-it-works promises).
 * Add, remove and reorder lines; server errors on `name.N` show under line N.
 */
export function StringListField({ name, label, addLabel = 'Add line', placeholder, hint, max = 30 }: { name: string; label: string; addLabel?: string; placeholder?: string; hint?: string; max?: number }) {
  const { control, formState } = useFormContext();
  const { field } = useController({ name, control });
  const items: string[] = Array.isArray(field.value) ? field.value : [];
  const set = (next: string[]) => field.onChange(next);
  return (
    <fieldset className="flex flex-col gap-2" id={`field-${name}`}>
      <legend className="text-body font-medium text-fg">{label}</legend>
      {hint ? <p className="text-body-sm text-fg-muted">{hint}</p> : null}
      {items.map((value, i) => {
        const err = (get(formState.errors, `${name}.${i}`) as { message?: string } | undefined)?.message ?? null;
        return (
          <div key={i} className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <FormField label={<span className="sr-only">{`${label} ${i + 1}`}</span>} name={`${name}.${i}`} error={err}>
                <Input value={value} placeholder={placeholder} onChange={(e) => set(items.map((v, j) => (j === i ? e.target.value : v)))} />
              </FormField>
            </div>
            <Button variant="ghost" iconOnly aria-label={`Move line ${i + 1} up`} disabled={i === 0} onClick={() => set(swap(items, i, i - 1))}>
              <ArrowUp size={18} aria-hidden="true" />
            </Button>
            <Button variant="ghost" iconOnly aria-label={`Move line ${i + 1} down`} disabled={i === items.length - 1} onClick={() => set(swap(items, i, i + 1))}>
              <ArrowDown size={18} aria-hidden="true" />
            </Button>
            <Button variant="ghost" iconOnly aria-label={`Remove line ${i + 1}`} onClick={() => set(items.filter((_, j) => j !== i))}>
              <Trash2 size={18} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" disabled={items.length >= max} leftIcon={<Plus size={16} aria-hidden="true" />} onClick={() => set([...items, ''])}>
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  const x = next[a] as T;
  next[a] = next[b] as T;
  next[b] = x;
  return next;
}

/**
 * Image list bound to a `string[]` of upload URLs: thumbnails with Move left/right and Remove, a
 * "Cover" label on the first, and an add slot that uploads one file at a time. Removing only drops
 * the reference (there is no delete endpoint).
 */
export function ImageListField({
  name,
  label,
  hint,
  max = 12,
  upload,
  onBusyChange,
}: {
  name: string;
  label: string;
  hint?: string;
  max?: number;
  upload?: UploadFn;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { control, formState } = useFormContext();
  const { field } = useController({ name, control });
  const urls: string[] = Array.isArray(field.value) ? field.value : [];
  const arrayError = (get(formState.errors, name) as { message?: string } | undefined)?.message;
  return (
    <fieldset className="flex flex-col gap-2" id={`field-${name}`}>
      <legend className="text-body font-medium text-fg">{label}</legend>
      <p className="text-body-sm text-fg-muted">{hint ?? 'The first image is the cover. Removing an image only removes it from this item.'}</p>
      {urls.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => {
            const err = (get(formState.errors, `${name}.${i}`) as { message?: string } | undefined)?.message;
            return (
              <li key={`${url}-${i}`} className={cn('rounded-lg border bg-surface-base p-2', err ? 'border-danger' : 'border-base')}>
                <img src={url} alt={`${label} ${i + 1}`} className="aspect-[4/5] w-full rounded-md bg-cream object-contain" />
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-caption text-fg-muted">{i === 0 ? 'Cover' : `Image ${i + 1}`}</span>
                  <span className="flex">
                    <Button variant="ghost" iconOnly size="sm" aria-label={`Move image ${i + 1} left`} disabled={i === 0} onClick={() => field.onChange(swap(urls, i, i - 1))}>
                      <ArrowLeft size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" iconOnly size="sm" aria-label={`Move image ${i + 1} right`} disabled={i === urls.length - 1} onClick={() => field.onChange(swap(urls, i, i + 1))}>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" iconOnly size="sm" aria-label={`Remove image ${i + 1}`} onClick={() => field.onChange(urls.filter((_, j) => j !== i))}>
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </span>
                </div>
                {err ? <p className="mt-1 text-caption font-medium text-fg-danger">{err}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {urls.length < max ? (
        <FileUpload
          variant="image"
          label={urls.length === 0 ? 'Add the first image' : 'Add another image'}
          value={null}
          compact
          upload={upload}
          onBusyChange={onBusyChange}
          onChange={(r: UploadResult | null) => {
            if (r) field.onChange([...urls, r.url]);
          }}
        />
      ) : null}
      {arrayError ? <p className="text-body-sm font-medium text-fg-danger">{arrayError}</p> : null}
    </fieldset>
  );
}
