import { useEffect, useId, useRef, useState } from 'react';
import { Button, FormField, Input, Select } from '@stimpy/ui';
import { useElementWidth } from '../../../components/charts';
import {
  DEFAULT_PLACEMENT,
  PANEL_ASPECT,
  dragBy,
  fractionToPercent,
  nudge,
  panelBox,
  percentToFraction,
  resizeFromPointer,
  resizeTo,
  rotationFromPointer,
  normalizeRotation,
  type Placement,
} from '../placement';

/** Numeric field with its own text state: commits whenever the text parses; reverts on blur when it does not. */
function NumField({ label, value, toText, parse, onCommit, suffix, id }: { label: string; value: number; toText: (v: number) => string; parse: (t: string) => number | null; onCommit: (v: number) => void; suffix: string; id: string }) {
  const [text, setText] = useState(toText(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value, toText]);
  const bad = parse(text) === null;
  return (
    <FormField label={label} name={id} error={bad ? 'Enter a number.' : null}>
      <Input
        inputMode="decimal"
        value={text}
        suffixText={suffix}
        autoComplete="off"
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setText(toText(value)); }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parse(e.target.value);
          if (v !== null) onCommit(v);
        }}
      />
    </FormField>
  );
}

export interface SampleStimpie { id: number; name: string; artworkUrl: string }

type Gesture =
  | { kind: 'drag'; px: number; py: number; start: Placement }
  | { kind: 'resize'; start: Placement }
  | { kind: 'rotate'; start: Placement }
  | { kind: 'pinch'; dist: number; start: Placement };

/**
 * Visual placement editor (builder.md 8, dashboard-pages 13.5). A box locked to the Stimpie aspect (0.64) over the
 * colour's flat image: drag to move, corner handles to resize, the top handle to rotate (clockwise), arrow keys to nudge
 * (Shift = 2%), `+` / `-` to resize, two-finger pinch on touch. X / Y are the panel CENTRE, Width a fraction of the image width,
 * Rotation degrees clockwise: all shown as percentages / degrees, stored as fractions.
 */
