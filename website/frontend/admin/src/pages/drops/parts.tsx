import { useEffect, useState } from 'react';
import { Pill, cn } from '@stimpy/ui';
import { STATE_LABEL, type DropState } from './dropForm';

/** Accent chip shows both the swatch and its exact selected hex value. */
export function AccentChip({ accentHex, className }: { accentHex: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-body-sm', className)}>
      <span aria-hidden="true" className="h-4 w-4 rounded-full border border-ink/30" style={{ backgroundColor: accentHex }} />
      {accentHex.toUpperCase()}
    </span>
  );
}

export function StateBadge({ state }: { state: DropState }) {
  const tone = state === 'LIVE' ? 'success' : state === 'UPCOMING' ? 'blue' : state === 'SOLD_OUT' ? 'coral' : 'neutral';
  return (
    <Pill tone={tone} size="sm">
      {STATE_LABEL[state]}
    </Pill>
  );
}

/** Re-renders every `ms` so "ends in ..." and units/hour stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** "2 days 4 h" / "3 h 20 min" / "12 min" until `iso`; "Ended" when past. */
export function remainingText(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'Ended';
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} ${d === 1 ? 'day' : 'days'} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}
