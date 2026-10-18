import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { Button, FormField, Modal, RadioGroup, Skeleton, Textarea, useToast, type OrderStatus } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu } from '../../components/Menu';
import { useFormatters } from '../../lib/format';
import { useIsMdUp } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { useChangeStatus, useOrder, type AdminOrder, type OrderWarning, type StatusChange } from './api';
import { DELIVERY_NUMBER_REQUIRED_TEXT, DeliveryNumberField, DuplicateDeliveryNotice, useDuplicateDeliveryCheck } from './DeliveryNumberField';
import { ACTION_LABEL, CANCEL_REASON_CHIPS, STATUS_LABEL } from './status';

const FORWARD_ORDER: OrderStatus[] = ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/** `details.from` of an INVALID_TRANSITION error (the status the order is in now). */
function invalidFrom(error: unknown): OrderStatus | null {
  const e = asApiError(error);
  const from = e && typeof e.details === 'object' && e.details !== null ? (e.details as { from?: unknown }).from : null;
  return typeof from === 'string' && from in STATUS_LABEL ? (from as OrderStatus) : null;
}

/**
 * The status action bar (dashboard-pages 6.3). Buttons come ONLY from `order.allowedTransitions`:
 * nothing is computed on the client. All changes are pessimistic (the whole bar is disabled while
 * a request is pending, the cache takes the server's order). Phone: the forward action is a full
 * width button, the rest sit in a "More" menu.
 */
