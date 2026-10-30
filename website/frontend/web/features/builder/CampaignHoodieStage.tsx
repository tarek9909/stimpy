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

// Keep the campaign photo's printed card unchanged while recolouring its fabric pixels.
const PRINTED_PANEL = { left: 283, top: 179, right: 580, bottom: 656 };

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
  if (!sourceContext || !outputContext) return;

  sourceContext.drawImage(photo, 0, 0, size, size);
  const pixels = sourceContext.getImageData(0, 0, size, size);
  const [targetR, targetG, targetB] = rgbFromHex(tint);
  const leftEdge = new Int16Array(size).fill(size);
  const rightEdge = new Int16Array(size).fill(-1);

  // Find the dark garment edge in the photograph itself so the tint cannot leak into its light backdrop.
  for (let y = 0; y < size; y++) {
    const rowOffset = y * size * 4;
    for (let x = 0; x < size; x++) {
      const i = rowOffset + x * 4;
      const luminance = 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! + 0.0722 * pixels.data[i + 2]!;
      if (luminance < 145) {
        leftEdge[y] = Math.min(leftEdge[y]!, x);
        rightEdge[y] = Math.max(rightEdge[y]!, x);
      }
    }
  }

  for (let y = 0; y < size; y++) {
    const left = leftEdge[y]!;
    const right = rightEdge[y]!;
    if (right < left) continue;
    const rowOffset = y * size * 4;
    for (let x = left; x <= right; x++) {
      if (x >= PRINTED_PANEL.left && x <= PRINTED_PANEL.right && y >= PRINTED_PANEL.top && y <= PRINTED_PANEL.bottom) continue;
      const i = rowOffset + x * 4;
      const sourceR = pixels.data[i]!;
      const sourceG = pixels.data[i + 1]!;
      const sourceB = pixels.data[i + 2]!;
      const luminance = 0.2126 * sourceR + 0.7152 * sourceG + 0.0722 * sourceB;
      const fabricMask = Math.max(0, Math.min(1, (165 - luminance) / 25));
      if (fabricMask === 0) continue;
      const shade = 0.42 + 0.58 * Math.pow(luminance / 255, 0.55);
      pixels.data[i] = Math.round(sourceR + (targetR * shade - sourceR) * fabricMask);
      pixels.data[i + 1] = Math.round(sourceG + (targetG * shade - sourceG) * fabricMask);
      pixels.data[i + 2] = Math.round(sourceB + (targetB * shade - sourceB) * fabricMask);
    }
  }

  canvas.width = size;
  canvas.height = size;
  outputContext.putImageData(pixels, 0, 0);
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
