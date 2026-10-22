'use client';

import { Component, useEffect, useImperativeHandle, useRef, useState, type ErrorInfo, type ReactNode, type Ref } from 'react';
import type { BuilderModel3d, CameraView, FallbackReason, Tier } from './types';
import type { EngineArt, EngineHandle } from './three/engine';
import type { SwapSample } from './lib/swapMonitor';
import { isSaveData, readEnvSignals } from './lib/env';
import { whenIdle } from './lib/images';

export type { EngineArt } from './three/engine';

/** What the stage buttons and the dashboard can ask of the running canvas. */
export interface Canvas3DHandle {
  rotateBy(deg: number): void;
  zoomBy(factor: number): void;
  resetView(): void;
  /** The orbit camera right now (dashboard "Use current preview view"). */
  getView(): CameraView | null;
  setCameraConfig(view: CameraView, animate?: boolean): void;
}

export interface BuilderCanvas3DProps {
  model: BuilderModel3d;
  tint: string;
  fabricTextureUrl: string | null;
  /** The Stimpie on the back panel. */
  art: EngineArt | null;
  /** Neighbours to warm on idle (at most 2). */
  neighbours?: readonly EngineArt[];
  tier: Tier;
  reducedMotion: boolean;
  /** Accessible name of the canvas (`role="img"`), updated on every selection. */
  label: string;
  /** First 3D frame is on screen: the caller cross-fades from the 2D poster. */
  onReady?: () => void;
  /** Automatic fallback: the caller silently switches to 2D. */
  onFallback: (reason: FallbackReason) => void;
  /** Reports that do not change the view (shader patch failed -> cross-fade swap). */
  onReport?: (reason: FallbackReason) => void;
  onTierChange?: (tier: Tier) => void;
  onPerf?: (p: { medianFrameMs: number; p95FrameMs: number; tier: Tier }) => void;
  onInteract?: (kind: 'rotate' | 'zoom' | 'reset') => void;
  onSwapDone?: (s: SwapSample) => void;
  /** Test/dashboard override: never fall back because of slow frames. */
  skipFrameVerdict?: boolean;
  /** Throttle simulator: artificial frame cost. */
  extraFrameMs?: number;
  /** Expose `window.__stimpyBuilder3d` for tests. */
  debug?: boolean;
  /** Test hook: break the swap shader to exercise the fallback. */
  breakShader?: boolean;
  /** Imperative handle (rotate, zoom, reset, camera read-out). */
  handleRef?: Ref<Canvas3DHandle>;
  className?: string;
}

/**
 * Client-only 3D view. The three.js chunk is fetched by the dynamic `import()` below, and only when this component is
 * mounted, i.e. when the decision order of builder.md 6.1 said 3D is viable and the view is 3D.
 */
