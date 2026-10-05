'use client';

import { useEffect, useState } from 'react';
import { useOptionalToast } from '@stimpy/ui';
import { Builder, type BuilderCartItem, type BuilderCartSummary, type BuilderData, type BuilderHoodie, type ShareParams } from '@stimpy/builder';
import { CART_FULL_TEXT, useAddToCart } from '@/features/cart/useAddToCart';
import { track } from '@/lib/track';
import { readOverrides, type BuilderOverrides } from './overrides';
import { browserApi } from '@/lib/api-browser';
import { toBuilderHoodie } from './data';

/**
 * The website's Builder island: the shared `@stimpy/builder` component fed with the server-fetched payloads, wired to
 * the cart store (`useAddToCart`), the analytics entry point and the share-link URL sync.
 */
export function BuilderClient({ data, share, source }: { data: BuilderData; share: ShareParams; source: string }) {
  const add = useAddToCart();
  const toast = useOptionalToast();
  // Test overrides are read after mount so the server HTML is identical for every URL.
  const [overrides, setOverrides] = useState<BuilderOverrides>({ force3d: false, breakShader: false, extraFrameMs: 0 });
  useEffect(() => setOverrides(readOverrides(window.location.search)), []);

  const onAddToCart = (item: BuilderCartItem, summary: BuilderCartSummary) => {
    const result = add({ item, ui: summary }, 'builder');
    if (!result.ok && result.reason === 'FULL') toast?.error(CART_FULL_TEXT);
  };

  const refreshInventory = async (): Promise<BuilderHoodie | null> => {
    const slug = data.config.hoodie?.slug;
    if (!slug) return null;
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
      track={track}
      force3d={overrides.force3d}
      debug3d={!!overrides.force3d}
      breakShader={overrides.breakShader}
      throttleSimulator={overrides.extraFrameMs ? { extraFrameMs: overrides.extraFrameMs } : undefined}
    />
  );
}
