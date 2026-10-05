import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RequestBody } from '@stimpy/api-client';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { filenameFromDisposition, todayStamp } from '../../lib/download';
import type { BulkTarget, OrderStatus, WhatsappTemplate } from './status';

export type AdminOrder = Schemas['AdminOrder'];
export type AdminOrderSummary = Schemas['AdminOrderSummary'];
export type OrderWarning = AdminOrder['warnings'][number];

/** The normalised list filters (what the URL holds). `status` is the API list (`CONFIRMED,PACKED`). */
export interface OrderListFilters {
  status?: string;
  source?: 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL';
  areaId?: number;
  dropId?: number;
  from?: string;
  to?: string;
  deliveryNumber?: string;
  q?: string;
  holdExpired?: boolean;
  sort: string;
  page: number;
  pageSize: number;
}

function toQuery(f: OrderListFilters) {
  return {
    status: f.status || undefined,
    source: f.source,
    areaId: f.areaId,
    dropId: f.dropId,
    from: f.from || undefined,
    to: f.to || undefined,
    deliveryNumber: f.deliveryNumber || undefined,
    q: f.q || undefined,
    holdExpired: f.holdExpired ? ('true' as const) : undefined,
    sort: f.sort,
    page: f.page,
    pageSize: f.pageSize,
  };
}

export function useOrdersList(filters: OrderListFilters) {
  return useQuery({
    queryKey: queryKeys.ordersList(filters),
    queryFn: () => unwrap(api.GET('/api/v1/admin/orders', { params: { query: toQuery(filters) } })),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

/** Tab badges. The shell polls the same key every 30 s; this hook only reads it (and loads it once). */
export function useOrderCounts() {
  return useQuery({
    queryKey: queryKeys.ordersCounts,
    queryFn: () => unwrap(api.GET('/api/v1/admin/orders/counts')),
    staleTime: 15_000,
    retry: false,
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: queryKeys.orderDetail(id),
    queryFn: () => unwrap(api.GET('/api/v1/admin/orders/{id}', { params: { path: { id } } })),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * What an order change makes stale (state-and-errors 4). Order detail of `keepId` is not refetched:
 * the caller has just written the server's answer into it.
 */
export function invalidateOrderCaches(qc: QueryClient, opts: { keepId?: number } = {}): void {
  void qc.invalidateQueries({
    queryKey: queryKeys.orders,
    predicate: (q) => !(opts.keepId !== undefined && q.queryKey[1] === 'detail' && q.queryKey[2] === opts.keepId),
  });
  for (const key of [queryKeys.stock, queryKeys.deliveries(), queryKeys.finance, queryKeys.overview, ['insights'], ['customers'], ['email-log']]) {
    void qc.invalidateQueries({ queryKey: key as readonly string[] });
  }
}

function useOrderWriter<V>(id: number, fn: (v: V) => Promise<AdminOrder>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orderDetail(id), order);
      invalidateOrderCaches(qc, { keepId: id });
    },
  });
}

export interface StatusChange {
  to: OrderStatus;
  note?: string;
  cancelReason?: string;
  deliveryNumber?: string;
  restock?: boolean;
}

/** `POST /admin/orders/:id/status`. Pessimistic: the cache takes the server's order, nothing is flipped early. */
export function useChangeStatus(id: number) {
  return useOrderWriter<StatusChange>(id, (body) => unwrap(api.POST('/api/v1/admin/orders/{id}/status', { params: { path: { id } }, body })));
}

/** `POST /admin/orders/:id/delivery`: corrects the delivery number of an order that is already out. */
export function useSetDeliveryNumber(id: number) {
  return useOrderWriter<{ deliveryNumber: string }>(id, (body) => unwrap(api.POST('/api/v1/admin/orders/{id}/delivery', { params: { path: { id } }, body })));
}

export function useUpdateContact(id: number) {
  return useOrderWriter<{ email?: string | null; phone?: string; whatsapp?: string }>(id, (body) =>
    unwrap(api.PATCH('/api/v1/admin/orders/{id}/contact', { params: { path: { id } }, body })),
  );
}

export function useUpdateDelivery(id: number) {
  return useOrderWriter<{ areaId?: number | null; areaName?: string; address?: string; notes?: string | null }>(id, (delivery) =>
    unwrap(api.PATCH('/api/v1/admin/orders/{id}', { params: { path: { id } }, body: { delivery } })),
  );
}

export function useSetCash(id: number) {
  return useOrderWriter<{ collected?: boolean; settled?: boolean }>(id, (body) => unwrap(api.POST('/api/v1/admin/orders/{id}/cash', { params: { path: { id } }, body })));
}

export function useAddNote(id: number) {
  return useOrderWriter<{ body: string }>(id, (body) => unwrap(api.POST('/api/v1/admin/orders/{id}/notes', { params: { path: { id } }, body })));
}

export function useExtendHold(id: number) {
  return useOrderWriter<{ hours: number }>(id, (body) => unwrap(api.POST('/api/v1/admin/orders/{id}/extend-hold', { params: { path: { id } }, body })));
}

export function useSendEmail(id: number) {
  return useOrderWriter<{ template: string } | { subject: string; body: string }>(id, (body) =>
    unwrap(api.POST('/api/v1/admin/orders/{id}/email', { params: { path: { id } }, body })),
  );
}

/** `POST /admin/orders/bulk-status`. The result lists per-order failures; the caller shows the result dialog. */
export function useBulkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ids: number[]; to: BulkTarget }) => unwrap(api.POST('/api/v1/admin/orders/bulk-status', { body: v })),
    onSuccess: (res) => {
      for (const id of res.updated) void qc.invalidateQueries({ queryKey: queryKeys.orderDetail(id) });
      invalidateOrderCaches(qc);
    },
  });
}

