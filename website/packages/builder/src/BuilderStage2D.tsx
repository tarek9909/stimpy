'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useIsomorphicLayoutEffect } from '@stimpy/ui';
import type { Placement2d } from './types';
import { placementStyle } from './lib/placement';
import { DecodedImageCache, whenIdle } from './lib/images';
import { readEnvSignals, isSaveData } from './lib/env';
import { SwapMonitor, sampleFromTimestamps, type SwapSample } from './lib/swapMonitor';
import { COLOR_FADE_MS, CROSSFADE_MS, ZIP_TOTAL_MS, zipKeyframes } from './lib/zipTimeline';

export interface Stage2DColor {
  key: string | number;
  hoodieSrc: string | null;
  overlaySrc: string | null;
  placement: Placement2d | null;
  /** `{colour} Stimpy hoodie, back view` */
  alt: string;
}

export interface Stage2DArt {
  key: string | number;
  src: string;
  /** `{Stimpie name} Stimpie` */
  alt: string;
}

export interface BuilderStage2DProps {
  color: Stage2DColor | null;
  art: Stage2DArt | null;
  /** Skip every animation (reduced motion, or the stage is hidden behind the 3D canvas). */
  instant?: boolean;
  /** The hoodie image is the LCP element: eager + `fetchpriority=high`. Otherwise lazy (home teaser). */
  priority?: boolean;
  /** Allow idle work (preloading). The teaser sets it once it has come into view. */
  active?: boolean;
  /** Artwork URLs to decode on idle (neighbours of the selection). Skipped on save-data. */
  preload?: readonly string[];
  /** Shared decoded-image cache (max 5). One is created when omitted. */
  cache?: DecodedImageCache;
  /** Show the "Preview" chip (builder.md section 1). Default true. */
  chip?: boolean;
  /** CSS aspect ratio of the stage, from the first byte (CLS 0). Default 4 / 5. */
  aspect?: string;
  /** Pixel size hints for the hoodie image (reserve space, CLS). */
  imageWidth?: number;
  imageHeight?: number;
  className?: string;
  onSwapDone?: (info: SwapSample & { fast: boolean }) => void;
  /** Extra controls drawn on top of the stage (mode toggle, 3D buttons). */
  children?: ReactNode;
}

const TEETH =
  'repeating-linear-gradient(90deg, #111111 0px, #111111 2px, rgba(17,17,17,0.35) 2px, rgba(17,17,17,0.35) 6px)';

/**
 * 2D mode (builder.md section 4): plain DOM layers, no canvas. Layers bottom to top: stage background, hoodie,
 * old Stimpie, new Stimpie, zip line, optional shade overlay, "Preview" chip. Only transform, opacity and clip-path
 * are animated (Web Animations API).
 */
