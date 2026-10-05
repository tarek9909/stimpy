import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn, useUI } from '@stimpy/ui';
import { setDocumentPage } from '../lib/documentTitle';

export interface Crumb {
  label: string;
  /** Omit on the last (current) crumb. */
  to?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const { Link } = useUI();
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-body-sm text-fg-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.to && !last ? (
                <Link href={c.to} className="rounded-sm underline underline-offset-4 hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'text-fg' : undefined}>
                  {c.label}
                </span>
              )}
              {!last ? <ChevronRight size={14} aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

let firstPageShown = false;

export interface PageHeaderProps {
  /** The page `h1`, also the document title: "<title> - Stimpy Dashboard". */
  title: string;
  /** Text for `document.title` when it differs from the visible title. */
  documentTitle?: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Right-aligned primary action(s) (`+ New hoodie`). One blue button at most. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Title (h1), optional breadcrumbs and a right-aligned primary action (dashboard-pages 2.7).
 * Sets the document title and, on client-side navigation, moves focus to the h1 so keyboard and
 * screen-reader users land on the new page (state-and-errors 14).
 */
export function PageHeader({ title, documentTitle, description, breadcrumbs, actions, className }: PageHeaderProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setDocumentPage(documentTitle ?? title);
  }, [title, documentTitle]);

  useEffect(() => {
    if (firstPageShown) ref.current?.focus({ preventScroll: true });
    firstPageShown = true;
    // Focus once per page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className={cn('mb-4 flex flex-col gap-2 md:mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 ref={ref} tabIndex={-1} className="text-h3 text-fg outline-none focus-visible:outline-none">
            {title}
          </h1>
          {description ? <p className="mt-1 max-w-prose text-body-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Test helper: pretend no page has been shown yet. */
export function resetPageFocusForTests(): void {
  firstPageShown = false;
}
