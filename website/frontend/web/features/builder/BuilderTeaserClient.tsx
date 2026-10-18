'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Box, Maximize2 } from 'lucide-react';
import { BuilderStage2D } from '@stimpy/builder/src/BuilderStage2D';
import type { BuilderData, BuilderStimpie, JoinedColor, SwapSample } from '@stimpy/builder';
import { track } from '@/lib/track';

const BuilderPreviewDialog = dynamic(() => import('./BuilderPreviewDialog'), { ssr: false });

/** The homepage's small, 2D-only Builder island. It deliberately avoids importing the full 2D/3D Builder. */
export function BuilderTeaserClient({ data }: { data: BuilderData }) {
  const colors = useMemo(() => {
    const configById = new Map(data.config.colors.map((color) => [color.colorId, color]));
    return [...data.colors]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .flatMap((option): JoinedColor[] => {
        const config = configById.get(option.id);
        if (!config?.hoodieImage2d || !config.placement2d) return [];
        return [{
          id: option.id,
          name: option.name,
          hex: option.hex,
          position: option.position,
          photo: option.images?.[0] ?? null,
          tint: config.tint,
          texture3d: config.texture3d,
          hoodieImage2d: config.hoodieImage2d,
          overlay2d: config.overlay2d,
          placement2d: config.placement2d,
        }];
      });
  }, [data]);
  const stimpies = data.stimpies.slice(0, 6);
  const [colorId, setColorId] = useState<number | null>(colors[0]?.id ?? null);
  const [stimpieId, setStimpieId] = useState<number | null>(stimpies[0]?.id ?? null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const colorRefs = useRef(new Map<number, HTMLButtonElement>());
  const stimpieRefs = useRef(new Map<number, HTMLButtonElement>());
  const swapCount = useRef(0);
  const selectedStimpie = useRef(stimpies[0]?.id ?? null);
  const color = colors.find((item) => item.id === colorId) ?? colors[0] ?? null;
  const stimpie = stimpies.find((item) => item.id === stimpieId) ?? stimpies[0] ?? null;

  useEffect(() => {
    track('builder_open', { surface: 'teaser', source: 'home_cta' });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const onSwapDone = useCallback((sample: SwapSample & { fast: boolean }) => {
    swapCount.current += 1;
    if (swapCount.current === 1 || swapCount.current % 5 === 0) {
      track('builder_swap_done', {
        view: '2d',
        duration_ms: Math.round(sample.durationMs),
        dropped_frames: Math.round(sample.droppedFrames),
      });
    }
  }, []);

  const selectColor = (id: number) => {
    setColorId(id);
    track('builder_color_select', { color_id: id });
  };
  const selectStimpie = (item: BuilderStimpie) => {
    if (selectedStimpie.current === item.id) return;
    selectedStimpie.current = item.id;
    setStimpieId(item.id);
    track('builder_stimpie_select', { stimpie_slug: item.slug, slot: 1, view: '2d' });
  };
  const handleColorKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction || colors.length < 2) return;
    event.preventDefault();
    const index = Math.max(0, colors.findIndex((item) => item.id === color?.id));
    const next = colors[(index + direction + colors.length) % colors.length];
    if (!next) return;
    colorRefs.current.get(next.id)?.focus();
    selectColor(next.id);
  };
  const handleStimpieKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = Math.max(0, stimpies.findIndex((item) => item.id === stimpie?.id));
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = Math.min(stimpies.length - 1, currentIndex + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = stimpies.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (stimpies[currentIndex]) selectStimpie(stimpies[currentIndex]);
      return;
    } else return;
    event.preventDefault();
    stimpieRefs.current.get(stimpies[nextIndex]?.id ?? -1)?.focus();
  };

  if (!color || !stimpie) return null;
  const stageColor = {
    key: color.id,
    hoodieSrc: color.hoodieImage2d,
    overlaySrc: color.overlay2d,
    placement: color.placement2d,
    alt: `${color.name} Stimpy hoodie, back view`,
  };
  const stageArt = { key: stimpie.id, src: stimpie.artworkUrl, alt: `${stimpie.name} Stimpie` };
  const fullBuilder = `/builder?color=${encodeURIComponent(color.id)}&stimpie=${encodeURIComponent(stimpie.slug)}`;

  return (
    <section data-builder="teaser" data-builder-view="2d" aria-label="Builder" className="store-teaser grid grid-cols-1 items-center gap-6 md:grid-cols-2">
      <div className="mx-auto w-full max-w-[384px]">
        <div
          role="group"
          aria-label={`Preview: ${color.name} Stimpy hoodie with the ${stimpie.name} Stimpie`}
          data-builder-frame
          className="relative mx-auto w-full overflow-hidden bg-cream"
          style={{ aspectRatio: '4 / 5' }}
        >
          <BuilderStage2D color={stageColor} art={stageArt} instant={reducedMotion} active preload={stimpies.map((item) => item.artworkUrl)} chip={false} />
          <button ref={previewTrigger} type="button" className="store-preview-trigger" aria-label="Open 3D preview" aria-haspopup="dialog" onClick={() => setPreviewOpen(true)}>
            <span className="store-preview-trigger-label"><Box size={16} aria-hidden="true" /> 3D preview</span>
            <span className="store-preview-expand" title="Open 3D preview"><Maximize2 size={18} aria-hidden="true" /></span>
          </button>
        </div>
        <div className="store-teaser-caption"><span>{stimpie.name}</span><span>{color.name} hoodie</span></div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-body-sm font-medium text-fg">Colour: <span className="text-fg-muted">{color.name}</span></p>
          <div role="radiogroup" aria-label="Hoodie colour" onKeyDown={handleColorKeys} className="mt-2 flex flex-wrap gap-2">
            {colors.map((item) => (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) colorRefs.current.set(item.id, node);
                  else colorRefs.current.delete(item.id);
                }}
                type="button"
                role="radio"
                aria-label={item.name}
                title={item.name}
                aria-checked={item.id === color.id}
                tabIndex={item.id === color.id ? 0 : -1}
                onClick={() => selectColor(item.id)}
                className="store-teaser-swatch"
              >
                <span aria-hidden="true" style={{ backgroundColor: item.hex }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-body-sm font-medium text-fg">Choose a Stimpie</p>
          <div
            role="listbox"
            aria-label="Stimpies"
            data-builder-carousel
            onKeyDown={handleStimpieKeys}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {stimpies.map((item, index) => (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) stimpieRefs.current.set(item.id, node);
                  else stimpieRefs.current.delete(item.id);
                }}
                type="button"
                role="option"
                aria-label={[item.name, item.status === 'SOLD_OUT' ? 'Sold out' : item.status === 'UPCOMING' ? 'Coming soon' : ''].filter(Boolean).join(', ')}
                aria-selected={item.id === stimpie.id}
                tabIndex={item.id === stimpie.id ? 0 : -1}
                data-stimpie-slug={item.slug}
                data-selected={item.id === stimpie.id ? 'true' : 'false'}
                data-preview={item.id === stimpie.id ? 'true' : 'false'}
                onFocus={() => item.id !== stimpie.id && selectStimpie(item)}
                onClick={() => selectStimpie(item)}
                className="w-28 shrink-0 snap-start overflow-hidden rounded-md bg-white text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                style={{ outline: item.id === stimpie.id ? '3px solid #111111' : '3px solid transparent' }}
              >
                <span className="relative block overflow-hidden bg-cream" style={{ aspectRatio: '0.64' }}>
                  <img src={item.artworkUrl} alt="" width={160} height={250} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="block truncate px-1 pb-1 pt-1 text-caption font-medium text-ink">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <Link
          href={fullBuilder}
          data-builder-open-full
          className="inline-flex min-h-11 self-start items-center justify-center rounded-md border border-control bg-white px-5 py-3 text-body font-semibold text-ink underline-offset-4 hover:bg-cream hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Customize this look <ArrowRight size={16} aria-hidden="true" className="ml-3" />
        </Link>
      </div>
      {previewOpen ? <BuilderPreviewDialog colors={colors} stimpies={stimpies} colorId={color.id} stimpieId={stimpie.id}
        onColorChange={selectColor} onStimpieChange={selectStimpie} onClose={() => setPreviewOpen(false)} returnFocusRef={previewTrigger} /> : null}
    </section>
  );
}
