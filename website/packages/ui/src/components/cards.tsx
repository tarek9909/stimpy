'use client';

import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { HOODIE_RATIO, STIMPIE_RATIO } from '../constants';
import { useUI } from '../context';
import { formatCents, pluralize } from '../format';
import { Check } from '../icons';
import { SURFACE_CLASSES, accentColorStyle, accentSurface } from '../surfaces';
import { isExternalHref } from '../utils';
import type { DropLike, HoodieSummaryLike, PackLike, StimpieLike } from '../types';
import { Badge, accentTone, Pill, type BadgeKind } from './badges';
import { Button } from './Button';
import { Countdown } from './Countdown';
import { Media } from './Media';
import { PriceTag } from './PriceTag';
import { ColorDots } from './Swatches';

/* ---------------------------------------------------------------------------------------- Card */

export type CardVariant = 'plain' | 'cream' | 'product' | 'stat';

const cardVariants: Record<CardVariant, string> = {
  plain: 'rounded-lg border border-base bg-surface-base text-fg',
  cream: 'rounded-lg bg-cream text-ink surface-colored surface-cream',
  product:
    'rounded-lg border border-base bg-surface-base text-fg overflow-hidden transition-colors duration-fast ease-standard hover:border-fg',
  stat: 'rounded-lg border border-base bg-surface-base p-4 text-fg',
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: ElementType;
}

