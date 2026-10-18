import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle, Phone, Printer, RefreshCw, Send } from 'lucide-react';
import { Banner, Button, CopyButton, Select, Skeleton, StatusPill, Switch, Tabs, TextLink, useToast } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, type MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { NotFoundState, QueryBoundary } from '../../components/QueryBoundary';
import { Timeline } from '../../components/Timeline';
import { useFormatters } from '../../lib/format';
import { useIsMdUp, isTypingTarget } from '../../lib/hooks';
import { mailtoHref, telHref } from '../../lib/links';
import { enumParam, useUrlState } from '../../lib/urlState';
import { useSettings } from '../../lib/settings';
import { useSendEmail, useSetCash, useAddNote, useOrder, type AdminOrder, type OrderWarning } from './api';
import {
  EditContactDialog,
  EditDeliveryDialog,
  EditDeliveryNumberDialog,
  ExchangeHelpDialog,
  ExtendHoldDialog,
  SendEmailDialog,
} from './OrderDialogs';
import { Block, EmailFailedBadge, HoldExpiredBadge, OrderNumber, ordersListPath, useOpenWhatsapp } from './parts';
import { OrderDetailItemRow } from './media';
import { StatusActions } from './StatusActions';
import { RESENDABLE_TEMPLATES, SOURCE_LABEL, STATUS_LABEL, WHATSAPP_TEMPLATES, defaultWhatsappTemplate, emailTemplateName, type OrderStatus, type WhatsappTemplate } from './status';
import { FormField, Textarea } from '@stimpy/ui';

const params = { tab: enumParam(['summary', 'timeline', 'notes'] as const, 'summary') };

/** Order detail (dashboard-pages 6): header, action bar, Summary / Timeline / Notes. */
export function OrderDetail() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const valid = Number.isInteger(id) && id > 0;
  const query = useOrder(valid ? id : 0);
  if (!valid) return <NotFoundState what="order" backTo="/orders" backLabel="Back to orders" />;
  return (
    <QueryBoundary query={query} skeleton={<DetailSkeleton />} notFoundWhat="order" notFoundBackTo="/orders" notFoundBackLabel="Back to orders">
      {(order) => <OrderView order={order} />}
    </QueryBoundary>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton variant="rect" className="h-20" />
      <Skeleton variant="rect" className="h-12" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton variant="rect" className="h-64" />
        <Skeleton variant="rect" className="h-64" />
      </div>
    </div>
  );
}

function OrderView({ order }: { order: AdminOrder }) {
  const [{ tab }, setParams] = useUrlState(params);
  const navigate = useNavigate();
  const f = useFormatters();
  const isMd = useIsMdUp();
  const [warnings, setWarnings] = useState<OrderWarning[]>([]);
  const [exchange, setExchange] = useState(false);
  const [requested, setRequested] = useState<{ to: OrderStatus; nonce: number } | null>(null);

  // Esc returns to the list with its previous filters (never while a dialog is open or typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTypingTarget(e.target)) return;
      if (document.querySelector('[data-stimpy-overlay]')) return;
      navigate(ordersListPath());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => setWarnings([]), [order.id]);

  const status = order.status as OrderStatus;
  return (
    <>
      <PageHeader title={`Order ${order.number}`} documentTitle={`Order ${order.number}`} breadcrumbs={[{ label: 'Orders', to: ordersListPath() }, { label: order.number }]} />
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-base bg-surface-base px-4 py-3 md:static md:mx-0 md:rounded-lg md:border md:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <OrderNumber number={order.number} copy className="text-h5 font-bold" />
          <StatusPill status={status} />
          {order.holdExpired ? <HoldExpiredBadge /> : null}
          <span className="text-body-sm text-fg-muted">
            Placed <time dateTime={order.placedAt} className="tabular-nums">{f.dateTime(order.placedAt)}</time>
          </span>
          <span className="text-body-sm text-fg-muted">Source: {SOURCE_LABEL[order.source]}</span>
          <span className="ml-auto text-h5 font-bold tabular-nums">{f.money(order.totalCents)}</span>
        </div>
        {order.deliveryNumber ? (
          <p className="mt-1 text-body-sm" data-testid="header-delivery-number">
            <span className="text-fg-muted">Delivery number:</span> <span className="font-mono font-medium">{order.deliveryNumber}</span>
          </p>
        ) : null}
        {status === 'CANCELLED' && order.cancelReason ? (
          <p className="mt-1 text-body-sm">
            <span className="text-fg-muted">Cancel reason{order.cancelledAt ? ` (${f.date(order.cancelledAt)})` : ''}:</span> <span className="whitespace-pre-wrap break-words">{order.cancelReason}</span>
          </p>
        ) : null}
        {status === 'DELIVERED' && order.deliveredAt ? (
          <p className="mt-1 text-body-sm text-fg-muted">Delivered on {f.date(order.deliveredAt)}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusActions order={order} onWarnings={setWarnings} externalOpen={requested} />
          <HeaderMenu order={order} isMd={isMd} onExchange={() => setExchange(true)} />
        </div>
      </div>

      {warnings.map((w) => (
        <Banner key={w.deliveryNumber} variant="warning" className="mb-4" dismissible onDismiss={() => setWarnings([])}>
          Delivery number <span className="font-mono font-medium">{w.deliveryNumber}</span> is also on {w.orderIds.length} other {w.orderIds.length === 1 ? 'order' : 'orders'}. That&apos;s fine if they travel on the same run.{' '}
          <TextLink href={`/orders?deliveryNumber=${encodeURIComponent(w.deliveryNumber)}`}>See them</TextLink>
        </Banner>
      ))}

      <Tabs
        aria-label="Order sections"
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'notes', label: `Notes${order.notes.length ? ` (${order.notes.length})` : ''}` },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'summary' | 'timeline' | 'notes' })}
      />
      <div className="pt-4">
        {tab === 'summary' ? <SummaryTab order={order} onWarnings={setWarnings} onRequestStatus={(to) => setRequested({ to, nonce: Date.now() })} /> : null}
        {tab === 'timeline' ? <TimelineTab order={order} /> : null}
        {tab === 'notes' ? <NotesTab order={order} /> : null}
      </div>
      <ExchangeHelpDialog
        order={order}
        open={exchange}
        onClose={() => setExchange(false)}
        onMarkReturned={() => {
          setExchange(false);
          setRequested({ to: 'RETURNED', nonce: Date.now() });
        }}
      />
    </>
  );
}

