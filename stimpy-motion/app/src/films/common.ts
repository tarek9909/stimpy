// Shared film pieces: fabric texture, kinetic type, the corner brand mark, world backgrounds.
import { C, ink, rgba } from '../engine/brand';
import { drawIcon, drawLockup, LOGO, type LogoColors } from '../engine/logo';
import { text, strokeText, measure, type Ctx, type TextOpts } from '../engine/draw';
import { W, H, SAFE } from '../engine/engine';
import { ease, clamp, mulberry, seg } from '../engine/util';
import { SIGNATURE_ZIP } from '../audio/score';
import { WIPE } from '../engine/zipper';

export { W, H, SAFE };

/** Duration of a zip wipe whose pull travel is exactly the signature zip. */
export const SIG_WIPE = SIGNATURE_ZIP / (WIPE.travel[1] - WIPE.travel[0]);
/** When the pull starts travelling in a wipe that begins at t0 with duration dur. */
export const wipeTravelStart = (t0: number, dur: number) => t0 + WIPE.travel[0] * dur;

// ---------------------------------------------------------------- fabric
let fleece: HTMLCanvasElement | null = null;
function fleeceTile() {
  if (fleece) return fleece;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  const r = mulberry(99);
  for (let i = 0; i < 5200; i++) {
    const x = r() * 256, y = r() * 256, l = r();
    c.fillStyle = l > 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.035})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
    c.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // faint knit rows
  c.strokeStyle = 'rgba(255,255,255,0.018)';
  for (let y = 0; y < 256; y += 4) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(256, y + 0.5); c.stroke(); }
  fleece = cv;
  return cv;
}
/** Fill the current path (or a rect) with fleece: a base colour + knit texture. */
export function fabricFill(c: Ctx, base: string, path?: Path2D, alpha = 1) {
  c.save();
  if (path) c.clip(path);
  c.fillStyle = base;
  c.fillRect(-4000, -4000, 9000, 9000);
  const pat = c.createPattern(fleeceTile(), 'repeat')!;
  c.globalAlpha *= alpha;
  c.fillStyle = pat;
  c.fillRect(-4000, -4000, 9000, 9000);
  c.restore();
}

// ---------------------------------------------------------------- type
export interface KineticOpts extends TextOpts {
  /** seconds between words */
  stagger?: number;
  /** rise distance (fraction of size) */
  rise?: number;
  dur?: number;
  /** a knockout stroke behind the letters (keeps type legible over busy art) */
  halo?: string;
  haloW?: number;
}
/**
 * Words that rise into place from behind a baseline mask, staggered. `age` = time since the line starts.
 * Returns the line width.
 */
export function kinetic(c: Ctx, s: string, x: number, y: number, age: number, o: KineticOpts) {
  const words = s.split(' ');
  const space = measure(c, ' ', o);
  const widths = words.map((w) => measure(c, w, o));
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  const st = o.stagger ?? 0.07, dur = o.dur ?? 0.55, rise = (o.rise ?? 0.9) * o.size;
  words.forEach((w, i) => {
    const p = ease.outExpo(seg(age - i * st, 0, dur));
    if (p > 0) {
      c.save();
      c.beginPath();
      c.rect(cx - o.size * 0.2, y - o.size * 1.05, widths[i]! + o.size * 0.4, o.size * 1.4);
      c.clip();
      if (o.halo) strokeText(c, w, cx, y + (1 - p) * rise, { ...o, align: 'left', color: o.halo }, o.haloW ?? o.size * 0.16);
      text(c, w, cx, y + (1 - p) * rise, { ...o, align: 'left' });
      c.restore();
    }
    cx += widths[i]! + space;
  });
  return total;
}

/** A multi-line headline: lines stacked with line-height lh, each line starting `lineDelay` after the last. */
export function kineticLines(c: Ctx, lines: string[], x: number, y: number, age: number, o: KineticOpts & { lh?: number; lineDelay?: number }) {
  const lh = o.lh ?? o.size * 1.12;
  let words = 0;
  lines.forEach((l, i) => {
    kinetic(c, l, x, y + i * lh, age - (o.lineDelay ?? 0) * i - words * (o.stagger ?? 0.07), o);
    words += l.split(' ').length;
  });
}

/** Outgoing type: words drop away (0 → in place, 1 → gone). */
export function kineticOut(c: Ctx, s: string, x: number, y: number, p: number, o: TextOpts & { halo?: string; haloW?: number }) {
  if (p >= 1) return;
  c.save();
  c.beginPath();
  c.rect(0, y - o.size * 1.05, W, o.size * 1.4);
  c.clip();
  if (o.halo) strokeText(c, s, x, y - ease.inCubic(p) * o.size * 1.1, { ...o, color: o.halo }, o.haloW ?? o.size * 0.16);
  text(c, s, x, y - ease.inCubic(p) * o.size * 1.1, o);
  c.restore();
}

// ---------------------------------------------------------------- brand mark
/** The small corner lockup inside the safe area. */
export function cornerMark(c: Ctx, bg: string, alpha = 1, y = SAFE.top - 70) {
  const col: LogoColors = bg === C.coral ? LOGO.main : bg === C.black || bg === C.blue ? { ...LOGO.onBlack, outline: bg === C.blue ? C.butter : C.coral } : { ...LOGO.onWhite, word: C.black };
  c.save();
  c.globalAlpha *= alpha;
  drawLockup(c, W / 2, y, 44, col);
  c.restore();
}

export function iconMark(c: Ctx, x: number, y: number, h: number, bg: string, alpha = 1) {
  const col: LogoColors = bg === C.coral ? LOGO.main : bg === C.black || bg === C.blue ? LOGO.onBlack : LOGO.onWhite;
  drawIcon(c, x, y, h, col, { alpha });
}

/** Flat background. */
export function fill(c: Ctx, color: string) {
  c.fillStyle = color;
  c.fillRect(-50, -50, W + 100, H + 100);
}

/** A soft radial light. */
export function glow(c: Ctx, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A pill label (e.g. electric-blue call to action). */
export function pill(c: Ctx, s: string, x: number, y: number, o: { size: number; bg: string; color?: string; padX?: number; padY?: number; alpha?: number; weight?: number }) {
  const tw = measure(c, s, { size: o.size, weight: o.weight ?? 700 });
  const px = o.padX ?? o.size * 0.9, py = o.padY ?? o.size * 0.55;
  const w = tw + px * 2, h = o.size + py * 2;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.fillStyle = o.bg;
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, h / 2); c.fill();
  text(c, s, x, y + o.size * 0.36, { size: o.size, weight: o.weight ?? 700, color: o.color ?? ink(o.bg), align: 'center' });
  c.restore();
  return { w, h };
}

export { clamp, ease, seg };
