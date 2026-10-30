/**
 * Small text helpers over an order's items. E-mail / WhatsApp placeholder values and links are WP-C's
 * (`services/template-values.ts`, `services/whatsapp.ts`); this file only has what the order lists need.
 */
import type { OrderItemDetail } from './pricing';

export type TextItem = { name: string; kind: 'PACK' | 'STIMPIE_PACK' | 'HOODIE' | 'STIMPIE'; qty: number; detail: unknown };

/** Reads an `order_items.detail` JSON column defensively. */
export function itemDetail(d: unknown): OrderItemDetail {
  const o = (d && typeof d === 'object' ? d : {}) as Partial<OrderItemDetail>;
  const stimpies = Array.isArray(o.stimpies) ? o.stimpies.filter((s): s is string => typeof s === 'string') : [];
  const stimpieQuantities = Array.isArray(o.stimpieQuantities)
    ? o.stimpieQuantities.filter((entry): entry is { name: string; qty: number } =>
        !!entry && typeof entry === 'object' && typeof entry.name === 'string' && Number.isInteger(entry.qty) && entry.qty > 0,
      )
    : stimpies.map((name) => ({ name, qty: 1 }));
  return {
    hoodie: typeof o.hoodie === 'string' ? o.hoodie : null,
    color: typeof o.color === 'string' ? o.color : null,
    size: typeof o.size === 'string' ? o.size : null,
    stimpies,
    stimpieQuantities,
  };
}

/** One-line summary for the dashboard list: "Hoodie + 2 Stimpies, 3 x Stimpy Hoodie, 1 Stimpie". */
export function itemsSummary(items: TextItem[]): string {
  return items
    .map((i) => {
      if (i.kind === 'STIMPIE') return `${i.qty} Stimpie${i.qty === 1 ? '' : 's'}`;
      return `${i.qty > 1 ? `${i.qty} x ` : ''}${i.name}`;
    })
    .join(', ');
}
