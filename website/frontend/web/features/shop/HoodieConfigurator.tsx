'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HOODIE_RATIO, PriceTag, RichText } from '@stimpy/ui';
import type { HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import { Gallery, type GalleryImage } from '@/components/Gallery';
import { browserApi } from '@/lib/api-browser';
import { useFreshData } from '@/lib/useFreshData';
import { initialState, parsePreset, type ComposerPreset } from './composer';
import { PackComposer } from './PackComposer';

interface Fresh {
  hoodie: HoodieDetail;
  stimpies: Stimpie[];
}

/** Photos for the gallery: the chosen colour's own photos first, then the hoodie's, without duplicates. */
export function galleryImages(hoodie: HoodieDetail, colorId: number | null): GalleryImage[] {
  const color = hoodie.colors.find((c) => c.id === colorId);
  const urls = [...(color?.images ?? []), ...hoodie.images];
  const seen = new Set<string>();
  const out: GalleryImage[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const isColorPhoto = color?.images.includes(url);
    out.push({ src: url, alt: `${hoodie.name}${isColorPhoto && color ? `, ${color.name}` : ''}, photo ${out.length + 1}` });
  }
  return out;
}

export interface HoodieConfiguratorProps {
  hoodie: HoodieDetail;
  packs: Pack[];
  stimpies: Stimpie[];
  estimateText: string | null;
}

/**
 * Top of the hoodie detail page: gallery, name, price, description and the pack composer. Server data renders first;
 * after hydration (and when the window regains focus) variant stock and Stimpie availability are refetched with
 * `no-store` so a size that sold out meanwhile cannot be added (state-and-errors 2.3).
 */
export function HoodieConfigurator({ hoodie, packs, stimpies, estimateText }: HoodieConfiguratorProps) {
  // Read after mount (not via searchParams on the server) so the page stays ISR and cacheable.
  const [preset, setPreset] = useState<ComposerPreset | undefined>(undefined);
  useEffect(() => {
    setPreset(parsePreset(Object.fromEntries(new URLSearchParams(window.location.search))));
  }, []);

  const initial = useMemo<Fresh>(() => ({ hoodie, stimpies }), [hoodie, stimpies]);
  const { data } = useFreshData<Fresh>(initial, async (signal) => {
    const api = browserApi();
    const [h, s] = await Promise.all([
      api.GET('/api/v1/products/hoodies/{slug}', { params: { path: { slug: hoodie.slug } }, cache: 'no-store', signal }),
      api.GET('/api/v1/products/stimpies', { params: { query: { includeSoldOut: 'true' } }, cache: 'no-store', signal }),
    ]);
    if (!h.data || !s.data) throw new Error('empty response');
    return { hoodie: h.data, stimpies: s.data };
  });

  // Same starting colour as the composer, so the server-rendered first photo (the LCP image) does not change.
  const [colorId, setColorId] = useState<number | null>(() => initialState({ hoodie, packs, stimpies }).colorId);
  const [index, setIndex] = useState(0);
  const images = useMemo(() => galleryImages(data.hoodie, colorId), [data.hoodie, colorId]);

  const onColorChange = useCallback((id: number) => {
    setColorId(id);
    setIndex(0);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Gallery
          images={images}
          index={index}
          onIndexChange={setIndex}
          label={`${data.hoodie.name} photos`}
          ratio={HOODIE_RATIO}
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
        />
      </div>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-h1 text-fg">{data.hoodie.name}</h1>
          <PriceTag cents={data.hoodie.priceCents} size="lg" />
          <RichText text={data.hoodie.description} />
        </header>
        <PackComposer
          hoodie={data.hoodie}
          packs={packs}
          stimpies={data.stimpies}
          preset={preset}
          estimateText={estimateText}
          source="product"
          onColorChange={onColorChange}
        />
      </div>
    </div>
  );
}
