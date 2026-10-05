/**
 * 2D placement maths for the Builder placement editor (api-reference 3.6, builder.md 4.2).
 *
 * `Placement { x, y, width, rotation }`:
 *  - `x`, `y`: the CENTRE of the Stimpie panel as fractions (0..1) of the hoodie image width / height.
 *  - `width`: panel width as a fraction of the image width. The height is never stored: it is
 *    `panelWidthPx / 0.64` (the box is locked to the Stimpie aspect).
 *  - `rotation`: degrees, CLOCKWISE about the centre, -180..180.
 */
export const PANEL_ASPECT = 0.64;
export const MIN_WIDTH = 0.05;

export interface Placement {
  x: number;
  y: number;
  width: number;
  rotation: number;
}

export const DEFAULT_PLACEMENT: Placement = { x: 0.5, y: 0.46, width: 0.36, rotation: 0 };

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

/** Rotation normalised to the contract range -180..180. */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let r = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (r === -180 && deg > 0) r = 180;
  return Math.round(r * 100) / 100;
}

export interface PanelBox {
  /** Centre in px. */
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
  /** Top-left of the UNROTATED box (what CSS `left`/`top` use with `transform: rotate()` about the centre). */
  left: number;
  top: number;
}

/** Pixel box of the panel on an image of `imgW` x `imgH` px (the same maths as the public Builder). */
export function panelBox(p: Placement, imgW: number, imgH: number, aspect: number = PANEL_ASPECT): PanelBox {
  const width = imgW * p.width;
  const height = width / aspect;
  const cx = imgW * p.x;
  const cy = imgH * p.y;
  return { cx, cy, width, height, rotation: p.rotation, left: cx - width / 2, top: cy - height / 2 };
}

/** Panel height as a fraction of the image height (derived, never stored). */
export function heightFraction(p: Placement, imgW: number, imgH: number, aspect: number = PANEL_ASPECT): number {
  return (p.width * imgW) / aspect / imgH;
}

/** Move the centre by a pixel delta on an image of `imgW` x `imgH` px. The centre stays inside the image. */
export function dragBy(p: Placement, dxPx: number, dyPx: number, imgW: number, imgH: number): Placement {
  return { ...p, x: round4(clamp(p.x + dxPx / imgW, 0, 1)), y: round4(clamp(p.y + dyPx / imgH, 0, 1)) };
}

/** New width (fraction), keeping the 0.64 aspect and the centre. */
export function resizeTo(p: Placement, width: number): Placement {
  return { ...p, width: round4(clamp(width, MIN_WIDTH, 1)) };
}

/**
 * Corner-handle resize: the pointer's distance from the centre, measured along the box diagonal, gives the new
 * half-width. Works for a rotated box because the distance is rotation independent.
 */
export function resizeFromPointer(p: Placement, pointer: { x: number; y: number }, imgW: number, imgH: number, aspect: number = PANEL_ASPECT): Placement {
  const cx = imgW * p.x;
  const cy = imgH * p.y;
  const dist = Math.hypot(pointer.x - cx, pointer.y - cy);
  // half-diagonal = hypot(w/2, w/(2*aspect)) = (w/2) * hypot(1, 1/aspect)
  const halfDiagFactor = Math.hypot(1, 1 / aspect) / 2;
  return resizeTo(p, dist / halfDiagFactor / imgW);
}

/** Rotation (deg, clockwise, 0 = handle straight above the centre) for a pointer position. */
export function rotationFromPointer(p: Placement, pointer: { x: number; y: number }, imgW: number, imgH: number): Placement {
  const dx = pointer.x - imgW * p.x;
  const dy = pointer.y - imgH * p.y;
  if (dx === 0 && dy === 0) return p;
  // atan2(dx, -dy): 0 when the pointer is straight up, positive towards the right = clockwise on screen.
  return { ...p, rotation: normalizeRotation((Math.atan2(dx, -dy) * 180) / Math.PI) };
}

/** Arrow keys nudge by 0.5% (Shift = 2%); `+` / `-` resize by the same step; `[` `]` are not used. */
export function nudge(p: Placement, key: string, shift: boolean): Placement {
  const step = shift ? 0.02 : 0.005;
  switch (key) {
    case 'ArrowLeft': return { ...p, x: round4(clamp(p.x - step, 0, 1)) };
    case 'ArrowRight': return { ...p, x: round4(clamp(p.x + step, 0, 1)) };
    case 'ArrowUp': return { ...p, y: round4(clamp(p.y - step, 0, 1)) };
    case 'ArrowDown': return { ...p, y: round4(clamp(p.y + step, 0, 1)) };
    case '+':
    case '=': return resizeTo(p, p.width + step);
    case '-':
    case '_': return resizeTo(p, p.width - step);
    default: return p;
  }
}

/** Fraction of the (unrotated) panel rectangle that lies inside the image, 0..1. */
export function insideFraction(p: Placement, imgW: number, imgH: number, aspect: number = PANEL_ASPECT): number {
  const b = panelBox(p, imgW, imgH, aspect);
  const ix = Math.max(0, Math.min(b.left + b.width, imgW) - Math.max(b.left, 0));
  const iy = Math.max(0, Math.min(b.top + b.height, imgH) - Math.max(b.top, 0));
  return (ix * iy) / (b.width * b.height);
}

/** Validation of builder.md 8: x, y, width in 0..1, rotation numeric -180..180, at least 50% inside the image. */
export function validatePlacement(p: Placement, imgW = 1000, imgH = 1250): string[] {
  const errs: string[] = [];
  const num = (v: number) => Number.isFinite(v);
  if (![p.x, p.y, p.width, p.rotation].every(num)) return ['Enter numbers for X, Y, Width and Rotation.'];
  if (p.x < 0 || p.x > 1) errs.push('X must be between 0% and 100%.');
  if (p.y < 0 || p.y > 1) errs.push('Y must be between 0% and 100%.');
  if (p.width <= 0 || p.width > 1) errs.push('Width must be above 0% and at most 100%.');
  if (p.rotation < -180 || p.rotation > 180) errs.push('Rotation must be between -180 and 180 degrees.');
  if (!errs.length && insideFraction(p, imgW, imgH) < 0.5) errs.push('At least half of the panel must stay inside the image.');
  return errs;
}

/** "42.5%" for a fraction; one decimal, trailing zero dropped. */
export function fractionToPercent(f: number): string {
  return `${Math.round(f * 1000) / 10}`;
}

/** Parses the percent text of a numeric field ("42.5", "42,5", "42.5%") to a fraction; null when not a number. */
export function percentToFraction(text: string): number | null {
  const t = text.replace('%', '').replace(',', '.').trim();
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null;
  return round4(Number(t) / 100);
}
