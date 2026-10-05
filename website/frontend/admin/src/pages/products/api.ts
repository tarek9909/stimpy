import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useToast } from '@stimpy/ui';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useNotifyError } from '../../api/errors';
import { MAX_ORDERABLE_ITEMS, sortByIds } from '../../lib/reorder';
import { fetchAllPages } from '../../lib/pagination';

export type AdminHoodie = Schemas['AdminHoodie'];
export type AdminStimpie = Schemas['AdminStimpie'];
export type AdminPack = Schemas['AdminPack'];
export type AdminColor = Schemas['AdminColor'];
export type AdminSize = Schemas['AdminSize'];
export type AdminSizeChart = Schemas['AdminSizeChart'];
export type AdminDrop = Schemas['AdminDrop'];

export type Resource = 'hoodies' | 'stimpies' | 'packs' | 'colors' | 'sizes';

export const useHoodies = () =>
  useQuery({
    queryKey: queryKeys.hoodies,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/hoodies', { params: { query: { page, pageSize } } }))),
    staleTime: 5 * 60_000,
  });
export const useHoodie = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.hoodie(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/admin/hoodies/{id}', { params: { path: { id: id as number } } })),
    enabled: id !== null,
  });
export const usePacks = () =>
  useQuery({
    queryKey: queryKeys.packs,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/packs', { params: { query: { page, pageSize } } }))),
    staleTime: 5 * 60_000,
  });
export const usePack = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.pack(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/admin/packs/{id}', { params: { path: { id: id as number } } })),
    enabled: id !== null,
  });
export const useColors = () =>
  useQuery({
    queryKey: queryKeys.colors,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/colors', { params: { query: { page, pageSize } } }))),
    staleTime: 5 * 60_000,
  });
export const useSizes = () =>
  useQuery({
    queryKey: queryKeys.sizes,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/sizes', { params: { query: { page, pageSize } } }))),
    staleTime: 5 * 60_000,
  });
export const useSizeChart = () =>
  useQuery({ queryKey: queryKeys.sizeChart, queryFn: () => unwrap(api.GET('/api/v1/admin/size-chart')), staleTime: 5 * 60_000 });
export const useStimpie = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.stimpie(id ?? 0),
    queryFn: () => unwrap(api.GET('/api/v1/admin/stimpies/{id}', { params: { path: { id: id as number } } })),
    enabled: id !== null,
  });
/** Drops for the Stimpie drop select and list column. */
export const useAllDrops = () =>
  useQuery({
    queryKey: ['drops', 'all'] as const,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/drops', { params: { query: { page, pageSize } } }))),
    staleTime: 30_000,
  });

