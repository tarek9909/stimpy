'use client';

import type { RefObject } from 'react';
import Link from 'next/link';
import { Button, Modal } from '@stimpy/ui';
import { ArrowRight } from 'lucide-react';
import type { BuilderStimpie, JoinedColor } from '@stimpy/builder';
import { ColorSwatchRow } from '@stimpy/builder/src/parts';
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

/** Photo-based preview opened on demand, with the current color and Stimpie selections. */
export default function BuilderPreviewDialog(props: Props) {
  const color = props.colors.find((item) => item.id === props.colorId) ?? props.colors[0]!;
  const stimpie = props.stimpies.find((item) => item.id === props.stimpieId) ?? props.stimpies[0]!;
  const fullBuilder = `/builder?color=${encodeURIComponent(color.id)}&stimpie=${encodeURIComponent(stimpie.slug)}`;

  return <Modal open onClose={props.onClose} title="Your Stimpy" size="lg" sheetOnMobile={false}
    className="store-preview-dialog" returnFocusRef={props.returnFocusRef}
    footer={<><Button variant="secondary" onClick={props.onClose}>Keep this look</Button>{props.showBuilderLink !== false ? <Link href={fullBuilder} className="store-button">Customize &amp; shop <ArrowRight size={16} aria-hidden="true" /></Link> : null}</>}>
    <div className="store-preview-layout">
      <div className="store-preview-scene" data-store-preview-scene data-preview-ready="true">
        <div className="store-preview-poster">
          <CampaignHoodieStage color={color} stimpie={stimpie} priority className="store-preview-2d" />
        </div>
        <span className="store-preview-mode">Photo preview</span>
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
