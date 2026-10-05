import { formatCents } from '@stimpy/ui';
import type { DeliveryFees } from '@stimpy/api-client';

type Area = DeliveryFees['areas'][number];

/** `feeCents ?? defaultFeeCents`; a fee of 0 reads "Free delivery" (state-and-errors 12.1). */
export function feeText(area: Pick<Area, 'feeCents'>, defaultFeeCents: number): string {
  const cents = area.feeCents ?? defaultFeeCents;
  return cents === 0 ? 'Free delivery' : formatCents(cents);
}

/** "{n} working days" when the area has its own estimate, otherwise the global estimate text. */
export function estimateFor(area: Pick<Area, 'estDays'>, estimateText: string): string {
  return area.estDays ? `${area.estDays} working ${area.estDays === 1 ? 'day' : 'days'}` : estimateText;
}
