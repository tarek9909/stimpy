import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';

export type AdminPromotion = Schemas['AdminPromotion'];
export type PromotionTarget = AdminPromotion['targets'][number];
export type PromotionFormBody = {
  name: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  allProducts: boolean;
  targets: PromotionTarget[];
  startsAt: string | null;
  endsAt: string | null;
};

export const usePromotions = (page: number, pageSize: number) =>
  useQuery({
    queryKey: [...queryKeys.promotions, { page, pageSize }],
    queryFn: () => unwrap(api.GET('/api/v1/admin/promotions', { params: { query: { page, pageSize } } })),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

export const usePromotion = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.promotionDetail(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/admin/promotions/{id}', { params: { path: { id: id as number } } })),
    enabled: id !== null,
    staleTime: 0,
  });

export function usePromotionMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.promotions });
    void qc.invalidateQueries({ queryKey: ['hoodies'] });
    void qc.invalidateQueries({ queryKey: ['stimpies'] });
    void qc.invalidateQueries({ queryKey: ['packs'] });
  };
  const create = useMutation({
    mutationFn: (body: PromotionFormBody) => unwrap(api.POST('/api/v1/admin/promotions', { body })),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.promotionDetail(saved.id), saved);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PromotionFormBody> & { enabled?: boolean } }) =>
      unwrap(api.PATCH('/api/v1/admin/promotions/{id}', { params: { path: { id } }, body })),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.promotionDetail(saved.id), saved);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.DELETE('/api/v1/admin/promotions/{id}', { params: { path: { id } } }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
