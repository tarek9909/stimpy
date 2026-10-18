'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { isApiError, type Content, type TrackedOrder } from '@stimpy/api-client';
import {
  Banner,
  Button,
  CopyButton,
  FormField,
  Input,
  StatusTimeline,
  TextLink,
  WhatsAppButton,
  focusFirstInvalid,
  formatDateTime,
  formatCents,
} from '@stimpy/ui';
import { SupportLine } from '@/components/SupportLine';
import { lastOrderNumber } from '@/features/order/handoff';
import { TotalsBlock } from '@/features/order/ThanksView';
import { browserApi } from '@/lib/api-browser';
import { rateLimitMessage } from '@/lib/errors';
import { track } from '@/lib/track';
import { useSecondsCountdown } from '@/lib/useSecondsCountdown';
import { LostNumber } from './LostNumber';
import { TRACK_NETWORK, TRACK_NOT_FOUND, isOpenOrder, isTerminal, orderFromQuery, validateTrackForm, visibleSteps, type TrackFormErrors } from './logic';

type Business = Content['business'] | null;

type Problem =
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'network'; requestId: string | null }
  | null;

export function TrackView({ business }: { business: Business }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<TrackFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [result, setResult] = useState<TrackedOrder | null>(null);
  const rate = useSecondsCountdown();
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [focusResult, setFocusResult] = useState(0);
  const [focusErrors, setFocusErrors] = useState(0);

  // Prefill: `?order=` (the tracking link in emails and on the confirmation page), else this tab's last order.
  useEffect(() => {
    const fromUrl = orderFromQuery(window.location.search);
    setOrderNumber(fromUrl || lastOrderNumber() || '');
  }, []);

  useEffect(() => {
    if (focusResult > 0) resultRef.current?.focus({ preventScroll: false });
  }, [focusResult]);

  useEffect(() => {
    if (focusErrors === 0) return;
    const id = window.requestAnimationFrame(() => {
      if (formRef.current) focusFirstInvalid(formRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusErrors]);

  const lookup = useCallback(
    async (values: { orderNumber: string; phone: string }) => {
      if (lock.current) return;
      lock.current = true;
      setLoading(true);
      setProblem(null);
      try {
        const { data } = await browserApi().POST('/api/v1/orders/track', {
          body: { orderNumber: values.orderNumber.trim(), phone: values.phone.trim() },
          cache: 'no-store',
        });
        if (!data) throw new Error('empty');
        setResult(data);
        track('order_track', { result: 'found' });
        setFocusResult((n) => n + 1);
      } catch (error) {
        setResult(null);
        if (isApiError(error)) {
          if (error.code === 'NOT_FOUND') {
            // Unknown number and wrong phone are deliberately the same message.
            track('order_track', { result: 'not_found' });
            setProblem({ kind: 'not_found' });
            return;
          }
          if (error.code === 'VALIDATION_ERROR' && error.fields) {
            const next: TrackFormErrors = {};
            if (error.fields.orderNumber) next.orderNumber = error.fields.orderNumber;
            if (error.fields.phone) next.phone = error.fields.phone;
            if (next.orderNumber || next.phone) {
              setErrors(next);
              setFocusErrors((n) => n + 1);
              return;
            }
          }
          if (error.code === 'RATE_LIMITED') {
            const seconds = error.retryAfterSeconds ?? 10;
            rate.start(seconds);
            setProblem({ kind: 'rate_limited', message: rateLimitMessage(seconds) });
            return;
          }
          track('order_track', { result: 'error' });
          setProblem({ kind: 'network', requestId: error.status >= 500 ? error.requestId : null });
          return;
        }
        track('order_track', { result: 'error' });
        setProblem({ kind: 'network', requestId: null });
      } finally {
        lock.current = false;
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rate.start` is stable
    [],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const next = validateTrackForm({ orderNumber, phone });
    setErrors(next);
    if (next.orderNumber || next.phone) {
      setFocusErrors((n) => n + 1);
      return;
    }
    void lookup({ orderNumber, phone });
  };

  const reset = () => {
    setResult(null);
    setProblem(null);
    setErrors({});
    setOrderNumber('');
    setPhone('');
  };

  const waiting = rate.remaining > 0;
  const showForm = result === null;

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8">
      {showForm ? <p className="text-lead text-fg-muted">Enter your order number and the phone number you ordered with.</p> : null}

      {showForm ? (
        <>
          <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="track-form" aria-busy={loading || undefined}>
            <FormField label="Order number" name="orderNumber" required error={errors.orderNumber ?? null} hint="Like STP-1042. Just the number works too.">
              <Input
                name="orderNumber"
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={orderNumber}
                readOnly={loading}
                onChange={(e) => {
                  setOrderNumber(e.target.value);
                  if (errors.orderNumber) setErrors((p) => ({ ...p, orderNumber: undefined }));
                }}
              />
            </FormField>
            <FormField label="Phone" name="phone" required error={errors.phone ?? null}>
              <Input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="03 123 456"
                value={phone}
                readOnly={loading}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                }}
              />
            </FormField>

            <div aria-live="polite" className="flex flex-col gap-3">
              {problem?.kind === 'not_found' ? (
                <Banner variant="error" data-testid="track-not-found">
                  {TRACK_NOT_FOUND}
                  {whatsappContact(business)}
                </Banner>
              ) : null}
              {problem?.kind === 'rate_limited' ? (
                <Banner variant="warning" data-testid="track-rate-limited">
                  {waiting ? `Too many tries. Please wait ${rate.remaining} seconds.` : 'You can try again now.'}
                </Banner>
              ) : null}
              {problem?.kind === 'network' ? (
                <Banner variant="error" data-testid="track-network" action={<Button variant="secondary" size="sm" onClick={() => void lookup({ orderNumber, phone })}>Retry</Button>}>
                  {TRACK_NETWORK}
                  <SupportLine requestId={problem.requestId} />
                </Banner>
              ) : null}
            </div>

            <div>
              <Button type="submit" variant="cta" size="lg" loading={loading} disabled={waiting} data-testid="track-submit">
                {loading ? 'Looking...' : waiting ? `Try again in ${rate.remaining}s` : 'Track order'}
              </Button>
            </div>
          </form>
          <LostNumber />
        </>
      ) : null}

      {result ? (
        <div ref={resultRef} tabIndex={-1} aria-live="polite" className="flex flex-col gap-8 outline-none" data-testid="track-result">
          <TrackResult order={result} business={business} />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Button variant="secondary" loading={loading} disabled={waiting} onClick={() => void lookup({ orderNumber: result.number, phone })} data-testid="track-refresh">
              {waiting ? `Refresh in ${rate.remaining}s` : 'Refresh'}
            </Button>
            <button type="button" onClick={reset} className="min-h-11 text-body font-medium text-fg underline underline-offset-4" data-testid="track-another">
              Track another order
            </button>
          </div>
          {problem?.kind === 'rate_limited' ? <p className="text-body-sm text-fg-muted">{waiting ? `Too many tries. Please wait ${rate.remaining} seconds.` : ''}</p> : null}
          {problem?.kind === 'network' ? <p className="text-body-sm text-fg-muted">{TRACK_NETWORK}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function whatsappContact(business: Business) {
  if (!business?.whatsappNumber) return null;
  return (
    <p className="mt-2">
      <WhatsAppButton number={business.whatsappNumber} text="Hi Stimpy, I can't find my order" label="Ask us on WhatsApp" variant="secondary" size="sm" />
    </p>
  );
}

function TrackResult({ order, business }: { order: TrackedOrder; business: Business }) {
  const terminal = isTerminal(order.status);
  const open = isOpenOrder(order.status);
  const steps = visibleSteps(order);
  return (
    <>
      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-fg" data-testid="track-heading">
          Hi {order.customerName}, here&apos;s order {order.number}
        </h2>
        <p className="text-body text-fg-muted" data-testid="track-placed">
          Placed {formatDateTime(order.placedAt, { timeZone: 'device' })}
        </p>
      </header>

      {terminal ? (
        <Banner variant="warning" data-testid="track-terminal">
          <span className="font-medium">{order.status === 'CANCELLED' ? 'This order was cancelled.' : 'This order was returned.'}</span>
          <span className="mt-2 block">
            <WhatsAppButton number={business?.whatsappNumber} text={`Hi Stimpy, about order ${order.number}`} label="Contact us on WhatsApp" variant="dark" size="md" />
          </span>
        </Banner>
      ) : null}

      <StatusTimeline steps={steps} timeline={order.timeline} current={order.status} timeZone="device" />

      {order.deliveryNumber !== null ? (
        <section className="rounded-lg bg-sky p-5 text-ink" aria-labelledby="delivery-number-label" data-testid="delivery-number-card">
          <p id="delivery-number-label" className="text-body-sm font-medium">
            Delivery number
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="select-all text-h2 font-bold tabular-nums" data-testid="delivery-number">
              {order.deliveryNumber}
            </p>
            <CopyButton text={order.deliveryNumber} label="Copy delivery number" variant="secondary" size="md" />
          </div>
          <p className="mt-2 text-body-sm">Your parcel is with delivery. Quote this number if the courier calls.</p>
        </section>
      ) : null}

      <section aria-labelledby="track-items-heading">
        <h2 id="track-items-heading" className="text-h3 text-fg">
          Your order
        </h2>
        <ul className="mt-2" aria-label="Items in this order">
          {order.items.map((item) => {
            const hoodieImg = (item.details as any).hoodieImage;
            const stimpieImgs: Array<{ name: string; imageUrl?: string | null }> = (item.details as any).stimpieImages ?? [];

            return (
              <li key={item.id} className="flex items-start justify-between gap-4 border-b border-base py-3 last:border-b-0" data-testid="order-item">
                <div className="flex items-center gap-3 min-w-0">
                  {hoodieImg || stimpieImgs.length > 0 ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hoodieImg ? (
                        <img src={hoodieImg} alt="Hoodie" className="h-11 w-11 rounded-md border border-line object-cover" />
                      ) : null}
                      {hoodieImg && stimpieImgs.length > 0 ? (
                        <span className="text-[10px] font-bold text-fg-muted">+</span>
                      ) : null}
                      {stimpieImgs.map((s, idx) =>
                        s.imageUrl ? (
                          <img key={idx} src={s.imageUrl} alt={s.name} className="h-11 w-8 rounded border border-line object-cover" title={s.name} />
                        ) : null,
                      )}
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-body font-medium text-fg">
                      {item.name}
                      {item.qty > 1 ? <span className="font-normal text-fg-muted"> x {item.qty}</span> : null}
                    </p>
                    <p className="text-body-sm text-fg-muted">
                      {[item.details.hoodie, item.details.color, item.details.size].filter(Boolean).join(' / ')}
                    </p>
                    {item.details.stimpies.length > 0 ? <p className="text-body-sm text-fg-muted">{item.details.stimpies.join(', ')}</p> : null}
                  </div>
                </div>
                <p className="shrink-0 tabular-nums text-body font-medium text-fg">{formatCents(item.lineTotalCents)}</p>
              </li>
            );
          })}
        </ul>
        <TotalsBlock
          subtotalCents={order.subtotalCents}
          deliveryFeeCents={order.deliveryFeeCents}
          totalCents={order.totalCents}
          note={open ? 'Pay cash at the door.' : null}
        />
      </section>

      {open ? (
        <p className="text-body text-fg" data-testid="track-estimate">
          Estimated delivery: {order.estimateText}.
        </p>
      ) : null}

      {!terminal ? (
        <div>
          <WhatsAppButton
            number={order.whatsappNumber}
            text={`Hi Stimpy, about order ${order.number}`}
            label="Contact us on WhatsApp"
            variant="secondary"
            size="md"
          />
        </div>
      ) : null}
      <TextLink href="/shop" className="self-start">
        Continue shopping
      </TextLink>
    </>
  );
}
