import type { ReactNode } from 'react';
import { Spinner } from '@stimpy/ui';

/** Keep the current panel's height while its new server content is arriving. */
export function PendingContent({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div className="relative min-h-24" aria-busy={pending || undefined}>
      <div inert={pending || undefined} aria-hidden={pending || undefined}>{children}</div>
      {pending ? (
        <div className="absolute inset-0 z-10 flex items-start justify-center gap-2 bg-white/90 pt-6 text-body-sm text-fg-muted" role="status">
          <Spinner size="sm" /> Loading…
        </div>
      ) : null}
    </div>
  );
}
