import { summaryInclude } from '../modules/orders/mappers';

/**
 * WP-C reads order summaries through WP-B's mapper (`modules/orders`), so lists in customers, search and overview
 * are identical to the Orders list.
 */
export { toAdminOrderSummary as toOrderSummary } from '../modules/orders/mappers';
export type { OrderWithItems, AdminOrderSummaryDto } from '../modules/orders/mappers';
export { adminOrderSummarySchema } from '../modules/orders/schemas';

export const orderSummaryArgs = { include: summaryInclude };
