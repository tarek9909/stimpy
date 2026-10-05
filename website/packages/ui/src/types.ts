/**
 * Structural data shapes the presentational components accept. They are deliberately minimal
 * subsets of the API contract (backend/api-reference.md section 2), so the generated
 * `@stimpy/api-client` types are assignable without importing them here.
 */

export type Cents = number;
export type ISODate = string;

export type AccentColor = 'BUTTER' | 'SKY' | 'LILAC';
export type DropState = 'UPCOMING' | 'LIVE' | 'SOLD_OUT' | 'ENDED';
export type StimpieStatus = 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';
export type StimpieType = 'CORE' | 'LIMITED';
export type OrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export interface ColorLike {
  id: number;
  name: string;
  hex: string;
}

export interface SizeLike {
  id: number;
  label: string;
}

export interface VariantLike {
  colorId: number;
  sizeId: number;
  inStock: boolean;
  remaining: number | null;
}

export interface HoodieSummaryLike {
  slug: string;
  name: string;
  priceCents: Cents;
  images: string[];
  colors: ColorLike[];
  inStock: boolean;
}

export interface StimpieLike {
  slug: string;
  name: string;
  type: StimpieType;
  priceCents: Cents;
  images: string[];
  artworkUrl: string;
  drop: { slug?: string; name: string; accentColor: AccentColor } | null;
  status: StimpieStatus;
  remaining: number | null;
  purchasable: boolean;
}

export interface PackLike {
  slug?: string;
  name: string;
  description: string;
  priceCents: Cents;
  badge: string | null;
}

export interface DropLike {
  slug: string;
  name: string;
  accentColor: AccentColor;
  startsAt: ISODate;
  endsAt: ISODate | null;
  state: DropState;
  teaserImage: string | null;
  unitsRemaining: number | null;
}

export interface TimelineEntryLike {
  status: OrderStatus;
  at: ISODate;
}

export interface ReviewLike {
  name: string;
  text: string;
  mediaUrl?: string | null;
}
