import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, cn } from '@stimpy/ui';

/**
 * Small, dependency-free charts for the dashboard (Finance and Insights), following the `dataviz` guidance:
 * one axis (never dual), thin marks, recessive grid, direct value labels on bars, tabular numerals, brand ink
 * for marks (identity comes from the text labels, so colour is never the only channel), and a data table
 * alternative behind a "Show data" toggle on every chart (`ChartCard`). No third-party chart library.
 */

/** Rounds `max` up to a "nice" axis maximum with `ticks` steps: 0, 5, 10... */
export function niceScale(max: number, ticks = 4, integer = false): { max: number; step: number } {
  if (!(max > 0)) return { max: ticks, step: 1 };
  if (integer && max <= ticks) return { max: Math.ceil(max), step: 1 };
  const rough = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const step = Math.max(integer ? 1 : 0, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow);
  return { max: step * Math.ceil(max / step), step };
}

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface Point {
  label: string;
  value: number;
  /** Text for the native tooltip (`<title>`), e.g. "3 Oct: $45.00". */
  tooltip?: string;
}

const AXIS = 'var(--fg-muted, #5c5c5c)';
const GRID = 'rgba(0,0,0,0.12)';
const INK = '#111111';

/**
 * Column chart for a series over time or a small ordered set (weekdays). <= 60 points: columns with a 2 px
 * gap; above that a 2 px line (all-time ranges). Y axis starts at 0.
 */
export function ColumnChart({ data, format, ariaLabel, height = 220, labelEvery, integerAxis = false }: { integerAxis?: boolean; data: Point[]; format: (v: number) => string; ariaLabel: string; height?: number; labelEvery?: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const padL = 44, padR = 8, padT = 12, padB = 28;
  const w = Math.max(width, 240);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const maxVal = Math.max(0, ...data.map((d) => d.value));
  const { max, step } = niceScale(maxVal, 4, integerAxis);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  const n = data.length;
  const slot = n > 0 ? innerW / n : innerW;
  const every = labelEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const line = n > 60;
  const clip = 'clip' + useId().replace(/:/g, '');
  const showValues = n <= 8;
  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block tabular-nums">
          <defs>
            <clipPath id={clip}>
              <rect x={0} y={0} width={w} height={padT + innerH} />
            </clipPath>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill={AXIS}>
                {format(t)}
              </text>
            </g>
          ))}
          {line ? (
            <polyline fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" points={data.map((d, i) => `${padL + slot * (i + 0.5)},${y(d.value)}`).join(' ')} />
          ) : (
            data.map((d, i) => {
              const bw = Math.max(2, Math.min(40, slot - 2));
              const x = padL + slot * i + (slot - bw) / 2;
              const h = Math.max(d.value > 0 ? 2 : 0, padT + innerH - y(d.value));
              return (
                <g key={`${d.label}-${i}`}>
                  <rect x={x} y={y(d.value)} width={bw} height={h + 4} rx={Math.min(3, bw / 2)} fill={INK} clipPath={`url(#${clip})`}>
                    <title>{d.tooltip ?? `${d.label}: ${format(d.value)}`}</title>
                  </rect>
                  {showValues && d.value > 0 ? (
                    <text x={x + bw / 2} y={y(d.value) - 4} textAnchor="middle" fontSize={12} fill="var(--fg, #111)" fontWeight={500}>
                      {format(d.value)}
                    </text>
                  ) : null}
                </g>
              );
            })
          )}
          {data.map((d, i) =>
            i % every === 0 || (n <= 8) ? (
              <text key={`x-${d.label}-${i}`} x={padL + slot * (i + 0.5)} y={height - 8} textAnchor="middle" fontSize={12} fill={AXIS}>
                {d.label}
              </text>
            ) : null,
          )}
          <line x1={padL} x2={w - padR} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth={1} />
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  /** Shown after the value (e.g. revenue next to an orders bar). */
  note?: string;
}

/**
 * Horizontal bars with the label above each bar and the value at its end: direct labels (no legend needed for one
 * series), long labels wrap instead of overflowing at 360 px. Bars start at zero and share one scale.
 */
export function HBarChart({ rows, format, ariaLabel, limit }: { rows: BarRow[]; format: (v: number) => string; ariaLabel: string; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3 tabular-nums" role="list" aria-label={ariaLabel}>
      {shown.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="min-w-0 break-words font-medium" title={r.label}>{r.label}</span>
            <span className="shrink-0 font-medium">
              {format(r.value)}
              {r.note ? <span className="ml-2 font-normal text-fg-muted">{r.note}</span> : null}
            </span>
          </div>
          <div className="h-3 w-full rounded-sm bg-ink/10" aria-hidden="true">
            <div className="h-3 rounded-r-sm bg-ink" style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Chart container with a title, optional controls and the "Show data" toggle that reveals the table alternative. */
export function ChartCard({ title, caption, controls, children, table, id }: { title: string; caption?: ReactNode; controls?: ReactNode; children: ReactNode; table: ReactNode; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-base p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-h5">{title}</h2>
          {caption ? <p className="text-body-sm text-fg-muted">{caption}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={`${id}-data`} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide data' : 'Show data'}
          </Button>
        </div>
      </div>
      {children}
      <div id={`${id}-data`} hidden={!open} className={cn('mt-4', !open && 'hidden')}>
        {open ? table : null}
      </div>
    </section>
  );
}
