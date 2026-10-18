'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { DeliveryFees } from '@stimpy/api-client';
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  ErrorSummary,
  FormField,
  Input,
  Select,
  Skeleton,
  SkeletonGroup,
  Textarea,
  TextLink,
  focusFirstInvalid,
  formatCents,
  useOptionalToast,
  type ErrorSummaryItem,
} from '@stimpy/ui';
import { ShoppingBag } from '@/components/icons';
import { StickyBarOffset } from '@/components/layout/FloatingWhatsAppGate';
import { SupportLine } from '@/components/SupportLine';
import { cartStore, useCart } from '@/features/cart/store';
import { EditLineModal } from '@/features/cart/EditLineModal';
import { cartLinesFingerprint, hasUnavailable } from '@/features/cart/helpers';
import { validateCart } from '@/features/cart/validate-cart';
import { lastOrderNumber, saveOrderHandoff, thanksPath } from '@/features/order/handoff';
import { browserApi } from '@/lib/api-browser';
import { track } from '@/lib/track';
import { useSecondsCountdown } from '@/lib/useSecondsCountdown';
import { NotPurchasableDialog, PriceChangedDialog, SoldOutDialog } from './dialogs';
import { clearDraft, loadDraft, saveDraft } from './draft';
import {
  EMPTY_VALUES,
  FIELD_ID,
  FIELD_PATHS,
  LIMITS,
  OTHER_AREA,
  areaIdFor,
  mapServerFields,
  validateCheckout,
  type CheckoutValues,
  type FieldErrors,
  type FieldPath,
} from './form';
import { DUPLICATE_STIMPIE_TEXT, applyPurchaseProblems, applyStockProblems, cartFieldIndices, duplicateStimpieLines, markCheckLines } from './outcome';
import { OrderSummary } from './OrderSummary';
import { checkoutValuesFromPayload, clearAttempt, readPendingAttempt } from './payload';
import { submitOrder, submitSignature, type PendingAttempt, type SubmitOutcome } from './submit';
import { displayTotals } from './totals';

type FeesState = { status: 'loading' } | { status: 'ready'; fees: DeliveryFees } | { status: 'error' };

type Dialog =
  | { kind: 'sold_out'; problems: Extract<SubmitOutcome, { type: 'sold_out' }>['problems'] }
  | { kind: 'not_purchasable'; problems: Extract<SubmitOutcome, { type: 'not_purchasable' }>['problems'] }
  | { kind: 'price_changed'; oldTotalCents: number | null; newTotalCents: number }
  | null;

interface UnknownState {
  network: boolean;
  message: string | null;
  requestId: string | null;
}

const SLOW_MS = 8000;

