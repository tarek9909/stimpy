'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Button, PriceTag, formatCents, useOptionalToast, useUI } from '@stimpy/ui';
import type {
  BuilderCartItem,
  BuilderCartSummary,
  BuilderData,
  BuilderHoodie,
  BuilderHandle,
  BuilderView,
  CameraView,
  EnvSignals,
  FallbackReason,
  ThrottleSimulator,
  Tier,
  TrackFn,
  WebGLProbe,
} from './types';
import { BuilderStage2D } from './BuilderStage2D';
import { BuilderCanvas3D, Canvas3DBoundary, type Canvas3DHandle } from './BuilderCanvas3D';
import { Controls3D, ColorSwatchRow, ModeToggle, PackSelector, SizeSheet, SlotChips, StimpieCarousel, BuilderStaticFallback } from './parts';
import { useInView, useReducedMotion } from './hooks';
import { DecodedImageCache } from './lib/images';
import {
  STORAGE_FALLBACK_PREFIX,
  STORAGE_SIZE_KEY,
  STORAGE_TIER_KEY,
  STORAGE_VIEW_KEY,
  probeWebGL,
  readEnvSignals,
  readSession,
  readTierVerdict,
  writeSession,
} from './lib/env';
import { colorsForView, joinColors, resolveColorForView, stimpieBlockReason, textureUrlFor, tintFor, usable2D } from './lib/join';
import { applyThrottle, applyWebGLSimulation, decideMode, formatMegabytes } from './lib/mode';
import {
  buildCartItem,
  colorSoldOut,
  evaluateAdd,
  initialSelection,
  packById,
  runningPriceCents,
  selectionReducer,
} from './lib/selection';
import { buildShareQuery, buildShareUrl, type ShareParams } from './lib/share';
import { buildCartSummary, liveAnnouncement, stimpieById } from './lib/summary';
import type { SwapSample } from './lib/swapMonitor';

export interface BuilderProps {
  /** The three payloads (+ packs + hoodie detail). The dashboard feeds the same shape built from unsaved form state. */
  data: BuilderData;
  /** `page` (full experience) or `teaser` (compact, always 2D, no pack or size). */
  surface?: 'page' | 'teaser';
  /** Parsed share link (`parseShareParams(searchParams)`); read once on load. */
  initialShare?: ShareParams | null;
  /** Keep the URL in sync with the selection through `history.replaceState` (page only). */
  syncUrl?: boolean;
  /** Absolute URL used by the share button; default is the current page without query. */
  shareBaseUrl?: string;
  /** Called when the visitor adds to cart. When omitted the purchase UI (price, size, add to cart) is not rendered. */
  onAddToCart?: (item: BuilderCartItem, summary: BuilderCartSummary) => void;
  /** Fetch a fresh hoodie inventory snapshot when the size chooser is opened. */
  refreshInventory?: () => Promise<BuilderHoodie | null>;
  /** Analytics callback (`builder_*` events of builder.md 14). No personal data is ever passed. */
  track?: TrackFn;
  /** `nav`, `stimpie_page`, `share` or `home_cta` (builder_open). */
  source?: string;
  /** Bypass the software-renderer and slow-frame checks (tests, dashboard); "renderer" bypasses only the software-renderer check so the real frame sampling still runs. Callers gate it themselves. */
  force3d?: boolean | 'renderer';
  /** Dashboard preview: simulate slow 3G or a low-tier device. */
  throttleSimulator?: ThrottleSimulator;
  /** Expose `window.__stimpyBuilder3d` (tests). */
  debug3d?: boolean;
  /** Test hook: break the swap shader to exercise the cross-fade fallback. */
  breakShader?: boolean;
  /** Hide "See real photos" links (dashboard preview). */
  hidePhotoLinks?: boolean;
  /** Where "See real photos" goes. Defaults to the shop routes. */
  hrefs?: { stimpie?: (slug: string) => string; hoodie?: (slug: string) => string; fullBuilder?: (s: { colorId: number | null; stimpie: string | null }) => string; sizeGuide?: string; shop?: string };
  /** Sticky mobile bottom bar for price + Add to cart. Default true on the page. */
  stickyBar?: boolean;
  /** Imperative handle (camera read-out for the dashboard). */
  ref?: Ref<BuilderHandle>;
  className?: string;
}

