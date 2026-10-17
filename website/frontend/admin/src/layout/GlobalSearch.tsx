import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Button, Spinner, StatusPill, cn } from '@stimpy/ui';
import { api, unwrap } from '../api/client';
import { describeError } from '../api/errors';
import { queryKeys } from '../api/queryKeys';
import { useFormatters } from '../lib/format';
import { useDebouncedValue, useIsMdUp } from '../lib/hooks';

export const FOCUS_SEARCH_EVENT = 'stimpy:focus-search';

/** Used by the keyboard shortcuts (`/`, Ctrl/Cmd+K): focus the global search wherever it is. */
export function focusGlobalSearch(): void {
  window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
}

interface Row {
  key: string;
  kind: 'order' | 'customer' | 'all-orders' | 'all-customers';
  to: string;
  label: string;
}

/**
 * Top-bar search (dashboard-pages 2.3). Debounced 300 ms, calls `GET /admin/search?q=` and shows two
 * groups, **Orders** (number, customer, status, total) and **Customers** (name, phone). Enter opens
 * the active row; with no active row it opens the only result, or `/orders?q=` when there are
 * several. Escape closes. On phones the field is an icon that expands to a full-width bar.
 * Everything is rendered as plain text.
 */
export function GlobalSearch() {
  const isMd = useIsMdUp();
  const navigate = useNavigate();
  const f = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(text.trim(), 300);

  const search = useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/search', { params: { query: { q: debounced } }, signal })),
    enabled: debounced.length > 0,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    const onFocus = () => {
      setExpanded(true);
      // The input may not exist yet on phones: focus after render.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      setOpen(true);
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocus);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const orders = search.data?.orders ?? [];
  const customers = search.data?.customers ?? [];
  const waiting = text.trim() !== debounced || search.isFetching;
  const ready = debounced.length > 0 && search.isSuccess && text.trim() === debounced;

  const rows = useMemo<Row[]>(() => {
    if (!ready) return [];
    const q = encodeURIComponent(debounced);
    const out: Row[] = [
      ...orders.map((o): Row => ({ key: `o-${o.id}`, kind: 'order', to: `/orders/${o.id}`, label: o.number })),
      ...customers.map((c): Row => ({ key: `c-${c.id}`, kind: 'customer', to: `/customers/${c.id}`, label: c.name })),
    ];
    out.push({ key: 'all-orders', kind: 'all-orders', to: `/orders?q=${q}`, label: 'See all orders' });
    out.push({ key: 'all-customers', kind: 'all-customers', to: `/customers?q=${q}`, label: 'See all customers' });
    return out;
  }, [ready, orders, customers, debounced]);

  const go = (to: string) => {
    setOpen(false);
    setExpanded(false);
    setText('');
    navigate(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open) setOpen(false);
      else {
        setText('');
        setExpanded(false);
      }
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      const row = rows[active];
      if (row) return go(row.to);
      const hits = orders.length + customers.length;
      if (ready && hits === 1) {
        const only = rows[0];
        if (only) return go(only.to);
      }
      go(`/orders?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const showPanel = open && text.trim().length > 0;
  const activeId = active >= 0 && rows[active] ? `${listId}-${rows[active]?.key}` : undefined;

  const field = (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <div className="admin-search-box focus-within-ring relative flex items-center border">
        <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-3 text-fg-muted" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search orders and customers"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          placeholder="Search orders and customers..."
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full appearance-none bg-transparent py-2 pl-10 pr-10 text-body text-fg placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute right-1 flex items-center">
          {waiting && text.trim() ? <Spinner size="sm" /> : null}
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('');
                inputRef.current?.focus();
              }}
              className="inline-flex h-10 w-10 items-center justify-center text-fg-muted hover:text-fg"
            >
              <X size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 top-full z-40 mt-2 max-h-[70dvh] w-full overflow-y-auto rounded-lg border border-base bg-surface-base shadow-float md:min-w-[28rem]"
        >
          {search.isError ? (
            <p role="alert" className="p-4 text-body-sm">
              {describeError(search.error, 'read').message}
            </p>
          ) : !ready ? (
            <p role="status" className="p-4 text-body-sm text-fg-muted">
              Searching&hellip;
            </p>
          ) : orders.length === 0 && customers.length === 0 ? (
            <p role="status" className="p-4 text-body-sm text-fg-muted">
              No results for &quot;{debounced}&quot;
            </p>
          ) : (
            <>
              {orders.length > 0 ? (
                <div role="group" aria-label="Orders">
                  <p className="px-4 pb-1 pt-3 text-caption font-medium uppercase tracking-[0.04em] text-fg-muted">Orders</p>
                  {orders.map((o) => {
                    const i = rows.findIndex((r) => r.key === `o-${o.id}`);
                    return (
                      <div
                        key={o.id}
                        id={`${listId}-o-${o.id}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(`/orders/${o.id}`)}
                        className={cn('flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2', i === active && 'bg-surface')}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium tabular-nums">{o.number}</p>
                          <p className="truncate text-body-sm text-fg-muted">{o.customerName}</p>
                        </div>
                        <StatusPill status={o.status} size="sm" />
                        <span className="w-20 shrink-0 text-right text-body-sm tabular-nums">{f.money(o.totalCents)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {customers.length > 0 ? (
                <div role="group" aria-label="Customers">
                  <p className="px-4 pb-1 pt-3 text-caption font-medium uppercase tracking-[0.04em] text-fg-muted">Customers</p>
                  {customers.map((c) => {
                    const i = rows.findIndex((r) => r.key === `c-${c.id}`);
                    return (
                      <div
                        key={c.id}
                        id={`${listId}-c-${c.id}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => go(`/customers/${c.id}`)}
                        className={cn('flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2', i === active && 'bg-surface')}
                      >
                        <p className="min-w-0 truncate font-medium">{c.name}</p>
                        <p className="shrink-0 text-body-sm tabular-nums text-fg-muted">{c.phone}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="mt-1 flex flex-col border-t border-base">
                {(['all-orders', 'all-customers'] as const).map((kind) => {
                  const row = rows.find((r) => r.kind === kind);
                  if (!row) return null;
                  const i = rows.indexOf(row);
                  return (
                    <div
                      key={kind}
                      id={`${listId}-${kind}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(row.to)}
                      className={cn('flex min-h-11 cursor-pointer items-center px-4 text-body-sm underline underline-offset-4', i === active && 'bg-surface')}
                    >
                      {row.label}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  if (isMd) return <div className="admin-search flex min-w-0">{field}</div>;

  if (!expanded) {
    return (
      <Button variant="ghost" iconOnly aria-label="Search" onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()); }}>
        <Search size={22} aria-hidden="true" />
      </Button>
    );
  }
  return (
    <div className="absolute inset-0 z-40 flex items-center gap-2 bg-surface-base px-3">
      {field}
      <Button
        variant="ghost"
        onClick={() => {
          setExpanded(false);
          setOpen(false);
          setText('');
        }}
      >
        Close
      </Button>
    </div>
  );
}
