/**
 * What the checkout shows for subtotal, delivery and total (checkout-and-order-flow 1.4, 2.4). Money is integer cents
 * only. Server numbers from the latest `POST /cart/validate` win; before the first answer (or after a change) the
 * client estimate is shown and labelled "Estimated".
 */
import type { DeliveryFees } from '@stimpy/api-client';
import { estimateSubtotalCents } from '@/features/cart/helpers';
import type { CartLine, CartValidationSummary } from '@/features/cart/types';
import { areaIdFor, feeLine, type CheckoutValues, type FeeLine } from './form';

export interface DisplayTotals {
  subtotalCents: number;
  /** `null` while the fee is unknown (fees failed and no validation yet). */
  feeCents: number | null;
  totalCents: number;
  /** "Estimated total": no area chosen yet, or no server answer for the current cart. */
  estimated: boolean;
  fee: FeeLine;
  /** Delivery estimate to show: the area's own, else `estimateText` of the latest validation / fees. */
  estimateText: string | null;
}

export function displayTotals(input: {
  lines: readonly CartLine[];
  validation: CartValidationSummary | null;
  values: Pick<CheckoutValues, 'areaChoice'>;
  fees: DeliveryFees | null;
}): DisplayTotals {
  const { lines, validation, values, fees } = input;
  const fee = feeLine(values, fees);
  // A validation only counts when it was computed for the area that is chosen now.
  const current = validation && validation.areaId === areaIdFor(values, fees) ? validation : null;
  const subtotalCents = current ? current.subtotalCents : estimateSubtotalCents(lines);

  let feeCents: number | null;
  if (current) feeCents = current.deliveryFeeCents;
  else if (fee.kind === 'unknown') feeCents = validation ? validation.deliveryFeeCents : null;
  else feeCents = fee.cents;

  const notChosen = fee.kind === 'from';
  const estimateText =
    fee.kind === 'area' ? fee.estimate : (current?.estimateText ?? validation?.estimateText ?? fees?.estimateText ?? null);
  return {
    subtotalCents,
    feeCents,
    totalCents: subtotalCents + (feeCents ?? 0),
    estimated: notChosen || fee.kind === 'unknown' || !current || feeCents === null,
    fee,
    estimateText,
  };
}