export function BuilderStage2D({
  color,
  art,
  instant = false,
  priority = false,
  active = true,
  preload,
  cache: cacheProp,
  chip = true,
  aspect = '4 / 5',
  imageWidth = 1000,
  imageHeight = 1250,
  className,
  onSwapDone,
  children,
}: BuilderStage2DProps) {
  const ownCache = useRef<DecodedImageCache | null>(null);
  if (!cacheProp && !ownCache.current) ownCache.current = new DecodedImageCache();
  const cache = (cacheProp ?? ownCache.current) as DecodedImageCache;
  const monitor = useRef(new SwapMonitor());
  const onSwapDoneRef = useRef(onSwapDone);
  onSwapDoneRef.current = onSwapDone;
  const instantRef = useRef(instant);
  instantRef.current = instant;

  // ----- Stimpie layer (zip wipe) -----
  const [shownArt, setShownArt] = useState<Stage2DArt | null>(art);
  const [outArt, setOutArt] = useState<Stage2DArt | null>(null);
  const [swapId, setSwapId] = useState(0);
  const shownArtRef = useRef<Stage2DArt | null>(art);
  const targetArtRef = useRef<Stage2DArt | null>(art);
  const artToken = useRef(0);
  const running = useRef<{ cancel: () => void } | null>(null);
  const newRef = useRef<HTMLImageElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const commitArt = (shown: Stage2DArt | null, out: Stage2DArt | null) => {
    shownArtRef.current = shown;
    setShownArt(shown);
    setOutArt(out);
  };

  const artKey = art?.key;
  useEffect(() => {
    if (!art || art.key === targetArtRef.current?.key) return;
    targetArtRef.current = art;
    const token = ++artToken.current;
    // Rapid swapping: finish the running swap instantly (its end state), then start from there. Latest wins.
    running.current?.cancel();
    if (!shownArtRef.current || instantRef.current) {
      commitArt(art, null);
      return;
    }
    void cache.load(art.src).then((r) => {
      if (token !== artToken.current) return; // superseded by a newer request
      if (r.status === 'error') return; // keep the previous art; the carousel selection is unaffected
      if (r.status === 'timeout') {
        commitArt(art, null); // not decoded within 400 ms: swap without animation instead of stalling
        return;
      }
      const prev = shownArtRef.current;
      shownArtRef.current = art;
      setOutArt(prev);
      setShownArt(art);
      setSwapId((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the art key only
  }, [artKey]);

  useIsomorphicLayoutEffect(() => {
    if (swapId === 0) return;
    const newEl = newRef.current;
    const line = lineRef.current;
    const wrap = wrapRef.current;
    if (!newEl || !wrap || typeof newEl.animate !== 'function') {
      setOutArt(null);
      return;
    }
    const fast = monitor.current.isDegraded;
    const t0 = performance.now();
    const stamps: number[] = [];
    let raf = 0;
    const tick = (t: number) => {
      stamps.push(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    wrap.style.willChange = 'transform, clip-path';
    newEl.style.willChange = 'clip-path';

    let anims: Animation[];
    if (fast || !line) {
      anims = [newEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CROSSFADE_MS, easing: 'linear', fill: 'backwards' })];
    } else {
      const kf = zipKeyframes(wrap.offsetHeight);
      const opts = { duration: ZIP_TOTAL_MS, fill: 'backwards' as FillMode };
      anims = [newEl.animate(kf.clip, opts), line.animate(kf.line, opts), wrap.animate(kf.wrapper, opts)];
    }
    let done = false;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      for (const a of anims) a.cancel();
      wrap.style.willChange = '';
      newEl.style.willChange = '';
    };
    running.current = {
      cancel: () => {
        if (done) return;
        done = true;
        cleanup();
        running.current = null;
        setOutArt(null);
      },
    };
    Promise.all(anims.map((a) => a.finished)).then(
      () => {
        if (done) return;
        done = true;
        const sample = sampleFromTimestamps(stamps, performance.now() - t0);
        monitor.current.record(sample);
        cleanup();
        running.current = null;
        setOutArt(null);
        onSwapDoneRef.current?.({ ...sample, fast });
      },
      () => undefined,
    );
    return () => {
      if (!done) {
        done = true;
        cleanup();
      }
    };
  }, [swapId]);

  // ----- Hoodie layer (colour cross-fade 150 ms) -----
  const [shownColor, setShownColor] = useState<Stage2DColor | null>(color);
  const [prevColor, setPrevColor] = useState<Stage2DColor | null>(null);
  const [fadeId, setFadeId] = useState(0);
  const shownColorRef = useRef<Stage2DColor | null>(color);
  const targetColorRef = useRef<Stage2DColor | null>(color);
  const colorToken = useRef(0);
  const hoodieRef = useRef<HTMLImageElement | null>(null);

  const colorKey = color?.key;
  useEffect(() => {
    if (!color || color.key === targetColorRef.current?.key) return;
    targetColorRef.current = color;
    const token = ++colorToken.current;
    const apply = (animated: boolean) => {
      const prev = shownColorRef.current;
      shownColorRef.current = color;
      setShownColor(color);
      if (animated && prev) {
        setPrevColor(prev);
        setFadeId((n) => n + 1);
      } else {
        setPrevColor(null);
      }
    };
    if (instantRef.current || !shownColorRef.current?.hoodieSrc || !color.hoodieSrc) {
      apply(false);
      return;
    }
    void cache.decodeOnly(color.hoodieSrc).then((r) => {
      if (token !== colorToken.current) return;
      if (r.status === 'error') return;
      apply(r.status === 'decoded');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the colour key only
  }, [colorKey]);

  useIsomorphicLayoutEffect(() => {
    if (fadeId === 0) return;
    const el = hoodieRef.current;
    if (!el || typeof el.animate !== 'function') {
      setPrevColor(null);
      return;
    }
    const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COLOR_FADE_MS, easing: 'linear', fill: 'backwards' });
    let cancelled = false;
    anim.finished.then(
      () => {
        if (!cancelled) setPrevColor(null);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      anim.cancel();
    };
  }, [fadeId]);

  // ----- Idle preloading of the neighbours (never on save-data) -----
  const preloadKey = useMemo(() => (preload ?? []).join('|'), [preload]);
  useEffect(() => {
    if (!active || !preloadKey) return;
    if (isSaveData(readEnvSignals())) return;
    const urls = preloadKey.split('|').filter(Boolean);
    return whenIdle(() => {
      for (const u of urls) void cache.load(u);
    });
  }, [active, preloadKey, cache]);

  // Keep the current art in the bounded cache so a swap back is instant.
  useEffect(() => {
    if (shownArt && active) void cache.load(shownArt.src);
  }, [shownArt, active, cache]);

  const c = shownColor;
  const place = c?.placement ?? null;
  const hasOverlay = !!c?.overlaySrc;

  return (
    <div
      data-builder-stage="2d"
      data-swapping={outArt ? 'true' : 'false'}
      className={['relative w-full select-none overflow-hidden bg-cream', className].filter(Boolean).join(' ')}
      style={{ aspectRatio: aspect }}
    >
      {prevColor?.hoodieSrc ? (
        <img
          data-layer="hoodie-prev"
          alt=""
          aria-hidden="true"
          src={prevColor.hoodieSrc}
          width={imageWidth}
          height={imageHeight}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : null}
      {c?.hoodieSrc ? (
        <img
          ref={hoodieRef}
          data-layer="hoodie"
          alt={c.alt}
          src={c.hoodieSrc}
          width={imageWidth}
          height={imageHeight}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : null}

      {place && shownArt ? (
        <div data-layer="panel" className="absolute" style={placementStyle(place)}>
          <div
            ref={wrapRef}
            data-layer="swap"
            className="absolute inset-0 overflow-hidden"
            style={{
              borderRadius: '4% / 2.56%',
              boxShadow: hasOverlay ? undefined : 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 0 14px rgba(0,0,0,0.10)',
            }}
          >
            {outArt ? (
              <img
                data-layer="stimpie-old"
                alt=""
                aria-hidden="true"
                src={outArt.src}
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            ) : null}
            <img
              ref={newRef}
              data-layer="stimpie-new"
              data-stimpie-key={String(shownArt.key)}
              alt={shownArt.alt}
              src={shownArt.src}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            {outArt ? (
              <div
                ref={lineRef}
                data-layer="zip-line"
                aria-hidden="true"
                className="pointer-events-none absolute left-0 right-0 top-0"
                style={{ height: 4, opacity: 0, background: TEETH }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {c?.overlaySrc ? (
        <img
          data-layer="overlay"
          alt=""
          aria-hidden="true"
          src={c.overlaySrc}
          loading={priority ? 'eager' : 'lazy'}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : null}

      {chip ? (
        <span
          data-layer="preview-chip"
          className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink"
        >
          Preview
        </span>
      ) : null}
      {children}
    </div>
  );
}
