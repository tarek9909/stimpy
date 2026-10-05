import { useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Clock, MessageCircle, TriangleAlert, Wallet } from 'lucide-react';
import { Button, CopyButton, Pill, cn } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { openWhatsAppTab } from '../../lib/links';
import { fetchWhatsapp, type AdminOrderSummary } from './api';
import { defaultWhatsappTemplate, type OrderStatus, type WhatsappTemplate } from './status';

/** `STP-1042`: monospace, never editable, with a copy button where there is room. */
export function OrderNumber({ number, copy, className }: { number: string; copy?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="font-mono tabular-nums">{number}</span>
      {copy ? <CopyButton text={number} label={`Copy order number ${number}`} iconOnly variant="ghost" size="sm" /> : null}
    </span>
  );
}

/** Red outline badge with an icon: the hold ran out (the text carries the meaning, not the colour). */
export function HoldExpiredBadge() {
  return (
    <Pill tone="outline" size="sm" className="!border-danger !text-fg-danger" icon={<Clock size={14} aria-hidden="true" />}>
      Hold expired
    </Pill>
  );
}

export function EmailFailedBadge() {
  return (
    <Pill tone="danger" size="sm" icon={<TriangleAlert size={14} aria-hidden="true" />}>
      Email failed
    </Pill>
  );
}

/** Cash state as text + icon: To collect / Cash collected / Settled (dashboard-pages 5.4). */
export function PaymentState({ order }: { order: Pick<AdminOrderSummary, 'status' | 'cashCollected' | 'cashSettled'> }) {
  if (order.status === 'CANCELLED' || order.status === 'RETURNED') return <span className="text-fg-muted">—</span>;
  if (order.cashSettled) {
    return (
      <Pill tone="success" size="sm" icon={<CheckCheck size={14} aria-hidden="true" />}>
        Settled
      </Pill>
    );
  }
  if (order.cashCollected) {
    return (
      <Pill tone="cream" size="sm" icon={<Wallet size={14} aria-hidden="true" />}>
        Cash collected
      </Pill>
    );
  }
  return <span className="whitespace-nowrap text-fg-muted">To collect</span>;
}

/**
 * Opens the customer's WhatsApp chat with the server-built `wa.me` link (never constructed in the
 * browser). Returns `open()` and a busy flag; errors are toasted.
 */
export function useOpenWhatsapp() {
  const qc = useQueryClient();
  const notify = useNotifyError();
  const [busy, setBusy] = useState(false);
  const open = useCallback(
    async (orderId: number, template: WhatsappTemplate) => {
      setBusy(true);
      try {
        await openWhatsAppTab(() => fetchWhatsapp(qc, orderId, template));
      } catch (e) {
        notify(e, { fallback: "Couldn't open WhatsApp. Try again." });
      } finally {
        setBusy(false);
      }
    },
    [qc, notify],
  );
  return { open, busy };
}

/** Row-level WhatsApp icon button. Renders nothing for statuses without a template (cancelled, returned). */
export function RowWhatsappButton({ order, className }: { order: Pick<AdminOrderSummary, 'id' | 'number' | 'status'>; className?: string }) {
  const { open, busy } = useOpenWhatsapp();
  const template = defaultWhatsappTemplate(order.status as OrderStatus);
  if (!template) return null;
  return (
    <Button
      variant="ghost"
      iconOnly
      loading={busy}
      aria-label={`Message ${order.number} on WhatsApp`}
      className={className}
      onClick={() => void open(order.id, template)}
    >
      <MessageCircle size={20} aria-hidden="true" />
    </Button>
  );
}

/** A labelled block of the order detail page. */
export function Block({ title, children, actions, className, id }: { title: string; children: ReactNode; actions?: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={cn('rounded-lg border border-base bg-surface-base p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={id ? `${id}-title` : undefined} className="text-h5 text-fg">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Remembers the list's query string so Esc / "Back to orders" returns to the same view. */
export const ordersListMemory = { search: '' };

export function ordersListPath(): string {
  return `/orders${ordersListMemory.search}`;
}