/** Surface container. No shadow: borders only. Clickable cards use ONE stretched link inside. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { variant = 'plain', as: Comp = 'div', className, children, ...rest },
  ref,
) {
  return (
    <Comp ref={ref} className={cn('focus-within-ring relative', cardVariants[variant], className)} {...rest}>
      {children}
    </Comp>
  );
});

export interface StretchedLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/** The card's single link: its `::after` covers the whole card, so there are no nested interactives. */
export function StretchedLink({ href, children, className, ...rest }: StretchedLinkProps) {
  const { Link } = useUI();
  const external = isExternalHref(href);
  const Comp: ElementType = external ? 'a' : Link;
  return (
    <Comp
      href={href}
      {...(external ? { rel: 'noopener noreferrer' } : {})}
      className={cn("after:absolute after:inset-0 after:z-0 after:content-['']", className)}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** `+12%` etc.; colour is semantic AND the text carries the sign. */
  delta?: { text: string; tone: 'up' | 'down' | 'flat' };
}

/** Dashboard KPI: label, value (tabular numerals), optional hint and delta. */
export function StatCard({ label, value, hint, delta, className, ...rest }: StatCardProps) {
  return (
    <Card variant="stat" className={className} {...rest}>
      <p className="text-body-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-h2 font-bold tabular-nums text-fg">{value}</p>
      {delta ? (
        <p
          className={cn(
            'mt-1 text-body-sm font-medium tabular-nums',
            delta.tone === 'up' && 'text-success',
            delta.tone === 'down' && 'text-fg-danger',
            delta.tone === 'flat' && 'text-fg-muted',
          )}
        >
          {delta.text}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-body-sm text-fg-muted">{hint}</p> : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------- ProductCard */

export interface ProductCardProps {
  hoodie: HoodieSummaryLike;
  /** Defaults to `/shop/hoodie/{slug}`. */
  href?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/** Hoodie tile for the Shop grid: 4:5 image, "from" price, up to 5 colour dots, Sold out badge. */
export function ProductCard({ hoodie, href, priority, sizes, className }: ProductCardProps) {
  const link = href ?? `/shop/hoodie/${hoodie.slug}`;
  return (
    <Card variant="product" className={cn('flex flex-col', className)}>
      <div className={cn(!hoodie.inStock && 'opacity-60')}>
        <Media
          src={hoodie.images[0]}
          alt={`${hoodie.name} hoodie`}
          ratio={HOODIE_RATIO}
          priority={priority}
          sizes={sizes}
        />
      </div>
      {!hoodie.inStock ? (
        <div className="absolute left-3 top-3">
          <Badge kind="SOLD_OUT" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-3 md:p-4">
        <h3 className="text-h4 text-fg">
          <StretchedLink href={link}>{hoodie.name}</StretchedLink>
        </h3>
        <PriceTag cents={hoodie.priceCents} compareAtCents={hoodie.compareAtPriceCents ?? undefined} prefix="from" size="sm" />
        <ColorDots colors={hoodie.colors} />
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------------------- StimpieCard */

const STATUS_KIND: Partial<Record<StimpieLike['status'], BadgeKind>> = {
  LOW: 'LOW',
  SOLD_OUT: 'SOLD_OUT',
  UPCOMING: 'UPCOMING',
  ENDED: 'ENDED',
};

const STATUS_TEXT: Partial<Record<StimpieLike['status'], string>> = {
  SOLD_OUT: 'Sold out',
  UPCOMING: 'Coming soon',
  ENDED: 'Ended',
};

export interface StimpieCardProps {
  stimpie: StimpieLike;
  /** Shows an Add button when the Stimpie is purchasable. */
  onAdd?: () => void;
  /** Picker mode (Builder, pack composer): the whole card is a toggle button with `aria-pressed`. */
  selectable?: boolean;
  selected?: boolean;
  /** Called in picker mode. */
  onSelect?: () => void;
  showDrop?: boolean;
  variant?: 'default' | 'compact';
  /** Defaults to `/shop/stimpie/{slug}`; ignored in picker mode. */
  href?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/** Stimpie tile. Art stays at 0.64 and is never cropped. Muted (not hidden) when not purchasable. */
export function StimpieCard({
  stimpie,
  onAdd,
  selectable,
  selected,
  onSelect,
  showDrop,
  variant = 'default',
  href,
  priority,
  sizes,
  className,
}: StimpieCardProps) {
  const compact = variant === 'compact';
  const muted = !stimpie.purchasable;
  const statusKind = STATUS_KIND[stimpie.status];
  const statusText = STATUS_TEXT[stimpie.status];
  const accent = stimpie.drop?.accentColor ?? null;

  const body = (
    <>
      <div className={cn('relative', muted && 'opacity-60')}>
        <Media
          src={stimpie.images[0] ?? stimpie.artworkUrl}
          alt={`${stimpie.name} Stimpie`}
          ratio={STIMPIE_RATIO}
          priority={priority}
          sizes={sizes}
        />
      </div>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
        {/* compact tiles are narrow: one badge only (status wins over type), no "n left" */}
        {compact && statusKind ? null : <Badge kind={stimpie.type === 'CORE' ? 'CORE' : 'LIMITED'} accent={accent} style={accentColorStyle(stimpie.drop?.accentHex)} />}
        {statusKind ? (
          <Badge
            kind={statusKind}
            remaining={compact ? null : stimpie.remaining}
            label={compact && statusKind === 'UPCOMING' ? 'Soon' : undefined}
          />
        ) : null}
      </div>
      {selectable && selected ? (
        <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white">
          <Check width={16} height={16} strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
      <div className={cn('flex flex-1 flex-col gap-1.5 text-left', compact ? 'p-2' : 'p-3 md:p-4')}>
        {selectable ? (
          <p className={cn('font-medium text-fg', compact ? 'text-body-sm' : 'text-h4')}>{stimpie.name}</p>
        ) : (
          <h3 className={cn('font-medium text-fg', compact ? 'text-body-sm' : 'text-h4')}>
            <StretchedLink href={href ?? `/shop/stimpie/${stimpie.slug}`}>{stimpie.name}</StretchedLink>
          </h3>
        )}
        <PriceTag cents={stimpie.priceCents} compareAtCents={stimpie.compareAtPriceCents ?? undefined} size="sm" />
        {showDrop && stimpie.drop ? (
          <Pill tone={accentTone(accent)} className="self-start" style={accentColorStyle(stimpie.drop.accentHex)}>
            {stimpie.drop.name}
          </Pill>
        ) : null}
        {!compact && !selectable ? (
          <div className="mt-auto pt-1">
            {stimpie.purchasable && onAdd ? (
              <Button
                size="sm"
                variant="cta"
                onClick={onAdd}
                aria-label={`Add ${stimpie.name} to cart`}
                className="relative z-10"
              >
                Add
              </Button>
            ) : !stimpie.purchasable && statusText ? (
              <p className="text-body-sm font-medium text-fg-muted">{statusText}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  if (selectable) {
    const disabled = muted;
    return (
      <button
        type="button"
        aria-pressed={!!selected}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onSelect?.();
        }}
        className={cn(
          'relative flex w-full flex-col overflow-hidden rounded-lg border-2 bg-surface-base text-fg transition-colors duration-fast ease-standard',
          selected ? 'border-fg' : 'border-base hover:border-control',
          disabled && 'cursor-not-allowed',
          className,
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <Card variant="product" className={cn('flex flex-col', className)}>
      {body}
    </Card>
  );
}

/* ----------------------------------------------------------------------------------- PackCard */

export interface PackCardProps {
  pack: PackLike;
  /** "second Stimpie effectively {price}" line (home page). */
  effectiveExtraCents?: number;
  /** Featured: coral border. */
  highlight?: boolean;
  selected?: boolean;
  /** Shows the call-to-action button ("Choose") that opens the pack composer. */
  onChoose?: () => void;
  ctaLabel?: string;
  className?: string;
}

export function PackCard({ pack, effectiveExtraCents, highlight, selected, onChoose, ctaLabel = 'Choose', className }: PackCardProps) {
  return (
    <Card
      variant="plain"
      className={cn(
        'flex flex-col gap-3 p-5',
        highlight && 'border-2 border-coral',
        selected && 'border-2 border-fg',
        className,
      )}
      data-selected={selected || undefined}
    >
      {pack.badge ? (
        <Badge kind="POPULAR" label={pack.badge} className="self-start" />
      ) : null}
      <h3 className="text-h3 text-fg">{pack.name}</h3>
      <p className="text-body text-fg-muted">{pack.description}</p>
      <PriceTag cents={pack.priceCents} compareAtCents={pack.compareAtPriceCents ?? undefined} size="lg" />
      {effectiveExtraCents !== undefined && effectiveExtraCents > 0 ? (
        <p className="text-body-sm text-fg-muted">
          Second Stimpie effectively{' '}
          <span className="font-medium tabular-nums text-fg">{formatCents(effectiveExtraCents)}</span>
        </p>
      ) : null}
      {selected ? (
        <p className="flex items-center gap-1 text-body-sm font-medium text-fg">
          <Check width={16} height={16} aria-hidden="true" /> Selected
        </p>
      ) : null}
      {onChoose ? (
        <Button variant="cta" fullWidth onClick={onChoose} className="mt-auto">
          {ctaLabel}
        </Button>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------------------------- DropCard */

export interface DropCardProps {
  drop: DropLike;
  variant: 'live' | 'upcoming' | 'archive';
  /** Defaults to `/drops/{slug}`. */
  href?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/** Drop tile on the drop's accent colour (black text). One accent per view is the caller's job. */
export function DropCard({ drop, variant, href, priority, sizes, className }: DropCardProps) {
  const tone = drop.accentHex ? 'surface-colored' : SURFACE_CLASSES[accentSurface(drop.accentColor)];
  const link = href ?? `/drops/${drop.slug}`;
  return (
    <Card className={cn('flex flex-col overflow-hidden border-0', tone, className)} style={accentColorStyle(drop.accentHex)}>
      <Media src={drop.teaserImage} alt={`${drop.name} drop`} ratio="4 / 5" priority={priority} sizes={sizes} />
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {variant === 'live' ? <Badge kind="CUSTOM" label="Live now" tone="black" /> : null}
          {variant === 'upcoming' ? <Badge kind="UPCOMING" /> : null}
        </div>
        <h3 className="text-h3">
          <StretchedLink href={link}>{drop.name}</StretchedLink>
        </h3>
        {variant === 'live' ? (
          <>
            {drop.endsAt ? <Countdown variant="inline" target={drop.endsAt} label="Ends in" /> : null}
            {drop.unitsRemaining != null ? (
              <p className="text-body-sm font-medium tabular-nums">{pluralize(drop.unitsRemaining, 'Stimpie')} left</p>
            ) : null}
          </>
        ) : null}
        {variant === 'upcoming' ? <Countdown variant="inline" target={drop.startsAt} label="Starts in" /> : null}
        {variant === 'archive' ? (
          <p className="text-body-sm font-medium">
            {drop.state === 'SOLD_OUT' ? "Sold out — won't return" : 'Ended'}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
