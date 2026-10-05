import { cn } from '../cn';
import { formatDateTime } from '../format';
import { Check, CircleDot } from '../icons';
import type { OrderStatus, TimelineEntryLike } from '../types';
import { STATUS_META } from './badges';

export interface TimelineStep {
  status: OrderStatus;
  label: string;
}

export interface StatusTimelineProps {
  /** The happy path in order, e.g. Received, Confirmed, Packed, Out for delivery, Delivered. */
  steps: TimelineStep[];
  /** Statuses reached so far with their times. */
  timeline: TimelineEntryLike[];
  current: OrderStatus;
  /** IANA zone, or `'device'` (website default for visitor-facing times). Default `Asia/Beirut`. */
  timeZone?: string;
  className?: string;
}

type StepState = 'done' | 'current' | 'upcoming' | 'skipped';

/**
 * Order progress. Vertical on phones, horizontal from `md`. Every state has an icon AND text
 * (never colour alone). `CANCELLED` / `RETURNED` add a terminal step and mark what was not reached.
 */
export function StatusTimeline({ steps, timeline, current, timeZone, className }: StatusTimelineProps) {
  const terminal = current === 'CANCELLED' || current === 'RETURNED';
  const reached = new Map(timeline.map((t) => [t.status, t.at]));
  const currentIndex = steps.findIndex((s) => s.status === current);

  const rows: Array<{ status: OrderStatus; label: string; state: StepState; at?: string }> = steps.map((s, i) => {
    const at = reached.get(s.status);
    let state: StepState;
    if (terminal) state = at ? 'done' : 'skipped';
    else if (currentIndex === -1) state = at ? 'done' : 'upcoming';
    else if (i < currentIndex) state = 'done';
    else if (i === currentIndex) state = i === steps.length - 1 ? 'done' : 'current';
    else state = 'upcoming';
    return { status: s.status, label: s.label, state, at };
  });
  if (terminal) {
    rows.push({ status: current, label: STATUS_META[current].label, state: 'current', at: reached.get(current) });
  }

  return (
    <ol className={cn('flex flex-col md:flex-row', className)} aria-label="Order progress">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const isTerminalRow = terminal && isLast;
        const TerminalIcon = STATUS_META[row.status].Icon;
        const caption =
          row.at && (row.state === 'done' || row.state === 'current' || isTerminalRow)
            ? formatDateTime(row.at, { timeZone })
            : row.state === 'current'
              ? 'In progress'
              : row.state === 'skipped'
                ? 'Not reached'
                : 'Upcoming';
        return (
          <li
            key={`${row.status}-${i}`}
            aria-current={row.state === 'current' ? 'step' : undefined}
            className={cn('relative flex gap-3 pb-6 md:flex-1 md:flex-col md:pb-0 md:pr-4', isLast && 'pb-0 md:pr-0')}
          >
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bottom-0 left-4 top-8 w-0.5 -translate-x-1/2 md:bottom-auto md:left-8 md:right-0 md:top-4 md:h-0.5 md:w-auto md:translate-x-0 md:-translate-y-1/2',
                  row.state === 'done' ? 'bg-fg' : 'bg-line',
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                isTerminalRow
                  ? row.status === 'RETURNED'
                    ? 'bg-danger text-white'
                    : 'bg-neutral text-white'
                  : row.state === 'done'
                    ? 'bg-fg text-fg-inverse'
                    : row.state === 'current'
                      ? 'bg-coral text-ink'
                      : 'border-2 border-control bg-surface-base text-fg-muted',
              )}
            >
              {isTerminalRow ? (
                <TerminalIcon width={18} height={18} />
              ) : row.state === 'done' ? (
                <Check width={18} height={18} strokeWidth={3} />
              ) : row.state === 'current' ? (
                <CircleDot width={18} height={18} />
              ) : null}
            </span>
            <span className="flex flex-col">
              <span className={cn('text-body font-medium', row.state === 'upcoming' || row.state === 'skipped' ? 'text-fg-muted' : 'text-fg')}>
                {row.label}
                <span className="sr-only">
                  {isTerminalRow
                    ? ' (final status)'
                    : row.state === 'done'
                      ? ' (completed)'
                      : row.state === 'current'
                        ? ' (current step)'
                        : row.state === 'skipped'
                          ? ' (not reached)'
                          : ' (upcoming)'}
                </span>
              </span>
              <span className="text-body-sm text-fg-muted">{caption}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
