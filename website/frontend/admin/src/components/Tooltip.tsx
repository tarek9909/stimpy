import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@stimpy/ui';

export interface TooltipProps {
  /** Short hint. Never essential information: touch users never see it. */
  content: ReactNode;
  /** One element that can receive focus (a button, link, input). It gets `aria-describedby`. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Hover / focus hint for icon buttons and disabled-reason text ("Select only New orders").
 * Shows on mouse hover and keyboard focus, hides on Escape, ignores touch. For a disabled button
 * wrap it in a `<span tabIndex={0}>` so it can still receive focus.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isValidElement(children)) return <>{children}</>;
  const child = cloneElement(children, {
    'aria-describedby': [children.props['aria-describedby'], open ? id : null].filter(Boolean).join(' ') || undefined,
  });

  return (
    <span
      className={cn('relative inline-flex', className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {child}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-40 w-max max-w-64 -translate-x-1/2 rounded-md bg-ink px-3 py-1.5 text-center text-body-sm text-white shadow-float',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
