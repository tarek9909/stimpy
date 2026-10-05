import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, RichText, cn } from '@stimpy/ui';

/** Helper line under every long-text field (dashboard-pages 13.3). */
export const PLAIN_TEXT_HINT = "Plain text. Leave a blank line between paragraphs. **bold** and '- ' lists are supported.";

/** Preview rendered by the same safe renderer as the public site (never raw HTML). */
export function TextPreview({ text, label = 'Preview' }: { text: string; label?: string }) {
  return (
    <div className="rounded-md border border-base bg-cream p-3" aria-label={label} role="region">
      <p className="mb-2 text-body-sm font-medium text-fg-muted">{label}</p>
      {text.trim() ? <RichText text={text} className="space-y-3 text-body" /> : <p className="text-body-sm text-fg-muted">Nothing to preview yet.</p>}
    </div>
  );
}

/** Edit / Preview switch for long text on phones; side by side from `lg`. */
export function EditPreview({ value, onChange, rows = 8, maxLength, label, id }: { value: string; onChange: (v: string) => void; rows?: number; maxLength?: number; label: string; id?: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <label htmlFor={fieldId} className="text-body font-medium">{label}</label>
        <div className="flex gap-1" role="group" aria-label="Edit or preview">
          <Button size="sm" variant={mode === 'edit' ? 'dark' : 'secondary'} onClick={() => setMode('edit')} aria-pressed={mode === 'edit'}>Edit</Button>
          <Button size="sm" variant={mode === 'preview' ? 'dark' : 'secondary'} onClick={() => setMode('preview')} aria-pressed={mode === 'preview'}>Preview</Button>
        </div>
      </div>
      <label htmlFor={fieldId} className="hidden text-body font-medium lg:block">{label}</label>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(mode === 'preview' && 'hidden lg:block')}>
          <textarea
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            maxLength={maxLength}
            className="min-h-32 w-full rounded-md border border-control bg-surface-base px-3 py-2 text-body text-fg"
            aria-describedby={`${fieldId}-hint`}
          />
          <p id={`${fieldId}-hint`} className="mt-1 text-body-sm text-fg-muted">{PLAIN_TEXT_HINT}{maxLength ? ` ${value.length} / ${maxLength}` : ''}</p>
        </div>
        <div className={cn(mode === 'edit' && 'hidden lg:block')}>
          <TextPreview text={value} />
        </div>
      </div>
    </div>
  );
}

/** A collapsible section (native `<details>`): the summary is the heading. */
export function Disclosure({ title, summary, defaultOpen, children, dirty }: { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode; dirty?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-base">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="text-h5">{title}</span>
          {dirty ? <span className="ml-2 text-body-sm font-medium text-fg-muted">Unsaved changes</span> : null}
          {summary ? <span className="block text-body-sm text-fg-muted">{summary}</span> : null}
        </span>
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-base p-4">{children}</div>
    </details>
  );
}
