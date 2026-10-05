'use client';

import { useId, type HTMLAttributes } from 'react';
import { cn } from '../cn';
import { relativeLuminance } from '../format';
import type { ColorLike, SizeLike, VariantLike } from '../types';

/* ------------------------------------------------------------------------------ ColorSwatch */

export interface ColorSwatchProps {
  color: ColorLike;
  /** Radio behaviour when `name` and `onSelect` are given; otherwise a static display dot. */
  name?: string;
  selected?: boolean;
  onSelect?: (id: number) => void;
  /** Struck through but still selectable (to view photos). Adds ", sold out" to the name. */
  soldOut?: boolean;
  /** Not selectable at all. */
  disabled?: boolean;
  className?: string;
}

function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.7;
}

/** The round colour itself (32px). Its `hex` is runtime data, the only inline colour in the library. */
function SwatchDot({ hex, size, soldOut }: { hex: string; size: 'md' | 'sm'; soldOut?: boolean }) {
  return (
    <span
      className={cn(
        'swatch relative inline-block shrink-0 overflow-hidden rounded-full border',
        size === 'md' ? 'h-8 w-8' : 'h-3 w-3',
        isLight(hex) ? 'border-control' : 'border-base',
      )}
      style={{ backgroundColor: hex }}
    >
      {soldOut ? (
        <>
          {/* diagonal strike: a white halo under an ink line stays visible on any swatch colour */}
          <span className="absolute left-1/2 top-1/2 h-1 w-12 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-white" />
          <span className="absolute left-1/2 top-1/2 h-0.5 w-12 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-ink" />
        </>
      ) : null}
    </span>
  );
}

