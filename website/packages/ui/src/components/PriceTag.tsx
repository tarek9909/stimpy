import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../cn';
import { formatCents } from '../format';

export interface PriceTagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Integer USD cents. */
  cents: number;
  /** The previous price in cents; shown struck through when higher than `cents`. */
  compareAtCents?: number;
  size?: 'sm' | 'md' | 'lg';
  /** `from`: renders "from $10". */
  prefix?: string;
  /** `compact`: table cells. `total`: bold with a label. `strike`: only the struck-through was price. */
  variant?: 'default' | 'compact' | 'strike' | 'total';
  /** Always two decimals (dashboard). */
  fixed?: boolean;
  /** Text to show instead of `$0`, e.g. "Free delivery" when the fee is 0. */
  zeroLabel?: string;
}

const sizeClass = { sm: 'text-price-sm', md: 'text-price-md', lg: 'text-price-lg' } as const;

export const PriceTag = forwardRef<HTMLSpanElement, PriceTagProps>(function PriceTag(
  { cents, compareAtCents, size = 'md', prefix, variant = 'default', fixed, zeroLabel, className, ...rest },
  ref,
) {
  const price = cents === 0 && zeroLabel ? zeroLabel : formatCents(cents, { fixed });
  const showCompare = compareAtCents !== undefined && compareAtCents > cents;

  if (variant === 'strike') {
    return (
      <span ref={ref} className={cn('text-body-sm tabular-nums text-fg-muted line-through', className)} {...rest}>
        <span className="sr-only">Was </span>
        {formatCents(cents, { fixed })}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex flex-wrap items-baseline gap-x-2 tabular-nums text-fg',
        variant === 'compact' ? 'text-body-sm font-medium' : cn(sizeClass[size], 'font-bold'),
        className,
      )}
      {...rest}
    >
      {prefix ? <span className="text-body-sm font-normal text-fg-muted">{prefix}</span> : null}
      <span>{price}</span>
      {showCompare ? (
        <span className="text-body-sm font-normal text-fg-muted line-through">
          <span className="sr-only">Was </span>
          {formatCents(compareAtCents as number, { fixed })}
        </span>
      ) : null}
    </span>
  );
});
