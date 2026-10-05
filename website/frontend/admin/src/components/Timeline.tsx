import type { ReactNode } from 'react';
import { CalendarClock, StickyNote } from 'lucide-react';
import { StatusPill, cn, type OrderStatus } from '@stimpy/ui';
import { useFormatters } from '../lib/format';

export interface TimelineItem {
  id: string | number;
  /** ISO instant. Shown in the business time zone, with the relative time as the visible text. */
  at: string;
  /** Headline: "Order placed", "Packed", "Delivery number changed". */
  title: ReactNode;
  /** Pill shown next to the title (order status events). */
  status?: OrderStatus;
  /** Distinct activity marker for CRM notes and follow-ups. */
  marker?: 'note' | 'follow-up';
  /** Who did it. `null`/undefined renders "System". */
  by?: string | null;
  /** Free text, rendered as plain text with line breaks preserved. */
  note?: string | null;
}

export interface TimelineProps {
  items: TimelineItem[];
  /** Shown when `items` is empty. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Vertical history list (order events, stock movements, email log). Newest first is the caller's
 * order. Notes are plain text (`white-space: pre-wrap`): customer and staff text is never HTML.
 */
export function Timeline({ items, empty = 'No history yet.', className }: TimelineProps) {
  const f = useFormatters();
  if (items.length === 0) return <p className="text-body-sm text-fg-muted">{empty}</p>;
  return (
    <ol className={cn('relative flex flex-col', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
          <span className="relative flex w-4 shrink-0 justify-center" aria-hidden="true">
            {item.marker === 'note' ? (
              <StickyNote size={14} strokeWidth={1.8} className="mt-0.5 text-fg-muted" />
            ) : item.marker === 'follow-up' ? (
              <CalendarClock size={14} strokeWidth={1.8} className="mt-0.5 text-fg-muted" />
            ) : (
              <span className="mt-1.5 h-3 w-3 rounded-full border-2 border-fg bg-surface-base" />
            )}
            {i < items.length - 1 ? <span className="absolute bottom-[-1.5rem] top-5 w-px bg-line-strong" /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-fg">{item.title}</p>
              {item.status ? <StatusPill status={item.status} size="sm" /> : null}
            </div>
            <p className="text-body-sm text-fg-muted">
              <time dateTime={item.at} title={f.dateTime(item.at)} className="tabular-nums">
                {f.relative(item.at)}
              </time>
              {' · '}
              {item.by ?? 'System'}
            </p>
            {item.note ? <p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-fg">{item.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
