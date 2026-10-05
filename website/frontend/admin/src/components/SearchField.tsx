import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Spinner, cn } from '@stimpy/ui';
import { isTypingTarget } from '../lib/hooks';

export interface SearchFieldProps {
  /** Committed value (e.g. from the URL). The field follows it when it changes from outside. */
  value: string;
  /** Called after `debounceMs` of quiet, and immediately on Enter or clear. */
  onChange: (value: string) => void;
  /** Accessible name (a visible label is not used in tool bars). */
  label: string;
  placeholder?: string;
  debounceMs?: number;
  /** Pressing `/` outside inputs focuses the field (desktop shortcut). One per page. */
  shortcut?: boolean;
  loading?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export interface SearchFieldHandle {
  focus: () => void;
}

/**
 * Debounced search box. Typing updates the draft at once and calls `onChange` 250 ms after the
 * last keystroke (default), so a URL-bound page does not fire a request per key. Escape clears.
 * Use `replace` navigation in `onChange` while typing (dashboard-pages 1.3).
 */
export const SearchField = forwardRef<SearchFieldHandle, SearchFieldProps>(function SearchField(
  { value, onChange, label, placeholder = 'Search', debounceMs = 250, shortcut, loading, className, autoFocus },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  // Follow external changes (back button, "Clear filters") without fighting the user's typing.
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!shortcut) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const commit = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next === lastSent.current) return;
    lastSent.current = next;
    onChangeRef.current(next);
  };

  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), debounceMs);
  };

  return (
    <div role="search" className={cn('focus-within-ring relative flex min-h-11 w-full items-center rounded-md border border-control bg-surface-base', className)}>
      <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-3 text-fg-muted" />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Escape' && draft) {
            e.preventDefault();
            e.stopPropagation();
            setDraft('');
            commit('');
          }
        }}
        className="min-h-11 w-full appearance-none bg-transparent py-2 pl-10 pr-10 text-body text-fg placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-1 flex items-center">
        {loading ? <Spinner size="sm" /> : null}
        {draft ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraft('');
              commit('');
              inputRef.current?.focus();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:text-fg"
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
});
