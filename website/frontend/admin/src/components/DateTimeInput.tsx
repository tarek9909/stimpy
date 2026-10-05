import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@stimpy/ui';
import { isoToZonedInput, useBusinessTimeZone, zonedInputToIso } from '../lib/time';

export interface DateTimeInputProps {
  label: string;
  /**
   * `datetime`: an ISO UTC instant (`2026-10-14T09:30:00.000Z`) in, ISO UTC out.
   * `date`: a date-only `YYYY-MM-DD` string in and out (filters, `spentOn`).
   */
  kind?: 'datetime' | 'date';
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  /** Same format as `value`. */
  min?: string;
  max?: string;
  id?: string;
  className?: string;
}

/**
 * Native date/time input shown and read in the BUSINESS time zone (`settings.business.timezone`),
 * never the device's: a "Launch" typed as 21:00 means 21:00 Beirut time and is sent as ISO UTC.
 * The zone is printed beside the field ("Asia/Beirut time"). Date-only values are plain strings.
 */
export function DateTimeInput({ label, kind = 'datetime', value, onChange, error, hint, required, disabled, min, max, id, className }: DateTimeInputProps) {
  const zone = useBusinessTimeZone();
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const toInput = (v: string | null) => (kind === 'date' ? (v ?? '') : isoToZonedInput(v, zone));
  const [local, setLocal] = useState(() => toInput(value));
  const lastEmitted = useRef<string | null>(value);

  // Follow outside changes (form reset, draft restore); our own emissions are ignored so partial typing survives.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setLocal(toInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toInput closes over zone and kind
  }, [value]);

  // A changed business zone re-reads the same instant in the new zone.
  useEffect(() => {
    if (value !== null) setLocal(toInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the zone is the trigger
  }, [zone]);

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const type = kind === 'date' ? 'date' : 'datetime-local';

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-body font-medium text-fg">
        {label}
        {required ? <span className="ml-1 text-body-sm font-normal text-fg-muted">(required)</span> : null}
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          id={fieldId}
          type={type}
          value={local}
          min={min ? (kind === 'date' ? min : isoToZonedInput(min, zone)) : undefined}
          max={max ? (kind === 'date' ? max : isoToZonedInput(max, zone)) : undefined}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setLocal(raw);
            const out = kind === 'date' ? (raw || null) : zonedInputToIso(raw, zone);
            lastEmitted.current = out;
            onChange(out);
          }}
          className="min-h-11 rounded-md border border-control bg-surface-base px-3 py-2 tabular-nums text-fg aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
        />
        <span className="text-body-sm text-fg-muted">{zone} time</span>
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