export interface StimpieFilters {
  q?: string;
  type?: 'CORE' | 'LIMITED';
  dropId?: number;
  active?: 'true' | 'false';
  page: number;
  pageSize: number;
  sort?: string;
}
export const useStimpies = (filters: StimpieFilters) =>
  useQuery({
    queryKey: queryKeys.stimpiesList(filters),
    queryFn: () => unwrap(api.GET('/api/v1/admin/stimpies', { params: { query: filters } })),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

/** Complete Stimpie list for Builder overrides, including records beyond the first API page. */
export const useAllStimpies = () =>
  useQuery({
    queryKey: ['stimpies', 'all'] as const,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/stimpies', { params: { query: { page, pageSize } } }))),
    staleTime: 60_000,
  });

/** What a change to each resource makes stale (state-and-errors section 4). */
const AFFECTS: Record<Resource | 'sizeChart', ReadonlyArray<readonly string[]>> = {
  hoodies: [['hoodies'], ['stock'], ['builder'], ['overview']],
  stimpies: [['stimpies'], ['stock'], ['drops'], ['builder'], ['overview']],
  packs: [['packs']],
  colors: [['colors'], ['stock'], ['hoodies'], ['builder'], ['overview']],
  sizes: [['sizes'], ['stock'], ['hoodies'], ['size-chart'], ['overview']],
  sizeChart: [['size-chart'], ['overview']],
};

export function invalidateFor(qc: QueryClient, resource: Resource | 'sizeChart'): void {
  AFFECTS[resource].forEach((key) => void qc.invalidateQueries({ queryKey: key as string[] }));
}

type Listed = { items: Array<{ id: number }> };

/** Applies `fn` to every cached page of a resource list (rows are objects with `id`). Returns the previous data for rollback. */
function mapCachedLists(qc: QueryClient, resource: Resource, fn: (page: Listed) => Listed) {
  const snapshots = qc.getQueriesData<Listed>({ queryKey: [resource] });
  for (const [key, data] of snapshots) {
    if (data && Array.isArray((data as Listed).items)) qc.setQueryData(key, fn(data));
  }
  return snapshots;
}
function restore(qc: QueryClient, snapshots: ReturnType<typeof mapCachedLists>) {
  for (const [key, data] of snapshots) qc.setQueryData(key, data);
}

async function patchActive(resource: Resource, id: number, active: boolean): Promise<unknown> {
  const params = { path: { id } };
  const body = { active };
  switch (resource) {
    case 'hoodies':
      return unwrap(api.PATCH('/api/v1/admin/hoodies/{id}', { params, body }));
    case 'stimpies':
      return unwrap(api.PATCH('/api/v1/admin/stimpies/{id}', { params, body }));
    case 'packs':
      return unwrap(api.PATCH('/api/v1/admin/packs/{id}', { params, body }));
    case 'colors':
      return unwrap(api.PATCH('/api/v1/admin/colors/{id}', { params, body }));
    case 'sizes':
      return unwrap(api.PATCH('/api/v1/admin/sizes/{id}', { params, body }));
  }
}

/** Active switch: optimistic with rollback (dashboard-pages 1.5). Hiding keeps variants and history. */
export function useActiveToggle(resource: Resource) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  return useMutation({
    mutationFn: (v: { id: number; active: boolean }) => patchActive(resource, v.id, v.active),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: [resource] });
      return mapCachedLists(qc, resource, (page) => ({ ...page, items: page.items.map((r) => (r.id === v.id ? { ...r, active: v.active } : r)) }));
    },
    onError: (e, _v, snapshots) => {
      if (snapshots) restore(qc, snapshots);
      notify(e);
      toast.info('Restored.');
    },
    onSettled: () => invalidateFor(qc, resource),
  });
}

async function putOrder(resource: 'hoodies' | 'packs' | 'colors' | 'sizes', ids: number[]): Promise<void> {
  switch (resource) {
    case 'hoodies':
      await api.PUT('/api/v1/admin/hoodies/order', { body: { ids } });
      return;
    case 'packs':
      await api.PUT('/api/v1/admin/packs/order', { body: { ids } });
      return;
    case 'colors':
      await api.PUT('/api/v1/admin/colors/order', { body: { ids } });
      return;
    case 'sizes':
      await api.PUT('/api/v1/admin/sizes/order', { body: { ids } });
      return;
  }
}

/** `PUT .../order { ids }` with the FULL list. Optimistic; on error the old order returns with a toast. */
export function useReorder(resource: 'hoodies' | 'packs' | 'colors' | 'sizes') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (ids: number[]) => {
      const cached = qc.getQueriesData<Listed>({ queryKey: [resource] }).find(([, page]) => page && Array.isArray(page.items))?.[1];
      const expected = new Set(cached?.items.map((row) => row.id) ?? []);
      if (
        !cached ||
        ids.length === 0 ||
        ids.length > MAX_ORDERABLE_ITEMS ||
        ids.length !== expected.size ||
        new Set(ids).size !== expected.size ||
        ids.some((id) => !expected.has(id))
      ) {
        throw new Error('The complete list changed. Refresh before reordering.');
      }
      return putOrder(resource, ids);
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: [resource] });
      return mapCachedLists(qc, resource, (page) => ({ ...page, items: sortByIds(page.items, ids, (r) => r.id) }));
    },
    onError: (_e, _ids, snapshots) => {
      if (snapshots) restore(qc, snapshots);
      toast.error("Couldn't save the new order. Restored.");
    },
    onSettled: () => invalidateFor(qc, resource),
  });
}