/** `GET /admin/orders/:id/whatsapp`: never cached across opens (staleTime 0, fetched on click). */
export function fetchWhatsapp(qc: QueryClient, id: number, template: WhatsappTemplate) {
  return qc.fetchQuery({
    queryKey: queryKeys.orderWhatsapp(id, template),
    queryFn: () => unwrap(api.GET('/api/v1/admin/orders/{id}/whatsapp', { params: { path: { id }, query: { template } } })),
    staleTime: 0,
  });
}

/** Other orders that already carry a delivery number (advisory duplicate notice, never blocks). */
export async function findOrdersByDeliveryNumber(deliveryNumber: string, excludeId?: number): Promise<AdminOrderSummary[]> {
  const page = await unwrap(api.GET('/api/v1/admin/orders', { params: { query: { deliveryNumber, pageSize: 6 } } }));
  return page.items.filter((o) => o.id !== excludeId && o.deliveryNumber === deliveryNumber);
}

export type ExportBody = RequestBody<'/api/v1/admin/orders/export', 'post'>;

/** `POST /admin/orders/export` -> the CSV blob and the file name from `Content-Disposition`. */
export async function exportOrdersCsv(body: ExportBody): Promise<{ blob: Blob; filename: string }> {
  const result = await api.POST('/api/v1/admin/orders/export', { body, parseAs: 'blob' });
  const blob = result.data as unknown as Blob;
  const type = result.response.headers.get('content-type') ?? '';
  if (!type.startsWith('text/csv')) throw new Error('The export did not return a CSV file.');
  return { blob, filename: filenameFromDisposition(result.response.headers.get('content-disposition'), `orders-${todayStamp()}.csv`) };
}

/** Orders for the print views (full `AdminOrder` data; there is no print endpoint by design). */
export function useOrdersByIds(ids: number[]) {
  return useQuery({
    queryKey: ['orders', 'print', ids.join(',')] as const,
    queryFn: async () => Promise.all(ids.map((id) => unwrap(api.GET('/api/v1/admin/orders/{id}', { params: { path: { id } } })))),
    enabled: ids.length > 0,
    staleTime: 0,
  });
}

/** Most orders one print run covers (each is one request, so the cap keeps a run quick). */
export const PRINT_CAP = 200;

/** Every order matching `filters` (up to `PRINT_CAP`), as ids in list order. Pages through the list endpoint. */
export function useMatchingOrderIds(filters: Omit<OrderListFilters, 'page' | 'pageSize' | 'sort'> | null) {
  return useQuery({
    queryKey: ['orders', 'print-ids', filters] as const,
    enabled: filters !== null,
    staleTime: 0,
    queryFn: async () => {
      const ids: number[] = [];
      let total = 0;
      for (let page = 1; ids.length < PRINT_CAP; page++) {
        const res = await unwrap(api.GET('/api/v1/admin/orders', { params: { query: toQuery({ ...filters!, sort: 'number', page, pageSize: 100 }) } }));
        total = res.total;
        ids.push(...res.items.map((o) => o.id));
        if (res.items.length < 100 || ids.length >= res.total) break;
      }
      return { ids: ids.slice(0, PRINT_CAP), total };
    },
  });
}
