'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Button, Modal } from '@stimpy/ui';
import { ArrowRight, Box, Focus, LoaderCircle, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { BuilderConfig } from '@stimpy/api-client';
import type { BuilderStimpie, JoinedColor } from '@stimpy/builder';
import { BuilderCanvas3D, Canvas3DBoundary, type Canvas3DHandle } from '@stimpy/builder/src/BuilderCanvas3D';
import { ColorSwatchRow } from '@stimpy/builder/src/parts';
import { browserApi } from '@/lib/api-browser';
import { storefrontBuilderConfig } from './data';
import { CampaignHoodieStage } from './CampaignHoodieStage';

interface Props {
  colors: readonly JoinedColor[];
  stimpies: readonly BuilderStimpie[];
  colorId: number;
  stimpieId: number;
  onColorChange: (id: number) => void;
  onStimpieChange: (stimpie: BuilderStimpie) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  disabledStimpieIds?: ReadonlySet<number>;
  showBuilderLink?: boolean;
}

const NO_SOLD_OUT_COLORS = new Set<number>();

/** Loaded only after an explicit preview tap, including the model and Three.js engine. */
export default function BuilderPreviewDialog(props: Props) {
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const canvas = useRef<Canvas3DHandle>(null);
  const color = props.colors.find((item) => item.id === props.colorId) ?? props.colors[0]!;
  const stimpie = props.stimpies.find((item) => item.id === props.stimpieId) ?? props.stimpies[0]!;
  const model = config?.model3d;
  const configColor = config?.colors.find((item) => item.colorId === color.id);
  const artUrl = config?.stimpieTextures.find((item) => item.stimpieId === stimpie.id)?.textureUrl ?? stimpie.artworkUrl;
  const fullBuilder = `/builder?color=${encodeURIComponent(color.id)}&stimpie=${encodeURIComponent(stimpie.slug)}`;

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(motion.matches);
    update();
    motion.addEventListener?.('change', update);
    return () => motion.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setReady(false);
    setConfig(null);
    void browserApi().GET('/api/v1/builder/config', { cache: 'no-store', signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      if (!response.data?.model3d || response.data.effectiveMode === '2D') {
        setFailed(true);
        return;
      }
      setConfig(storefrontBuilderConfig(response.data));
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);

  const controls = [
    { label: 'Rotate left', Icon: RotateCcw, action: () => canvas.current?.rotateBy(-30) },
    { label: 'Rotate right', Icon: RotateCw, action: () => canvas.current?.rotateBy(30) },
    { label: 'Zoom in', Icon: ZoomIn, action: () => canvas.current?.zoomBy(0.85) },
    { label: 'Zoom out', Icon: ZoomOut, action: () => canvas.current?.zoomBy(1.18) },
    { label: 'Reset view', Icon: Focus, action: () => canvas.current?.resetView() },
  ];

  return <Modal open onClose={props.onClose} title="Your Stimpy" size="lg" sheetOnMobile={false}
    className="store-preview-dialog" returnFocusRef={props.returnFocusRef}
    footer={<><Button variant="secondary" onClick={props.onClose}>Keep this look</Button>{props.showBuilderLink !== false ? <Link href={fullBuilder} className="store-button">Customize &amp; shop <ArrowRight size={16} aria-hidden="true" /></Link> : null}</>}>
    <div className="store-preview-layout">
      <div className="store-preview-scene" data-store-preview-scene data-preview-ready={ready && !failed}>
        <div className="store-preview-poster" style={{ visibility: ready && !failed ? 'hidden' : 'visible' }} aria-hidden={ready && !failed}>
          <CampaignHoodieStage color={color} stimpie={stimpie} priority className="store-preview-2d" />
        </div>
        {model && !failed ? <Canvas3DBoundary key={attempt} onError={() => setFailed(true)}>
          <BuilderCanvas3D model={model} tint={configColor?.tint ?? color.hex} fabricTextureUrl={configColor?.texture3d ?? null}
            art={{ id: stimpie.id, url: artUrl, width: stimpie.artworkWidth, height: stimpie.artworkHeight }}
            tier="mid" reducedMotion={reduced} label={`3D preview: ${color.name} Stimpy hoodie with ${stimpie.name}`}
            onReady={() => setReady(true)} onFallback={() => setFailed(true)} handleRef={canvas} className="store-preview-canvas" />
        </Canvas3DBoundary> : null}
        <span className="store-preview-mode"><Box size={14} aria-hidden="true" /> {failed ? '2D preview' : '3D studio'}</span>
        {!ready && !failed ? <div className="store-preview-loading" role="status"><LoaderCircle size={16} className="animate-stimpy-spin" aria-hidden="true" /> Loading 3D preview</div> : null}
        {ready && !failed ? <div className="store-preview-controls" role="group" aria-label="3D view controls">{controls.map(({ label, Icon, action }) =>
          <button type="button" key={label} aria-label={label} title={label} onClick={action}><Icon size={18} aria-hidden="true" /></button>)}</div> : null}
        {failed ? <div className="store-preview-fallback" role="status"><p>3D preview is unavailable. Your look is still here.</p><Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Retry 3D</Button></div> : null}
      </div>
      <aside className="store-preview-options" aria-label="Preview options">
        <div><p className="store-eyebrow">Your selected look</p><h3>{stimpie.name}</h3><p className="store-preview-product">{color.name} Stimpy hoodie</p></div>
        <ColorSwatchRow colors={props.colors} selectedId={color.id} soldOutIds={NO_SOLD_OUT_COLORS} onSelect={props.onColorChange} />
        <div><p className="text-body-sm font-medium">Stimpie</p><div className="store-preview-artworks" role="group" aria-label="Choose a Stimpie">
          {props.stimpies.map((item) => <button key={item.id} type="button" aria-label={item.name} aria-pressed={item.id === stimpie.id} title={props.disabledStimpieIds?.has(item.id) ? `${item.name}: already selected in another pack slot; select it to replace that slot` : item.name} onClick={() => props.onStimpieChange(item)}>
            <img src={item.artworkUrl} alt="" loading="lazy" width={160} height={250} /><span>{item.name}</span>
          </button>)}
        </div></div>
      </aside>
    </div>
  </Modal>;
}
