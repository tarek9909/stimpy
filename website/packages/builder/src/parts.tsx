'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Badge, Button, Modal, STIMPIE_RATIO, cn, formatCents, icons, useUI } from '@stimpy/ui';
import type { BuilderHoodie, BuilderPack, BuilderSize, BuilderStimpie, JoinedColor } from './types';
import { stimpieBlockReason } from './lib/join';
import { colorSoldOut } from './lib/selection';

/* ------------------------------------------------------------------ colour swatches */

export interface SwatchesProps {
  colors: readonly JoinedColor[];
  selectedId: number | null;
  soldOutIds: ReadonlySet<number>;
  onSelect: (id: number) => void;
  label?: string;
}

/** Radio group of colour swatches: 44 px targets, 32 px circle, 2 px ink ring when selected, diagonal strike when sold out. */
export function ColorSwatchRow({ colors, selectedId, soldOutIds, onSelect, label = 'Hoodie colour' }: SwatchesProps) {
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const selected = colors.find((c) => c.id === selectedId) ?? colors[0] ?? null;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || colors.length === 0) return;
    e.preventDefault();
    const idx = Math.max(0, colors.findIndex((c) => c.id === selected?.id));
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % colors.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + colors.length) % colors.length;
    else if (e.key === 'Home') next = 0;
    else next = colors.length - 1;
    const c = colors[next];
    if (!c) return;
    onSelect(c.id);
    refs.current.get(c.id)?.focus();
  };
  return (
    <div>
      <p className="text-body-sm font-medium text-fg" data-builder-color-name>
        <span className="text-fg-muted">Colour: </span>
        {selected?.name ?? ''}
        {selected && soldOutIds.has(selected.id) ? <span className="text-fg-muted"> (sold out)</span> : null}
      </p>
      <div role="radiogroup" aria-label={label} className="mt-1 flex flex-wrap gap-1" onKeyDown={onKey}>
        {colors.map((c) => {
          const isSelected = c.id === selected?.id;
          const soldOut = soldOutIds.has(c.id);
          return (
            <button
              key={c.id}
              ref={(el) => {
                if (el) refs.current.set(c.id, el);
                else refs.current.delete(c.id);
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={soldOut ? `${c.name}, sold out` : c.name}
              title={soldOut ? `${c.name} (sold out)` : c.name}
              tabIndex={isSelected ? 0 : -1}
              data-color-id={c.id}
              data-selected={isSelected ? 'true' : 'false'}
              data-sold-out={soldOut ? 'true' : 'false'}
              onClick={() => onSelect(c.id)}
              className="relative flex min-h-tap min-w-tap items-center justify-center rounded-full"
            >
              <span
                className="relative block overflow-hidden rounded-full"
                style={{
                  width: 32,
                  height: 32,
                  background: c.hex,
                  boxShadow: isSelected ? '0 0 0 2px #fff, 0 0 0 4px #111111' : 'inset 0 0 0 1px rgba(17,17,17,0.25)',
                }}
              >
                {soldOut ? (
                  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" className="absolute inset-0">
                    <line x1="5" y1="27" x2="27" y2="5" stroke="#111111" strokeWidth="4" strokeLinecap="round" />
                    <line x1="5" y1="27" x2="27" y2="5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : null}
              </span>
              {isSelected ? <icons.Check size={14} aria-hidden="true" className="absolute" style={{ color: checkColor(c.hex) }} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function checkColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#111111';
  const n = parseInt(m[1] as string, 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? '#111111' : '#FFFFFF';
}

/* ------------------------------------------------------------------ Stimpie carousel */

export interface CarouselProps {
  stimpies: readonly BuilderStimpie[];
  /** Selected cards (slots in a pack, or the preview). */
  selectedIds: readonly number[];
  /** Card shown on the hoodie right now. */
  previewId: number | null;
  /** Cards that cannot be picked for the focused slot (already in another slot). */
  disabledIds: ReadonlySet<number>;
  /** Slot number (1-based) of cards held by a slot, for the caption. */
  slotOf: (id: number) => number | null;
  onPick: (id: number) => void;
  /** Arrow keys also select (teaser). In the page the arrows move focus and Enter/Space select. */
  selectOnFocus?: boolean;
  reducedMotion: boolean;
  /** Load card images eagerly (page, above the fold) or lazily (teaser). */
  eagerCount?: number;
  label?: string;
}

/** Horizontal scroll-snap listbox with one tab stop (roving tabindex). */
export function StimpieCarousel({
  stimpies,
  selectedIds,
  previewId,
  disabledIds,
  slotOf,
  onPick,
  selectOnFocus = false,
  reducedMotion,
  eagerCount = 4,
  label = 'Stimpies',
}: CarouselProps) {
  const refs = useRef(new Map<number, HTMLElement>());
  const [focusId, setFocusId] = useState<number | null>(previewId ?? stimpies[0]?.id ?? null);
  useEffect(() => {
    if (previewId !== null) setFocusId(previewId);
  }, [previewId]);

  // Keep the previewed card in view (never smooth with reduced motion).
  useEffect(() => {
    if (previewId === null) return;
    const el = refs.current.get(previewId);
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const target =
      parent.scrollLeft + (el.getBoundingClientRect().left - parent.getBoundingClientRect().left) - (parent.clientWidth - el.clientWidth) / 2;
    if (typeof parent.scrollTo === 'function') parent.scrollTo({ left: Math.max(0, target), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [previewId, reducedMotion]);

  const move = (to: number, select: boolean) => {
    const s = stimpies[to];
    if (!s) return;
    setFocusId(s.id);
    refs.current.get(s.id)?.focus();
    if (select && !disabledIds.has(s.id)) onPick(s.id);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = Math.max(0, stimpies.findIndex((s) => s.id === focusId));
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(Math.min(stimpies.length - 1, idx + 1), selectOnFocus);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(Math.max(0, idx - 1), selectOnFocus);
        break;
      case 'Home':
        e.preventDefault();
        move(0, selectOnFocus);
        break;
      case 'End':
        e.preventDefault();
        move(stimpies.length - 1, selectOnFocus);
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const s = stimpies[idx];
        if (s && !disabledIds.has(s.id)) onPick(s.id);
        break;
      }
      default:
    }
  };

  return (
    <div
      role="listbox"
      aria-label={label}
      aria-multiselectable={selectedIds.length > 1 ? true : undefined}
      data-builder-carousel
      onKeyDown={onKey}
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-1"
      style={{
        scrollbarWidth: 'none',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 28px), transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 28px), transparent 100%)',
      }}
    >
      {stimpies.map((s, i) => {
        const selected = selectedIds.includes(s.id);
        const disabled = disabledIds.has(s.id);
        const reason = stimpieBlockReason(s);
        const slot = slotOf(s.id);
        const accent = s.type === 'LIMITED' ? (s.drop?.accentHex ?? null) : null;
        const outline = selected ? `3px solid ${accent ?? '#111111'}` : '3px solid transparent';
        return (
          <div
            key={s.id}
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            role="option"
            id={`builder-stimpie-${s.id}`}
            aria-selected={selected}
            aria-disabled={disabled ? true : undefined}
            aria-label={[s.name, formatCents(s.priceCents), reason ?? '', disabled ? 'already chosen' : ''].filter(Boolean).join(', ')}
            tabIndex={s.id === focusId ? 0 : -1}
            data-stimpie-slug={s.slug}
            data-selected={selected ? 'true' : 'false'}
            data-preview={previewId === s.id ? 'true' : 'false'}
            onClick={() => {
              setFocusId(s.id);
              if (!disabled) onPick(s.id);
            }}
            className={cn('relative shrink-0 snap-start cursor-pointer rounded-md bg-white text-left', disabled && 'opacity-50')}
            style={{ width: 112, outline, outlineOffset: -1 }}
          >
            <div className="relative overflow-hidden rounded-md bg-cream" style={{ aspectRatio: String(STIMPIE_RATIO) }}>
              <img
                src={s.artworkUrl}
                alt=""
                width={160}
                height={250}
                loading={i < eagerCount ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {selected ? (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white" aria-hidden="true">
                  <icons.Check size={12} />
                </span>
              ) : null}
              {slot !== null ? (
                <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-2 text-caption text-ink" aria-hidden="true">
                  {slot}
                </span>
              ) : null}
            </div>
            <div className="px-1 pb-1 pt-1">
              <p className="truncate text-caption font-medium text-ink">{s.name}</p>
              <div className="flex items-center justify-between gap-1">
                <span className="text-caption tabular text-ink-70">{formatCents(s.priceCents)}</span>
                <StimpieBadge s={s} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StimpieBadge({ s }: { s: BuilderStimpie }) {
  switch (s.status) {
    case 'SOLD_OUT':
      return <Badge kind="SOLD_OUT" />;
    case 'UPCOMING':
      return <Badge kind="UPCOMING" />;
    case 'ENDED':
      return <Badge kind="ENDED" label="Ended" />;
    case 'LOW':
      return <Badge kind="LOW" label="Last few" />;
    default:
      return s.type === 'LIMITED' ? <Badge kind="LIMITED" /> : <Badge kind="CORE" />;
  }
}

/* ------------------------------------------------------------------ pack selector and slots */

export interface PackSelectorProps {
  packs: readonly BuilderPack[];
  /** Pack id, or null for hoodie only. */
  selectedPackId: number | null;
  hoodiePriceCents: number | null;
  onSelect: (packId: number | null) => void;
}

/** Segmented control driven by `GET /packs`, plus "Hoodie only". */
export function PackSelector({ packs, selectedPackId, hoodiePriceCents, onSelect }: PackSelectorProps) {
  const sorted = [...packs].sort((a, b) => a.stimpieCount - b.stimpieCount);
  const options: { id: number | null; name: string; price: number | null; badge: string | null }[] = sorted.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.priceCents,
    badge: p.badge,
  }));
  if (hoodiePriceCents !== null) options.push({ id: null, name: 'Hoodie only', price: hoodiePriceCents, badge: null });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.id === selectedPackId));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    const o = options[next];
    if (!o) return;
    onSelect(o.id);
    refs.current[next]?.focus();
  };
  if (options.length === 0) return null;
  return (
    <div role="radiogroup" aria-label="Pack" onKeyDown={onKey} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} data-builder-packs>
      {options.map((o, i) => {
        const selected = i === idx;
        return (
          <button
            key={o.id ?? 'hoodie'}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-pack-slug={o.id === null ? 'hoodie-only' : (packs.find((p) => p.id === o.id)?.slug ?? '')}
            onClick={() => onSelect(o.id)}
            className={cn(
              'flex min-h-tap flex-col items-start justify-center gap-0.5 rounded-md border px-3 py-2 text-left',
              selected ? 'border-ink bg-ink text-white' : 'border-control bg-white text-ink',
            )}
          >
            <span className="text-body-sm font-medium leading-tight">{o.name}</span>
            <span className="flex flex-wrap items-center gap-1 text-caption">
              {o.price !== null ? <span className="tabular">{formatCents(o.price)}</span> : null}
              {o.badge ? (
                <span className={cn('rounded-full px-2 py-px text-caption font-medium', selected ? 'bg-coral text-ink' : 'bg-cream text-ink')}>{o.badge}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SLOT_LABELS = ['On your hoodie', 'In the box', 'Slot 3', 'Slot 4', 'Slot 5'];

export interface SlotChipsProps {
  slots: readonly (number | null)[];
  focus: number;
  stimpies: readonly BuilderStimpie[];
  onFocus: (slot: number) => void;
}

/** N "slots" chips above the carousel (builder.md 10.2); only for packs of two or more. */
export function SlotChips({ slots, focus, stimpies, onFocus }: SlotChipsProps) {
  if (slots.length < 2) return null;
  return (
    <div role="group" aria-label="Pack slots" className="flex flex-wrap gap-2" data-builder-slots>
      {slots.map((id, i) => {
        const s = id === null ? null : stimpies.find((x) => x.id === id);
        const active = i === focus;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={active}
            data-slot={i + 1}
            onClick={() => onFocus(i)}
            className={cn(
              'flex min-h-tap items-center gap-2 rounded-full border px-3 text-body-sm',
              active ? 'border-ink bg-ink text-white' : 'border-control bg-white text-ink',
            )}
          >
            <span className="font-medium">{SLOT_LABELS[i] ?? `Slot ${i + 1}`}</span>
            <span className={active ? 'text-white' : 'text-ink-70'}>{s ? s.name : 'Choose'}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ 2D / 3D toggle and 3D buttons */

export function ModeToggle({ view, onChange }: { view: '2d' | '3d'; onChange: (v: '2d' | '3d') => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const items: ('2d' | '3d')[] = ['2d', '3d'];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const next = view === '2d' ? '3d' : '2d';
    onChange(next);
    refs.current[items.indexOf(next)]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Preview view"
      onKeyDown={onKey}
      data-builder-toggle
      className="inline-flex overflow-hidden rounded-full border border-control bg-white/95"
    >
      {items.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={view === v}
          tabIndex={view === v ? 0 : -1}
          data-view={v}
          onClick={() => onChange(v)}
          className={cn('min-h-tap min-w-tap px-4 text-body-sm font-medium', view === v ? 'bg-ink text-white' : 'bg-transparent text-ink')}
        >
          {v === '2d' ? '2D' : '3D'}
        </button>
      ))}
    </div>
  );
}

export interface Controls3DProps {
  onRotate: (deg: number) => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
}

/** Keyboard and switch-user alternatives to dragging (builder.md 13): rotate +/-45, zoom +/-, Back view. */
export function Controls3D({ onRotate, onZoom, onReset }: Controls3DProps) {
  const btn =
    'flex min-h-tap min-w-tap items-center justify-center rounded-full border border-control bg-white/95 px-3 text-body-sm font-medium text-ink';
  return (
    <div role="group" aria-label="3D view controls" data-builder-3d-controls className="flex flex-wrap items-center gap-1">
      <button type="button" className={btn} aria-label="Rotate left 45 degrees" onClick={() => onRotate(-45)}>
        <icons.ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button type="button" className={btn} aria-label="Rotate right 45 degrees" onClick={() => onRotate(45)}>
        <icons.ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" className={btn} aria-label="Zoom in" onClick={() => onZoom(0.85)}>
        <icons.Plus size={18} aria-hidden="true" />
      </button>
      <button type="button" className={btn} aria-label="Zoom out" onClick={() => onZoom(1.18)}>
        <icons.Minus size={18} aria-hidden="true" />
      </button>
      <button type="button" className={btn} onClick={onReset}>
        Back view
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ size sheet */

export interface SizeSheetProps {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  hoodie: BuilderHoodie;
  colorId: number;
  sizeId: number | null;
  onSelect: (id: number) => void;
  /** Label of the confirm button: "Add to cart - $45". */
  confirmLabel: string;
  onConfirm: () => void;
  sizeGuideHref?: string;
}

/** Choose your size: bottom sheet on mobile, modal on desktop (builder.md 10.4). */
export function SizeSheet({ open, onClose, returnFocusRef, hoodie, colorId, sizeId, onSelect, confirmLabel, onConfirm, sizeGuideHref = '/help' }: SizeSheetProps) {
  const { Link } = useUI();
  const sizes = [...hoodie.sizes].sort((a, b) => a.position - b.position);
  const stockFor = (s: BuilderSize) => hoodie.variants.find((v) => v.colorId === colorId && v.sizeId === s.id);
  const groupId = useId();
  const selectedOk = sizeId !== null && !!stockFor(sizes.find((s) => s.id === sizeId) as BuilderSize)?.inStock;
  return (
    <Modal open={open} onClose={onClose} title="Choose your size" size="sm" sheetOnMobile returnFocusRef={returnFocusRef}>
      <div data-builder-size-sheet className="flex flex-col gap-4">
        <div role="radiogroup" aria-labelledby={groupId} className="flex flex-wrap gap-2">
          <span id={groupId} className="sr-only">
            Size
          </span>
          {sizes.map((s) => {
            const v = stockFor(s);
            const inStock = !!v?.inStock;
            const selected = s.id === sizeId;
            const name = !inStock ? `${s.label}, sold out` : v?.remaining != null ? `${s.label}, only ${v.remaining} left` : s.label;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={!inStock || undefined}
                aria-label={name}
                data-size-id={s.id}
                disabled={!inStock}
                onClick={() => onSelect(s.id)}
                className={cn(
                  'relative flex min-h-tap min-w-tap flex-col items-center justify-center rounded-md border px-3 text-body font-medium',
                  selected ? 'border-ink bg-ink text-white' : 'border-control bg-white text-ink',
                  !inStock && 'text-disabled-fg line-through',
                )}
              >
                {s.label}
                {inStock && v?.remaining != null ? <span className="text-caption font-normal">Only {v.remaining} left</span> : null}
              </button>
            );
          })}
        </div>
        <Link href={sizeGuideHref} target="_blank" rel="noopener" className="text-body-sm underline">
          Size guide
        </Link>
        <Button variant="cta" size="lg" fullWidth disabled={!selectedOk} onClick={onConfirm} data-builder-confirm-size>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ static fallback */

export function BuilderStaticFallback({
  photo,
  stimpies,
  shopHref = '/shop',
  children,
}: {
  photo: string | null;
  stimpies: readonly BuilderStimpie[];
  shopHref?: string;
  children?: ReactNode;
}) {
  const { Link } = useUI();
  return (
    <section data-builder-static aria-label="Builder preview" className="flex flex-col gap-4 rounded-md bg-cream p-4">
      {photo ? (
        <img src={photo} alt="The Stimpy hoodie" width={800} height={1000} loading="lazy" className="mx-auto w-full" style={{ maxWidth: 420, aspectRatio: '4 / 5', objectFit: 'contain' }} />
      ) : null}
      {stimpies.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Stimpies">
          {stimpies.slice(0, 6).map((s) => (
            <li key={s.id} style={{ width: 72 }}>
              <img src={s.artworkUrl} alt={`${s.name} Stimpie`} loading="lazy" className="w-full rounded-sm" style={{ aspectRatio: String(STIMPIE_RATIO), objectFit: 'cover' }} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-center text-body">
        Try Stimpies on the hoodie:{' '}
        <Link href={shopHref} className="underline">
          browse the shop
        </Link>
        .
      </p>
      {children}
    </section>
  );
}

/** Is the colour sold out in the (optional) hoodie detail? Re-exported for the Builder. */
export { colorSoldOut };