/** Call, Print label, How to handle an exchange (all behind a menu on phone, buttons from md). */
function HeaderMenu({ order, isMd, onExchange }: { order: AdminOrder; isMd: boolean; onExchange: () => void }) {
  const tel = telHref(order.contact.phone);
  const items: MenuItem[] = [
    ...(tel ? [{ id: 'call', label: 'Call', href: tel }] : []),
    { id: 'print', label: 'Print label', href: `/orders/${order.id}/label` },
    { id: 'invoice', label: 'Print invoice', href: `/orders/${order.id}/invoice` },
    { id: 'exchange', label: 'How to handle an exchange', onSelect: onExchange },
  ];
  if (isMd) {
    return (
      <div className="flex flex-wrap items-center gap-1 md:ml-auto">
        {tel ? (
          <Button variant="ghost" href={tel} leftIcon={<Phone size={18} aria-hidden="true" />}>
            Call
          </Button>
        ) : null}
        <Button variant="ghost" href={`/orders/${order.id}/label`} leftIcon={<Printer size={18} aria-hidden="true" />}>
          Print label
        </Button>
        <Button variant="ghost" href={`/orders/${order.id}/invoice`} leftIcon={<Printer size={18} aria-hidden="true" />}>
          Print invoice
        </Button>
        <Button variant="ghost" onClick={onExchange}>
          How to handle an exchange
        </Button>
      </div>
    );
  }
  return <Menu label="Order tools" items={items} />;
}

/* ================================================================================== Summary */

function SummaryTab({ order, onWarnings, onRequestStatus }: { order: AdminOrder; onWarnings: (w: OrderWarning[]) => void; onRequestStatus: (to: OrderStatus) => void }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <HoldBlock order={order} onRequestStatus={onRequestStatus} />
        <ContactBlock order={order} />
        <DeliveryBlock order={order} onWarnings={onWarnings} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <ItemsBlock order={order} />
        <CashBlock order={order} />
        <EmailsBlock order={order} />
      </div>
    </div>
  );
}

