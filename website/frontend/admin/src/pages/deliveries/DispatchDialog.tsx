import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, Checkbox, FormField, Input, Modal, Skeleton, useToast } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useFormatters } from '../../lib/format';
import { findOrdersByDeliveryNumber } from '../orders/api';
import { BulkResultDialog, type BulkFailure } from '../orders/BulkResultDialog';
import { DELIVERY_NUMBER_REQUIRED_TEXT } from '../orders/DeliveryNumberField';
import { OrderNumber } from '../orders/parts';
import { useDispatch, usePackedOrders } from './api';

interface Result {
  dispatched: number;
  failed: BulkFailure[];
  warnings: Array<{ deliveryNumber: string; orderNumbers: string[] }>;
}

const MAX_DISPATCH_ORDERS = 100;

/**
 * Orders -> Out for delivery: pick PACKED orders, give each a delivery number
 * (or apply one number to all selected for a shared run), then `POST /admin/deliveries/dispatch`.
 * Duplicate numbers (inside the selection or on other orders) only warn.
 */
export function DispatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const packed = usePackedOrders(open);
  const dispatch = useDispatch();
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [numbers, setNumbers] = useState<Record<number, string>>({});
  const [bulkNumber, setBulkNumber] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Record<string, string[]>>({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const checked = useRef(new Set<string>());

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setNumbers({});
      setBulkNumber('');
      setRowErrors({});
      setFormError(null);
      setExisting({});
      checked.current = new Set();
    }
  }, [open]);

  const orders = packed.data?.items ?? [];
  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      setSelected(next);
      setFormError(null);
      return;
    }
    if (next.size >= MAX_DISPATCH_ORDERS) {
      setFormError(`Dispatch up to ${MAX_DISPATCH_ORDERS} orders at a time. Send this batch, then start another.`);
      return;
    }
    next.add(id);
    setSelected(next);
    setFormError(null);
  };
  const selectAllOrders = orders.slice(0, MAX_DISPATCH_ORDERS);
  const allSelected = selectAllOrders.length > 0 && selectAllOrders.every((o) => selected.has(o.id));

  const lookup = async (raw: string) => {
    const value = raw.trim();
    if (!value || checked.current.has(value)) return;
    checked.current.add(value);
    try {
      const others = await findOrdersByDeliveryNumber(value);
      if (others.length > 0) setExisting((prev) => ({ ...prev, [value]: others.map((o) => o.number) }));
    } catch {
      /* advisory only */
    }
  };

  const selectedIds = orders.filter((o) => selected.has(o.id)).map((o) => o.id);
  const countByNumber = new Map<string, number>();
  for (const id of selectedIds) {
    const v = (numbers[id] ?? '').trim();
    if (v) countByNumber.set(v, (countByNumber.get(v) ?? 0) + 1);
  }

  const applyAll = () => {
    const v = bulkNumber.trim();
    if (!v) return setFormError('Enter the delivery number to apply.');
    setFormError(null);
    setNumbers((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) next[id] = v;
      return next;
    });
    setRowErrors({});
    void lookup(v);
  };

  const tryConfirm = () => {
    const errs: Record<number, string> = {};
    for (const id of selectedIds) {
      const v = (numbers[id] ?? '').trim();
      if (!v) errs[id] = DELIVERY_NUMBER_REQUIRED_TEXT;
      else if (v.length > 60) errs[id] = 'Use at most 60 characters.';
    }
    setRowErrors(errs);
    if (selectedIds.length === 0) return setFormError('Select at least one order.');
    if (selectedIds.length > MAX_DISPATCH_ORDERS) return setFormError(`Dispatch up to ${MAX_DISPATCH_ORDERS} orders at a time.`);
    if (Object.keys(errs).length > 0) return setFormError('Enter a delivery number for each selected order.');
    setFormError(null);
    setConfirming(true);
  };

  const submit = async () => {
    const payload = selectedIds.map((orderId) => ({ orderId, deliveryNumber: (numbers[orderId] ?? '').trim() }));
    try {
      const res = await dispatch.mutateAsync(payload);
      const numberOf = (id: number) => byId.get(id)?.number ?? `Order ${id}`;
      const failed = res.failed.map((x) => ({ id: x.orderId, label: numberOf(x.orderId), code: x.code }));
      const warnings = res.warnings.map((w) => ({ deliveryNumber: w.deliveryNumber, orderNumbers: w.orderIds.map(numberOf) }));
      if (failed.length === 0 && warnings.length === 0) {
        toast.success(`${res.dispatched.length} ${res.dispatched.length === 1 ? 'order' : 'orders'} sent out for delivery.`);
        onClose();
      } else {
        setResult({ dispatched: res.dispatched.length, failed, warnings });
        // Keep failed rows selected so they can be fixed and sent again.
        setSelected(new Set(res.failed.map((x) => x.orderId)));
      }
    } catch (e) {
      const err = asApiError(e);
      if (err?.code === 'DELIVERY_NUMBER_REQUIRED') setFormError(DELIVERY_NUMBER_REQUIRED_TEXT);
      else notify(e);
      throw e;
    }
  };

  return (
    <>
      <Modal
        open={open && result === null}
        onClose={() => !dispatch.isPending && onClose()}
        title="Send out packed orders"
        size="lg"
        closeOnBackdrop={!dispatch.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={tryConfirm} disabled={packed.isPending || orders.length === 0}>
              {`Send out ${selectedIds.length} ${selectedIds.length === 1 ? 'order' : 'orders'}`}
            </Button>
          </>
        }
      >
        {packed.isPending ? (
          <Skeleton variant="rect" className="h-40" />
        ) : packed.isError ? (
          <p role="alert">Couldn&apos;t load the packed orders. Close this and try again.</p>
        ) : orders.length === 0 ? (
          <p className="text-body">No packed orders. Pack orders from the Orders page first.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-md bg-surface p-3 sm:flex-row sm:items-end">
              <FormField label="Apply one number to all selected" name="bulkNumber" className="flex-1" hint="For a shared run: every selected order gets this delivery number.">
                <Input value={bulkNumber} onChange={(e) => setBulkNumber(e.target.value)} autoComplete="off" maxLength={60} placeholder="e.g. D-88231" />
              </FormField>
              <Button variant="secondary" onClick={applyAll} disabled={selectedIds.length === 0}>
                Apply to selected
              </Button>
            </div>
            {formError ? (
              <p role="alert" className="text-body-sm font-medium text-fg-danger">
                {formError}
              </p>
            ) : null}
            <Checkbox label={orders.length > MAX_DISPATCH_ORDERS ? `Select first ${MAX_DISPATCH_ORDERS} (of ${orders.length})` : `Select all (${orders.length})`} checked={allSelected} onChange={() => { setSelected(allSelected ? new Set() : new Set(selectAllOrders.map((o) => o.id))); setFormError(null); }} />
            {orders.length > MAX_DISPATCH_ORDERS ? <p className="text-body-sm text-fg-muted">Send up to {MAX_DISPATCH_ORDERS} orders per batch. You can dispatch the remaining packed orders in another batch.</p> : null}
            <ul className="divide-y divide-line rounded-md border border-base">
              {orders.map((o) => {
                const isSel = selected.has(o.id);
                const value = numbers[o.id] ?? '';
                const trimmed = value.trim();
                const dupInSelection = isSel && trimmed !== '' && (countByNumber.get(trimmed) ?? 0) > 1;
                const dupExisting = isSel && trimmed !== '' ? existing[trimmed] : undefined;
                return (
                  <li key={o.id} className={isSel ? 'bg-cream px-3 py-3' : 'px-3 py-3'}>
                    <div className="flex flex-wrap items-start gap-3">
                      <Checkbox label={<span className="sr-only">Select {o.number}</span>} checked={isSel} disabled={!isSel && selectedIds.length >= MAX_DISPATCH_ORDERS} onChange={() => toggle(o.id)} className="!min-h-0" />
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="flex flex-wrap items-center gap-x-3 font-medium">
                          <OrderNumber number={o.number} />
                          <span>{o.customerName}</span>
                        </p>
                        <p className="text-body-sm text-fg-muted">
                          {o.areaName} · <span className="tabular-nums">{f.money(o.totalCents)}</span> cash
                        </p>
                      </div>
                      {isSel ? (
                        <FormField label="Delivery number" name={`dn-${o.id}`} id={`dn-${o.id}`} error={rowErrors[o.id]} className="basis-full sm:basis-56 sm:w-56">
                          <Input
                            value={value}
                            onChange={(e) => {
                              setNumbers((prev) => ({ ...prev, [o.id]: e.target.value }));
                              if (rowErrors[o.id]) setRowErrors((prev) => ({ ...prev, [o.id]: '' }));
                            }}
                            onBlur={() => void lookup(value)}
                            autoComplete="off"
                            maxLength={60}
                            placeholder="From the delivery slip"
                          />
                        </FormField>
                      ) : null}
                    </div>
                    {dupInSelection || dupExisting ? (
                      <p role="status" className="mt-2 flex items-start gap-2 rounded-md bg-butter px-3 py-2 text-body-sm text-ink">
                        <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          {trimmed} is also used
                          {dupInSelection ? ` on ${(countByNumber.get(trimmed) ?? 1) - 1} other selected ${(countByNumber.get(trimmed) ?? 1) - 1 === 1 ? 'order' : 'orders'}` : ''}
                          {dupInSelection && dupExisting ? ' and' : ''}
                          {dupExisting ? ` on ${dupExisting.join(', ')}` : ''}. That&apos;s fine if they travel on the same run.
                        </span>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Send ${selectedIds.length} ${selectedIds.length === 1 ? 'order' : 'orders'} out for delivery?`}
        description={`Send ${selectedIds.length} ${selectedIds.length === 1 ? 'order' : 'orders'} out for delivery? Customers with an email are emailed 'On its way'.`}
        notUndoable
        confirmLabel={`Send out ${selectedIds.length}`}
        reportErrors={false}
        onConfirm={submit}
      />
      <BulkResultDialog
        open={result !== null}
        title={result && result.failed.length === 0 ? 'Sent out, with a note' : 'Some orders were not sent out'}
        updated={result?.dispatched ?? 0}
        failed={result?.failed ?? []}
        onSelectFailed={() => setResult(null)}
        onClose={() => {
          const closeAll = result?.failed.length === 0;
          setResult(null);
          if (closeAll) onClose();
        }}
        extra={
          result && result.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-body-sm" aria-label="Duplicate delivery numbers">
              {result.warnings.map((w) => (
                <li key={w.deliveryNumber} className="flex items-start gap-2 rounded-md bg-butter px-3 py-2 text-ink">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {w.deliveryNumber} is on {w.orderNumbers.join(', ')}. That&apos;s fine if they travel on the same run.
                  </span>
                </li>
              ))}
            </ul>
          ) : null
        }
      />
    </>
  );
}
