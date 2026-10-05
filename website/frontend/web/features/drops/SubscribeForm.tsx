'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Banner, Button, FormField, Input, SegmentedControl, cn, focusFirstInvalid } from '@stimpy/ui';
import { browserApi } from '@/lib/api-browser';
import { rateLimitMessage, toUserError } from '@/lib/errors';
import { track } from '@/lib/track';

export type ContactType = 'WHATSAPP' | 'EMAIL';

/** Client convenience checks, no stricter than the server (state-and-errors 6.1). */
export function checkContact(type: ContactType, value: string): string | null {
  const v = value.trim();
  if (!v) return type === 'WHATSAPP' ? 'Enter your WhatsApp number.' : 'Enter your email address.';
  if (type === 'EMAIL') return v.includes('@') && v.includes('.') ? null : 'Enter a valid email address.';
  return v.replace(/\D/g, '').length >= 7 ? null : 'Enter a valid WhatsApp number, e.g. 03 123 456.';
}

export interface SubscribeFormProps {
  dropId: number;
  dropSlug?: string;
  /** Visible name of the drop, used in the form's accessible name. */
  dropName: string;
  className?: string;
}

/**
 * "Notify me" (website-pages 2): WhatsApp or email, `POST /drops/{id}/subscribe` -> 204 -> "You're on the list."
 * Subscribing twice is also success (the endpoint is idempotent). Maps VALIDATION_ERROR to the contact field and
 * RATE_LIMITED to a live countdown on the button. Typed values are kept on every failure.
 */
export function SubscribeForm({ dropId, dropSlug, dropName, className }: SubscribeFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<ContactType>('WHATSAPP');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [wait, setWait] = useState(0);

  // 429: a live countdown, then the button is available again.
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  function focusInvalid() {
    requestAnimationFrame(() => focusFirstInvalid(formRef.current ?? document));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || wait > 0) return;
    setFormError(null);
    setReference(null);
    const local = checkContact(type, contact);
    setError(local);
    if (local) {
      focusInvalid();
      return;
    }
    setPending(true);
    try {
      await browserApi().POST('/api/v1/drops/{id}/subscribe', {
        params: { path: { id: dropId } },
        body: { contact: contact.trim(), type },
      });
      setDone(true);
      track('drop_subscribe', { type, drop_slug: dropSlug });
    } catch (err) {
      const mapped = toUserError(err);
      track('error_shown', { code: mapped.code, area: 'subscribe' });
      if (mapped.kind === 'validation') {
        const fieldMessage = mapped.fields?.contact ?? null;
        if (fieldMessage) setError(fieldMessage);
        else setFormError(mapped.message);
        focusInvalid();
      } else if (mapped.kind === 'rate_limited') {
        setWait(mapped.retryAfterSeconds ?? 30);
        setFormError(rateLimitMessage(mapped.retryAfterSeconds));
      } else {
        setFormError(mapped.message);
        setReference(mapped.reference);
      }
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className={cn('rounded-lg border border-base bg-surface-base p-4 text-body font-medium text-fg', className)}>
        You&apos;re on the list.
      </p>
    );
  }

  const label = type === 'WHATSAPP' ? 'WhatsApp number' : 'Email address';
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className={cn('flex flex-col gap-3', className)}
      aria-label={`Get notified about ${dropName}`}
    >
      <SegmentedControl
        aria-label="How should we reach you?"
        value={type}
        onChange={(v) => {
          setType(v === 'EMAIL' ? 'EMAIL' : 'WHATSAPP');
          setError(null);
        }}
        options={[
          { value: 'WHATSAPP', label: 'WhatsApp' },
          { value: 'EMAIL', label: 'Email' },
        ]}
        name={`subscribe-${dropId}-type`}
      />
      <FormField label={label} name={`subscribe-${dropId}-contact`} error={error}>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          type={type === 'EMAIL' ? 'email' : 'tel'}
          inputMode={type === 'EMAIL' ? 'email' : 'tel'}
          autoComplete={type === 'EMAIL' ? 'email' : 'tel'}
          placeholder={type === 'EMAIL' ? 'you@example.com' : '03 123 456'}
        />
      </FormField>
      {formError ? (
        <Banner variant="error" live>
          <span>
            {formError}
            {reference ? <span className="mt-1 block text-caption">Reference: {reference}</span> : null}
          </span>
        </Banner>
      ) : null}
      <Button type="submit" variant="dark" loading={pending} disabled={wait > 0}>
        {wait > 0 ? `Try again in ${wait}s` : 'Notify me'}
      </Button>
    </form>
  );
}
