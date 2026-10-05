import { useQuery } from '@tanstack/react-query';
import type { HoodieDetail, HoodieSummary, Pack, Stimpie } from '@stimpy/api-client';
import { getPublicApi, unwrap } from '../../api/client';

/**
 * Read-only catalog data for the manual order form (dashboard-pages 5.6). These are the PUBLIC
 * endpoints, read without cookies: the form offers exactly what a customer could buy.
 */
const STALE = 30_000;

export function useCatalogHoodies() {
  return useQuery({
    queryKey: ['order-form', 'hoodies'] as const,
    queryFn: () => unwrap(getPublicApi().GET('/api/v1/products/hoodies')) as Promise<HoodieSummary[]>,
    staleTime: STALE,
  });
}

export function useCatalogHoodie(slug: string | null) {
  return useQuery({
    queryKey: ['order-form', 'hoodie', slug] as const,
    queryFn: () => unwrap(getPublicApi().GET('/api/v1/products/hoodies/{slug}', { params: { path: { slug: slug as string } } })) as Promise<HoodieDetail>,
    enabled: !!slug,
    staleTime: STALE,
  });
}

export function useCatalogStimpies() {
  return useQuery({
    queryKey: ['order-form', 'stimpies'] as const,
    queryFn: () => unwrap(getPublicApi().GET('/api/v1/products/stimpies', { params: { query: {} } })) as Promise<Stimpie[]>,
    staleTime: STALE,
  });
}

export function useCatalogPacks() {
  return useQuery({
    queryKey: ['order-form', 'packs'] as const,
    queryFn: () => unwrap(getPublicApi().GET('/api/v1/packs')) as Promise<Pack[]>,
    staleTime: STALE,
  });
}

export function useDeliveryFees() {
  return useQuery({
    queryKey: ['order-form', 'delivery-fees'] as const,
    queryFn: () => unwrap(getPublicApi().GET('/api/v1/delivery/fees')),
    staleTime: STALE,
  });
}
