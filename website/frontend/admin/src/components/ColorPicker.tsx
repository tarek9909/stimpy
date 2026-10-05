import { useId, useState } from 'react';
import { cn } from '@stimpy/ui';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

export interface ColorPickerProps {
  label: string;
  /** `#RRGGBB`, or `''` when unset. */
  value: string;
  onChange: (hex: string) => void;
  error?: string | null;
  hint?: string;
  /** Optional colour (Builder tint): the text field may be empty and a **Clear** button appears. */
  optional?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Hex colour field: swatch, native colour picker and a text input kept in sync. Validates
 * `#RRGGBB` (the text is upper-cased as you type). `onChange` receives whatever is typed, so the
 * form's own schema decides what is valid; the native picker always emits a valid value.
 * The swatch shows the colour as data (it is the colour being edited), with its hex as text.
 */
export function ColorPicker({ label, value, onChange, error, hint, optional, disabled, id, className }: ColorPickerProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const [lastValid, setLastValid] = useState(isHexColor(value) ? value : '#FFFFFF');
  const valid = isHexColor(value);
  const swatch = valid ? value : lastValid;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  const emit = (raw: string) => {
    let next = raw.trim().toUpperCase();
    if (next !== '' && !next.startsWith('#')) next = `#${next}`;
    next = next.slice(0, 7);
    if (isHexColor(next)) setLastValid(next);
    onChange(next);
  };

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-body font-medium text-fg">
        {label}
        {optional ? <span className="ml-1 text-body-sm font-normal text-fg-muted">(optional)</span> : null}
      </label>
      <div className="flex items-center gap-2">
        <span
          className="relative inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-md border border-control"
          style={{ backgroundColor: valid || !optional ? swatch : undefined }}
        >
          <input
            type="color"
            aria-label={`Pick ${label.toLowerCase()}`}
            value={swatch.toLowerCase()}
            disabled={disabled}
            onChange={(e) => emit(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <input
          id={fieldId}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={7}
          placeholder="#RRGGBB"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => emit(e.target.value)}
          className="min-h-11 w-32 rounded-md border border-control bg-surface-base px-3 py-2 font-medium tabular-nums text-fg aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
        />
        {optional && value ? (
          <button type="button" disabled={disabled} onClick={() => onChange('')} className="min-h-11 rounded-md px-3 text-body-sm font-medium underline underline-offset-4">
            Clear
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-body-sm font-medium text-fg-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