export function ColorSwatch({ color, name, selected, onSelect, soldOut, disabled, className }: ColorSwatchProps) {
  const accessibleName = soldOut ? `${color.name}, sold out` : color.name;
  if (!name || !onSelect) {
    return (
      <span className={className} role="img" aria-label={accessibleName} title={color.name}>
        <SwatchDot hex={color.hex} size="md" soldOut={soldOut} />
      </span>
    );
  }
  return (
    <label
      title={color.name}
      className={cn(
        'relative inline-flex h-11 w-11 shrink-0 items-center justify-center',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={String(color.id)}
        checked={!!selected}
        disabled={disabled}
        onChange={() => onSelect(color.id)}
        className="peer stimpy-peer absolute inset-0 z-10 m-0 h-full w-full cursor-[inherit] opacity-0"
      />
      <span
        aria-hidden="true"
        className={cn(
          'focus-target inline-flex h-11 w-11 items-center justify-center rounded-full',
          'peer-checked:[&>.swatch]:ring-2 peer-checked:[&>.swatch]:ring-fg peer-checked:[&>.swatch]:ring-offset-2',
        )}
      >
        <SwatchDot hex={color.hex} size="md" soldOut={soldOut} />
      </span>
      <span className="sr-only">{accessibleName}</span>
    </label>
  );
}

export interface ColorSwatchesProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  colors: ColorLike[];
  value: number | null;
  onChange: (id: number) => void;
  /** Cannot be chosen. */
  disabledIds?: number[];
  /** Struck through, still selectable (no in-stock size, photos still viewable). */
  soldOutIds?: number[];
  /** Accessible name of the group and prefix of the visible caption. Default "Colour". */
  label?: string;
  /** Show "Colour: Black" next to the group. Default true. */
  showSelectedName?: boolean;
}

/** Radio group of round swatches. Accessible name of each = colour name (+ ", sold out"). */
export function ColorSwatches({
  colors,
  value,
  onChange,
  disabledIds,
  soldOutIds,
  label = 'Colour',
  showSelectedName = true,
  className,
  ...rest
}: ColorSwatchesProps) {
  const name = useId();
  const selected = colors.find((c) => c.id === value);
  return (
    <div className={cn('flex flex-col gap-1', className)} {...rest}>
      {showSelectedName ? (
        <p className="text-body-sm text-fg" data-testid="swatch-caption">
          <span className="text-fg-muted">{label}: </span>
          <span className="font-medium">{selected ? selected.name : 'Choose a colour'}</span>
        </p>
      ) : null}
      <div role="radiogroup" aria-label={label} className="-mx-1.5 flex flex-wrap">
        {colors.map((c) => (
          <ColorSwatch
            key={c.id}
            color={c}
            name={name}
            selected={c.id === value}
            onSelect={onChange}
            soldOut={soldOutIds?.includes(c.id)}
            disabled={disabledIds?.includes(c.id)}
            className="mx-0.5"
          />
        ))}
      </div>
    </div>
  );
}

/** Tiny static dots for cards: up to `max` swatches, "+n" beyond, name as accessible text. */
export function ColorDots({ colors, max = 5, className }: { colors: ColorLike[]; max?: number; className?: string }) {
  if (colors.length === 0) return null;
  const shown = colors.slice(0, max);
  const extra = colors.length - shown.length;
  return (
    <ul className={cn('flex items-center gap-1.5', className)} aria-label="Colours">
      {shown.map((c) => (
        <li key={c.id} className="inline-flex">
          <SwatchDot hex={c.hex} size="sm" />
          <span className="sr-only">{c.name}</span>
        </li>
      ))}
      {extra > 0 ? <li className="text-caption text-fg-muted">+{extra}</li> : null}
    </ul>
  );
}

/* ----------------------------------------------------------------------------- SizeChip/Selector */

export interface SizeChipProps {
  label: string;
  name: string;
  value: number;
  selected: boolean;
  onSelect: (value: number) => void;
  /** Sold out: struck through, not selectable, explained in the accessible name. */
  soldOut?: boolean;
  /** Only when low stock: shows "{n} left". */
  remaining?: number | null;
  className?: string;
}

/** 44x44 minimum selectable size. Native radio underneath; `aria-disabled` keeps it discoverable. */
export function SizeChip({ label, name, value, selected, onSelect, soldOut, remaining, className }: SizeChipProps) {
  const lowText = !soldOut && remaining != null && remaining > 0 ? `${remaining} left` : null;
  return (
    <label
      className={cn(
        'relative inline-flex min-h-11 min-w-11',
        soldOut ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={String(value)}
        checked={selected}
        aria-disabled={soldOut || undefined}
        onChange={() => {
          if (!soldOut) onSelect(value);
        }}
        className="peer stimpy-peer absolute inset-0 z-10 m-0 h-full w-full cursor-[inherit] opacity-0"
      />
      <span
        className={cn(
          'focus-target flex min-h-11 min-w-11 flex-col items-center justify-center rounded-md border-2 px-3 text-button font-medium tabular-nums',
          'transition-colors duration-fast ease-standard',
          soldOut
            ? 'border-base text-disabled-fg line-through'
            : 'border-control bg-surface-base text-fg hover:border-fg peer-checked:border-fg peer-checked:bg-fg peer-checked:text-fg-inverse',
        )}
      >
        <span>{label}</span>
        {lowText ? <span className="text-caption font-normal no-underline">{lowText}</span> : null}
      </span>
      {soldOut ? <span className="sr-only">, sold out</span> : null}
    </label>
  );
}

export interface SizeSelectorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  sizes: SizeLike[];
  variants: VariantLike[];
  colorId: number;
  value: number | null;
  onChange: (sizeId: number) => void;
  label?: string;
}

/** A size is sold out when its variant for `colorId` has `inStock: false` (or does not exist). */
export function SizeSelector({ sizes, variants, colorId, value, onChange, label = 'Size', className, ...rest }: SizeSelectorProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)} {...rest}>
      {sizes.map((s) => {
        const v = variants.find((x) => x.colorId === colorId && x.sizeId === s.id);
        return (
          <SizeChip
            key={s.id}
            name={name}
            value={s.id}
            label={s.label}
            selected={value === s.id}
            onSelect={onChange}
            soldOut={!v || !v.inStock}
            remaining={v?.remaining ?? null}
          />
        );
      })}
    </div>
  );
}
