import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../cn';
import { Loader2 } from '../icons';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
  /** When set the spinner is announced (`role="status"`); otherwise it is decorative. */
  label?: string;
}

/** Inline progress. Only inside buttons or small regions: page-level waits use skeletons. */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label, className, ...rest },
  ref,
) {
  const px = size === 'sm' ? 16 : 20;
  return (
    <span
      ref={ref}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <Loader2 width={px} height={px} className="animate-stimpy-spin" aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
});
