import type { Placement2d } from '../types';

/** Stimpie artwork aspect (width / height), builder.md 7.4. */
export const STIMPIE_ASPECT = 0.64;

export interface PlacementPx {
  panelWidthPx: number;
  panelHeightPx: number;
  left: number;
  top: number;
  rotation: number;
}

/** builder.md 4.2 in pixels (used by tests and by anything that needs absolute numbers). */
export function placementPx(p: Placement2d, stageWidthPx: number, stageHeightPx: number, aspect = STIMPIE_ASPECT): PlacementPx {
  const panelWidthPx = stageWidthPx * p.width;
  const panelHeightPx = panelWidthPx / aspect;
  return {
    panelWidthPx,
    panelHeightPx,
    left: stageWidthPx * p.x - panelWidthPx / 2,
    top: stageHeightPx * p.y - panelHeightPx / 2,
    rotation: p.rotation,
  };
}

const pct = (n: number): string => `${Math.round(n * 100000) / 1000}%`;

/**
 * The same geometry as CSS percentages, so it scales with the stage without JS and without layout shift:
 * `left/top` = centre, `width` = fraction of the stage, `aspect-ratio` 16/25, translate(-50%,-50%) rotate(deg).
 */
export function placementStyle(p: Placement2d): {
  left: string;
  top: string;
  width: string;
  aspectRatio: string;
  transform: string;
} {
  return {
    left: pct(p.x),
    top: pct(p.y),
    width: pct(p.width),
    aspectRatio: '16 / 25',
    transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
  };
}
