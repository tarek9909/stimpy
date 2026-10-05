'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isApiError } from '@stimpy/api-client';
import { Banner, Button, FormField, Input } from '@stimpy/ui';
import { browserApi } from '@/lib/api-browser';
import { rateLimitMessage } from '@/lib/errors';
import { track } from '@/lib/track';
import { useSecondsCountdown } from '@/lib/useSecondsCountdown';
import { validateLostEmail } from './logic';

/**
 * "Lost your order number?" (checkout-and-order-flow 6.3). One email field; every 202 shows exactly the response
 * message, whether or not orders exist. The UI never branches, animates or times differently on the result and never
 * says "no orders found". 429 shows the generic wait message; a network failure offers a retry.
 */
export function LostNumber() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<'network' | 'rate' | null>(null);
  const rate = useSecondsCountdown();
  const lock = useRef(false);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    const invalid = validateLostEmail(email);
    setError(invalid);
    if (invalid) {
      inputRef.current?.focus();
      return;
    }
    lock.current = true;
    setLoading(true);
    setFailure(null);
    try {
      const { data } = await browserApi().POST('/api/v1/orders/find', { body: { email: email.trim() }, cache: 'no-store' });
      track('order_find_submit');
      setMessage(data?.message ?? "If we found orders for this email, we've emailed you the order numbers.");
      setOpen(false);
    } catch (err) {
      if (isApiError(err) && err.code === 'RATE_LIMITED') {
        rate.start(err.retryAfterSeconds ?? 10);
        setFailure('rate');
      } else {
        setFailure('network');
      }
    } finally {
      lock.current = false;
      setLoading(false);
    }
  };

  const waiting = rate.remaining > 0;

  return (
    <section aria-label="Lost your order number?" className="border-t border-base pt-6" data-testid="lost-number">
      {message ? (
        <p
          ref={messageRef}
          tabIndex={-1}
          role="status"
          className="rounded-lg bg-success px-4 py-3 text-body font-medium text-white outline-none"
          data-testid="lost-number-message"
        >
          {message}
        </p>
      ) : null}
      {!open && !message ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 text-body font-medium text-fg underline underline-offset-4"
          aria-expanded={false}
          data-testid="lost-number-toggle"
        >
          Lost your order number?
        </button>
      ) : null}
      {open ? (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" data-testid="lost-number-form" aria-busy={loading || undefined}>
          <h2 className="text-h4 text-fg">Lost your order number?</h2>
          <p className="text-body-sm text-fg-muted">Enter the email you ordered with and we&apos;ll email you your order numbers.</p>
          <FormField label="Email" name="lost-email" required error={error}>
            <Input
              ref={inputRef}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={190}
              value={email}
              readOnly={loading}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
            />
          </FormField>
          {failure === 'rate' ? (
            <Banner variant="warning" data-testid="lost-rate-limited">
              {waiting ? rateLimitMessage(rate.remaining) : 'You can try again now.'}
            </Banner>
          ) : null}
          {failure === 'network' ? (
            <Banner variant="error" data-testid="lost-network">
              Couldn&apos;t reach the server. Try again.
            </Banner>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="dark" loading={loading} disabled={waiting}>
              {waiting ? `Try again in ${rate.remaining}s` : 'Email me my order numbers'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
