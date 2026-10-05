import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { fetchAllPages } from '../../lib/pagination';
import type { AdminDrop } from './dropForm';
import { toDropBody, type DropFormValues } from './dropForm';

export type { AdminDrop };
export type DropTab = 'UPCOMING' | 'LIVE' | 'ARCHIVE';
export type Subscriber = Schemas['Subscriber'];

export const useDrops = (state: DropTab, page = 1, pageSize = 25, refetchInterval?: number) =>
  useQuery({
    queryKey: [...queryKeys.drops(state), { page, pageSize }],
    queryFn: () => unwrap(api.GET('/api/v1/admin/drops', { params: { query: { state, page, pageSize } } })),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    refetchInterval,
  });

/** Every drop (small list): overlap warning and selects. */
export const useEveryDrop = () =>
  useQuery({
    queryKey: ['drops', 'every'] as const,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/drops', { params: { query: { page, pageSize } } }))),
    staleTime: 15_000,
  });

export const useDrop = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.dropDetail(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/admin/drops/{id}', { params: { path: { id: id as number } } })),
    enabled: id !== null,
    staleTime: 0,
  });

/** All Stimpies assignable to a drop (name, type, drop, stock). */
export const useAssignableStimpies = () =>
  useQuery({
    queryKey: ['stimpies', 'assignable'] as const,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/stimpies', { params: { query: { page, pageSize } } }))),
    staleTime: 15_000,
  });

export const useDropSubscribers = (dropId: number, page: number, pageSize: number) =>
  useQuery({
    queryKey: queryKeys.subscribers({ dropId, page, pageSize }),
    queryFn: async () => {
      const res = await unwrap(api.GET('/api/v1/admin/subscribers', { params: { query: { dropId, page, pageSize } } }));
      if (typeof res === 'string') throw new Error('Unexpected CSV response');
      return res;
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export function useDropMutations() {
  const qc = useQueryClient();
  /** Drops feed Stimpies (drop column), the public Builder/overview and subscriber counts. */
  const invalidate = () => {
    for (const k of [['drops'], ['stimpies'], ['overview'], ['subscribers']]) void qc.invalidateQueries({ queryKey: k });
  };
  const create = useMutation({
    mutationFn: (v: DropFormValues) => unwrap(api.POST('/api/v1/admin/drops', { body: toDropBody(v) })),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: number; values: DropFormValues }) =>
      unwrap(api.PATCH('/api/v1/admin/drops/{id}', { params: { path: { id } }, body: toDropBody(values) })),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.dropDetail(saved.id), saved);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.DELETE('/api/v1/admin/drops/{id}', { params: { path: { id } } }),
    onSuccess: invalidate,
  });
  const end = useMutation({
    mutationFn: (id: number) => unwrap(api.POST('/api/v1/admin/drops/{id}/end', { params: { path: { id } } })),
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.dropDetail(saved.id), saved);
      invalidate();
    },
  });
  return { create, update, remove, end };
}
