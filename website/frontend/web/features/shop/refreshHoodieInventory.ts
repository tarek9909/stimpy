import type { HoodieDetail, Stimpie } from '@stimpy/api-client';
import { browserApi } from '@/lib/api-browser';
import { fetchApiAllPages } from '@/lib/pagination';

/** Refresh stock after hydration or focus without adding the API client to the product's initial bundle. */
export async function refreshHoodieInventory(slug: string, signal: AbortSignal): Promise<{ hoodie: HoodieDetail; stimpies: Stimpie[] }> {
  const api = browserApi();
  const [hoodie, stimpies] = await Promise.all([
    api.GET('/api/v1/products/hoodies/{slug}', { params: { path: { slug } }, cache: 'no-store', signal }),
    fetchApiAllPages((page, pageSize) => api.GET('/api/v1/products/stimpies', { params: { query: { includeSoldOut: 'true', page, pageSize } }, cache: 'no-store', signal })),
  ]);
  if (!hoodie.data) throw new Error('empty response');
  return { hoodie: hoodie.data, stimpies };
}
