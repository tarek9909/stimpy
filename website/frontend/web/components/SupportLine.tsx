'use client';

import { CopyButton } from '@stimpy/ui';

/**
 * "If it keeps happening, message us and quote this code: {requestId}" with a copy button (checkout-and-order-flow
 * 4, "Support line"). Renders nothing when there is no request id (offline, timeout): there is no code to quote.
 */
export function SupportLine({ requestId }: { requestId: string | null | undefined }) {
  if (!requestId) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-body-sm text-fg-muted" data-testid="support-line">
      <span>
        If it keeps happening, message us and quote this code: <span className="font-medium text-fg" data-testid="request-id">{requestId}</span>
      </span>
      <CopyButton text={requestId} label="Copy code" iconOnly variant="ghost" size="sm" />
    </p>
  );
}
