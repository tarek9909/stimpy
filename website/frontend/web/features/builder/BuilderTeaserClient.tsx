'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { BuilderStage2D } from '@stimpy/builder/src/BuilderStage2D';
import type { BuilderData, BuilderStimpie, SwapSample } from '@stimpy/builder';
import { track } from '@/lib/track';
import { BuilderTeaserView, teaserColors } from './BuilderTeaserView';

const BuilderPreviewDialog = dynamic(() => import('./BuilderPreviewDialog'), { ssr: false });

/** The homepage's small, 2D-only Builder island. It deliberately avoids importing the full 2D/3D Builder. */
export function BuilderTeaserClient({ data }: { data: BuilderData }) {
  const colors = useMemo(() => teaserColors(data), [data]);
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

  return <BuilderTeaserView colors={colors} stimpies={stimpies} color={color} stimpie={stimpie}
    colorRefs={colorRefs} stimpieRefs={stimpieRefs} previewTrigger={previewTrigger}
    selectColor={selectColor} selectStimpie={selectStimpie} handleColorKeys={handleColorKeys} handleStimpieKeys={handleStimpieKeys}
    openPreview={() => setPreviewOpen(true)}
    stage={<BuilderStage2D color={stageColor} art={stageArt} instant={reducedMotion} active preload={stimpies.slice(0, 2).map((item) => item.artworkUrl)} chip={false} onSwapDone={onSwapDone} />}
    preview={previewOpen ? <BuilderPreviewDialog colors={colors} stimpies={stimpies} colorId={color.id} stimpieId={stimpie.id}
      onColorChange={selectColor} onStimpieChange={selectStimpie} onClose={() => setPreviewOpen(false)} returnFocusRef={previewTrigger} /> : null}
  />;
}
