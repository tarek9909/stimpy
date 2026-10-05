import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import type { DateRange } from '../../lib/ranges';

export type Profit = Schemas['FinanceProfit'];
export type Cash = Schemas['FinanceCash'];
export type Expense = Schemas['Expense'];
export type AdSpend = Schemas['AdSpend'];
export type CostKind = 'expenses' | 'ad-spend';

const rangeQuery = (r: DateRange) => ({ from: r.from ?? undefined, to: r.to ?? undefined });

export const useProfit = (range: DateRange) =>
  useQuery({
    queryKey: queryKeys.financeProfit(range),
    queryFn: () => unwrap(api.GET('/api/v1/admin/finance/profit', { params: { query: rangeQuery(range) } })),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export const useCash = () =>
  useQuery({
    queryKey: queryKeys.financeCash,
    queryFn: () => unwrap(api.GET('/api/v1/admin/finance/cash')),
    staleTime: 15_000,
  });

export interface CostFilters {
  from: string | null;
  to: string | null;
  category?: string;
  page: number;
  pageSize: number;
}

export const useExpenses = (f: CostFilters) =>
  useQuery({
    queryKey: queryKeys.expenses(f),
    queryFn: () => unwrap(api.GET('/api/v1/admin/expenses', { params: { query: { ...rangeQuery(f), category: f.category || undefined, page: f.page, pageSize: f.pageSize } } })),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export const useAdSpend = (f: CostFilters) =>
  useQuery({
    queryKey: queryKeys.adSpend(f),
    queryFn: () => unwrap(api.GET('/api/v1/admin/ad-spend', { params: { query: { ...rangeQuery(f), page: f.page, pageSize: f.pageSize } } })),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export interface ExpenseBody {
  category: string;
  amountCents: number;
  note: string | null;
  spentOn: string;
}
export interface AdSpendBody {
  channel: string;
  amountCents: number;
  note: string | null;
  spentOn: string;
}

/** Costs feed profit (and the Overview revenue card): every write invalidates finance. */
export function useCostMutations(kind: CostKind) {
  const qc = useQueryClient();
  const done = () => {
    for (const k of [kind === 'expenses' ? ['expenses'] : ['ad-spend'], ['finance'], ['overview']]) void qc.invalidateQueries({ queryKey: k });
  };
  const create = useMutation({
    mutationFn: async (body: ExpenseBody | AdSpendBody): Promise<Expense | AdSpend> =>
      kind === 'expenses' ? unwrap(api.POST('/api/v1/admin/expenses', { body: body as ExpenseBody })) : unwrap(api.POST('/api/v1/admin/ad-spend', { body: body as AdSpendBody })),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: ExpenseBody | AdSpendBody }): Promise<Expense | AdSpend> =>
      kind === 'expenses'
        ? unwrap(api.PATCH('/api/v1/admin/expenses/{id}', { params: { path: { id } }, body: body as ExpenseBody }))
        : unwrap(api.PATCH('/api/v1/admin/ad-spend/{id}', { params: { path: { id } }, body: body as AdSpendBody })),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: number) => (kind === 'expenses' ? api.DELETE('/api/v1/admin/expenses/{id}', { params: { path: { id } } }) : api.DELETE('/api/v1/admin/ad-spend/{id}', { params: { path: { id } } })),
    onSuccess: done,
  });
  return { create, update, remove };
}
