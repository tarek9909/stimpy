import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import {
  Check,
  CheckCheck,
  CircleDot,
  Package,
  Truck,
  Undo2,
  XCircle,
  type LucideIcon,
} from '../icons';
import type { AccentColor, OrderStatus } from '../types';

/* ------------------------------------------------------------------------------------------
 * Pill: the one small filled label. Every tone carries its brand text colour (design-system
 * section 3.1), so consumers choose a tone, never a text colour.
 * ---------------------------------------------------------------------------------------- */

export type PillTone =
  | 'coral'
  | 'black'
  | 'outline'
  | 'white'
  | 'cream'
  | 'butter'
  | 'sky'
  | 'lilac'
  | 'neutral'
  | 'blue'
  | 'success'
  | 'danger';

export const pillToneClasses: Record<PillTone, string> = {
  coral: 'bg-coral text-ink',
  black: 'bg-ink text-white',
  outline: 'border border-fg bg-transparent text-fg',
  white: 'border border-ink bg-white text-ink',
  cream: 'border border-line bg-cream text-ink',
  butter: 'bg-butter text-ink',
  sky: 'bg-sky text-ink',
  lilac: 'bg-lilac text-ink',
  neutral: 'bg-neutral text-white',
  blue: 'bg-action text-white',
  success: 'bg-success text-white',
  danger: 'bg-danger text-white',
};

/** Drop accent enum to its token tone (tokens, not runtime hex strings, drive styling). */
export function accentTone(accent: AccentColor | null | undefined): PillTone {
  switch (accent) {
    case 'BUTTER':
      return 'butter';
    case 'SKY':
      return 'sky';
    case 'LILAC':
      return 'lilac';
    default:
      return 'coral';
  }
}

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: 'sm' | 'md';
  shape?: 'tag' | 'pill';
  icon?: ReactNode;
}

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = 'black', size = 'sm', shape = 'tag', icon, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-caption' : 'px-3 py-1 text-body-sm',
        shape === 'tag' ? 'rounded-sm' : 'rounded-full',
        pillToneClasses[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
});

/* ------------------------------------------------------------------------------------ Badge */

export type BadgeKind =
  | 'CORE'
  | 'LIMITED'
  | 'LOW'
  | 'SOLD_OUT'
  | 'UPCOMING'
  | 'ENDED'
  | 'POPULAR'
  | 'CUSTOM';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  kind: BadgeKind;
  /** Overrides the copy (`POPULAR`/`CUSTOM`: the pack's `badge` text, e.g. "Most popular"). */
  label?: string;
  /** `LOW` only: adds "{n} left" when not null. */
  remaining?: number | null;
  /** Drop accent. `LIMITED` uses it when given, coral otherwise. */
  accent?: AccentColor | null;
  /** `CUSTOM` tone. Default black. */
  tone?: PillTone;
  size?: 'sm' | 'md';
}

export function badgeCopy(kind: BadgeKind, label?: string, remaining?: number | null): string {
  switch (kind) {
    case 'CORE':
      return label ?? 'Core';
    case 'LIMITED':
      return label ?? 'Limited';
    case 'LOW':
      return remaining != null && remaining > 0 ? `${label ?? 'Last few'} · ${remaining} left` : (label ?? 'Last few');
    case 'SOLD_OUT':
      return label ?? 'Sold out';
    case 'UPCOMING':
      return label ?? 'Coming soon';
    case 'ENDED':
      return label ?? "Won't return";
    case 'POPULAR':
      return label ?? 'Most popular';
    case 'CUSTOM':
      return label ?? '';
  }
}

function badgeTone(kind: BadgeKind, accent: AccentColor | null | undefined, tone?: PillTone): PillTone {
  switch (kind) {
    case 'CORE':
      return 'cream';
    case 'LIMITED':
      return accent ? accentTone(accent) : 'coral';
    case 'LOW':
      return 'butter';
    case 'SOLD_OUT':
      return 'neutral';
    case 'UPCOMING':
      return 'white';
    case 'ENDED':
      return 'black';
    case 'POPULAR':
      return 'coral';
    case 'CUSTOM':
      return tone ?? 'black';
  }
}

/** Product/pack/drop marker. Colour is never the only signal: every kind has text. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { kind, label, remaining, accent, tone, size = 'sm', ...rest },
  ref,
) {
  const text = badgeCopy(kind, label, remaining);
  if (!text) return null;
  return (
    <Pill ref={ref} tone={badgeTone(kind, accent, tone)} size={size} data-badge={kind} {...rest}>
      {text}
    </Pill>
  );
});

/** design-system calls the same component `Tag`. */
export const Tag = Badge;

/* ------------------------------------------------------------------------------- StatusPill */

export interface StatusMeta {
  label: string;
  tone: PillTone;
  Icon: LucideIcon;
}

/** design-system 2.3: all seven OrderStatus values, background, text pair and icon. */
export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  NEW: { label: 'New', tone: 'coral', Icon: CircleDot },
  CONFIRMED: { label: 'Confirmed', tone: 'blue', Icon: Check },
  PACKED: { label: 'Packed', tone: 'butter', Icon: Package },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'sky', Icon: Truck },
  DELIVERED: { label: 'Delivered', tone: 'success', Icon: CheckCheck },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', Icon: XCircle },
  RETURNED: { label: 'Returned', tone: 'danger', Icon: Undo2 },
};

export interface StatusPillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: OrderStatus;
  size?: 'sm' | 'md';
}

/** Order status: icon AND label, never colour alone. */
export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(function StatusPill(
  { status, size = 'md', ...rest },
  ref,
) {
  const meta = STATUS_META[status] ?? STATUS_META.NEW;
  const Icon = meta.Icon;
  const px = size === 'sm' ? 14 : 16;
  return (
    <Pill
      ref={ref}
      tone={meta.tone}
      size={size}
      shape="pill"
      data-status={status}
      icon={<Icon width={px} height={px} aria-hidden="true" />}
      {...rest}
    >
      {meta.label}
    </Pill>
  );
});
