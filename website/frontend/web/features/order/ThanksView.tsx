'use client';

import { useEffect, useRef, useState } from 'react';
import type { Content, OrderItem, PlacedOrder } from '@stimpy/api-client';
import { Button, TextLink, WhatsAppButton, copyToClipboard, formatCents, whatsappLink } from '@stimpy/ui';
import { ExternalLink, MessageCircle } from '@/components/icons';
import { track } from '@/lib/track';
import { readOrderHandoff } from './handoff';

type Business = Content['business'] | null;

/** The path part of the API's `trackUrl` (`/track?order=STP-1042`), with a safe fallback. */
export function trackPath(trackUrl: string | null | undefined, number: string): string {
  const fallback = `/track?order=${encodeURIComponent(number)}`;
  if (!trackUrl) return fallback;
  try {
    const u = new URL(trackUrl);
    return u.pathname === '/track' ? `${u.pathname}${u.search}` : fallback;
  } catch {
    return trackUrl.startsWith('/track') ? trackUrl : fallback;
  }
}

/** Copy button with its three states (5.1): "Copy", "Copied" for 2 s, and "Press and hold to copy" when blocked. */
function OrderNumberCopy({ number }: { number: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onClick = async () => {
    const ok = await copyToClipboard(number);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), ok ? 2000 : 6000);
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="secondary" size="md" onClick={onClick} data-testid="copy-order-number" aria-label={`Copy order number ${number}`}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press and hold to copy' : 'Copy'}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Order number copied' : state === 'failed' ? "Couldn't copy. Select the number and copy it." : ''}
      </span>
    </span>
  );
}

function ItemRow({ item }: { item: OrderItem }) {
  const details = [item.details.hoodie, item.details.color, item.details.size].filter(Boolean).join(' / ');
  const hoodieImg = (item.details as any).hoodieImage;
  const stimpieImgs: Array<{ name: string; imageUrl?: string | null }> = (item.details as any).stimpieImages ?? [];

  return (
    <li className="flex items-start justify-between gap-4 border-b border-base py-3 last:border-b-0" data-testid="order-item">
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
          {details ? <p className="text-body-sm text-fg-muted">{details}</p> : null}
          {item.details.stimpies.length > 0 ? <p className="text-body-sm text-fg-muted">{item.details.stimpies.join(', ')}</p> : null}
        </div>
      </div>
      <p className="shrink-0 tabular-nums text-body font-medium text-fg">{formatCents(item.lineTotalCents)}</p>
    </li>
  );
}

/** Totals block shared by the confirmation and tracking pages. Server numbers only. */
export function TotalsBlock({
  subtotalCents,
  deliveryFeeCents,
  totalCents,
  note,
}: {
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  note?: string | null;
}) {
  return (
    <dl className="mt-3 flex flex-col gap-1.5 text-body">
      <div className="flex justify-between gap-3">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd className="tabular-nums" data-testid="subtotal">
          {formatCents(subtotalCents)}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-fg-muted">Delivery</dt>
        <dd className="tabular-nums" data-testid="delivery-fee">
          {deliveryFeeCents === 0 ? 'Free delivery' : formatCents(deliveryFeeCents)}
        </dd>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-base pt-3">
        <dt className="text-h4 font-bold">Total</dt>
        <dd className="text-price-md font-bold tabular-nums" data-testid="total">
          {formatCents(totalCents)}
        </dd>
      </div>
      {note ? <p className="text-right text-body-sm text-fg-muted">{note}</p> : null}
    </dl>
  );
}