function Row({ label, children, actions }: { label: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-fg-muted">{label}</p>
        <div className="min-w-0 break-words text-body">{children}</div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

function WhatsappMessage({ order }: { order: AdminOrder }) {
  const { open, busy } = useOpenWhatsapp();
  const [template, setTemplate] = useState<WhatsappTemplate>(defaultWhatsappTemplate(order.status as OrderStatus) ?? 'order_confirmation');
  useEffect(() => {
    const next = defaultWhatsappTemplate(order.status as OrderStatus);
    if (next) setTemplate(next);
  }, [order.status]);
  const hasNumber = !!order.contact.whatsapp;
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-body-sm font-medium">
        WhatsApp message
        <Select value={template} onChange={(e) => setTemplate(e.target.value as WhatsappTemplate)} options={WHATSAPP_TEMPLATES.map((t) => ({ value: t.value, label: t.label }))} />
      </label>
      <Button
        variant="secondary"
        loading={busy}
        disabled={!hasNumber}
        leftIcon={<MessageCircle size={20} aria-hidden="true" />}
        onClick={() => void open(order.id, template)}
      >
        Message customer on WhatsApp
      </Button>
    </div>
  );
}

function ContactBlock({ order }: { order: AdminOrder }) {
  const [edit, setEdit] = useState(false);
  const tel = telHref(order.contact.phone);
  const mail = mailtoHref(order.contact.email);
  return (
    <Block
      title="Contact"
      id="contact"
      actions={
        <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>
          Edit contact
        </Button>
      }
    >
      <div className="flex flex-col">
        <Row label="Customer" actions={<TextLink href={`/customers/${order.customer.id}`}>View customer</TextLink>}>
          <span className="font-medium">{order.customer.name}</span>
        </Row>
        <Row
          label="Email"
          actions={
            order.contact.email ? (
              <>
                <CopyButton text={order.contact.email} label="Copy email" iconOnly variant="ghost" size="sm" />
                {mail ? <Button variant="ghost" size="sm" iconOnly href={mail} aria-label="Send an email"><Mail size={18} aria-hidden="true" /></Button> : null}
              </>
            ) : null
          }
        >
          {order.contact.email ?? <span className="text-fg-muted">No email on file</span>}
        </Row>
        <Row
          label="Phone"
          actions={
            <>
              <CopyButton text={order.contact.phone} label="Copy phone" iconOnly variant="ghost" size="sm" />
              {tel ? <Button variant="ghost" size="sm" iconOnly href={tel} aria-label="Call"><Phone size={18} aria-hidden="true" /></Button> : null}
            </>
          }
        >
          <span className="tabular-nums">{order.contact.phone}</span>
        </Row>
        <Row label="WhatsApp" actions={<CopyButton text={order.contact.whatsapp} label="Copy WhatsApp number" iconOnly variant="ghost" size="sm" />}>
          <span className="tabular-nums">{order.contact.whatsapp}</span>
        </Row>
      </div>
      <WhatsappMessage order={order} />
      <EditContactDialog order={order} open={edit} onClose={() => setEdit(false)} />
    </Block>
  );
}

function DeliveryBlock({ order, onWarnings }: { order: AdminOrder; onWarnings: (w: OrderWarning[]) => void }) {
  const [edit, setEdit] = useState(false);
  const [editNumber, setEditNumber] = useState(false);
  const editable = order.status !== 'DELIVERED' && order.status !== 'RETURNED' && order.status !== 'CANCELLED';
  const address = [order.delivery.address, order.delivery.areaName].filter(Boolean).join(', ');
  return (
    <Block
      title="Delivery"
      id="delivery"
      actions={
        editable ? (
          <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>
            Edit delivery
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col">
        <Row label="Area">{order.delivery.areaName}</Row>
        <Row label="Address" actions={<CopyButton text={address} label="Copy address" iconOnly variant="ghost" size="sm">Copy address</CopyButton>}>
          <span className="whitespace-pre-wrap">{order.delivery.address}</span>
        </Row>
        <Row label="Delivery notes">{order.delivery.notes ? <span className="whitespace-pre-wrap">{order.delivery.notes}</span> : <span className="text-fg-muted">None</span>}</Row>
        <Row
          label="Delivery number"
          actions={
            order.status === 'OUT_FOR_DELIVERY' ? (
              <Button variant="secondary" size="sm" onClick={() => setEditNumber(true)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {order.deliveryNumber ? <span className="font-mono">{order.deliveryNumber}</span> : <span className="text-fg-muted">Not sent out yet</span>}
        </Row>
      </div>
      <EditDeliveryDialog order={order} open={edit} onClose={() => setEdit(false)} />
      <EditDeliveryNumberDialog order={order} open={editNumber} onClose={() => setEditNumber(false)} onWarnings={onWarnings} />
    </Block>
  );
}

function ItemsBlock({ order }: { order: AdminOrder }) {
  const f = useFormatters();
  return (
    <Block title="Items" id="items">
      <ul className="divide-y divide-line">
        {order.items.map((item) => (
          <OrderDetailItemRow key={item.id} item={item} moneyFormatter={f.money} />
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-base pt-3 text-body-sm">
        <div className="flex justify-between"><dt className="text-fg-muted">Subtotal</dt><dd className="tabular-nums">{f.money(order.subtotalCents)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-muted">Delivery fee</dt><dd className="tabular-nums">{f.money(order.deliveryFeeCents)}</dd></div>
        <div className="flex justify-between text-body font-bold"><dt>Total</dt><dd className="tabular-nums">{f.money(order.totalCents)}</dd></div>
        <div className="flex justify-between text-fg-muted"><dt>Cost (internal)</dt><dd className="tabular-nums">{f.money(order.costCents)}</dd></div>
      </dl>
      <p className="mt-3 text-body-sm">
        <TextLink href={`/stock?tab=movements&orderId=${order.id}`}>Stock movements for this order</TextLink>
      </p>
    </Block>
  );
}

function HoldBlock({ order, onRequestStatus }: { order: AdminOrder; onRequestStatus: (to: OrderStatus) => void }) {
  const f = useFormatters();
  const [extend, setExtend] = useState(false);
  if (order.status !== 'NEW' || !order.holdExpiresAt) return null;
  if (!order.holdExpired) {
    return (
      <Block title="Stock hold" id="hold">
        <p>
          Stock held until <time dateTime={order.holdExpiresAt} className="font-medium tabular-nums">{f.dateTime(order.holdExpiresAt)}</time>
        </p>
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={() => setExtend(true)}>
            Extend hold
          </Button>
        </div>
        <ExtendHoldDialog order={order} open={extend} onClose={() => setExtend(false)} />
      </Block>
    );
  }
  return (
    <>
      <Banner variant="error" title="Hold expired" className="">
        <p>The stock hold has run out and these items may be sold to someone else if the setting auto-expires.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setExtend(true)}>
            Extend hold
          </Button>
          {order.allowedTransitions.includes('CONFIRMED') ? (
            <Button variant="primary" size="sm" onClick={() => onRequestStatus('CONFIRMED')}>
              Confirm order
            </Button>
          ) : null}
          {order.allowedTransitions.includes('CANCELLED') ? (
            <Button variant="secondary" size="sm" className="!border-danger !text-fg-danger hover:!bg-danger hover:!text-white" onClick={() => onRequestStatus('CANCELLED')}>
              Cancel order
            </Button>
          ) : null}
        </div>
      </Banner>
      <ExtendHoldDialog order={order} open={extend} onClose={() => setExtend(false)} />
    </>
  );
}

function CashBlock({ order }: { order: AdminOrder }) {
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const setCash = useSetCash(order.id);
  const delivered = order.status === 'DELIVERED';

  const apply = async (patch: { collected?: boolean; settled?: boolean }, message: string, undo: { collected?: boolean; settled?: boolean }) => {
    try {
      await setCash.mutateAsync(patch);
      toast.success(message, {
        durationMs: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            setCash.mutateAsync(undo).catch((e) => notify(e));
          },
        },
      });
    } catch (e) {
      notify(e);
    }
  };

  return (
    <Block title="Cash" id="cash">
      <p className="mb-3 text-body">
        Cash to collect: <span className="font-bold tabular-nums">{f.money(order.totalCents)}</span>
      </p>
      <div className="flex flex-col gap-3">
        <Switch
          label="Cash collected"
          checked={order.cashCollected}
          disabled={!delivered || setCash.isPending}
          loading={setCash.isPending}
          description={!delivered ? 'Available once the order is delivered. Delivering sets it automatically.' : undefined}
          onChange={(v) => void apply({ collected: v }, v ? 'Cash marked as collected.' : 'Cash collected removed.', { collected: !v })}
        />
        <Switch
          label="Cash settled"
          checked={order.cashSettled}
          disabled={!delivered || !order.cashCollected || setCash.isPending}
          loading={setCash.isPending}
          description={delivered && !order.cashCollected ? 'Collect the cash first.' : !delivered ? 'Available once the cash is collected.' : 'You received the money from the courier.'}
          onChange={(v) => void apply({ settled: v }, v ? 'Cash marked as settled.' : 'Cash settled removed.', { settled: !v })}
        />
      </div>
      {order.status === 'RETURNED' ? <p className="mt-3 text-body-sm text-fg-muted">Returning an order resets both cash flags.</p> : null}
    </Block>
  );
}

function EmailsBlock({ order }: { order: AdminOrder }) {
  const f = useFormatters();
  const toast = useToast();
  const send = useSendEmail(order.id);
  const [compose, setCompose] = useState(false);
  const [resend, setResend] = useState<AdminOrder['emails'][number] | null>(null);
  const hasEmail = !!order.contact.email;
  return (
    <Block
      title="Emails sent"
      id="emails"
      actions={
        <Button variant="secondary" size="sm" disabled={!hasEmail} leftIcon={<Send size={16} aria-hidden="true" />} onClick={() => setCompose(true)}>
          Send email
        </Button>
      }
    >
      {!hasEmail ? <p className="mb-3 text-body-sm text-fg-muted">No email on file: emails can&apos;t be sent for this order.</p> : null}
      {order.emails.length === 0 ? (
        <p className="text-body-sm text-fg-muted">No emails sent for this order yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {order.emails.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 ${m.status === 'FAILED' ? 'rounded-md bg-surface px-2 ring-1 ring-danger' : ''}`}>
              <div className="min-w-0">
                <p className="font-medium">{emailTemplateName(m.template)}</p>
                <p className="truncate text-body-sm text-fg-muted">
                  {m.to} · <time dateTime={m.at} title={f.dateTime(m.at)} className="tabular-nums">{f.relative(m.at)}</time>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.status === 'FAILED' ? <EmailFailedBadge /> : <EmailStatus status={m.status} />}
                {RESENDABLE_TEMPLATES.includes(m.template) ? (
                  <Button variant="secondary" size="sm" disabled={!hasEmail} leftIcon={<RefreshCw size={16} aria-hidden="true" />} onClick={() => setResend(m)}>
                    Resend
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <SendEmailDialog order={order} open={compose} onClose={() => setCompose(false)} />
      <ConfirmDialog
        open={resend !== null}
        onClose={() => setResend(null)}
        title="Resend email?"
        description={resend ? `Resend '${emailTemplateName(resend.template)}' to ${resend.to}?` : null}
        confirmLabel="Resend"
        onConfirm={async () => {
          if (!resend) return;
          await send.mutateAsync({ template: resend.template });
          toast.success('Email queued.');
        }}
      />
    </Block>
  );
}

function EmailStatus({ status }: { status: 'PENDING' | 'SENT' | 'FAILED' }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${status === 'SENT' ? 'bg-success text-white' : 'border border-fg text-fg'}`}>
      {status === 'SENT' ? 'Sent' : 'Pending'}
    </span>
  );
}

/* ================================================================================== Timeline */

function TimelineTab({ order }: { order: AdminOrder }) {
  const items = useMemo(
    () =>
      order.events.map((e) => ({
        id: e.id,
        at: e.at,
        status: e.to as OrderStatus,
        title: e.from === null ? 'Order placed' : e.from === e.to ? (e.note ?? STATUS_LABEL[e.to as OrderStatus]) : `${STATUS_LABEL[e.from as OrderStatus]} → ${STATUS_LABEL[e.to as OrderStatus]}`,
        by: e.by,
        note: e.from === e.to ? null : e.note,
      })),
    [order.events],
  );
  return (
    <Block title="Timeline" id="timeline">
      <Timeline items={items} empty="No history yet." />
    </Block>
  );
}

/* ==================================================================================== Notes */

function NotesTab({ order }: { order: AdminOrder }) {
  const add = useAddNote(order.id);
  const toast = useToast();
  const notify = useNotifyError();
  const f = useFormatters();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const text = body.trim();
    if (!text) return setError('Write a note first.');
    if (text.length > 1000) return setError('Use at most 1000 characters.');
    setError(null);
    try {
      await add.mutateAsync({ body: text });
      setBody('');
      toast.success('Note added.');
    } catch (e) {
      const api = asApiError(e);
      if (api?.code === 'VALIDATION_ERROR' && api.fields?.body) setError(api.fields.body);
      else notify(e);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Banner variant="info">Internal only. Customers never see these.</Banner>
      <Block title="Add a note" id="add-note">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <FormField label="Note" name="note" error={error} required>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} showCount />
          </FormField>
          <div>
            <Button type="submit" variant="primary" loading={add.isPending}>
              Add note
            </Button>
          </div>
        </form>
      </Block>
      <Block title="Notes" id="notes">
        {order.notes.length === 0 ? (
          <p className="text-body-sm text-fg-muted">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {order.notes.map((n) => (
              <li key={n.id} className="py-3 first:pt-0">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <p className="mt-1 text-body-sm text-fg-muted">
                  {n.by} · <time dateTime={n.at} title={f.dateTime(n.at)} className="tabular-nums">{f.dateTime(n.at)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

export { ArrowLeft };
