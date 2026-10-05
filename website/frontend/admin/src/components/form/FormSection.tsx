import { useId, type ReactNode } from 'react';
import { cn } from '@stimpy/ui';

export interface FormSectionProps {
  title: string;
  description?: ReactNode;
  /** Right-aligned content in the header (a link, a status). */
  aside?: ReactNode;
  children: ReactNode;
  /** `quiet` has no border (nested groups). */
  variant?: 'card' | 'quiet';
  className?: string;
}

/**
 * A titled group of fields (a card with a heading). Quiet, bordered, no shadow. Use one per topic
 * ("Details", "Pricing", "Images") and lay the fields out with `className="grid gap-4 md:grid-cols-2"`.
 */
export function FormSection({ title, description, aside, children, variant = 'card', className }: FormSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn(variant === 'card' && 'rounded-lg border border-base bg-surface-base p-4 md:p-6', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 text-fg">
            {title}
          </h2>
          {description ? <p className="mt-1 text-body-sm text-fg-muted">{description}</p> : null}
        </div>
        {aside}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