interface EnvState {
  probe: WebGLProbe | null;
  signals: EnvSignals;
  userView: BuilderView | null;
  tierVerdict: { disabled: boolean; tier: Tier | null };
}

const reportedFallbacks = new Set<string>();
const reportedInteractions = new Set<string>();

function onceFallback(reason: FallbackReason, track: TrackFn | undefined) {
  const key = STORAGE_FALLBACK_PREFIX + reason;
  if (reportedFallbacks.has(key) || readSession(key) === '1') return;
  reportedFallbacks.add(key);
  writeSession(key, '1');
  track?.('builder_fallback', { reason });
}

/** The Builder: stage (2D or 3D), mode toggle, colour swatches, Stimpie carousel, packs, size sheet, add to cart. */
export function Builder({
  data,
  surface = 'page',
  initialShare = null,
  syncUrl = false,
  shareBaseUrl,
  onAddToCart,
  refreshInventory,
  track,
  source = 'nav',
  force3d = false,
  throttleSimulator,
  debug3d = false,
  breakShader = false,
  hidePhotoLinks = false,
  hrefs,
  stickyBar,
  ref,
  className,
}: BuilderProps) {
  const compact = surface === 'teaser';
  const { Link } = useUI();
  const toast = useOptionalToast();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef(track);
  trackRef.current = track;
  const emit: TrackFn = useCallback((event, props) => trackRef.current?.(event, props), []);

  const { config, packs: packsAll, hoodie } = data;
  const packs = compact ? [] : packsAll;
  const effectiveMode = compact ? '2D' : config.effectiveMode;
  const defaultView: BuilderView = String(config.defaultView).toLowerCase() === '3d' ? '3d' : '2d';

  // ----- the join (builder.md 2.2) -----
  const joinedAll = useMemo(() => joinColors(data.colors, config), [data.colors, config]);
  const joined = useMemo(() => {
    if (!compact) return joinedAll;
    return joinedAll.filter(usable2D).slice(0, 4);
  }, [joinedAll, compact]);
  const stimpies = useMemo(() => (compact ? data.stimpies.slice(0, 6) : data.stimpies), [data.stimpies, compact]);
  const model = config.model3d;
  const hasModel = !!model && !compact;
  const has2d = joined.some(usable2D) && stimpies.length > 0;
  const has3d = hasModel && joined.length > 0 && stimpies.length > 0;
  const initialView: BuilderView | 'pending' | 'static' = has2d ? '2d' : has3d && effectiveMode !== '2D' ? 'pending' : 'static';

  // ----- selection -----
  const [selection, dispatch] = useReducer(
    selectionReducer,
    undefined,
    () =>
      initialSelection({
        colors: joined,
        stimpies,
        packs,
        view: has2d ? '2d' : '3d',
        hasModel,
        share: initialShare,
      }),
  );

  // ----- mode resolution (runs once after mount; the server always renders 2D) -----
  const [env, setEnv] = useState<EnvState | null>(null);
  const [loadTapped, setLoadTapped] = useState(false);
  const [threeFailure, setThreeFailure] = useState<FallbackReason | null>(null);
  useEffect(() => {
    const signals = applyThrottle(readEnvSignals(), throttleSimulator);
    const wants3d = effectiveMode !== '2D' && has3d;
    const stored = readSession(STORAGE_VIEW_KEY);
    setEnv({
      probe: wants3d ? applyWebGLSimulation(probeWebGL(), throttleSimulator) : null,
      signals,
      userView: stored === '2d' || stored === '3d' ? stored : null,
      tierVerdict: force3d === true ? { disabled: false, tier: null } : readTierVerdict(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount; the simulator re-runs it below
  }, []);
  const simKey = typeof throttleSimulator === 'string' ? throttleSimulator : JSON.stringify(throttleSimulator ?? 'none');
  const firstSim = useRef(simKey);
  useEffect(() => {
    if (firstSim.current === simKey) return;
    firstSim.current = simKey;
    setThreeFailure(null);
    setLoadTapped(false);
    setEnv((e) => (e ? {
      ...e,
      probe: applyWebGLSimulation(probeWebGL(), throttleSimulator),
      signals: applyThrottle(readEnvSignals(), throttleSimulator),
      tierVerdict: { disabled: false, tier: null },
    } : e));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the simulator value
  }, [simKey]);

  const decision = useMemo(() => {
    if (!env) return null;
    return decideMode({
      effectiveMode,
      defaultView,
      has2d,
      has3d,
      probe: env.probe,
      signals: env.signals,
      force3d: !!force3d,
      storedVerdict: threeFailure || (force3d !== true && env.tierVerdict.disabled) ? 'disabled' : null,
      userView: env.userView,
      loadTapped,
      shareView: initialShare?.view ?? null,
    });
  }, [env, effectiveMode, defaultView, has2d, has3d, force3d, threeFailure, loadTapped, initialShare]);

  const view: BuilderView | 'pending' | 'static' = decision ? decision.view : initialView;
  const [threeReady, setThreeReady] = useState(false);
  useEffect(() => {
    if (view !== '3d') setThreeReady(false);
  }, [view]);

  // analytics: mode resolved, fallbacks
  const resolvedOnce = useRef(false);
  useEffect(() => {
    if (!decision || resolvedOnce.current) return;
    resolvedOnce.current = true;
    emit('builder_mode_resolved', {
      effective_mode: effectiveMode,
      view: decision.view === '3d' ? '3d' : '2d',
      tier: decision.tier,
      reason: decision.reason,
    });
    if (effectiveMode !== '2D' && has3d && decision.threeDisabled && decision.reason === 'WEBGL_UNSUPPORTED') {
      onceFallback('WEBGL_UNSUPPORTED', trackRef.current);
    }
    if (decision.view === 'static') onceFallback('NO_RENDERER', trackRef.current);
  }, [decision, effectiveMode, has3d, emit]);

  const handleFallback = useCallback(
    (reason: FallbackReason) => {
      if (force3d || debug3d) console.info('[builder] automatic fallback to 2D:', reason); // eslint-disable-line no-console -- test/dashboard overrides only
      onceFallback(reason, trackRef.current);
      if (reason === 'SLOW_FRAMES') writeSession(STORAGE_TIER_KEY, 'disabled');
      setThreeFailure(reason);
    },
    [force3d, debug3d],
  );

  // ----- colours valid for the current view -----
  const viewForColors: BuilderView = view === '3d' ? '3d' : '2d';
  const visibleColors = useMemo(() => colorsForView(joined, viewForColors, hasModel), [joined, viewForColors, hasModel]);
  useEffect(() => {
    const ok = resolveColorForView(joined, selection.colorId, viewForColors, hasModel);
    if (ok !== null && ok !== selection.colorId) dispatch({ type: 'color', colorId: ok });
  }, [joined, selection.colorId, viewForColors, hasModel]);

  const color = joined.find((c) => c.id === selection.colorId) ?? visibleColors[0] ?? null;
  const stimpie = stimpieById(stimpies, selection.previewId) ?? stimpies[0] ?? null;
  const pack = packById(packs, selection.packId);

  // ----- stock and price -----
  const soldOutIds = useMemo(() => new Set(joined.filter((c) => colorSoldOut(hoodie, c.id)).map((c) => c.id)), [joined, hoodie]);
  const priceCents = runningPriceCents(selection, packs, hoodie);
  const addState = evaluateAdd({ selection, packs, stimpies, hoodie });
  const purchase = !!onAddToCart && !compact && !!hoodie;

  // ----- 2D / 3D props -----
  const cache = useRef<DecodedImageCache | null>(null);
  if (!cache.current) cache.current = new DecodedImageCache();
  const idx = stimpie ? stimpies.findIndex((s) => s.id === stimpie.id) : -1;
  const neighbours = [stimpies[idx - 1], stimpies[idx + 1]].filter((s): s is NonNullable<typeof s> => !!s);
  const inView = useInView(rootRef, '200px', compact);
  const stage2dColor = color
    ? {
        key: color.id,
        hoodieSrc: usable2D(color) ? color.hoodieImage2d : null,
        overlaySrc: usable2D(color) ? color.overlay2d : null,
        placement: usable2D(color) ? color.placement2d : null,
        alt: `${color.name} Stimpy hoodie, back view`,
      }
    : null;
  const stage2dArt = stimpie ? { key: stimpie.id, src: stimpie.artworkUrl, alt: `${stimpie.name} Stimpie` } : null;
  const engineArt = stimpie
    ? { id: stimpie.id, url: textureUrlFor(stimpie, config.stimpieTextures), width: stimpie.artworkWidth, height: stimpie.artworkHeight }
    : null;
  const label3d = `3D preview of a ${color?.name ?? ''} Stimpy hoodie${stimpie ? ` with the ${stimpie.name} Stimpie on the back` : ''}. Drag to rotate.`;
  const tier: Tier = env?.tierVerdict.tier ?? decision?.tier ?? 'mid';
  const sim = typeof throttleSimulator === 'object' ? throttleSimulator : undefined;
  const extraFrameMs = sim?.extraFrameMs ?? (throttleSimulator === 'low-tier' ? 30 : 0);

  // ----- swap analytics (1 in 5 plus the first) -----
  const swapCount = useRef(0);
  const reportSwap = useCallback(
    (v: '2d' | '3d', s: SwapSample) => {
      swapCount.current += 1;
      if (swapCount.current === 1 || swapCount.current % 5 === 0) {
        emit('builder_swap_done', { view: v, duration_ms: Math.round(s.durationMs), dropped_frames: Math.round(s.droppedFrames) });
      }
    },
    [emit],
  );

  // ----- live region -----
  const [announce, setAnnounce] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setAnnounce(liveAnnouncement({ color, selection, packs, hoodie, stimpie }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce on selection changes only
  }, [selection.colorId, selection.packId, selection.previewId]);

  // ----- share link: keep the URL in sync (no history entry per click) -----
  useEffect(() => {
    if (!syncUrl || !color || !stimpie) return;
    const first = pack ? stimpieById(stimpies, selection.slots[0] ?? null) : stimpie;
    const second = pack && pack.stimpieCount > 1 ? stimpieById(stimpies, selection.slots[1] ?? null) : null;
    const params = new URLSearchParams(window.location.search); // keep unrelated params (view, UTM, test flags)
    const mine = new URLSearchParams(
      buildShareQuery({
        colorId: color.id,
        stimpie: first?.slug ?? stimpie.slug,
        stimpie2: second?.slug ?? null,
        pack: pack ? pack.slug : packsAll.length > 0 ? 'hoodie-only' : null,
      }),
    );
    for (const k of ['color', 'stimpie', 'stimpie2', 'pack']) {
      const v = mine.get(k);
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    try {
      window.history.replaceState(window.history.state, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
    } catch {
      /* some embedded browsers refuse replaceState: the URL simply is not updated */
    }
  }, [syncUrl, color, stimpie, pack, packsAll.length, selection.slots, stimpies]);

  // ----- sticky bar offset for toasts / floating buttons -----
  const sticky = (stickyBar ?? surface === 'page') && purchase;
  useEffect(() => {
    if (!sticky) return;
    const el = document.documentElement;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => {
      if (mq.matches) el.style.setProperty('--stimpy-sticky-offset', '72px');
      else el.style.removeProperty('--stimpy-sticky-offset');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      el.style.removeProperty('--stimpy-sticky-offset');
    };
  }, [sticky]);

  // ----- builder_open -----
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || (compact && !inView)) return;
    opened.current = true;
    emit('builder_open', { surface: compact ? 'teaser' : 'page', source });
  }, [compact, inView, source, emit]);

  // ----- 3D canvas handle -----
  const canvasRef = useRef<Canvas3DHandle | null>(null);
  useImperativeHandle(
    ref,
    (): BuilderHandle => ({
      getCameraView: () => canvasRef.current?.getView() ?? null,
      setCameraView: (v: CameraView) => canvasRef.current?.setCameraConfig(v, false),
      getView: () => (view === '3d' ? '3d' : view === '2d' ? '2d' : 'static'),
    }),
    [view],
  );
  const [interacted, setInteracted] = useState(false);

  // ----- handlers -----
  const onColor = (id: number) => {
    dispatch({ type: 'color', colorId: id });
    emit('builder_color_select', { color_id: id });
  };
  const onPick = (id: number) => {
    dispatch({ type: 'pick', stimpieId: id });
    const s = stimpieById(stimpies, id);
    if (s) emit('builder_stimpie_select', { stimpie_slug: s.slug, slot: selection.focus + 1, view: view === '3d' ? '3d' : '2d' });
  };
  const onPack = (packId: number | null) => {
    dispatch({ type: 'pack', packId, packs });
    const p = packById(packs, packId);
    emit('builder_pack_select', p ? { pack_slug: p.slug } : { hoodie_only: true });
  };
  const onToggle = (v: BuilderView) => {
    writeSession(STORAGE_VIEW_KEY, v);
    setEnv((e) => (e ? { ...e, userView: v } : e));
    emit('builder_toggle_view', { to: v });
  };
  const onInteract = useCallback(
    (kind: 'rotate' | 'zoom' | 'reset') => {
      setInteracted(true);
      if (reportedInteractions.has(kind)) return;
      reportedInteractions.add(kind);
      emit('builder_3d_interact', { kind });
    },
    [emit],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const addButtonRef = useRef<HTMLElement | null>(null);
  const [inventory, setInventory] = useState<BuilderHoodie | null>(hoodie ?? null);
  const [refreshingInventory, setRefreshingInventory] = useState(false);
  useEffect(() => setInventory(hoodie ?? null), [hoodie]);
  const finalize = (chosenSize: number) => {
    if (!hoodie || !color || !onAddToCart) return;
    const item = buildCartItem({ selection, packs, hoodieId: hoodie.id, sizeId: chosenSize });
    if (!item) return;
    const sizeLabel = hoodie.sizes.find((s) => s.id === chosenSize)?.label ?? null;
    const summary = buildCartSummary({ selection, packs, stimpies, hoodie, color, sizeLabel });
    onAddToCart(item, summary);
    writeSession(STORAGE_SIZE_KEY, String(chosenSize));
    emit('builder_add_to_cart', { kind: item.kind, pack_slug: pack?.slug ?? null, value_cents: summary.unitPriceCents });
    setSheetOpen(false);
  };
  const onAdd = async () => {
    if (!addState.ok || !hoodie || refreshingInventory) return;
    let fresh = inventory ?? hoodie;
    if (refreshInventory) {
      setRefreshingInventory(true);
      try {
        fresh = (await refreshInventory()) ?? fresh;
        setInventory(fresh);
      } catch {
        // The last catalog snapshot remains usable; cart validation and checkout are authoritative.
      } finally {
        setRefreshingInventory(false);
      }
    }
    const freshSizeInStock = (id: number | null) =>
      id !== null && color !== null && fresh.variants.some((v) => v.colorId === color.id && v.sizeId === id && v.inStock);
    if (sizeId !== null && freshSizeInStock(sizeId)) {
      finalize(sizeId);
      return;
    }
    if (sizeId === null) {
      const remembered = Number(readSession(STORAGE_SIZE_KEY));
      if (remembered && freshSizeInStock(remembered)) setSizeId(remembered);
    }
    setSheetOpen(true);
    emit('builder_size_sheet_open');
  };

  const onShare = async () => {
    if (!color || !stimpie) return;
    const base = shareBaseUrl ?? `${window.location.origin}${window.location.pathname}`;
    const first = pack ? stimpieById(stimpies, selection.slots[0] ?? null) : stimpie;
    const second = pack && pack.stimpieCount > 1 ? stimpieById(stimpies, selection.slots[1] ?? null) : null;
    const url = buildShareUrl(base, {
      colorId: color.id,
      stimpie: first?.slug ?? stimpie.slug,
      stimpie2: second?.slug ?? null,
      pack: pack ? pack.slug : packsAll.length > 0 ? 'hoodie-only' : null,
    });
    const title = `${stimpie.name} on a Stimpy hoodie`;
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title, url });
        emit('builder_share', { method: 'native' });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast?.success('Link copied');
      emit('builder_share', { method: 'copy' });
    } catch {
      toast?.error('Could not copy the link. Copy it from the address bar.');
    }
  };

  // ----- derived UI -----
  const slotOf = (id: number) => {
    const at = selection.slots.indexOf(id);
    return at >= 0 && selection.slots.length > 1 ? at + 1 : null;
  };
  const selectedIds = selection.slots.length > 0 ? selection.slots.filter((s): s is number => s !== null) : selection.previewId !== null ? [selection.previewId] : [];
  const disabledIds = useMemo(() => {
    const out = new Set<number>();
    selection.slots.forEach((id, i) => {
      if (id !== null && i !== selection.focus) out.add(id);
    });
    return out;
  }, [selection.slots, selection.focus]);

  const photoStimpieHref = stimpie ? (hrefs?.stimpie?.(stimpie.slug) ?? `/shop/stimpie/${stimpie.slug}`) : null;
  const photoHoodieHref = config.hoodie ? (hrefs?.hoodie?.(config.hoodie.slug) ?? `/shop/hoodie/${config.hoodie.slug}`) : null;
  const fullHref = hrefs?.fullBuilder
    ? hrefs.fullBuilder({ colorId: color?.id ?? null, stimpie: stimpie?.slug ?? null })
    : `/builder${color && stimpie ? `?${buildShareQuery({ colorId: color.id, stimpie: stimpie.slug })}` : ''}`;

  // ----- static fallback -----
  if (view === 'static' || joined.length === 0 || stimpies.length === 0) {
    return (
      <BuilderStaticFallback photo={joined[0]?.photo ?? hoodie?.images[0] ?? null} stimpies={stimpies} shopHref={hrefs?.shop ?? '/shop'} />
    );
  }

  const show3d = view === '3d' && !!model && !!color;
  const showToggle = !!decision?.showToggle && !compact;
  const canvasCamera = model
    ? { position: model.camera.position, target: model.camera.target, fov: model.camera.fov }
    : null;
  const priceLabel = priceCents !== null ? formatCents(priceCents) : '';

  return (
    <section
      ref={rootRef}
      data-builder={compact ? 'teaser' : 'page'}
      data-builder-view={view}
      aria-label="Builder"
      className={['w-full', className].filter(Boolean).join(' ')}
    >
      <div className={compact ? 'grid grid-cols-1 items-center gap-6 md:grid-cols-2' : 'lg:grid lg:items-start lg:gap-10'} style={compact ? undefined : { gridTemplateColumns: 'minmax(0, 560px) minmax(0, 1fr)' }}>
        {/* ---------------- stage ---------------- */}
        <div className="mx-auto w-full" style={{ maxWidth: compact ? undefined : 560 }}>
          <div
            role="group"
            aria-label={`Preview: ${color?.name ?? ''} Stimpy hoodie${stimpie ? ` with the ${stimpie.name} Stimpie` : ''}`}
            data-builder-frame
            className={compact ? 'relative mx-auto w-full max-w-[336px] bg-cream md:max-w-[384px]' : 'relative w-full bg-cream'}
            style={{ aspectRatio: '4 / 5' }}
          >
            <div
              className="absolute inset-0"
              style={{
                opacity: show3d && threeReady ? 0 : 1,
                visibility: show3d && threeReady ? 'hidden' : 'visible',
                transition: reduced ? 'none' : 'opacity 150ms linear',
              }}
              aria-hidden={show3d && threeReady ? true : undefined}
            >
              <BuilderStage2D
                color={stage2dColor}
                art={stage2dArt}
                instant={reduced || show3d}
                priority={!compact}
                active={compact ? inView : true}
                preload={neighbours.map((n) => n.artworkUrl)}
                cache={cache.current}
                chip={false}
                className="h-full"
                onSwapDone={(s) => reportSwap('2d', s)}
              />
            </div>

            {show3d && model && color && canvasCamera ? (
              <Canvas3DBoundary onError={() => handleFallback('GLB_FAILED')}>
                <BuilderCanvas3D
                  model={{ ...model, camera: canvasCamera }}
                  tint={tintFor(color)}
                  fabricTextureUrl={color.texture3d}
                  art={engineArt}
                  neighbours={neighbours.map((n) => ({
                    id: n.id,
                    url: textureUrlFor(n, config.stimpieTextures),
                    width: n.artworkWidth,
                    height: n.artworkHeight,
                  }))}
                  tier={tier}
                  reducedMotion={reduced}
                  label={label3d}
                  onReady={() => setThreeReady(true)}
                  onFallback={handleFallback}
                  onReport={(r) => onceFallback(r, trackRef.current)}
                  onPerf={(p) => emit('builder_perf', { view: '3d', median_frame_ms: Math.round(p.medianFrameMs * 10) / 10, fps_tier: p.tier })}
                  onTierChange={(t) => writeSession(STORAGE_TIER_KEY, t)}
                  onInteract={onInteract}
                  onSwapDone={(s) => reportSwap('3d', s)}
                  skipFrameVerdict={force3d === true}
                  extraFrameMs={extraFrameMs}
                  debug={debug3d || !!force3d}
                  breakShader={breakShader}
                  handleRef={canvasRef}
                />
              </Canvas3DBoundary>
            ) : null}

            <span
              data-layer="preview-chip"
              className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink"
            >
              Preview
            </span>
            {showToggle && view !== 'pending' ? (
              <div className="absolute right-3 top-3">
                <ModeToggle view={view === '3d' ? '3d' : '2d'} onChange={onToggle} />
              </div>
            ) : null}
            {show3d && threeReady && !interacted ? (
              <p
                data-builder-hint
                className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-caption text-white"
              >
                Drag to turn
              </p>
            ) : null}
          </div>

          {show3d ? (
            <div className="mt-2">
              <Controls3D
                onRotate={(d) => canvasRef.current?.rotateBy(d)}
                onZoom={(f) => canvasRef.current?.zoomBy(f)}
                onReset={() => canvasRef.current?.resetView()}
              />
            </div>
          ) : null}

          <p className="mt-2 text-caption text-fg-muted">Preview. Real photos are one tap away.</p>

          {decision?.needsLoadTap && model ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted" data-builder-load3d>
              <span>3D view available</span>
              <button
                type="button"
                className="min-h-tap rounded-full border border-control px-4 text-body-sm font-medium text-ink"
                onClick={() => {
                  emit('builder_load_3d_tap');
                  setLoadTapped(true);
                  setEnv((e) => (e ? { ...e, userView: '3d' } : e));
                }}
              >
                Load 3D (about {formatMegabytes(model.sizeBytes)})
              </button>
            </p>
          ) : null}
        </div>

        {/* ---------------- controls ---------------- */}
        <div className={compact ? 'flex flex-col gap-4' : 'mt-4 flex flex-col gap-5 lg:mt-0'}>
          <ColorSwatchRow colors={visibleColors} selectedId={color?.id ?? null} soldOutIds={soldOutIds} onSelect={onColor} />

          {pack && pack.stimpieCount > 1 ? (
            <SlotChips slots={selection.slots} focus={selection.focus} stimpies={stimpies} onFocus={(s) => dispatch({ type: 'focus', slot: s })} />
          ) : null}

          <StimpieCarousel
            stimpies={stimpies}
            selectedIds={selectedIds}
            previewId={selection.previewId}
            disabledIds={disabledIds}
            slotOf={slotOf}
            onPick={onPick}
            selectOnFocus={compact}
            reducedMotion={reduced}
            eagerCount={compact ? 0 : 4}
          />

          {/* Non-visual alternative to the carousel (website-pages 4.5 accessibility) */}
          <div className="sr-only">
            <label htmlFor="builder-stimpie-select">Choose Stimpie</label>
            <select
              id="builder-stimpie-select"
              value={selection.previewId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) onPick(id);
              }}
            >
              {stimpies.map((s) => (
                <option key={s.id} value={s.id} disabled={disabledIds.has(s.id)}>
                  {s.name}
                  {stimpieBlockReason(s) ? ` (${stimpieBlockReason(s)})` : ''}
                </option>
              ))}
            </select>
          </div>

          {!compact && (packs.length > 0 || hoodie) ? (
            <PackSelector packs={packs} selectedPackId={selection.packId} hoodiePriceCents={hoodie?.priceCents ?? null} onSelect={onPack} />
          ) : null}

          {compact ? (
            <div>
              <Button href={fullHref} variant="secondary" size="lg" data-builder-open-full>
                Open full Builder
              </Button>
            </div>
          ) : null}

          {purchase ? (
            <div
              data-builder-buy
              className={
                sticky
                  ? 'fixed inset-x-0 bottom-0 z-40 border-t border-base bg-white p-3 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0'
                  : ''
              }
            >
              <div className="mx-auto flex max-w-[560px] flex-col gap-2 lg:max-w-none">
                <div className="hidden items-baseline justify-between gap-3 lg:flex">
                  {priceCents !== null ? <PriceTag cents={priceCents} size="lg" data-builder-price /> : <span />}
                  <span className="text-body-sm text-fg-muted">{pack?.description ?? hoodie?.name ?? ''}</span>
                </div>
                <Button
                  ref={addButtonRef}
                  variant="cta"
                  size="lg"
                  fullWidth
                  disabled={!addState.ok || refreshingInventory}
                  onClick={onAdd}
                  data-builder-add
                  aria-describedby={addState.hint ? 'builder-add-hint' : undefined}
                >
                  {priceCents !== null ? `Add to cart - ${priceLabel}` : 'Add to cart'}
                </Button>
                {addState.hint ? (
                  <p id="builder-add-hint" className="text-body-sm text-fg-muted" data-builder-hint-text>
                    {addState.hint}
                  </p>
                ) : (
                  <p className="text-caption text-fg-muted">Pay cash on delivery. Extra Stimpies are bought separately.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {!compact && stimpie?.status === 'UPCOMING' && stimpie.drop?.slug ? (
              <Link
                href={`/drops/${stimpie.drop.slug}`}
                className="inline-flex min-h-tap items-center text-body-sm font-medium underline"
                data-builder-upcoming-drop
              >
                See the upcoming drop
              </Link>
            ) : null}
            {!hidePhotoLinks && photoStimpieHref ? (
              <Link
                href={photoStimpieHref}
                className="inline-flex min-h-tap items-center text-body-sm font-medium underline"
                data-builder-see-photos
                onClick={() => emit('builder_see_photos', { target: 'stimpie' })}
              >
                See real photos
              </Link>
            ) : null}
            {!hidePhotoLinks && photoHoodieHref && !compact ? (
              <Link
                href={photoHoodieHref}
                className="inline-flex min-h-tap items-center text-body-sm underline"
                onClick={() => emit('builder_see_photos', { target: 'hoodie' })}
              >
                Hoodie photos
              </Link>
            ) : null}
            {!compact ? (
              <button type="button" className="inline-flex min-h-tap items-center text-body-sm underline" onClick={onShare} data-builder-share>
                Share this look
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-builder-live>
        {announce}
      </p>
      {sticky ? <div className="h-24 lg:hidden" aria-hidden="true" /> : null}

      {purchase && hoodie && color ? (
        <SizeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          returnFocusRef={addButtonRef}
          hoodie={inventory ? { ...hoodie, variants: inventory.variants } : hoodie}
          colorId={color.id}
          sizeId={sizeId}
          onSelect={setSizeId}
          confirmLabel={priceCents !== null ? `Add to cart - ${priceLabel}` : 'Add to cart'}
          onConfirm={() => sizeId !== null && finalize(sizeId)}
          sizeGuideHref={hrefs?.sizeGuide ?? '/help'}
        />
      ) : null}
    </section>
  );
}
