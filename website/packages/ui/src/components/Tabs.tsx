'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Count badge (Orders status tabs). */
  count?: number;
  disabled?: boolean;
}

/** Reads and writes one query-string parameter. Inject the router's version when there is one. */
export interface UrlParamAdapter {
  get(name: string): string | null;
  set(name: string, value: string): void;
}

/** History API adapter: `replaceState`, so tabs do not pollute the back stack. */
export const browserUrlParamAdapter: UrlParamAdapter = {
  get(name) {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get(name);
  },
  set(name, value) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    window.history.replaceState(window.history.state, '', url);
  },
};

interface TabsContextValue {
  baseId: string;
  value: string;
}
const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  /** Accessible name of the tablist, e.g. "Shop sections". */
  'aria-label': string;
  /** Keep the active tab in this query parameter (`?tab=`). */
  urlParam?: string;
  urlAdapter?: UrlParamAdapter;
  /** `<TabPanel>` elements. */
  children?: ReactNode;
}

/** WAI-ARIA tabs with automatic activation: arrows, Home and End move and select. */
export function Tabs({
  tabs,
  value,
  onChange,
  variant = 'underline',
  urlParam,
  urlAdapter = browserUrlParamAdapter,
  children,
  className,
  'aria-label': ariaLabel,
  ...rest
}: TabsProps) {
  const baseId = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  // Adopt the tab from the URL on mount when it is valid and different.
  useEffect(() => {
    if (!urlParam) return;
    const fromUrl = urlAdapter.get(urlParam);
    if (fromUrl && fromUrl !== value && tabs.some((t) => t.id === fromUrl && !t.disabled)) onChange(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only sync
  }, []);

  const select = useCallback(
    (id: string) => {
      if (id === value) return;
      onChange(id);
      if (urlParam) urlAdapter.set(urlParam, id);
    },
    [onChange, urlAdapter, urlParam, value],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((t) => !t.disabled);
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((t) => t.id === value);
    let next: TabItem | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = enabled[(currentIndex + 1) % enabled.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = enabled[(currentIndex - 1 + enabled.length) % enabled.length];
        break;
      case 'Home':
        next = enabled[0];
        break;
      case 'End':
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) {
      select(next.id);
      refs.current.get(next.id)?.focus();
    }
  };

  return (
    <TabsContext.Provider value={{ baseId, value }}>
      <div className={className} {...rest}>
        <div
          role="tablist"
          aria-label={ariaLabel}
          onKeyDown={onKeyDown}
          className={cn(
            'flex overflow-x-auto',
            variant === 'underline' ? 'gap-6 border-b border-base' : 'gap-2',
          )}
        >
          {tabs.map((t) => {
            const selected = t.id === value;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) refs.current.set(t.id, el);
                  else refs.current.delete(t.id);
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                aria-disabled={t.disabled || undefined}
                disabled={t.disabled}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-button font-medium focus-visible:outline-offset-[-3px] transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:text-disabled-fg',
                  variant === 'underline'
                    ? '-mb-px border-b-[3px] border-transparent px-1 text-fg-muted hover:text-fg aria-selected:border-fg aria-selected:text-fg'
                    : 'rounded-full border border-control px-4 text-fg hover:border-fg aria-selected:border-fg aria-selected:bg-fg aria-selected:text-fg-inverse',
                )}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span
                    className={cn(
                      'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-caption tabular-nums',
                      selected ? (variant === 'pill' ? 'bg-surface-base text-fg' : 'bg-fg text-fg-inverse') : 'bg-line text-ink',
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The `id` of the tab this panel belongs to. */
  tabId: string;
  /** Keep inactive panels in the DOM (hidden). Default: render only the active panel. */
  keepMounted?: boolean;
}

export function TabPanel({ tabId, keepMounted, className, children, ...rest }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('<TabPanel> must be rendered inside <Tabs>.');
  const active = ctx.value === tabId;
  if (!active && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${tabId}`}
      aria-labelledby={`${ctx.baseId}-tab-${tabId}`}
      hidden={!active}
      tabIndex={0}
      className={className}
      {...rest}
    >
      {children}
    </div>
  );
}
