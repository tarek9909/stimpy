export interface CoverCrop {
  /** True when the artwork aspect differs from the panel aspect by more than the tolerance. */
  needed: boolean;
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/** Aspects within 2% of each other need no fitting (builder.md 5.5). */
export const COVER_TOLERANCE = 0.02;

/**
 * Centre-crop ("cover") texture fit: the artwork is never stretched and never letterboxed.
 * `repeat`/`offset` are in UV units of the panel's 0..1 square.
 */
export function coverCrop(artWidth: number, artHeight: number, panelAspect: number, tolerance = COVER_TOLERANCE): CoverCrop {
  const none: CoverCrop = { needed: false, repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };
  if (!(artWidth > 0) || !(artHeight > 0) || !(panelAspect > 0)) return none;
  const art = artWidth / artHeight;
  if (Math.abs(art - panelAspect) / panelAspect <= tolerance) return none;
  if (art > panelAspect) {
    // Wider than the panel: crop left/right.
    const repeatX = panelAspect / art;
    return { needed: true, repeatX, repeatY: 1, offsetX: (1 - repeatX) / 2, offsetY: 0 };
  }
  // Taller than the panel: crop top/bottom.
  const repeatY = art / panelAspect;
  return { needed: true, repeatX: 1, repeatY, offsetX: 0, offsetY: (1 - repeatY) / 2 };
}

/** The 2D `object-fit: cover` rectangle, expressed for tests. */
export function coverFitRect(srcW: number, srcH: number, boxW: number, boxH: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
