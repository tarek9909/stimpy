'use client';

import { useCallback, useEffect, useState } from 'react';
import { isApiError } from '@stimpy/api-client';
import { Banner, Button } from '@stimpy/ui';
import { browserApi } from '@/lib/api-browser';

type State = 'checking' | 'ready' | 'invalid' | 'unavailable' | 'confirming' | 'confirmed' | 'confirm_error';

export function UnsubscribeView({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'checking' : 'invalid');

  const validate = useCallback(async () => {
    if (!token || token.length > 512) {
      setState('invalid');
      return;
    }
    setState('checking');
    try {
      const { data } = await browserApi().GET('/api/v1/unsubscribe/{token}', {
        params: { path: { token } },
        cache: 'no-store',
      });
      setState(data?.valid ? 'ready' : 'invalid');
    } catch (error) {
      // A malformed token is refused by the route schema (400): that link is invalid, not a temporary outage.
      setState(isApiError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') ? 'invalid' : 'unavailable');
    }
  }, [token]);

  useEffect(() => {
    void validate();
  }, [validate]);

  const confirm = async () => {
    // 'confirm_error' keeps the button so the visitor can retry the confirmation.
    if ((state !== 'ready' && state !== 'confirm_error') || !token) return;
    setState('confirming');
    try {
      await browserApi().POST('/api/v1/unsubscribe/{token}/confirm', { params: { path: { token } } });
      setState('confirmed');
    } catch (error) {
      setState(isApiError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') ? 'invalid' : 'confirm_error');
    }
  };

  if (state === 'checking') return <p role="status">Checking this email link…</p>;
  if (state === 'invalid') {
    return <p role="status">This email link is invalid or has expired. You can close this page.</p>;
  }
  if (state === 'unavailable') {
    return (
      <div className="flex max-w-prose flex-col items-start gap-4">
        <Banner variant="warning" live>We couldn&apos;t check this link right now.</Banner>
        <Button variant="secondary" onClick={() => void validate()}>Try again</Button>
      </div>
    );
  }
  if (state === 'confirmed') {
    return <p role="status">You have been unsubscribed from email updates.</p>;
  }
  return (
    <div className="flex max-w-prose flex-col items-start gap-4">
      {state === 'confirm_error' ? (
        <Banner variant="warning" live>We couldn&apos;t update your email preferences. Please try again.</Banner>
      ) : (
        <p>Would you like to stop receiving Stimpy email updates?</p>
      )}
      <Button variant="cta" loading={state === 'confirming'} disabled={state === 'confirming'} onClick={() => void confirm()}>
        {state === 'confirming' ? 'Unsubscribing…' : 'Unsubscribe from emails'}
      </Button>
    </div>
  );
}
