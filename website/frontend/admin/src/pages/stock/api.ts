import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { fetchAllPages } from '../../lib/pagination';

export type StockSnapshot = Schemas['StockSnapshot'];
export type ItemType = 'HOODIE_VARIANT' | 'STIMPIE';
export type MovementReason = 'INITIAL' | 'RESTOCK' | 'CORRECTION' | 'DAMAGED' | 'ORDER_RESERVED' | 'ORDER_RELEASED' | 'ORDER_SOLD' | 'ORDER_RETURNED' | 'ORDER_WRITTEN_OFF';

export const REASON_LABEL: Record<MovementReason, string> = {
  INITIAL: 'Initial stock',
  RESTOCK: 'Restock',
  CORRECTION: 'Correction',
  DAMAGED: 'Damaged',
  ORDER_RESERVED: 'Order placed',
  ORDER_RELEASED: 'Order released',
  ORDER_SOLD: 'Order delivered',
  ORDER_RETURNED: 'Order returned (restocked)',
  ORDER_WRITTEN_OFF: 'Order returned (written off)',
};
export const REASONS = Object.keys(REASON_LABEL) as MovementReason[];

export function useStockHoodies({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.stockHoodies,
    enabled,
    queryFn: () => {
      const loadPage = (page: number, pageSize: number) =>
        unwrap(api.GET('/api/v1/admin/stock/hoodies', { params: { query: { page, pageSize } } }));
      return fetchAllPages(loadPage, 100, (hoodie) => hoodie.hoodieId);
    },
    staleTime: 15_000,
  });
}
export type StockHoodies = NonNullable<ReturnType<typeof useStockHoodies>['data']>;
export type StockCell = StockHoodies['items'][number]['cells'][number];

export function useStockStimpies() {
  return useQuery({
    queryKey: queryKeys.stockStimpies,
    queryFn: () => fetchAllPages(
      (page, pageSize) => unwrap(api.GET('/api/v1/admin/stock/stimpies', { params: { query: { page, pageSize } } })),
      100,
      (stimpie) => stimpie.stimpieId,
    ),
    staleTime: 15_000,
  });
}
export type StockStimpie = NonNullable<ReturnType<typeof useStockStimpies>['data']>['items'][number] & {
  artworkUrl?: string | null;
  imageUrl?: string | null;
  reserved?: number;
};

export interface MovementFilters {
  itemType?: ItemType;
  itemId?: number;
  reason?: MovementReason;
  orderId?: number;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useMovements(filters: MovementFilters) {
  return useQuery({
    queryKey: queryKeys.stockMovements(filters),
    queryFn: () => unwrap(api.GET('/api/v1/admin/stock/movements', { params: { query: filters } })),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** What a stock change makes stale (state-and-errors 4). */
export function invalidateStockCaches(qc: QueryClient): void {
  for (const key of [queryKeys.stock, queryKeys.overview, queryKeys.hoodies, queryKeys.stimpies, queryKeys.drops()]) {
    void qc.invalidateQueries({ queryKey: key as readonly string[] });
  }
}

export type AdjustInput =
  | { mode: 'adjust'; itemType: ItemType; itemId: number; delta: number; reason: 'RESTOCK' | 'CORRECTION' | 'DAMAGED'; note: string }
  | { mode: 'set'; itemType: ItemType; itemId: number; quantity: number; note: string };

/** `POST /admin/stock/adjust` or `/set`. Pessimistic: the cache takes the numbers the server returns. */
export function useStockChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdjustInput): Promise<StockSnapshot> => {
      if (input.mode === 'adjust') {
        return unwrap(
          api.POST('/api/v1/admin/stock/adjust', {
            body: {
              itemType: input.itemType,
              itemId: input.itemId,
              delta: input.delta,
              reason: input.reason,
              note: input.note,
            },
          }),
        );
      }
      return unwrap(
        api.POST('/api/v1/admin/stock/set', {
          body: {
            itemType: input.itemType,
            itemId: input.itemId,
            quantity: input.quantity,
            note: input.note,
          },
        }),
      );
    },
    onSuccess: (snapshot, input) => {
      if (input.itemType === 'HOODIE_VARIANT') {
        qc.setQueryData<StockHoodies>(queryKeys.stockHoodies, (old) =>
          old ? { ...old, items: old.items.map((h) => ({ ...h, cells: h.cells.map((c) => (c.variantId === input.itemId ? { ...c, ...snapshot } : c)) })) } : old,
        );
      } else {
        qc.setQueryData<{ items: StockStimpie[] }>(queryKeys.stockStimpies, (old) =>
          old ? { ...old, items: old.items.map((s) => (s.stimpieId === input.itemId ? { ...s, ...snapshot } : s)) } : old,
        );
      }
      invalidateStockCaches(qc);
    },
  });
}
