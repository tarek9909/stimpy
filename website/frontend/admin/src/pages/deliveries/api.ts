import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { fetchAllPages } from '../../lib/pagination';
import { invalidateOrderCaches } from '../orders/api';

export type Area = Schemas['Area'];
export type DeliverySettings = Schemas['DeliverySettings'];

export interface DeliveryFilters {
  tab: 'OUT' | 'DELIVERED';
  q?: string;
  page: number;
  pageSize: number;
}

export function useDeliveries(filters: DeliveryFilters) {
  return useQuery({
    queryKey: ['deliveries', filters.tab, filters.q ?? '', filters.page, filters.pageSize] as const,
    queryFn: () => unwrap(api.GET('/api/v1/admin/deliveries', { params: { query: { tab: filters.tab, q: filters.q || undefined, page: filters.page, pageSize: filters.pageSize } } })),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
export type DeliveryRow = NonNullable<ReturnType<typeof useDeliveries>['data']>['items'][number];

/**
 * Confirmation copy shared by Finance -> Cash and Orders -> Delivered (dashboard-pages 11.2: "Mark all 3 orders on
 * D-88231 as settled? You received $174.00."). The server only flips the UNSETTLED orders of the group, so when some
 * were settled earlier the copy names just the ones that change and the cash they represent.
 */
export function groupSettlementConfirmation(deliveryNumber: string, orderCount: number, received: string, wholeGroup = true): string {
  const orders = orderCount === 1 ? 'order' : 'orders';
  if (wholeGroup) return `Mark ${orderCount === 1 ? '1 order' : `all ${orderCount} orders`} on ${deliveryNumber} as settled? You received ${received}.`;
  return `Mark ${orderCount} unsettled ${orders} on ${deliveryNumber} as settled? You received ${received}.`;
}

/**
 * Load the complete delivered-order group before confirming a group settlement. The list endpoint
 * searches by substring, so filter the complete search result back to the exact delivery number.
 */
export async function getDeliveredOrdersForDelivery(deliveryNumber: string): Promise<DeliveryRow[]> {
  const exactNumber = deliveryNumber.trim();
  if (!exactNumber) throw new Error('A delivery number is required.');
  const page = await fetchAllPages((page, pageSize) =>
    unwrap(api.GET('/api/v1/admin/deliveries', { params: { query: { tab: 'DELIVERED', q: exactNumber, page, pageSize } } })),
    100,
    (row) => row.orderId,
  );
  return page.items.filter((row) => row.deliveryNumber?.trim() === exactNumber);
}

/** Complete packed-order list for dispatch, including records after the first API page. */
export function usePackedOrders(enabled: boolean) {
  return useQuery({
    queryKey: ['orders', 'list', { status: 'PACKED', pageSize: 100, for: 'dispatch' }] as const,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/orders', { params: { query: { status: 'PACKED', page, pageSize, sort: 'number' } } }))),
    enabled,
    staleTime: 0,
  });
}

export function useDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orders: Array<{ orderId: number; deliveryNumber: string }>) => unwrap(api.POST('/api/v1/admin/deliveries/dispatch', { body: { orders } })),
    onSuccess: (res) => {
      for (const id of res.dispatched) void qc.invalidateQueries({ queryKey: queryKeys.orderDetail(id) });
      invalidateOrderCaches(qc);
    },
  });
}

/** `POST /admin/deliveries/:deliveryNumber/settle`. Shared with Finance -> Cash collection. */
export function useSettleDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { deliveryNumber: string; settled: boolean }) =>
      unwrap(api.POST('/api/v1/admin/deliveries/{deliveryNumber}/settle', { params: { path: { deliveryNumber: v.deliveryNumber } }, body: { settled: v.settled } })),
    onSuccess: (res) => {
      for (const id of res.orderIds) void qc.invalidateQueries({ queryKey: queryKeys.orderDetail(id) });
      invalidateCashCaches(qc);
    },
  });
}

/** `POST /admin/orders/:id/cash` for one order (no delivery number to settle by). */
export function useSettleOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; settled: boolean }) => unwrap(api.POST('/api/v1/admin/orders/{id}/cash', { params: { path: { id: v.id } }, body: { settled: v.settled } })),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orderDetail(order.id), order);
      invalidateCashCaches(qc);
    },
  });
}

export function invalidateCashCaches(qc: QueryClient): void {
  for (const key of [queryKeys.orders, queryKeys.deliveries(), queryKeys.finance, queryKeys.overview]) {
    void qc.invalidateQueries({ queryKey: key as readonly string[] });
  }
}

export function useDeliverySettings() {
  return useQuery({
    queryKey: queryKeys.deliverySettings,
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings/delivery')),
    staleTime: 5 * 60_000,
  });
}

export function useSaveDeliverySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<DeliverySettings>) => unwrap(api.PATCH('/api/v1/admin/settings/delivery', { body })),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.deliverySettings, data);
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
      void qc.invalidateQueries({ queryKey: ['order-form'] });
    },
  });
}

export interface AreaInput {
  name: string;
  feeCents: number | null;
  estDays: number | null;
  active: boolean;
}

function invalidateAreas(qc: QueryClient): void {
  for (const key of [queryKeys.areas, queryKeys.deliveries(), queryKeys.overview, ['order-form']]) void qc.invalidateQueries({ queryKey: key as readonly string[] });
}

export function useCreateArea() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: AreaInput) => unwrap(api.POST('/api/v1/admin/areas', { body })), onSuccess: () => invalidateAreas(qc) });
}

export function useUpdateArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number } & Partial<AreaInput>) => {
      const { id, ...body } = v;
      return unwrap(api.PATCH('/api/v1/admin/areas/{id}', { params: { path: { id } }, body }));
    },
    onSuccess: () => invalidateAreas(qc),
  });
}

export function useDeleteArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/v1/admin/areas/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAreas(qc),
  });
}