export function StatusActions({
  order,
  onWarnings,
  externalOpen,
}: {
  order: AdminOrder;
  onWarnings?: (warnings: OrderWarning[]) => void;
  /** Opens the dialog of a status from elsewhere on the page (hold banner, exchange help). Ignored unless the server offers it. */
  externalOpen?: { to: OrderStatus; nonce: number } | null;
}) {
  const isMd = useIsMdUp();
  const change = useChangeStatus(order.id);
  const [dialog, setDialog] = useState<OrderStatus | null>(null);
  const [notice, setNotice] = useState<OrderStatus | null>(null);

  const offered = order.allowedTransitions.filter((to) => {
    if (ACTION_LABEL[to]) return true;
    // eslint-disable-next-line no-console -- a status without a label is a contract drift worth seeing
    console.warn('[stimpy:admin] no action label for status', to);
    return false;
  });
  const forward = FORWARD_ORDER.filter((s) => offered.includes(s));
  const rest = offered.filter((s) => !forward.includes(s));
  // The cancel button is outlined red; return is outlined; forward actions are the one blue button.
  const secondary: OrderStatus[] = [...rest.filter((s) => s === 'RETURNED'), ...rest.filter((s) => s === 'CANCELLED'), ...rest.filter((s) => s !== 'RETURNED' && s !== 'CANCELLED')];
  const busy = change.isPending;
  useEffect(() => {
    if (externalOpen && order.allowedTransitions.includes(externalOpen.to)) setDialog(externalOpen.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen?.nonce]);

  if (offered.length === 0) return null;

  const button = (to: OrderStatus, primary: boolean, fullWidth?: boolean) => (
    <Button
      key={to}
      variant={primary ? 'primary' : 'secondary'}
      fullWidth={fullWidth}
      disabled={busy}
      className={to === 'CANCELLED' ? '!border-danger !text-fg-danger hover:!bg-danger hover:!text-white' : undefined}
      onClick={() => setDialog(to)}
    >
      {ACTION_LABEL[to]}
    </Button>
  );

  return (
    <>
      <div role="group" aria-label="Order actions" className="flex flex-wrap items-center gap-2" aria-busy={busy || undefined}>
        {isMd || offered.length === 1 ? (
          <>
            {forward.map((s, i) => button(s, i === 0))}
            {secondary.map((s) => button(s, forward.length === 0 && false))}
          </>
        ) : (
          <>
            {forward[0] ? button(forward[0], true, true) : null}
            <Menu
              label="More status actions"
              trigger={
                <span className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-fg px-4 text-button">
                  <MoreHorizontal size={20} aria-hidden="true" /> More
                </span>
              }
              items={[...forward.slice(1), ...secondary].map((to) => ({
                id: to,
                label: ACTION_LABEL[to] ?? to,
                tone: to === 'CANCELLED' ? ('danger' as const) : ('default' as const),
                disabled: busy,
                onSelect: () => setDialog(to),
              }))}
            />
          </>
        )}
      </div>
      {dialog ? (
        <StatusDialog
          key={dialog}
          order={order}
          to={dialog}
          change={change}
          onClose={() => setDialog(null)}
          onInvalid={(from) => setNotice(from)}
          onWarnings={onWarnings}
        />
      ) : null}
      <Modal
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={`This order is now ${notice ? STATUS_LABEL[notice] : ''}`}
        size="sm"
        footer={
          <Button variant="dark" onClick={() => setNotice(null)}>
            OK
          </Button>
        }
      >
        <p>Someone else changed it, or it was changed in another tab. The buttons now match its current status.</p>
      </Modal>
    </>
  );
}

function StatusDialog({
  order,
  to,
  change,
  onClose,
  onInvalid,
  onWarnings,
}: {
  order: AdminOrder;
  to: OrderStatus;
  change: ReturnType<typeof useChangeStatus>;
  onClose: () => void;
  onInvalid: (from: OrderStatus) => void;
  onWarnings?: (warnings: OrderWarning[]) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const f = useFormatters();
  const settings = useSettings();
  const hasEmail = !!order.contact.email && settings.data?.email.enabled !== false;
  const dup = useDuplicateDeliveryCheck(order.id);

  const [note, setNote] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState<'true' | 'false'>('true');
  const [fieldError, setFieldError] = useState<{ deliveryNumber?: string; cancelReason?: string; note?: string }>({});

  const wasDelivered = order.status === 'DELIVERED';
  const num = order.number;

  const submit = async () => {
    const errors: typeof fieldError = {};
    const body: StatusChange = { to };
    if (to === 'OUT_FOR_DELIVERY') {
      const v = deliveryNumber.trim();
      if (!v) errors.deliveryNumber = DELIVERY_NUMBER_REQUIRED_TEXT;
      else if (v.length > 60) errors.deliveryNumber = 'Use at most 60 characters.';
      else body.deliveryNumber = v;
    }
    if (to === 'CANCELLED') {
      const r = reason.trim();
      if (r.length < 3) errors.cancelReason = 'Give a reason of at least 3 characters.';
      else if (r.length > 255) errors.cancelReason = 'Use at most 255 characters.';
      else body.cancelReason = r;
    }
    if ((to === 'CONFIRMED' || to === 'PACKED' || to === 'RETURNED') && note.trim()) {
      if (note.trim().length > 500) errors.note = 'Use at most 500 characters.';
      else body.note = note.trim();
    }
    if (to === 'RETURNED' && wasDelivered) body.restock = restock === 'true';
    setFieldError(errors);
    if (Object.keys(errors).length > 0) throw new Error('invalid'); // keeps the dialog open; nothing was sent

    if (to === 'OUT_FOR_DELIVERY') await dup.check(deliveryNumber); // advisory, never blocks

    try {
      const updated = await change.mutateAsync(body);
      toast.success(`Order ${num} is now ${STATUS_LABEL[to]}.`);
      if (updated.warnings.length > 0) onWarnings?.(updated.warnings);
    } catch (e) {
      const api = asApiError(e);
      if (api?.code === 'INVALID_TRANSITION') {
        // Someone (or another tab) changed the order: show where it is now and re-read it.
        const from = invalidFrom(e) ?? order.status;
        void qc.invalidateQueries({ queryKey: queryKeys.orderDetail(order.id) });
        onInvalid(from);
        return;
      }
      if (api?.code === 'DELIVERY_NUMBER_REQUIRED') {
        setFieldError({ deliveryNumber: DELIVERY_NUMBER_REQUIRED_TEXT });
        throw e;
      }
      if (api?.code === 'VALIDATION_ERROR' && api.fields) {
        setFieldError({
          deliveryNumber: api.fields.deliveryNumber,
          cancelReason: api.fields.cancelReason,
          note: api.fields.note,
        });
        if (!api.fields.deliveryNumber && !api.fields.cancelReason && !api.fields.note) notify(e);
        throw e;
      }
      notify(e);
      throw e;
    }
  };

  const copy: Record<OrderStatus, { title: string; confirm: string; cancel?: string; body: React.ReactNode }> = {
    NEW: { title: '', confirm: '', body: null },
    CONFIRMED: {
      title: `Confirm ${num}?`,
      confirm: 'Confirm order',
      body: (
        <>
          Only confirm once the customer has confirmed on WhatsApp or by phone.
          {hasEmail ? " The customer is emailed 'Order confirmed'." : ''}
        </>
      ),
    },
    PACKED: { title: `Mark ${num} as packed?`, confirm: 'Mark as packed', body: 'The parcel is ready for delivery.' },
    OUT_FOR_DELIVERY: {
      title: `Send ${num} out for delivery?`,
      confirm: 'Send out for delivery',
      body: (
        <>
          Enter the delivery number from the delivery slip.
          {hasEmail ? " The customer is emailed 'On its way' with this number." : ''}
        </>
      ),
    },
    DELIVERED: {
      title: `Mark ${num} as delivered?`,
      confirm: 'Mark delivered',
      body: `The customer received the order. ${f.money(order.totalCents)} cash is now expected.`,
    },
    RETURNED: {
      title: `Mark ${num} as returned?`,
      confirm: 'Mark returned',
      body: (
        <>
          Failed delivery or accepted return. Cash collected and settled flags are reset.
          {!wasDelivered ? ' The items go back on the shelf.' : ''}
        </>
      ),
    },
    CANCELLED: {
      title: `Cancel ${num}?`,
      confirm: 'Cancel order',
      cancel: 'Keep order',
      body: (
        <>
          Reserved items go back in stock.
          {hasEmail ? " The customer is emailed 'Order cancelled' with your reason." : ''}
        </>
      ),
    },
  };
  const c = copy[to];

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={c.title}
      description={c.body}
      confirmLabel={c.confirm}
      cancelLabel={c.cancel ?? 'Cancel'}
      tone={to === 'CANCELLED' ? 'destructive' : 'default'}
      notUndoable
      reportErrors={false}
      onConfirm={submit}
    >
      {to === 'OUT_FOR_DELIVERY' ? (
        <div className="space-y-2">
          <DeliveryNumberField
            value={deliveryNumber}
            onChange={(v) => {
              setDeliveryNumber(v);
              if (fieldError.deliveryNumber) setFieldError({});
            }}
            onBlur={() => void dup.check(deliveryNumber)}
            error={fieldError.deliveryNumber}
            autoFocus
          />
          <DuplicateDeliveryNotice duplicates={dup.duplicates} current={deliveryNumber} />
        </div>
      ) : null}
      {to === 'CANCELLED' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
            {CANCEL_REASON_CHIPS.map((chip) => (
              <Button key={chip} variant="secondary" size="sm" onClick={() => setReason(chip)} aria-pressed={reason === chip}>
                {chip}
              </Button>
            ))}
          </div>
          <FormField label="Reason" name="cancelReason" required error={fieldError.cancelReason} hint="Saved on the order and sent to the customer if they have an email.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} showCount />
          </FormField>
        </div>
      ) : null}
      {to === 'RETURNED' && wasDelivered ? (
        <RadioGroup
          name="restock"
          legend="What happens to the items?"
          value={restock}
          onChange={(v) => setRestock(v as 'true' | 'false')}
          options={[
            { value: 'true', label: 'Put the items back in stock' },
            { value: 'false', label: "Write off as damaged (don't restock)" },
          ]}
        />
      ) : null}
      {to === 'CONFIRMED' || to === 'PACKED' || to === 'RETURNED' ? (
        <FormField label="Note" name="note" optional error={fieldError.note}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
        </FormField>
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * Opens the status dialog for an order known only by id (Deliveries rows): the order is loaded
 * first (the dialog needs its contact and total), then the same dialog as the detail page runs.
 */
export function OrderStatusDialog({ orderId, to, onClose }: { orderId: number; to: OrderStatus; onClose: () => void }) {
  const query = useOrder(orderId);
  const change = useChangeStatus(orderId);
  const [notice, setNotice] = useState<OrderStatus | null>(null);
  const noticeRef = useRef<OrderStatus | null>(null);
  const [closed, setClosed] = useState(false);
  const order = query.data;
  if (notice !== null && closed) {
    return (
      <Modal open onClose={onClose} title={`This order is now ${STATUS_LABEL[notice]}`} size="sm" footer={<Button variant="dark" onClick={onClose}>OK</Button>}>
        <p>Someone else changed it, or it was changed in another tab. The list now shows its current status.</p>
      </Modal>
    );
  }
  if (closed) return null;
  if (!order) {
    return (
      <Modal open onClose={onClose} title="Loading order" size="sm">
        {query.isError ? (
          <div className="space-y-3">
            <p>Could not load this order. Close this dialog and try again.</p>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <Skeleton variant="rect" className="h-24" />
        )}
      </Modal>
    );
  }
  return (
    <StatusDialog
      order={order}
      to={to}
      change={change}
      onClose={() => {
        if (noticeRef.current === null) onClose();
        else setClosed(true);
      }}
      onInvalid={(from) => {
        noticeRef.current = from;
        setNotice(from);
      }}
    />
  );
}