export function PlacementEditor({
  imageUrl,
  placement,
  onChange,
  samples,
  error,
}: {
  imageUrl: string | null;
  placement: Placement | null;
  onChange: (p: Placement) => void;
  samples: SampleStimpie[];
  error?: string | null;
}) {
  const uid = useId();
  const [wrapRef, wrapW] = useElementWidth<HTMLDivElement>();
  const [nat, setNat] = useState<{ w: number; h: number }>({ w: 4, h: 5 });
  const [sampleId, setSampleId] = useState<number | null>(samples[0]?.id ?? null);
  const sample = samples.find((s) => s.id === sampleId) ?? samples[0] ?? null;
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stageRef = useRef<HTMLDivElement>(null);

  const stageW = Math.min(wrapW || 320, 420);
  const stageH = stageW * (nat.h / nat.w);
  const p = placement ?? DEFAULT_PLACEMENT;
  const box = panelBox(p, stageW, stageH, PANEL_ASPECT);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const begin = (e: React.PointerEvent, kind: 'drag' | 'resize' | 'rotate') => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    if (pointers.current.size === 2 && kind === 'drag') {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, start: p };
      return;
    }
    gesture.current = kind === 'drag' ? { kind, px: pt.x, py: pt.y, start: p } : { kind, start: p };
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    if (g.kind === 'pinch') {
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        onChange(resizeTo(g.start, g.start.width * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.dist)));
      }
    } else if (g.kind === 'drag') onChange(dragBy(g.start, pt.x - g.px, pt.y - g.py, stageW, stageH));
    else if (g.kind === 'resize') onChange(resizeFromPointer(g.start, pt, stageW, stageH));
    else onChange(rotationFromPointer(g.start, pt, stageW, stageH));
  };
  const end = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === 'pinch') gesture.current = null;
  };

  if (!imageUrl) {
    return <p className="rounded-md border border-dashed border-control p-4 text-body-sm text-fg-muted">Upload the flat image first.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="placement-editor">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor={`${uid}-sample`} className="mb-1 block text-body-sm font-medium">Sample Stimpie</label>
          <Select id={`${uid}-sample`} value={String(sample?.id ?? '')} onChange={(e) => setSampleId(Number(e.target.value))} options={samples.map((s) => ({ value: String(s.id), label: s.name, image: s.artworkUrl }))} />
        </div>
        {placement === null ? (
          <Button variant="secondary" onClick={() => onChange(DEFAULT_PLACEMENT)}>Set a starting placement</Button>
        ) : (
          <Button variant="ghost" onClick={() => onChange(DEFAULT_PLACEMENT)}>Reset placement</Button>
        )}
      </div>

      <div ref={wrapRef} className="w-full">
        <div
          ref={stageRef}
          className="relative mx-auto touch-none select-none overflow-hidden rounded-md border border-base bg-cream"
          style={{ width: stageW, height: stageH }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img
            src={imageUrl}
            alt="Flat back view of the hoodie"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 4, h: e.currentTarget.naturalHeight || 5 })}
          />
          {placement ? (
            <div
              role="group"
              tabIndex={0}
              aria-label="Stimpie placement box. Arrow keys move it, plus and minus resize it."
              data-testid="placement-box"
              className="absolute cursor-move outline-none focus-visible:ring-4 focus-visible:ring-action"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height, transform: `rotate(${p.rotation}deg)`, transformOrigin: 'center' }}
              onPointerDown={(e) => begin(e, 'drag')}
              onKeyDown={(e) => {
                const next = nudge(p, e.key, e.shiftKey);
                if (next !== p) {
                  e.preventDefault();
                  onChange(next);
                }
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-[4%] border-2 border-white shadow-[0_0_0_2px_#111]">
                {sample ? <img src={sample.artworkUrl} alt="" className="pointer-events-none h-full w-full object-cover opacity-90" draggable={false} /> : <div className="h-full w-full bg-coral/60" />}
              </div>
              {(['-left-3 -top-3', '-right-3 -top-3', '-bottom-3 -left-3', '-bottom-3 -right-3'] as const).map((pos) => (
                <span
                  key={pos}
                  aria-hidden="true"
                  data-testid="resize-handle"
                  className={`absolute ${pos} h-6 w-6 cursor-nwse-resize rounded-sm border-2 border-ink bg-white before:absolute before:-inset-3 before:content-['']`}
                  onPointerDown={(e) => begin(e, 'resize')}
                />
              ))}
              <span aria-hidden="true" className="absolute left-1/2 -top-8 h-7 w-0.5 -translate-x-1/2 bg-ink" />
              <span
                aria-hidden="true"
                data-testid="rotate-handle"
                className="absolute left-1/2 -top-11 h-6 w-6 -translate-x-1/2 cursor-grab rounded-full border-2 border-ink bg-white before:absolute before:-inset-3 before:content-['']"
                onPointerDown={(e) => begin(e, 'rotate')}
              />
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-center text-body-sm text-fg-muted" aria-live="polite">The box keeps the 0.64 Stimpie shape. Drag it, use the corner handles to resize and the top handle to rotate.</p>

      {placement ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField id={`${uid}-x`} label="X (centre)" suffix="%" value={p.x} toText={fractionToPercent} parse={percentToFraction} onCommit={(v) => onChange({ ...p, x: v })} />
          <NumField id={`${uid}-y`} label="Y (centre)" suffix="%" value={p.y} toText={fractionToPercent} parse={percentToFraction} onCommit={(v) => onChange({ ...p, y: v })} />
          <NumField id={`${uid}-w`} label="Width" suffix="%" value={p.width} toText={fractionToPercent} parse={percentToFraction} onCommit={(v) => onChange({ ...p, width: v })} />
          <NumField
            id={`${uid}-r`}
            label="Rotation"
            suffix="deg"
            value={p.rotation}
            toText={(v) => String(Math.round(v * 100) / 100)}
            parse={(t) => (t.trim() !== '' && Number.isFinite(Number(t.replace(',', '.'))) ? Number(t.replace(',', '.')) : null)}
            onCommit={(v) => onChange({ ...p, rotation: Math.abs(v) <= 180 ? v : normalizeRotation(v) })}
          />
        </div>
      ) : null}
      {error ? <p role="alert" className="text-body-sm font-medium text-fg-danger">{error}</p> : null}
    </div>
  );
}