/** Counter "{n}/300" once the text passes 80% of the limit. */
function Counter({ length, max }: { length: number; max: number }) {
  if (length < max * 0.8) return null;
  return (
    <p className="text-right text-caption tabular-nums text-fg-muted" data-testid="char-counter">
      {length}/{max}
    </p>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const toast = useOptionalToast();
  const hydrated = useCart((s) => s.hydrated);
  const lines = useCart((s) => s.lines);
  const validation = useCart((s) => s.validation);

  const [values, setValues] = useState<CheckoutValues>(EMPTY_VALUES);
  const [draftReady, setDraftReady] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<FieldPath>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [extraErrors, setExtraErrors] = useState<string[]>([]);
  const [focusSeq, setFocusSeq] = useState(0);

  const [feesState, setFeesState] = useState<FeesState>({ status: 'loading' });
  const [feesAttempt, setFeesAttempt] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmTotal, setConfirmTotal] = useState<number | null>(null);
  const [offlineMsg, setOfflineMsg] = useState(false);
  const [cartBanner, setCartBanner] = useState<string | null>(null);
  const [genericError, setGenericError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [unknown, setUnknown] = useState<UnknownState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rate = useSecondsCountdown();

  const lockRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hpRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLInputElement>(null);
  const focusWhatsapp = useRef(false);
  const pendingRef = useRef<PendingAttempt | null>(null);
  const trackedStart = useRef(false);
  const firstValidate = useRef(true);

  const fees = feesState.status === 'ready' ? feesState.fees : null;
  const areasAvailable = feesState.status === 'ready';
  const areaId = areaIdFor(values, fees);
  const blocked = hasUnavailable(lines);
  const totals = useMemo(() => displayTotals({ lines, validation, values, fees }), [lines, validation, values, fees]);

  /* ------------------------------------------------------------------ draft (restore, then save) */

  useEffect(() => {
    const draft = loadDraft();
    if (draft) setValues(draft);
    else {
      const pending = readPendingAttempt();
      if (pending) setValues(checkoutValuesFromPayload(pending.body));
    }
    setDraftReady(true);
  }, []);

  // Recover an accepted-but-unconfirmed order after reload. The exact body/key live in sessionStorage until a
  // success or definitive response; only offer replay if the restored form and cart still match their snapshot.
  useEffect(() => {
    if (!draftReady || !hydrated) return;
    const pending = readPendingAttempt();
    if (!pending) return;
    const signature = submitSignature(values, cartStore, hpRef.current?.value ?? '');
    if (pending.signature !== signature) {
      clearAttempt();
      return;
    }
    pendingRef.current = pending;
    setUnknown({ network: true, message: null, requestId: null });
  }, [draftReady, hydrated]);

  useEffect(() => {
    if (!draftReady || redirecting) return;
    const id = window.setTimeout(() => saveDraft(values), 250);
    return () => window.clearTimeout(id);
  }, [values, draftReady, redirecting]);

  /* ------------------------------------------------------------------------------- delivery fees */

  useEffect(() => {
    let cancelled = false;
    setFeesState({ status: 'loading' });
    browserApi()
      .GET('/api/v1/delivery/fees', { cache: 'no-store' })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) throw new Error('empty');
        setFeesState({ status: 'ready', fees: data });
        // A restored draft may name an area that no longer exists.
        setValues((v) => (v.areaChoice !== '' && v.areaChoice !== OTHER_AREA && !data.areas.some((a) => String(a.id) === v.areaChoice) ? { ...v, areaChoice: '' } : v));
      })
      .catch(() => {
        if (!cancelled) setFeesState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [feesAttempt]);

  /* -------------------------------------------------------- cart validation (mount, qty, area) */

  const signature = cartLinesFingerprint(lines);
  useEffect(() => {
    if (!hydrated || lines.length === 0 || redirecting || feesState.status === 'loading') return;
    let cancelled = false;
    const delay = firstValidate.current ? 0 : 500;
    firstValidate.current = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        await validateCart({ client: browserApi(), areaId, force: true, onToast: (m) => toast?.info(m) });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature stands for the line list
  }, [hydrated, signature, areaId, feesState.status, redirecting]);

  useEffect(() => {
    if (hydrated && lines.length > 0 && !trackedStart.current) {
      trackedStart.current = true;
      track('checkout_start', { items_count: lines.reduce((n, l) => n + l.item.qty, 0), value_cents: totals.totalCents });
    }
  }, [hydrated, lines, totals.totalCents]);

  /* ----------------------------------------------------------- offline, unload, slow submit */

  useEffect(() => {
    const online = () => setOfflineMsg(false);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  useEffect(() => {
    if (!submitting) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_MS);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('beforeunload', warn);
    };
  }, [submitting]);

  /* ------------------------------------------------------------------------------ focus helpers */

  useEffect(() => {
    if (focusSeq === 0) return;
    const id = window.requestAnimationFrame(() => {
      if (formRef.current) focusFirstInvalid(formRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusSeq]);

  useEffect(() => {
    if (!values.whatsappSame && focusWhatsapp.current) {
      focusWhatsapp.current = false;
      whatsappRef.current?.focus();
    }
  }, [values.whatsappSame]);

  /* ------------------------------------------------------------------------------------ errors */

  const clientErrors = useMemo(() => validateCheckout(values, { areasAvailable }), [values, areasAvailable]);

  /** The error shown under a field: the server's (until the field changes), else the client's once touched/submitted. */
  const errorFor = (path: FieldPath): string | null => {
    const server = serverErrors[path];
    if (server) return server;
    if (submitted || touched.has(path)) return clientErrors[path] ?? null;
    return null;
  };

  const summaryItems: ErrorSummaryItem[] = useMemo(() => {
    const items: ErrorSummaryItem[] = [];
    for (const path of FIELD_PATHS) {
      const message = serverErrors[path] ?? (submitted ? clientErrors[path] : undefined);
      if (message) items.push({ fieldId: FIELD_ID[path], message });
    }
    for (const message of extraErrors) items.push({ message });
    return items;
  }, [serverErrors, clientErrors, submitted, extraErrors]);

  const touch = (path: FieldPath) => setTouched((prev) => (prev.has(path) ? prev : new Set([...prev, path])));

  const setField = <K extends keyof CheckoutValues>(key: K, value: CheckoutValues[K], paths: FieldPath[]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Editing a field clears its server error; client validation is live once touched.
    if (paths.some((p) => serverErrors[p])) {
      setServerErrors((prev) => {
        const next = { ...prev };
        for (const p of paths) delete next[p];
        return next;
      });
    }
    // Any edit invalidates "the same payload": a retry must rebuild the body (new key).
    pendingRef.current = null;
    clearAttempt();
    setUnknown(null);
  };

  const blurValidate = (path: FieldPath) => () => touch(path);

  /* ------------------------------------------------------------------------------------ submit */

  const revalidate = useCallback(async () => {
    await validateCart({ client: browserApi(), areaId, force: true, onToast: (m) => toast?.info(m) });
  }, [areaId, toast]);

  const resetNotices = () => {
    setGenericError(null);
    setUnknown(null);
    setCartBanner(null);
    setOfflineMsg(false);
    setExtraErrors([]);
  };

  const handleOutcome = async (outcome: SubmitOutcome) => {
    switch (outcome.type) {
      case 'success': {
        const { placed } = outcome;
        // Order is placed: hand over, THEN clear (the cart is cleared only after a success response).
        saveOrderHandoff(placed);
        track('order_placed', {
          value_cents: placed.order.totalCents,
          delivery_fee_cents: placed.order.deliveryFeeCents,
          items_count: placed.order.items.reduce((n, i) => n + i.qty, 0),
          has_pack: placed.order.items.some((i) => i.kind === 'PACK'),
          retry_count: 0,
        });
        pendingRef.current = null;
        clearDraft();
        clearAttempt();
        setRedirecting(true);
        cartStore.getState().clear();
        router.replace(thanksPath(placed.order.number));
        return;
      }
      case 'empty':
        return;
      case 'offline':
        setOfflineMsg(true);
        return;
      case 'blocked':
        track('order_failed', { code: 'NOT_PURCHASABLE' });
        setCartBanner(
          outcome.reason === 'UNAVAILABLE'
            ? 'Some items in your order are not available. Remove or replace them to continue.'
            : 'We updated your order. Please review it, then place your order again.',
        );
        return;
      case 'price_changed':
        track('order_failed', { code: 'PRICE_CHANGED' });
        pendingRef.current = null;
        setDialog({ kind: 'price_changed', oldTotalCents: outcome.oldTotalCents, newTotalCents: outcome.newTotalCents });
        if (outcome.source === 'server') await revalidate();
        return;
      case 'validation': {
        track('order_failed', { code: 'VALIDATION_ERROR' });
        pendingRef.current = null;
        const { form, cart, other } = mapServerFields(outcome.fields);
        // `customer.whatsapp` while "same as phone" is ticked: reveal the field by unticking the box.
        if (form['customer.whatsapp'] && values.whatsappSame) {
          setValues((v) => ({ ...v, whatsappSame: false, whatsapp: v.phone }));
        }
        // Area errors land on the control that is visible.
        if (form['delivery.areaName'] && areasAvailable && values.areaChoice !== OTHER_AREA) {
          form['delivery.areaId'] = form['delivery.areaName'];
          delete form['delivery.areaName'];
        }
        setServerErrors(form);
                const lineIdx = cartFieldIndices(cart);
        if (lineIdx.length > 0) {
          const dupes = duplicateStimpieLines(cart);
          const current = cartStore.getState().lines;
          const flagged = markCheckLines(current, lineIdx, 'Please check this item.');
          const withDupes = dupes.length > 0 ? markCheckLines(flagged, dupes, DUPLICATE_STIMPIE_TEXT) : flagged;
          cartStore.getState().applyChecks(withDupes, cartStore.getState().validation);
          await revalidate();
        }
        if (cart.items) setCartBanner(cart.items);
        if (outcome.fields.expectedTotalCents !== undefined) await revalidate();
        // , an unknown key: a generic banner, no field (the reason is never revealed).
        const unknownKeys = other.filter(
          (k) => k !== 'expectedTotalCents' && k !== 'attribution' && !k.startsWith('attribution.') && k !== 'firstTouch' && !k.startsWith('firstTouch.'),
        );
        if (unknownKeys.length > 0) setGenericError({ message: GENERIC_FIELD_COPY, requestId: outcome.requestId });
        setExtraErrors([]);
        setSubmitted(true);
        setFocusSeq((n) => n + 1);
        return;
      }
      case 'generic':
        track('order_failed', { code: 'VALIDATION_ERROR' });
        pendingRef.current = null;
        setGenericError({ message: outcome.message, requestId: outcome.requestId });
        return;
      case 'sold_out': {
        track('order_failed', { code: 'SOLD_OUT' });
        pendingRef.current = null;
        const updated = applyStockProblems(cartStore.getState().lines, outcome.problems);
        cartStore.getState().applyChecks(updated, null);
        setDialog({ kind: 'sold_out', problems: outcome.problems });
        await revalidate();
        return;
      }
      case 'not_purchasable': {
        track('order_failed', { code: 'NOT_PURCHASABLE' });
        pendingRef.current = null;
        const updated = applyPurchaseProblems(cartStore.getState().lines, outcome.problems);
        cartStore.getState().applyChecks(updated, null);
        setDialog({ kind: 'not_purchasable', problems: outcome.problems });
        await revalidate();
        return;
      }
      case 'rate_limited':
        track('order_failed', { code: 'RATE_LIMITED' });
        rate.start(outcome.retryAfterSeconds);
        return;
      case 'unknown_outcome':
        track('order_failed', { code: outcome.network ? 'NETWORK' : 'INTERNAL' });
        pendingRef.current = outcome.pending;
        setUnknown({ network: outcome.network, message: outcome.message, requestId: outcome.requestId });
        return;
    }
  };

  const doSubmit = async () => {
    // The lock is taken synchronously, before any await: two taps in the same frame cannot both pass.
    if (lockRef.current) return;
    lockRef.current = true;
    setSubmitting(true);
    try {
      resetNotices();
      const errors = validateCheckout(values, { areasAvailable });
      setSubmitted(true);
      const failed = Object.keys(errors) as FieldPath[];
      if (failed.length > 0) {
        for (const f of failed) track('checkout_field_error', { field: f });
        setFocusSeq((n) => n + 1);
        return;
      }
      track('checkout_submit', { items_count: lines.reduce((n, l) => n + l.item.qty, 0), value_cents: totals.totalCents, area_set: areaId !== null });
      const outcome = await submitOrder({
        client: browserApi(),
        values,
        fees,
        hp: hpRef.current?.value ?? '',
        // With the fee unknown (fees endpoint down, no validation yet) the shown total is not a promise: let the server decide.
        displayedTotalCents: totals.feeCents === null ? null : totals.totalCents,
        pending: pendingRef.current,
        onToast: (m) => toast?.info(m),
      });
      await handleOutcome(outcome);
    } finally {
      lockRef.current = false;
      setSubmitting(false);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doSubmit();
  };

  /* ------------------------------------------------------------------------------------ render */

  if (!hydrated) {
    return (
      <SkeletonGroup label="Loading your cart">
        <Skeleton variant="rect" className="h-40" />
      </SkeletonGroup>
    );
  }

  if (redirecting) {
    return (
      <p role="status" className="text-lead text-fg-muted" data-testid="redirecting">
        Order placed. Taking you to your confirmation...
      </p>
    );
  }

  if (lines.length === 0) {
    const recent = lastOrderNumber();
    return (
      <EmptyState
        icon={<ShoppingBag width={32} height={32} />}
        title="Your cart is empty"
        text="Add a hoodie and a Stimpie or two, then come back to check out."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              <Button href="/shop" variant="dark">
                Shop
              </Button>
              <Button href="/builder" variant="secondary">
                Try the Builder
              </Button>
            </div>
            {recent ? (
              <TextLink href={thanksPath(recent)} data-testid="recent-order-link">
                View your last order ({recent})
              </TextLink>
            ) : null}
          </div>
        }
      />
    );
  }

  const rateWaiting = rate.remaining > 0;
  const buttonLabel = submitting
    ? 'Placing order...'
    : rateWaiting
      ? `Try again in ${rate.remaining}s`
      : confirmTotal !== null
        ? `Place order for ${formatCents(confirmTotal)}`
        : 'Place order';
  const buttonDisabled = blocked || rateWaiting;
  const readOnly = submitting;

  const placeButton = (size: 'md' | 'lg', fullWidth: boolean, extra?: string) => (
    <Button
      type="submit"
      variant="cta"
      size={size}
      fullWidth={fullWidth}
      loading={submitting}
      disabled={buttonDisabled}
      aria-busy={submitting || undefined}
      data-testid={extra}
    >
      {buttonLabel}
    </Button>
  );

  const showWhatsappField = !values.whatsappSame;
  const areaIsText = !areasAvailable || values.areaChoice === OTHER_AREA;

  return (
    <form ref={formRef} onSubmit={onFormSubmit} noValidate aria-busy={submitting || undefined} className="store-checkout-form pb-28 lg:pb-0" data-testid="checkout-form">
      <StickyBarOffset px={88} />
      {/* Honeypot (2.5): off-screen, not display:none; a different DOM name so autofill leaves it alone. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Leave this empty
          <input ref={hpRef} type="text" name="website_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
        <div className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          <OrderSummary lines={lines} totals={totals} checking={checking} onEdit={setEditingId} />
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
          <div className="flex flex-col gap-4" aria-live="polite">
            {summaryItems.length > 0 ? <ErrorSummary errors={summaryItems} title="Please fix the following" data-testid="error-summary" /> : null}
            {cartBanner ? <Banner variant="error" data-testid="cart-banner">{cartBanner}</Banner> : null}
            {offlineMsg ? (
              <Banner variant="warning" live data-testid="offline-message">
                You&apos;re offline. Connect to place your order. Your details are kept.
              </Banner>
            ) : null}
            {genericError ? (
              <Banner variant="error" data-testid="generic-error">
                {genericError.message}
                <SupportLine requestId={genericError.requestId} />
              </Banner>
            ) : null}
            {rateWaiting ? (
              <Banner variant="warning" data-testid="rate-limit-banner">
                <span className="sr-only" role="status">
                  You&apos;re doing that too fast.
                </span>
                <span aria-hidden="true">
                  You&apos;re doing that too fast. Try again in <span data-testid="rate-countdown">{rate.remaining}</span> seconds.
                </span>
              </Banner>
            ) : null}
            {unknown ? (
              <div role="alert" className="rounded-lg border-2 border-danger p-4" data-testid="network-panel">
                <h2 className="text-h4 text-fg">We couldn&apos;t confirm your order</h2>
                {unknown.network ? null : <p className="mt-1 text-body text-fg">{unknown.message ?? 'Something went wrong on our side.'}</p>}
                <p className="mt-1 text-body text-fg">
                  Your cart is safe. Tap Retry. You won&apos;t be charged twice and we won&apos;t create a duplicate.
                </p>
                <SupportLine requestId={unknown.requestId} />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="dark" onClick={() => void doSubmit()} loading={submitting}>
                    Retry
                  </Button>
                </div>
                <p className="mt-3 text-body-sm text-fg-muted">
                  Already got an email from us? Then your order went through.{' '}
                  <TextLink href="/track">Track it with your phone number</TextLink>
                </p>
              </div>
            ) : null}
          </div>

          <section aria-labelledby="details-heading" className="flex flex-col gap-4">
            <h2 id="details-heading" className="text-h3 text-fg">
              Your details
            </h2>
            <FormField label="Full name" name="customer.name" required error={errorFor('customer.name')}>
              <Input
                name="customer.name"
                type="text"
                autoComplete="name"
                maxLength={LIMITS.nameMax}
                value={values.name}
                readOnly={readOnly}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('name', e.target.value, ['customer.name'])}
                onBlur={blurValidate('customer.name')}
              />
            </FormField>
            <FormField label="Email" name="customer.email" required error={errorFor('customer.email')} hint="We'll email you updates about this order.">
              <Input
                name="customer.email"
                type="email"
                inputMode="email"
                autoComplete="email"
                maxLength={LIMITS.emailMax}
                value={values.email}
                readOnly={readOnly}
                onChange={(e) => setField('email', e.target.value, ['customer.email'])}
                onBlur={blurValidate('customer.email')}
              />
            </FormField>
            <FormField label="Phone" name="customer.phone" required error={errorFor('customer.phone')}>
              <Input
                name="customer.phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="03 123 456"
                value={values.phone}
                readOnly={readOnly}
                onChange={(e) => setField('phone', e.target.value, ['customer.phone'])}
                onBlur={blurValidate('customer.phone')}
              />
            </FormField>
            <div className="flex flex-col gap-2">
              <Checkbox
                name="customer.whatsappSameAsPhone"
                autoComplete="off"
                label="WhatsApp is the same as my phone number"
                checked={values.whatsappSame}
                disabled={readOnly}
                onChange={(e) => {
                  const same = e.target.checked;
                  if (!same) focusWhatsapp.current = true;
                  // Unticking pre-fills the phone; re-ticking discards the typed WhatsApp value.
                  setValues((v) => ({ ...v, whatsappSame: same, whatsapp: same ? '' : v.phone }));
                  setServerErrors((prev) => {
                    const { 'customer.whatsapp': _gone, ...rest } = prev;
                    void _gone;
                    return rest;
                  });
                  pendingRef.current = null;
                  clearAttempt();
                  setUnknown(null);
                }}
              />
              {values.whatsappSame ? (
                <p className="text-body-sm text-fg-muted" data-testid="whatsapp-hint">
                  {values.phone.trim() ? `We'll use ${values.phone.trim()} on WhatsApp.` : "We'll use your phone number on WhatsApp."}
                </p>
              ) : null}
            </div>
            {showWhatsappField ? (
              <FormField label="WhatsApp number" name="customer.whatsapp" required error={errorFor('customer.whatsapp')}>
                <Input
                  ref={whatsappRef}
                  name="customer.whatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={values.whatsapp}
                  readOnly={readOnly}
                  onChange={(e) => setField('whatsapp', e.target.value, ['customer.whatsapp'])}
                  onBlur={blurValidate('customer.whatsapp')}
                />
              </FormField>
            ) : null}
            <p className="text-body-sm text-fg-muted">We&apos;ll email you updates about this order and may contact you on WhatsApp about it.</p>
          </section>

          <section aria-labelledby="delivery-heading" className="flex flex-col gap-4">
            <h2 id="delivery-heading" className="text-h3 text-fg">
              Delivery
            </h2>
            {feesState.status === 'error' ? (
              <Banner
                variant="warning"
                live
                data-testid="fees-error"
                action={
                  <Button variant="secondary" size="sm" onClick={() => setFeesAttempt((n) => n + 1)}>
                    Retry
                  </Button>
                }
              >
                We couldn&apos;t load delivery areas. Type your area below and we&apos;ll confirm the delivery fee on WhatsApp.
              </Banner>
            ) : null}
            {areasAvailable && fees ? (
              <FormField label="Area" name="delivery.areaId" required error={errorFor('delivery.areaId')}>
                <Select
                  name="delivery.areaId"
                  autoComplete="address-level2"
                  value={values.areaChoice}
                  disabled={readOnly}
                  placeholder="Choose your area"
                  onChange={(e) => {
                    setField('areaChoice', e.target.value, ['delivery.areaId', 'delivery.areaName']);
                    touch('delivery.areaId');
                    setConfirmTotal(null);
                  }}
                  onBlur={blurValidate('delivery.areaId')}
                >
                  {fees.areas.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
                  <option value={OTHER_AREA}>Other (type it below)</option>
                </Select>
              </FormField>
            ) : null}
            {areaIsText ? (
              <FormField label={areasAvailable ? 'Your area or town' : 'Area or town'} name="delivery.areaName" required error={errorFor('delivery.areaName')}>
                <Input
                  name="delivery.areaName"
                  type="text"
                  autoComplete="address-level2"
                  maxLength={LIMITS.areaNameMax}
                  value={values.areaOther}
                  readOnly={readOnly}
                  onChange={(e) => setField('areaOther', e.target.value, ['delivery.areaName'])}
                  onBlur={blurValidate('delivery.areaName')}
                />
              </FormField>
            ) : null}
            <FormField label="Address" name="delivery.address" required error={errorFor('delivery.address')}>
              {(a11y) => (
                <>
                  <Textarea
                    {...a11y}
                    invalid={!!a11y['aria-invalid']}
                    name="delivery.address"
                    rows={3}
                    autoComplete="street-address"
                    maxLength={LIMITS.addressMax}
                    value={values.address}
                    readOnly={readOnly}
                    onChange={(e) => setField('address', e.target.value, ['delivery.address'])}
                    onBlur={blurValidate('delivery.address')}
                  />
                  <Counter length={values.address.length} max={LIMITS.addressMax} />
                </>
              )}
            </FormField>
            <FormField label="Notes" name="delivery.notes" optional error={errorFor('delivery.notes')}>
              {(a11y) => (
                <>
                  <Textarea
                    {...a11y}
                    invalid={!!a11y['aria-invalid']}
                    name="delivery.notes"
                    rows={2}
                    autoComplete="off"
                    maxLength={LIMITS.notesMax}
                    value={values.notes}
                    readOnly={readOnly}
                    onChange={(e) => setField('notes', e.target.value, ['delivery.notes'])}
                    onBlur={blurValidate('delivery.notes')}
                  />
                  <Counter length={values.notes.length} max={LIMITS.notesMax} />
                </>
              )}
            </FormField>
          </section>

          <section aria-labelledby="payment-heading" className="flex flex-col gap-2">
            <h2 id="payment-heading" className="text-h3 text-fg">
              Payment
            </h2>
            <p className="text-body text-fg">Cash on delivery. You pay in cash when your order arrives. No card needed.</p>
          </section>

          <div className="hidden flex-col gap-3 lg:flex">
            {blocked ? (
              <p className="text-body-sm text-fg-muted" data-testid="submit-blocked">
                Remove or replace the unavailable items to place your order.
              </p>
            ) : null}
            {slow ? (
              <p role="status" className="text-body-sm text-fg-muted" data-testid="still-working">
                Still working. Please don&apos;t close this page.
              </p>
            ) : null}
            {placeButton('lg', false, 'place-order-desktop')}
          </div>
        </div>
      </div>

      {/* Sticky bottom bar (phones and tablets): the total and Place order. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-base bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-float lg:hidden" data-testid="sticky-bar">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <div className="min-w-0">
            <p className="text-caption text-fg-muted">{totals.estimated ? 'Estimated total' : 'Total'}</p>
            <p className="text-price-md font-bold tabular-nums text-fg" data-testid="sticky-total">
              {formatCents(totals.totalCents)}
            </p>
            {blocked ? <p className="truncate text-caption text-fg-muted">Remove unavailable items first</p> : null}
            {slow ? (
              <p role="status" className="truncate text-caption text-fg-muted" data-testid="still-working-mobile">
                Still working. Please don&apos;t close this page.
              </p>
            ) : null}
          </div>
          <div className="ml-auto">{placeButton('lg', false, 'place-order-mobile')}</div>
        </div>
      </div>

      <SoldOutDialog
        open={dialog?.kind === 'sold_out'}
        problems={dialog?.kind === 'sold_out' ? dialog.problems : []}
        lines={lines}
        onClose={() => setDialog(null)}
        onCartChanged={() => void revalidate()}
      />
      <NotPurchasableDialog open={dialog?.kind === 'not_purchasable'} problems={dialog?.kind === 'not_purchasable' ? dialog.problems : []} onClose={() => setDialog(null)} />
      <PriceChangedDialog
        open={dialog?.kind === 'price_changed'}
        oldTotalCents={dialog?.kind === 'price_changed' ? dialog.oldTotalCents : null}
        newTotalCents={dialog?.kind === 'price_changed' ? dialog.newTotalCents : 0}
        onReview={() => {
          if (dialog?.kind === 'price_changed') setConfirmTotal(dialog.newTotalCents);
          setDialog(null);
        }}
        onConfirm={() => {
          setDialog(null);
          setConfirmTotal(null);
          void doSubmit();
        }}
      />
      <EditLineModal lineId={editingId} onClose={() => setEditingId(null)} />
    </form>
  );
}

const GENERIC_FIELD_COPY = 'Something went wrong. Please try again.';

