'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { BuilderStimpie, JoinedColor } from '@stimpy/builder';
import { placementStyle } from '@stimpy/builder/src/lib/placement';
import { campaignImages } from '@/lib/campaign-images';

const CAMPAIGN_IMAGE = campaignImages.builder;
const CAMPAIGN_SIZES = '(max-width: 591px) calc(100vw - 32px), 560px';
const CAMPAIGN_CANVAS_SIZE = 809;
// Calibrated to the 72 cm XL length assumption: the photo's center-back span from neckline (y=199)
// to hem (y=773) is the 72 cm reference for a 30 x 40 cm panel, starting 20 cm below the neckline.
const CAMPAIGN_PLACEMENT = { x: 0.531, y: 0.641, width: 0.296, rotation: 0 };
const CAMPAIGN_PANEL_STYLE = { ...placementStyle(CAMPAIGN_PLACEMENT), aspectRatio: '3 / 4' };

// The inner contour excludes the printed panel, so the selected artwork remains untouched.
const HOODIE_CLIP = [
  'M 1318 7',
  'C 1360 0 1510 2 1554 16',
  'L 1596 91 C 1627 111 1660 128 1687 158',
  'C 1729 207 1776 333 1808 438',
  'C 1830 514 1821 621 1772 672 L 1725 714 L 1674 679',
  'L 1650 772 C 1553 791 1313 791 1208 773 L 1187 674 L 1139 711',
  'C 1092 703 1051 671 1034 640 C 1005 588 1009 519 1025 468',
  'C 1051 369 1092 270 1135 209 C 1166 166 1198 145 1241 124',
  'L 1283 95 Z',
  'M 1268 199 H 1591 V 671 H 1268 Z',
].join(' ');

function rgbFromHex(hex: string): [number, number, number] {
  const match = /^#?([\da-f]{6})$/i.exec(hex);
  if (!match) return [17, 17, 17];
  const value = match[1]!;
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

/** Recolour the photograph's fabric pixels while retaining its luminance, folds and highlights. */
function recolourPhoto(photo: HTMLImageElement, canvas: HTMLCanvasElement, tint: string) {
  const size = CAMPAIGN_CANVAS_SIZE;
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  const outputContext = canvas.getContext('2d');
  if (!sourceContext || !outputContext || typeof Path2D === 'undefined') return;

  sourceContext.drawImage(photo, 0, 0, size, size);
  const pixels = sourceContext.getImageData(0, 0, size, size);
  const [targetR, targetG, targetB] = rgbFromHex(tint);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const luminance = (0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! + 0.0722 * pixels.data[i + 2]!) / 255;
    const shade = 0.42 + 0.58 * Math.pow(luminance, 0.55);
    pixels.data[i] = Math.round(targetR * shade);
    pixels.data[i + 1] = Math.round(targetG * shade);
    pixels.data[i + 2] = Math.round(targetB * shade);
  }

  const adjusted = document.createElement('canvas');
  adjusted.width = size;
  adjusted.height = size;
  adjusted.getContext('2d')?.putImageData(pixels, 0, 0);

  canvas.width = size;
  canvas.height = size;
  outputContext.drawImage(photo, 0, 0, size, size);
  outputContext.save();
  outputContext.translate(-1000, 0);
  outputContext.clip(new Path2D(HOODIE_CLIP), 'evenodd');
  outputContext.drawImage(adjusted, 1000, 0);
  outputContext.restore();
}

/** Photo-based 2D Builder preview; the selected dashboard tint adjusts the photograph itself. */
export function CampaignHoodieStage({ color, stimpie, priority = false, className }: {
  color: JoinedColor;
  stimpie: BuilderStimpie | null;
  priority?: boolean;
  className?: string;
}) {
  const photoRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tint = color.tint ?? color.hex;
  const updatePhoto = useCallback(() => {
    const photo = photoRef.current;
    const canvas = canvasRef.current;
    if (!photo?.complete || !photo.naturalWidth || !canvas) return;
    recolourPhoto(photo, canvas, tint);
  }, [tint]);

  useEffect(() => {
    updatePhoto();
  }, [updatePhoto]);

  return (
    <div
      data-builder-stage="2d"
      data-builder-scene="campaign"
      role="img"
      aria-label={`${color.name} Stimpy hoodie${stimpie ? ` with the ${stimpie.name} Stimpie` : ''}`}
      className={['relative aspect-square w-full select-none overflow-hidden bg-[#d2d2d2]', className].filter(Boolean).join(' ')}
      style={{ isolation: 'isolate' }}
    >
      <picture>
        <source type="image/avif" srcSet={CAMPAIGN_IMAGE.avifSrcSet} sizes={CAMPAIGN_SIZES} />
        <img
          ref={photoRef}
          data-layer="hoodie-photo"
          src={CAMPAIGN_IMAGE.src}
          srcSet={CAMPAIGN_IMAGE.webpSrcSet}
          sizes={CAMPAIGN_SIZES}
          alt=""
          aria-hidden="true"
          width={CAMPAIGN_IMAGE.width}
          height={CAMPAIGN_IMAGE.height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={updatePhoto}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </picture>

      <canvas ref={canvasRef} data-layer="hoodie-photo-adjusted" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />

      {stimpie ? (
        <div data-layer="panel" className="absolute" style={CAMPAIGN_PANEL_STYLE}>
          <img
            data-layer="stimpie"
            src={stimpie.artworkUrl}
            alt=""
            aria-hidden="true"
            width={160}
            height={250}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
        </div>
      ) : null}
    </div>
  );
}
