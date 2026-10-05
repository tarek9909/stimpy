import type { CartItem } from '@stimpy/api-client';

/** Exact shapes of checkout-and-order-flow.md section 1.1. Only `item` is ever sent to the API. */

export type { CartItem };

export type CartLineState = 'OK' | 'PRICE_CHANGED' | 'ADJUSTED' | 'UNAVAILABLE';

export interface CartLineStimpie {
  id: number;
  slug: string;
  name: string;
  artworkUrl: string;
  type: 'CORE' | 'LIMITED';
}

export interface CartLineUi {
  /** "Hoodie + 2 Stimpies", "Stimpie: Neon Koi" */
  title: string;
  imageUrl: string | null;
  /** Used for "pick another size" links; not needed for validation. */
  hoodieSlug: string | null;
  packSlug: string | null;
  colorName: string | null;
  colorHex: string | null;
  sizeLabel: string | null;
  stimpies: CartLineStimpie[];
  /** Client ESTIMATE from the catalog when added or last re-validated. Never sent. */
  unitPriceCents: number;
  /** ISO date. */
  addedAt: string;
}

export interface CartLineCheck {
  state: CartLineState;
  reasons: string[];
  /** ISO date of the last validation that touched this line. */
  checkedAt: string | null;
}

export interface CartLine {
  /** crypto.randomUUID(); UI key only. */
  lineId: string;
  /** EXACT contract shape, the only part sent to POST /orders. */
  item: CartItem;
  ui: CartLineUi;
  check: CartLineCheck;
}

/** Latest `POST /cart/validate` totals; they replace the client estimate while fresh. */
export interface CartValidationSummary {
  ok: boolean;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  estimateText: string;
  checkedAt: string;
  /** Area the delivery fee was computed for. */
  areaId: number | null;
}

export const CART_MAX_LINES = 20;
export const CART_MAX_QTY = 10;
export const CART_MIN_QTY = 1;
