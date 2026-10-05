import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@stimpy/ui';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Small secondary text on the right (a count, a price). */
  hint?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  /** Selected option value, or (with `allowCustom`) the typed text. `null`/`''` = nothing. */
  value: string | null;
  onChange: (value: string | null, option?: ComboboxOption) => void;
  /** Free text is a valid value (expense category: suggestions, but anything goes). */
  allowCustom?: boolean;
  placeholder?: string;
  /** Show a clear button when there is a value. */
  clearable?: boolean;
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  /** "No matches" text. */
  emptyText?: string;
  id?: string;
  className?: string;
}

/**
 * Searchable select (WAI-ARIA combobox with a listbox). Type to filter, arrows to move, Enter to
 * choose, Escape to close (and revert). With `allowCustom`, what is typed becomes the value.
 * Use the native `Select` for short fixed lists; this is for long lists and suggestions.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  allowCustom,
  placeholder,
  clearable,
  error,
  hint,
  required,
  disabled,
  emptyText = 'No matches',
  id,
  className,
}: ComboboxProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const listId = `${fieldId}-list`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const selected = options.find((o) => o.value === value) ?? null;
  const shownText = selected ? selected.label : allowCustom ? (value ?? '') : '';
  const [query, setQuery] = useState(shownText);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery(shownText);
  }, [shownText, open]);

  const filtered = useMemo(() => {
    if (!typing || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, typing]);

  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [filtered.length, active]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeAndCommit();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeAndCommit reads current state each render
  }, [open, query, typing]);

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    onChange(option.value, option);
    setQuery(option.label);
    setTyping(false);
    setOpen(false);
  };

  function closeAndCommit() {
    if (allowCustom && typing) {
      const text = query.trim();
      const match = options.find((o) => o.label.toLowerCase() === text.toLowerCase());
      if (match) onChange(match.value, match);
      else onChange(text === '' ? null : text);
    } else {
      setQuery(shownText);
    }
    setTyping(false);
    setOpen(false);
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(Math.max(0, filtered.length - 1));
        }
        break;
      case 'Enter':
        if (open) {
          e.preventDefault();
          const option = filtered[active];
          if (option) choose(option);
          else closeAndCommit();
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          setQuery(shownText);
          setTyping(false);
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) closeAndCommit();
        break;
      default:
    }
  };

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const activeId = open && filtered[active] ? `${fieldId}-opt-${active}` : undefined;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)} ref={wrapRef}>
      <label htmlFor={fieldId} className="text-body font-medium text-fg">
        {label}
        {required ? <span className="ml-1 text-body-sm font-normal text-fg-muted">(required)</span> : null}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={fieldId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setTyping(true);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-md border border-control bg-surface-base py-2 pl-3 pr-16 text-body text-fg placeholder:text-fg-muted aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg"
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
          {clearable && (value ?? '') !== '' && !disabled ? (
            <button
              type="button"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                onChange(null);
                setQuery('');
                setTyping(false);
                inputRef.current?.focus();
              }}
              className="inline-flex h-10 w-8 items-center justify-center text-fg-muted hover:text-fg"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
          <ChevronDown size={20} aria-hidden="true" className="mr-2 text-fg" />
        </div>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-base bg-surface-base py-1 shadow-float"
          >
            {filtered.length === 0 ? (
              <li role="presentation" className="px-3 py-2 text-body-sm text-fg-muted">
                {allowCustom && query.trim() ? `Press Enter to use "${query.trim()}"` : emptyText}
              </li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  id={`${fieldId}-opt-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-body-sm',
                    i === active && 'bg-surface',
                    o.disabled && 'cursor-not-allowed text-disabled-fg',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="shrink-0 tabular-nums text-fg-muted">{o.hint}</span> : null}
                  {o.value === value ? <Check size={16} aria-hidden="true" /> : null}
                </li>
              ))
            )}
          </ul>
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
