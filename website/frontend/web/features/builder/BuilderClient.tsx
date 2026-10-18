'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Maximize2 } from 'lucide-react';
import { useOptionalToast } from '@stimpy/ui';
import { Builder, type BuilderCartItem, type BuilderCartSummary, type BuilderData, type BuilderHoodie, type BuilderPreviewContext, type ShareParams } from '@stimpy/builder';
import { CART_FULL_TEXT, useAddToCart } from '@/features/cart/useAddToCart';
import { track } from '@/lib/track';
import { readOverrides, type BuilderOverrides } from './overrides';
import { browserApi } from '@/lib/api-browser';
import { toBuilderHoodie } from './data';

const BuilderPreviewDialog = dynamic(() => import('./BuilderPreviewDialog'), { ssr: false });

function BuilderPagePreview(preview: BuilderPreviewContext) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="store-builder-preview-trigger" aria-label="Open 3D preview" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Box size={16} aria-hidden="true" /><span>3D preview</span><Maximize2 size={14} aria-hidden="true" />
    </button>
    {open ? <BuilderPreviewDialog {...preview} onStimpieChange={(stimpie) => preview.onStimpieChange(stimpie.id)}
      onClose={() => setOpen(false)} returnFocusRef={trigger} showBuilderLink={false} /> : null}
  </>;
}

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
      renderPreviewAction={(preview) => <BuilderPagePreview {...preview} />}
      track={track}
      force3d={overrides.force3d}
      debug3d={!!overrides.force3d}
      breakShader={overrides.breakShader}
      throttleSimulator={overrides.extraFrameMs ? { extraFrameMs: overrides.extraFrameMs } : undefined}
    />
  );
}
