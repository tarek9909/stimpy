import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { fetchAllPages } from './pagination';
import { setNavBadge } from '../layout/navBadges';

export type Area = Schemas['Area'];
export type Overview = Schemas['Overview'];

/** Delivery areas (inactive ones included, see `active`). Shared by the order filters, the order form and Deliveries. */
export function useAreas() {
  return useQuery({
    queryKey: queryKeys.areas,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/areas', { params: { query: { page, pageSize } } }))),
    staleTime: 5 * 60_000,
  });
}

/** `GET /admin/overview`: one cache entry shared by the Overview page and the Stock navigation badge. */
export function useOverview(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => unwrap(api.GET('/api/v1/admin/overview')),
    staleTime: 30_000,
    refetchInterval: options.refetchInterval ?? false,
    refetchIntervalInBackground: false,
  });
}

/** Number of `LOW_STOCK` attention items: the Stock navigation badge (dashboard-pages 2.2). */
export function lowStockCount(overview: Pick<Overview, 'attention'> | undefined): number {
  return overview ? overview.attention.filter((a) => a.type === 'LOW_STOCK').length : 0;
}

/** Mounted once in the shell: feeds the Stock badge from the shared overview query (refreshed every 60 s while visible). */
export function useStockBadgeFeed(): void {
  const { data } = useOverview({ refetchInterval: 60_000 });
  const count = lowStockCount(data);
  useEffect(() => {
    setNavBadge('stock', count);
    return () => setNavBadge('stock', null);
  }, [count]);
}