export function BuilderCanvas3D(props: BuilderCanvas3DProps) {
  const { model, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const [progress, setProgress] = useState<number | null>(0);
  const [ready, setReady] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(
    props.handleRef,
    (): Canvas3DHandle => ({
      rotateBy: (d) => engineRef.current?.rotateBy(d),
      zoomBy: (f) => engineRef.current?.zoomBy(f),
      resetView: () => engineRef.current?.resetView(),
      getView: () => engineRef.current?.getView() ?? null,
      setCameraConfig: (v, a) => engineRef.current?.setCameraConfig(v, a),
    }),
    [],
  );

  const modelKey = `${model.url}|${model.backPanelMesh}|${model.panelAspect}`;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ctl = new AbortController();
    let engine: EngineHandle | null = null;
    let cancelled = false;
    let p = propsRef.current;
    setReady(false);
    setProgress(0);

    void (async () => {
      try {
        // The lazy chunk can fail to download independently of model loading; that must also fall back to 2D.
        const mod = await import('./three/engine');
        if (cancelled) return;
        p = propsRef.current;
        engine = await mod.createEngine({
          container,
          model: {
            url: p.model.url,
            sizeBytes: p.model.sizeBytes,
            backPanelMesh: p.model.backPanelMesh,
            panelAspect: p.model.panelAspect,
            camera: {
              position: toVec3(p.model.camera.position),
              target: toVec3(p.model.camera.target),
              fov: p.model.camera.fov,
            },
            lighting: p.model.lighting,
          },
          tier: p.tier,
          reducedMotion: p.reducedMotion,
          tint: p.tint,
          fabricTextureUrl: p.fabricTextureUrl,
          art: p.art,
          signal: ctl.signal,
          onProgress: (f) => {
            if (!cancelled) setProgress(f);
          },
          onFallback: (r) => {
            if (!cancelled) propsRef.current.onFallback(r);
          },
          onReport: (r) => propsRef.current.onReport?.(r),
          onTierChange: (t) => propsRef.current.onTierChange?.(t),
          onPerf: (x) => propsRef.current.onPerf?.(x),
          onInteract: (k) => propsRef.current.onInteract?.(k),
          onSwapDone: (s) => propsRef.current.onSwapDone?.(s),
          skipFrameVerdict: p.skipFrameVerdict === true,
          ...(p.extraFrameMs ? { extraFrameMs: p.extraFrameMs } : {}),
          debug: p.debug === true,
          breakShader: p.breakShader === true,
        });
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === 'EngineAborted')) return;
        const reason = e instanceof Error && 'reason' in e ? ((e as { reason: FallbackReason }).reason) : 'GLB_FAILED';
        propsRef.current.onFallback(reason);
        return;
      }
      if (cancelled) {
        engine.dispose();
        engine = null;
        return;
      }
      engineRef.current = engine;
      // Read the latest props: the fabric may have changed while the model was downloading.
      const fabric = propsRef.current.fabricTextureUrl;
      if (fabric) engine.setFabricTexture(fabric);
      setReady(true);
      requestAnimationFrame(() => {
        if (!cancelled) propsRef.current.onReady?.();
      });
    })();

    return () => {
      cancelled = true;
      ctl.abort();
      engineRef.current = null;
      engine?.dispose();
      engine = null;
    };
  }, [modelKey]);

  // ----- live updates (selection and dashboard edits). The engine is never recreated for these. -----
  const appliedArt = useRef<string | number | null>(props.art?.id ?? null);
  useEffect(() => {
    const e = engineRef.current;
    const art = props.art;
    if (!e || !art || art.id === appliedArt.current) return;
    appliedArt.current = art.id;
    void e.showArt(art, true);
  }, [props.art, ready]);

  useEffect(() => {
    engineRef.current?.setTint(props.tint, true);
  }, [props.tint, ready]);

  useEffect(() => {
    engineRef.current?.setFabricTexture(props.fabricTextureUrl);
  }, [props.fabricTextureUrl]);

  useEffect(() => {
    engineRef.current?.setLighting(model.lighting);
  }, [model.lighting, ready]);

  const camKey = JSON.stringify([model.camera.position, model.camera.target, model.camera.fov]);
  const appliedCam = useRef(camKey);
  useEffect(() => {
    if (!engineRef.current || appliedCam.current === camKey) return;
    appliedCam.current = camKey;
    engineRef.current.setCameraConfig({ position: toVec3(model.camera.position), target: toVec3(model.camera.target), fov: model.camera.fov }, false);
  }, [camKey, model.camera, ready]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(props.reducedMotion);
  }, [props.reducedMotion, ready]);

  const nbKey = (props.neighbours ?? []).map((n) => String(n.id)).join('|');
  useEffect(() => {
    if (!ready || !nbKey) return;
    if (isSaveData(readEnvSignals())) return;
    const list = propsRef.current.neighbours ?? [];
    return whenIdle(() => engineRef.current?.preload(list));
  }, [nbKey, ready]);

  useEffect(() => {
    const c = engineRef.current?.canvas;
    if (!c) return;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', props.label);
  }, [props.label, ready]);

  return (
    <div
      ref={containerRef}
      data-builder-3d={ready ? 'ready' : 'loading'}
      className={['absolute inset-0', className].filter(Boolean).join(' ')}
      style={{ opacity: ready ? 1 : 0, transition: props.reducedMotion ? 'none' : 'opacity 150ms linear' }}
    >
      {!ready ? (
        <div className="pointer-events-none absolute left-0 right-0 top-0 h-1 bg-ink/10" aria-hidden="true" data-builder-progress>
          <div
            className="h-full bg-ink"
            style={{ width: progress === null ? '40%' : `${Math.round(progress * 100)}%`, transition: 'width 120ms linear' }}
          />
        </div>
      ) : null}
    </div>
  );
}

function toVec3(a: readonly number[]): readonly [number, number, number] {
  return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
}

/** Error boundary around the 3D view: any render error silently falls back to 2D (builder.md 6.2). */
export class Canvas3DBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
