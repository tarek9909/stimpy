import type { OrderStatus } from '@stimpy/ui';

export type { OrderStatus };

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

/** Button label per target status (dashboard-pages 6.3). `NEW` is never offered: nothing leads back to it. */
export const ACTION_LABEL: Record<OrderStatus, string | null> = {
  NEW: null,
  CONFIRMED: 'Confirm order',
  PACKED: 'Mark as packed',
  OUT_FOR_DELIVERY: 'Send out for delivery',
  DELIVERED: 'Mark delivered',
  RETURNED: 'Mark returned',
  CANCELLED: 'Cancel order',
};

/** URL tab values of the Orders page (dashboard-pages 5.1). `TO_PACK` and `CLOSED` are UI aliases. */
export const ORDER_TABS = ['ALL', 'NEW', 'TO_PACK', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CLOSED'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const TAB_LABEL: Record<OrderTab, string> = {
  ALL: 'All',
  NEW: 'New',
  TO_PACK: 'To pack',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CLOSED: 'Returned & cancelled',
};

/** The API `status` list a tab sends (comma separated; one request, one paginated list). */
export const TAB_STATUSES: Record<OrderTab, OrderStatus[]> = {
  ALL: [],
  NEW: ['NEW'],
  TO_PACK: ['CONFIRMED', 'PACKED'],
  OUT_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
  DELIVERED: ['DELIVERED'],
  CLOSED: ['CANCELLED', 'RETURNED'],
};

type Counts = Record<'ALL' | OrderStatus, number>;

/** Badge number of a tab from `GET /admin/orders/counts` (sums for the two alias tabs). */
export function tabCount(tab: OrderTab, counts: Counts | undefined): number | undefined {
  if (!counts) return undefined;
  if (tab === 'ALL') return counts.ALL;
  return TAB_STATUSES[tab].reduce((sum, s) => sum + (counts[s] ?? 0), 0);
}

/** Which bulk actions exist and the only status every selected order must have (dashboard-pages 5.5). */
export const BULK_ACTIONS = [
  { to: 'CONFIRMED', from: 'NEW', label: 'Mark confirmed', done: 'Confirmed', onlyHint: 'Select only New orders' },
  { to: 'PACKED', from: 'CONFIRMED', label: 'Mark packed', done: 'Packed', onlyHint: 'Select only Confirmed orders' },
  { to: 'DELIVERED', from: 'OUT_FOR_DELIVERY', label: 'Mark delivered', done: 'Delivered', onlyHint: 'Select only Out for delivery orders' },
] as const;
export type BulkTarget = (typeof BULK_ACTIONS)[number]['to'];

/** Plain reasons for a failed order in a bulk result (dashboard-pages 5.5). */
export function bulkFailureReason(code: string): string {
  switch (code) {
    case 'INVALID_TRANSITION':
      return 'Not in the right status';
    case 'NOT_FOUND':
      return 'Order no longer exists';
    case 'DELIVERY_NUMBER_REQUIRED':
      return 'Needs a delivery number';
    case 'SOLD_OUT':
      return 'Out of stock';
    default:
      return 'Something went wrong';
  }
}

export type WhatsappTemplate = 'order_confirmation' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered';

export const WHATSAPP_TEMPLATES: Array<{ value: WhatsappTemplate; label: string }> = [
  { value: 'order_confirmation', label: 'Order confirmation' },
  { value: 'ready_for_delivery', label: 'Ready for delivery' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
];

/** Default WhatsApp template from the status; other statuses show no button in the list (dashboard-pages 5.7). */
export function defaultWhatsappTemplate(status: OrderStatus): WhatsappTemplate | null {
  switch (status) {
    case 'NEW':
    case 'CONFIRMED':
      return 'order_confirmation';
    case 'PACKED':
      return 'ready_for_delivery';
    case 'OUT_FOR_DELIVERY':
      return 'out_for_delivery';
    case 'DELIVERED':
      return 'delivered';
    default:
      return null;
  }
}

export const EMAIL_TEMPLATE_NAME: Record<string, string> = {
  order_received: 'Order received',
  order_confirmed: 'Order confirmed',
  order_out_for_delivery: 'On its way',
  order_delivered: 'Delivered',
  order_cancelled: 'Order cancelled',
  orders_lookup: 'Order numbers',
  custom: 'Message from you',
  founder_new_order: 'New order alert',
  founder_low_stock: 'Low stock alert',
};

/** Templates the Resend button can send again (`POST /admin/orders/:id/email { template }`). */
export const RESENDABLE_TEMPLATES: readonly string[] = ['order_received', 'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled'];

export function emailTemplateName(key: string): string {
  return EMAIL_TEMPLATE_NAME[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const SOURCE_LABEL = { WEBSITE: 'Website', INSTAGRAM: 'Instagram DM', WHATSAPP: 'WhatsApp', MANUAL: 'Manual' } as const;
export const SOURCES = ['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MANUAL'] as const;

export const CANCEL_REASON_CHIPS = ['Customer changed mind', "Couldn't reach customer", 'Out of stock', 'Duplicate order'] as const;
