'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button, HOODIE_RATIO, PriceTag, RichText } from '@stimpy/ui';
import type { HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import { Gallery, type GalleryImage } from '@/components/Gallery';
import { useFreshData } from '@/lib/useFreshData';
import { initialState, parsePreset, type ComposerPreset } from './composer';
import { PackComposer } from './PackComposer';

const HoodieModelStage = dynamic(() => import('./HoodieModelStage').then((m) => m.HoodieModelStage), { ssr: false });

/** 3D needs WebGL2. On data-saver or 2G it waits for a tap instead of starting a 1 MB download by itself. */
function modelAvailability(): 'auto' | 'on-tap' | 'none' {
  try {
    if (!document.createElement('canvas').getContext('webgl2')) return 'none';
  } catch {
    return 'none';
  }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connection?.saveData || connection?.effectiveType?.endsWith('2g') ? 'on-tap' : 'auto';
}

interface Fresh {
  hoodie: HoodieDetail;
  stimpies: Stimpie[];
}

/** Legacy seed photos include a placement guide; real product photography stays untouched. */
function galleryPhoto(url: string): string {
  try {
    const color = /^\/uploads\/seed\/hoodies\/photo-back-(black|cream|stone|coral)-[a-f0-9]+\.webp$/
      .exec(new URL(url, 'http://localhost').pathname)?.[1];
    return color ? `/images/hoodies/back-${color}-v2.webp` : url;
  } catch {
    return url;
  }
}

/** Photos for the gallery: the chosen colour's own photos first, then the hoodie's, without duplicates. */
export function galleryImages(hoodie: HoodieDetail, colorId: number | null): GalleryImage[] {
  const color = hoodie.colors.find((c) => c.id === colorId);
  const urls = [...(color?.images ?? []), ...hoodie.images];
  const seen = new Set<string>();
  const out: GalleryImage[] = [];
  for (const url of urls) {
    const src = galleryPhoto(url);
    if (seen.has(src)) continue;
    seen.add(src);
    const isColorPhoto = color?.images.includes(url);
    out.push({ src, alt: `${hoodie.name}${isColorPhoto && color ? `, ${color.name}` : ''}, photo ${out.length + 1}` });
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
    const { refreshHoodieInventory } = await import('./refreshHoodieInventory');
    return refreshHoodieInventory(hoodie.slug, signal);
  });

  // Same starting colour as the composer, so the server-rendered first photo (the LCP image) does not change.
  const [colorId, setColorId] = useState<number | null>(() => initialState({ hoodie, packs, stimpies }).colorId);
  const [index, setIndex] = useState(0);
  const images = useMemo(() => galleryImages(data.hoodie, colorId), [data.hoodie, colorId]);

  const [pickedIds, setPickedIds] = useState<readonly number[]>([]);
  const [modelWanted, setModelWanted] = useState(false);
  const [modelOnTap, setModelOnTap] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  // After the photos: the model never competes with the first image.
  useEffect(() => {
    const availability = modelAvailability();
    if (availability === 'none') return;
    if (availability === 'on-tap') {
      setModelOnTap(true);
      return;
    }
    const start = () => setModelWanted(true);
    if (typeof requestIdleCallback !== 'function') {
      const timer = setTimeout(start, 1000);
      return () => clearTimeout(timer);
    }
    const handle = requestIdleCallback(start, { timeout: 3000 });
    return () => cancelIdleCallback(handle);
  }, []);

  const chosenColor = data.hoodie.colors.find((c) => c.id === colorId) ?? data.hoodie.colors[0];
  const lastPicked = pickedIds.length > 0 ? data.stimpies.find((s) => s.id === pickedIds[pickedIds.length - 1]) : undefined;
  const modelArt = useMemo(() => (lastPicked ? {
    id: lastPicked.id,
    url: `/_next/image?url=${encodeURIComponent(lastPicked.artworkUrl)}&w=1080&q=75`,
    fallbackUrl: lastPicked.artworkUrl,
    width: lastPicked.artworkWidth,
    height: lastPicked.artworkHeight,
  } : null), [lastPicked]);
  const modelShown = modelReady && !modelFailed && !showPhotos;

  const onColorChange = useCallback((id: number) => {
    setColorId(id);
    setIndex(0);
  }, []);

  return (
    <><nav className="store-breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/shop">Shop</Link><span aria-hidden="true">/</span><span aria-current="page">{data.hoodie.name}</span></nav>
    <div className="store-product-layout grid gap-8 lg:grid-cols-2 lg:gap-12">
      <div className="store-product-gallery lg:sticky lg:top-24 lg:self-start">
        {modelReady && !modelFailed ? (
          <div className="mb-3 flex gap-2" role="group" aria-label="Hoodie view">
            <Button size="sm" variant={modelShown ? 'dark' : 'secondary'} aria-pressed={modelShown} onClick={() => setShowPhotos(false)}>3D</Button>
            <Button size="sm" variant={modelShown ? 'secondary' : 'dark'} aria-pressed={!modelShown} onClick={() => setShowPhotos(true)}>Photos</Button>
          </div>
        ) : null}
        <div className="relative">
          <div className={modelShown ? 'hidden' : undefined}>
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
          {modelWanted && !modelFailed && chosenColor ? (
            <div className={modelShown ? 'relative aspect-square w-full overflow-hidden rounded-lg' : `absolute inset-x-0 top-0 aspect-square w-full ${modelReady ? 'invisible' : 'pointer-events-none'}`} data-testid="hoodie-model">
              <HoodieModelStage
                tint={chosenColor.hex}
                art={modelArt}
                label={`3D view of a ${chosenColor.name} ${data.hoodie.name}${lastPicked ? ` with the ${lastPicked.name} Stimpie on the back` : ''}. Drag to rotate.`}
                onReady={() => setModelReady(true)}
                onFailed={() => setModelFailed(true)}
              />
            </div>
          ) : null}
        </div>
        {modelOnTap && !modelWanted ? (
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => setModelWanted(true)}>View in 3D (1 MB)</Button>
        ) : null}
      </div>
      <div className="store-product-info flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-h1 text-fg">{data.hoodie.name}</h1>
          <PriceTag cents={data.hoodie.priceCents} compareAtCents={data.hoodie.compareAtPriceCents ?? undefined} size="lg" />
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
          onStimpiesChange={setPickedIds}
        />
      </div>
    </div></>
  );
}
