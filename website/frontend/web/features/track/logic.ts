/**
 * Pure rules of the tracking page (checkout-and-order-flow 6). No React, no fetching.
 */
import type { TrackedOrder } from '@stimpy/api-client';
import type { TimelineStep } from '@stimpy/ui';
import { isEmailShape, isLebanesePhone } from '@/features/checkout/form';

export const TRACK_NOT_FOUND =
  "We couldn't find an order with those details. Check the order number and use the phone number you ordered with.";
export const TRACK_NETWORK = "Couldn't reach the server. Try again.";

export const HAPPY_STEPS: TimelineStep[] = [
  { status: 'NEW', label: 'Received' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'PACKED', label: 'Packed' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function isTerminal(status: TrackedOrder['status']): boolean {
  return status === 'CANCELLED' || status === 'RETURNED';
}

/**
 * The five steps; for a cancelled or returned order the line stops at the last reached step (later steps are
 * hidden) and the timeline adds the terminal step.
 */
export function visibleSteps(order: Pick<TrackedOrder, 'status' | 'timeline'>): TimelineStep[] {
  if (!isTerminal(order.status)) return HAPPY_STEPS;
  return HAPPY_STEPS.filter((s) => order.timeline.some((t) => t.status === s.status));
}

/** "Pay cash at the door" and the delivery estimate only apply while the order is still on its way. */
export function isOpenOrder(status: TrackedOrder['status']): boolean {
  return status !== 'DELIVERED' && status !== 'CANCELLED' && status !== 'RETURNED';
}

export interface TrackFormValues {
  orderNumber: string;
  phone: string;
}

export interface TrackFormErrors {
  orderNumber?: string;
  phone?: string;
}

export function validateTrackForm(v: TrackFormValues): TrackFormErrors {
  const errors: TrackFormErrors = {};
  if (v.orderNumber.trim() === '') errors.orderNumber = 'Enter your order number.';
  if (v.phone.trim() === '') errors.phone = 'Enter the phone number you ordered with.';
  else if (!isLebanesePhone(v.phone)) errors.phone = 'Enter a Lebanese phone number, like 03 123 456.';
  return errors;
}

export function validateLostEmail(email: string): string | null {
  return isEmailShape(email) ? null : 'Enter a valid email address.';
}

/** Order number from `?order=`: trimmed, upper-cased for display, limited to a sane charset and length. */
export function orderFromQuery(search: string): string {
  const raw = new URLSearchParams(search).get('order') ?? '';
  return raw.replace(/[^A-Za-z0-9#-]/g, '').slice(0, 20).toUpperCase();
}
