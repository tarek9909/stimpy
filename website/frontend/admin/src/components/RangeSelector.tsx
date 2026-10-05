import { useMemo } from 'react';
import { SegmentedControl, Select } from '@stimpy/ui';
import { useIsMdUp } from '../lib/hooks';
import { DateTimeInput } from './DateTimeInput';
import { detectPreset, presetRange, PRESET_LABELS, type DateRange, type RangePreset } from '../lib/ranges';
import { todayInZone } from '../lib/time';
import { useBusinessTimeZone } from '../lib/time';
import { optionalStringParam, useUrlState } from '../lib/urlState';

const rangeDefs = { from: optionalStringParam(), to: optionalStringParam(), all: optionalStringParam(), custom: optionalStringParam(), page: optionalStringParam() };

export interface RangeState {
  range: DateRange;
  preset: RangePreset;
  today: string;
  /** Choose a preset (writes `from` / `to` into the URL; "All time" writes `all=1`). */
  choose: (preset: Exclude<RangePreset, 'custom'>) => void;
  /** Custom bounds (either may be empty). */
  setCustom: (patch: Partial<DateRange>) => void;
}

/**
 * Range selector state kept in the URL (`?from=2026-10-01&to=2026-10-31`, `?all=1`): dashboard-pages 11.1 / 12. Without any
 * parameter the default preset applies. Presets are computed in the BUSINESS time zone.
 */
export function useRangeState(defaultPreset: Exclude<RangePreset, 'custom' | 'all'>): RangeState {
  const [p, setP] = useUrlState(rangeDefs);
  const zone = useBusinessTimeZone();
  const today = useMemo(() => todayInZone(zone), [zone]);
  const range: DateRange = useMemo(() => {
    if (p.all) return { from: null, to: null };
    if (p.from || p.to) return { from: p.from, to: p.to };
    return presetRange(defaultPreset, today);
  }, [p.all, p.from, p.to, defaultPreset, today]);
  const preset: RangePreset = p.custom ? 'custom' : detectPreset(range, today);
  return {
    range,
    preset,
    today,
    choose: (next) => {
      if (next === 'all') setP({ all: '1', from: null, to: null, custom: null });
      else {
        const r = presetRange(next, today);
        // The default preset stays out of the URL.
        setP(next === defaultPreset ? { all: null, from: null, to: null, custom: null } : { all: null, from: r.from, to: r.to, custom: null });
      }
    },
    setCustom: (patch) => {
      const next = { from: range.from, to: range.to, ...patch };
      setP({ all: null, from: next.from, to: next.to, custom: '1' });
    },
  };
}

/** Preset chips + two date inputs when Custom. */
export function RangeSelector({ state, presets = ['month', '30d', 'last-month', 'all'] }: { state: RangeState; presets?: ReadonlyArray<Exclude<RangePreset, 'custom'>> }) {
  const options = [...presets, 'custom' as const].map((id) => ({ value: id, label: PRESET_LABELS[id] }));
  const isMd = useIsMdUp();
  const pick = (v: string) => {
    if (v === 'custom') state.setCustom({ from: state.range.from ?? state.today, to: state.range.to ?? state.today });
    else state.choose(v as Exclude<RangePreset, 'custom'>);
  };
  return (
    <div className="flex flex-col gap-3">
      {isMd ? (
        <SegmentedControl aria-label="Date range" value={state.preset} options={options} onChange={pick} />
      ) : (
        <div>
          <label htmlFor="range-preset" className="mb-1 block text-body font-medium">Date range</label>
          <Select id="range-preset" value={state.preset} onChange={(e) => pick(e.target.value)} options={options} />
        </div>
      )}
      {state.preset === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <DateTimeInput kind="date" label="From" value={state.range.from} onChange={(v) => state.setCustom({ from: v })} max={state.range.to ?? undefined} />
          <DateTimeInput kind="date" label="To" value={state.range.to} onChange={(v) => state.setCustom({ to: v })} min={state.range.from ?? undefined} />
        </div>
      ) : null}
    </div>
  );
}
