'use client';

import { formatCents, pluralize } from '@stimpy/ui';
import { CartLineRow } from '@/features/cart/CartLineRow';
import { cartItemCount } from '@/features/cart/helpers';
import type { CartLine } from '@/features/cart/types';
import type { FeeLine } from './form';
import type { DisplayTotals } from './totals';

function money(cents: number): string {
  return cents === 0 ? 'Free delivery' : formatCents(cents);
}

/** The delivery row text for each state of 2.4. */
export function deliveryLabel(fee: FeeLine): { label: string; value: string | null } {
  switch (fee.kind) {
    case 'from':
      return { label: 'Delivery', value: `from ${money(fee.cents)}` };
    case 'area':
      return { label: `Delivery to ${fee.areaName}`, value: money(fee.cents) };
    case 'other':
      return { label: 'Delivery', value: money(fee.cents) };
    case 'unknown':
      return { label: 'Delivery fee confirmed on WhatsApp', value: null };
  }
}

/**
 * Collapsible order summary (open by default): lines with editable quantities, remove, edit, the unavailable
 * notices, and the totals (client estimate until the server answers, labelled "Estimated total").
 */
export function OrderSummary({
  lines,
  totals,
  checking,
  onEdit,
}: {
  lines: readonly CartLine[];
  totals: DisplayTotals;
  checking: boolean;
  onEdit: (lineId: string) => void;
}) {
  const count = cartItemCount(lines);
  const delivery = deliveryLabel(totals.fee);
  return (
    <details open className="group rounded-lg border border-base bg-surface-base" data-testid="order-summary">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="text-h3 text-fg">Order summary</h2>
        <span className="text-body-sm text-fg-muted">{pluralize(count, 'item')}</span>
      </summary>
      <div className="px-4 pb-4">
        <ul aria-label="Order items">
          {lines.map((line) => (
            <CartLineRow key={line.lineId} line={line} onEdit={onEdit} />
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 text-body">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-fg">Subtotal</dt>
            <dd className="tabular-nums text-fg" data-testid="summary-subtotal">
              {formatCents(totals.subtotalCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-fg" data-testid="summary-delivery-label">
              {delivery.label}
            </dt>
            <dd className="tabular-nums text-fg" data-testid="summary-delivery">
              {delivery.value}
            </dd>
          </div>
          {totals.estimateText ? (
            <div className="text-body-sm text-fg-muted" data-testid="summary-estimate">
              Estimated delivery: {totals.estimateText}
            </div>
          ) : null}
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-base pt-3">
            <dt className="text-h4 font-bold text-fg" data-testid="summary-total-label">
              {totals.estimated ? 'Estimated total' : 'Total'}
            </dt>
            <dd className="text-price-md font-bold tabular-nums text-fg" data-testid="summary-total">
              {formatCents(totals.totalCents)}
            </dd>
          </div>
        </dl>
        {checking ? (
          <p className="mt-2 text-body-sm text-fg-muted" role="status">
            Checking availability...
          </p>
        ) : null}
      </div>
    </details>
  );
}
