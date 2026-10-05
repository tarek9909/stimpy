'use client';

import { useEffect } from 'react';
import { Button, ErrorState, Section } from '@stimpy/ui';
import { isApiError } from '@stimpy/api-client';

/**
 * Route error boundary (website-pages 3.6). Plain language, never a stack trace. When the failure came from an API
 * error body the support line quotes its request id; network failures have none. Logs only the digest and the code.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- reporting without a DSN is console only
    console.error('[stimpy:web] route error', error.digest ?? '', isApiError(error) ? error.code : error.name);
  }, [error]);
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <Section tone="white">
      <ErrorState
        title="Something went wrong."
        text="We could not load this page. Please try again."
        onRetry={reset}
        requestId={requestId}
        action={
          <Button href="/" variant="secondary">
            Home
          </Button>
        }
      />
    </Section>
  );
}