function ContactLine({ business, number }: { business: Business; number: string }) {
  const wa = whatsappLink(business?.whatsappNumber, `Hi Stimpy, I need to change the email for order ${number}`);
  const mail = business?.supportEmail ? `mailto:${business.supportEmail}?subject=${encodeURIComponent(`Order ${number}`)}` : null;
  const href = wa ?? mail;
  if (!href) return null;
  return (
    <TextLink href={href} {...(wa ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      Wrong email? Contact us
    </TextLink>
  );
}

/**
 * Order confirmation (checkout-and-order-flow 5, website-pages 4.10). Reads the `POST /orders` response that checkout
 * left in sessionStorage; with nothing stored (another tab or device, new session) it shows the reduced view and
 * sends the customer to Track. No API call in either path.
 */
export function ThanksView({ number, business }: { number: string; business: Business }) {
  const [placed, setPlaced] = useState<PlacedOrder | null | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The storage read is synchronous: one frame of skeleton, then the full or reduced view.
  useEffect(() => {
    setPlaced(readOrderHandoff(number));
  }, [number]);

  useEffect(() => {
    if (placed !== undefined) headingRef.current?.focus({ preventScroll: true });
  }, [placed]);

  if (placed === undefined) {
    return (
      <div className="mx-auto max-w-[640px]" aria-busy="true">
        <div className="h-10 w-2/3 rounded-md bg-surface" />
      </div>
    );
  }

  const trackHref = `/track?order=${encodeURIComponent(number)}`;

  if (placed === null) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-6" data-testid="thanks-reduced">
        <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-fg outline-none">
          Order {number}
        </h1>
        <p className="text-lead text-fg">We can&apos;t show the full details here. Track your order with your phone number.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button href={trackHref} variant="cta" size="lg" data-testid="track-this-order">
            Track this order
          </Button>
          <WhatsAppButton
            number={business?.whatsappNumber}
            text={`Hi Stimpy, about order ${number}`}
            label="Contact us on WhatsApp"
            variant="secondary"
            size="lg"
          />
        </div>
      </div>
    );
  }

  const { order, whatsappUrl, trackUrl } = placed;
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-8" data-testid="thanks-full">
      <header className="flex flex-col gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="text-h1 text-fg outline-none">
          Order placed
        </h1>
        <p className="text-lead text-fg-muted">
          {whatsappUrl
            ? 'Your order is placed. Sending the WhatsApp message helps us confirm it faster.'
            : "Your order is placed. We'll message you on WhatsApp to confirm."}
        </p>
      </header>

      <section aria-labelledby="order-number-label" className="rounded-lg bg-cream p-5 text-ink" data-testid="order-number-card">
        <p id="order-number-label" className="text-body-sm font-medium">
          Order number
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="select-all text-h1 font-bold tabular-nums tracking-wide" data-testid="order-number">
            {order.number}
          </p>
          <OrderNumberCopy number={order.number} />
        </div>
        <p className="mt-2 text-body-sm">Keep this number: it&apos;s how you refer back to your order.</p>
      </section>

      {whatsappUrl ? (
        <div className="flex flex-col gap-2">
          <Button
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="cta"
            size="lg"
            fullWidth
            leftIcon={<MessageCircle width={20} height={20} aria-hidden="true" />}
            rightIcon={<ExternalLink width={18} height={18} aria-hidden="true" />}
            onClick={() => track('whatsapp_click', { place: 'confirmation' })}
            data-testid="confirm-whatsapp"
          >
            Confirm on WhatsApp<span className="sr-only"> (opens in a new tab)</span>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-h3 text-fg">
          Your order
        </h2>
        <ul className="mt-2" aria-label="Items in this order">
          {order.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
        <TotalsBlock
          subtotalCents={order.subtotalCents}
          deliveryFeeCents={order.deliveryFeeCents}
          totalCents={order.totalCents}
          note="Pay cash at the door."
        />
      </section>

      <section aria-labelledby="next-heading" className="rounded-lg border border-base p-5">
        <h2 id="next-heading" className="text-h3 text-fg">
          What happens next
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          <li>{whatsappUrl ? "We'll message you to confirm your order." : "We'll message you on WhatsApp to confirm."}</li>
          <li data-testid="estimate">Delivery: {order.estimateText}.</li>
          <li>Pay cash at the door.</li>
        </ul>
      </section>

      {order.contactEmail ? (
        <p className="text-body text-fg-muted" data-testid="email-notice">
          We&apos;re sending a confirmation to <span className="font-medium text-fg">{order.contactEmail}</span>. <ContactLine business={business} number={order.number} />
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <TextLink href={trackPath(trackUrl, order.number)} data-testid="track-link">
          Track your order
        </TextLink>
        <TextLink href="/shop">Continue shopping</TextLink>
      </div>
    </div>
  );
}
