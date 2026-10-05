/** Public surface of the orders module for other modules (e.g. `GET /admin/search` in the customers/insights work package). */
export { toAdminOrderSummary, summaryInclude, toOrderItem, isHoldExpired } from './mappers';
export type { OrderWithItems, AdminOrderSummaryDto } from './mappers';
export { ordersModule } from './routes';
