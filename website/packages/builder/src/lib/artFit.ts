/** Fractions of the source image or of the panel. */
export interface FitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtFit {
  /** The part of the image that holds the design: transparent margins are left out. */
  source: FitRect;
  /** Where that part goes on the panel. The design is never cropped and never stretched. */
  place: FitRect;
  /** CSS colour for the space around the design, or null to let the hoodie colour show. */
  fill: string | null;
}

/** Aspects within 2% of each other fill the panel; the difference is too small to see. */
export const FIT_TOLERANCE = 0.02;
/** Designs without a background of their own stay this far from the panel's edge. */
export const CUTOUT_INSET = 0.05;
const ALPHA_VISIBLE = 12;
/** Largest colour deviation (0..255) for an image edge to count as one flat colour. */
const FLAT_EDGE_DEVIATION = 18;

/** Mean and deviation of the opaque pixels in a rectangle of the image. */
function edgeColor(rgba: ArrayLike<number>, width: number, x0: number, y0: number, x1: number, y1: number) {
  const pixels: number[][] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if ((rgba[i + 3] ?? 0) > ALPHA_VISIBLE) pixels.push([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0]);
    }
  }
  const mean = [0, 1, 2].map((c) => pixels.reduce((sum, p) => sum + (p[c] ?? 0), 0) / Math.max(1, pixels.length));
  const deviation = Math.max(...[0, 1, 2].map((c) => Math.sqrt(pixels.reduce((sum, p) => sum + ((p[c] ?? 0) - (mean[c] ?? 0)) ** 2, 0) / Math.max(1, pixels.length))));
  return { mean, deviation };
}

/**
 * Decides how any image sits on the panel, from a small RGBA copy of it:
 *  - transparent margins are ignored, and a design with transparency shows the hoodie colour around it;
 *  - the design is scaled to fit whole, keeping its proportions;
 *  - an opaque image whose edges are one flat colour continues that colour into the leftover space, so it looks like
 *    part of the design. Otherwise the hoodie colour shows there.
 */
export function analyzeArt(rgba: ArrayLike<number>, width: number, height: number, panelAspect: number): ArtFit {
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  let transparent = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) > ALPHA_VISIBLE) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      } else transparent++;
    }
  }
  if (maxX < 0) return { source: { x: 0, y: 0, w: 1, h: 1 }, place: { x: 0, y: 0, w: 1, h: 1 }, fill: null };

  const hasTransparency = transparent / (width * height) > 0.01;
  const [cropW, cropH] = [maxX - minX + 1, maxY - minY + 1];
  const source = { x: minX / width, y: minY / height, w: cropW / width, h: cropH / height };
  const aspect = cropW / cropH;
  const inset = hasTransparency ? CUTOUT_INSET : 0;
  const room = 1 - inset * 2;

  if (!hasTransparency && Math.abs(aspect - panelAspect) / panelAspect <= FIT_TOLERANCE) {
    return { source, place: { x: 0, y: 0, w: 1, h: 1 }, fill: null };
  }
  const wider = aspect > panelAspect;
  const w = wider ? room : (room * aspect) / panelAspect;
  const h = wider ? (room * panelAspect) / aspect : room;
  const place = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  if (hasTransparency) return { source, place, fill: null };

  // Leftover space is above and below a wide image, beside a tall one: those are the edges to read.
  const [a, b] = wider
    ? [edgeColor(rgba, width, 0, 0, width, 2), edgeColor(rgba, width, 0, height - 2, width, height)]
    : [edgeColor(rgba, width, 0, 0, 2, height), edgeColor(rgba, width, width - 2, 0, width, height)];
  const mean = [0, 1, 2].map((c) => ((a.mean[c] ?? 0) + (b.mean[c] ?? 0)) / 2);
  const between = Math.max(...[0, 1, 2].map((c) => Math.abs((a.mean[c] ?? 0) - (b.mean[c] ?? 0))));
  const flat = a.deviation <= FLAT_EDGE_DEVIATION && b.deviation <= FLAT_EDGE_DEVIATION && between <= FLAT_EDGE_DEVIATION;
  return { source, place, fill: flat ? `rgb(${mean.map(Math.round).join(',')})` : null };
}
