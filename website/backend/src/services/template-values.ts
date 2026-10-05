import type { AppContext } from '../context';
import type { Db, Prisma } from '../lib/db';
import { AppError } from '../lib/errors';
import { formatUsd } from '../lib/money';
import { tzOffsetMs } from '../lib/dates';

/**
 * Placeholder values for e-mail and WhatsApp templates (integrations.md section 5). Pure formatting lives here so that
 * the e-mail queue, the WhatsApp links and the dashboard previews all produce identical text.
 */
export type TemplateValues = Record<string, string>;

export type ItemForText = {
  name: string;
  qty: number;
  detail?: unknown;
};

type ItemDetail = { hoodie?: string | null; color?: string | null; size?: string | null; stimpies?: string[] | null };

function readDetail(detail: unknown): { hoodie: string | null; color: string | null; size: string | null; stimpies: string[] } {
  const d = (detail && typeof detail === 'object' ? detail : {}) as ItemDetail;
  return {
    hoodie: typeof d.hoodie === 'string' && d.hoodie ? d.hoodie : null,
    color: typeof d.color === 'string' && d.color ? d.color : null,
    size: typeof d.size === 'string' && d.size ? d.size : null,
    stimpies: Array.isArray(d.stimpies) ? d.stimpies.filter((s): s is string => typeof s === 'string') : [],
  };
}

/** `- Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1`, one line per item. */
export function formatItemsText(items: ItemForText[]): string {
  return items
    .map((it) => {
      const d = readDetail(it.detail);
      const variant = [d.color, d.size].filter(Boolean).join(', ');
      const stimpies = d.stimpies.filter((s) => s !== it.name).join(', ');
      let inner = variant;
      if (stimpies) inner = inner ? `${inner}: ${stimpies}` : stimpies;
      return `- ${it.name}${inner ? ` (${inner})` : ''} x${it.qty}`;
    })
    .join('\n');
}

export const trackingUrl = (webUrl: string, orderNumber?: string): string =>
  orderNumber ? `${webUrl}/track?order=${encodeURIComponent(orderNumber)}` : `${webUrl}/track`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `14 Oct 2026` in the business timezone (assembled by hand: Intl output differs between ICU versions). */
export function formatDateInTz(d: Date, tz: string): string {
  const local = new Date(d.getTime() + tzOffsetMs(d, tz));
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

/** `STP-1042 - 14 Oct 2026 - Delivered - $58.00` */
export function formatOrderListLine(o: { number: string; placedAt: Date; status: string; totalCents: number }, tz: string): string {
  return `${o.number} - ${formatDateInTz(o.placedAt, tz)} - ${STATUS_LABELS[o.status] ?? o.status} - ${formatUsd(o.totalCents)}`;
}

/** `cancel_reason` renders as " Reason: ..." (leading space) when present, otherwise empty (integrations 3). */
export const cancelReasonText = (reason: string | null | undefined): string => (reason && reason.trim() ? ` Reason: ${reason.trim()}` : '');

/** Sample data used by previews and test sends (integrations 3: order STP-1042, three items, total $45.00). */
export function sampleValues(webUrl: string, tz: string): TemplateValues {
  return {
    customer_name: 'Rami Haddad',
    order_number: 'STP-1042',
    items: formatItemsText([
      { name: 'Hoodie + 2 Stimpies', qty: 1, detail: { color: 'Black', size: 'M', stimpies: ['THE VOID', 'THE CEDAR'] } },
      { name: 'THE DREAMER', qty: 1 },
    ]),
    total: formatUsd(4500),
    delivery_number: 'D-88231',
    tracking_url: trackingUrl(webUrl, 'STP-1042'),
    shop_url: `${webUrl}/shop`,
    cancel_reason: ' Reason: Out of stock',
    order_list: [
      formatOrderListLine({ number: 'STP-1042', placedAt: new Date('2026-10-14T09:30:00Z'), status: 'DELIVERED', totalCents: 4500 }, tz),
      formatOrderListLine({ number: 'STP-1031', placedAt: new Date('2026-10-02T15:10:00Z'), status: 'OUT_FOR_DELIVERY', totalCents: 3500 }, tz),
    ].join('\n'),
  };
}

/** Everything the order-bound templates need, read from the order (works inside a transaction). */
export async function loadOrderTemplateValues(ctx: AppContext, db: Db, orderId: number): Promise<{ values: TemplateValues; order: LoadedOrder }> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: 'asc' } } } });
  if (!order) throw AppError.notFound('Order not found.');
  return { values: orderToValues(ctx, order), order };
}

export type LoadedOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

export function orderToValues(
  ctx: AppContext,
  order: { number: string; customerName: string; totalCents: number; deliveryNumber: string | null; cancelReason: string | null; items: ItemForText[] },
): TemplateValues {
  return {
    customer_name: order.customerName,
    order_number: order.number,
    items: formatItemsText(order.items),
    total: formatUsd(order.totalCents),
    delivery_number: order.deliveryNumber ?? '',
    tracking_url: trackingUrl(ctx.config.webUrl, order.number),
    cancel_reason: cancelReasonText(order.cancelReason),
    order_list: '',
  };
}
