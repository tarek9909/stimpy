import { useCallback, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { FormField, Input } from '@stimpy/ui';
import { findOrdersByDeliveryNumber, type AdminOrderSummary } from './api';

export const DELIVERY_NUMBER_REQUIRED_TEXT = 'Enter the delivery number to continue.';

/**
 * Advisory duplicate lookup for a delivery number (dashboard-pages 6.3): `GET /admin/orders?deliveryNumber=`
 * minus this order. It never blocks anything and fails silently. `check` is called on blur and
 * before submit; the notice shows what it found.
 */
export function useDuplicateDeliveryCheck(excludeId?: number) {
  const [duplicates, setDuplicates] = useState<{ value: string; orders: AdminOrderSummary[] } | null>(null);
  const latest = useRef(0);
  const check = useCallback(
    async (raw: string): Promise<void> => {
      const value = raw.trim();
      const ticket = ++latest.current;
      if (!value) {
        setDuplicates(null);
        return;
      }
      try {
        const orders = await findOrdersByDeliveryNumber(value, excludeId);
        if (ticket === latest.current) setDuplicates(orders.length > 0 ? { value, orders } : null);
      } catch {
        // Advisory only: skip silently.
      }
    },
    [excludeId],
  );
  const clear = useCallback(() => {
    latest.current++;
    setDuplicates(null);
  }, []);
  return { duplicates, check, clear };
}

/** Amber, non-blocking notice: "D-88231 is already on 2 other orders (STP-1040, STP-1041)." */
export function DuplicateDeliveryNotice({ duplicates, current }: { duplicates: { value: string; orders: AdminOrderSummary[] } | null; current: string }) {
  if (!duplicates || duplicates.value !== current.trim()) return null;
  const n = duplicates.orders.length;
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-butter px-3 py-2 text-body-sm text-ink" data-testid="duplicate-delivery-number">
      <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">{duplicates.value}</span> is already on {n} other {n === 1 ? 'order' : 'orders'} ({duplicates.orders.map((o) => o.number).join(', ')}). That&apos;s fine if they travel on the same run.
      </span>
    </p>
  );
}

/** The "Delivery number" text input: never confused with the order number. */
export function DeliveryNumberField({
  value,
  onChange,
  onBlur,
  error,
  label = 'Delivery number',
  hint,
  id,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string | null;
  label?: string;
  hint?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <FormField label={label} name="deliveryNumber" id={id} error={error} hint={hint} required className={className}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoComplete="off"
        inputMode="text"
        maxLength={60}
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder="From the delivery slip"
      />
    </FormField>
  );
}
