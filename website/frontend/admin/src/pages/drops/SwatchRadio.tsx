import { useId } from 'react';
import { cn } from '@stimpy/ui';

interface Option<V extends string> {
  value: V;
  label: string;
  hex: string;
}

/**
 * Radio chips showing a swatch AND the colour name (accent colour of a drop). Native radios underneath, so
 * arrow keys and form semantics come from the browser; the selected chip has a thick outline, not just a fill.
 */
export function SwatchRadio<V extends string>({ legend, value, onChange, options, disabled }: { legend: string; value: V; onChange: (v: V) => void; options: ReadonlyArray<Option<V>>; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-body font-medium text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-body',
              value === o.value ? 'border-2 border-ink font-medium' : 'border-control',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span aria-hidden="true" className="h-5 w-5 rounded-full border border-ink/30" style={{ backgroundColor: o.hex }} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
