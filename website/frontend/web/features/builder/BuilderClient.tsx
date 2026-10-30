'use client';

import { useOptionalToast } from '@stimpy/ui';
import { Builder, type BuilderCartItem, type BuilderCartSummary, type BuilderData, type BuilderHoodie, type ShareParams } from '@stimpy/builder';
import { CART_FULL_TEXT, useAddToCart } from '@/features/cart/useAddToCart';
import { track } from '@/lib/track';
import { toBuilderHoodie } from './data';

/**
 * The website's Builder island: the shared `@stimpy/builder` component fed with the server-fetched payloads, wired to
 * the cart store (`useAddToCart`), the analytics entry point and the share-link URL sync.
 */
export function BuilderClient({ data, share, source }: { data: BuilderData; share: ShareParams; source: string }) {
  const add = useAddToCart();
  const toast = useOptionalToast();

  const onAddToCart = (item: BuilderCartItem, summary: BuilderCartSummary) => {
    const result = add({ item, ui: summary }, 'builder');
    if (!result.ok && result.reason === 'FULL') toast?.error(CART_FULL_TEXT);
  };

  const refreshInventory = async (): Promise<BuilderHoodie | null> => {
    const slug = data.config.hoodie?.slug;
    if (!slug) return null;
    const { browserApi } = await import('@/lib/api-browser');
    const { data: fresh } = await browserApi().GET('/api/v1/products/hoodies/{slug}', {
      params: { path: { slug } },
      cache: 'no-store',
    });
    return fresh ? toBuilderHoodie(fresh) : null;
  };

  return (
    <Builder
      data={data}
      surface="page"
      initialShare={share}
      syncUrl
      source={source}
      onAddToCart={onAddToCart}
      refreshInventory={refreshInventory}
      only3d
      stageAspect="1 / 1"
      hrefs={{ sizeGuide: '/help?tab=size' }}
      track={track}
    />
  );
}
