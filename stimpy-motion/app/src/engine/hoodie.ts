// The flat, clean hoodie illustration (brand brief: "a flat, clean illustration style for the hoodie").
// Back view with the Stimpie dock, front view (hood up, faceless: the wearer is "you"), a 2D turn
// between them, optional legs for a standing figure, and the Stimpie panel that zips on around its edge.
//
// Hoodie-local units: a 1000×1000 box, y down; (500, 500) is placed at the requested position.
import { C, mix, rgba } from './brand';
import { drawIcon, LOGO } from './logo';
import { roundRectTrack, closedTeeth, drawPull, zipWipe, type Track } from './zipper';
import type { Ctx } from './draw';
import { clamp, lerp, ease } from './util';

export const DOCK = { x: 500, y: 555, w: 300, h: 364, r: 24 };
const TRACK: Track = roundRectTrack(0, 0, DOCK.w, DOCK.h, DOCK.r);
export const PANEL_PERIM = TRACK.len;

/** A painter for a Stimpie: draws the artwork in panel-local coordinates (0..w, 0..h). */
export type Art = (c: Ctx, w: number, h: number) => void;

// ---------------------------------------------------------------- silhouette paths
function P(f: (p: Path2D) => void) { const p = new Path2D(); f(p); return p; }
const MIRROR = new DOMMatrix([-1, 0, 0, 1, 1000, 0]);
function mirrored(p: Path2D) { const q = new Path2D(); q.addPath(p, MIRROR); return q; }
function both(p: Path2D) { const q = new Path2D(p); q.addPath(p, MIRROR); return q; }

const SLEEVE = P((c) => {
  c.moveTo(266, 296);
  c.bezierCurveTo(224, 310, 196, 362, 186, 432);
  c.bezierCurveTo(176, 520, 170, 650, 170, 792);
  c.lineTo(260, 794);
  c.bezierCurveTo(264, 690, 272, 560, 292, 450);
  c.bezierCurveTo(296, 380, 290, 320, 266, 296);
  c.closePath();
});
const CUFF = P((c) => {
  c.moveTo(171, 782);
  c.lineTo(259, 784);
  c.lineTo(257, 842);
  c.quadraticCurveTo(214, 850, 173, 840);
  c.closePath();
});
const BODY = P((c) => {
  c.moveTo(370, 250);
  c.bezierCurveTo(430, 266, 570, 266, 630, 250);
  c.bezierCurveTo(680, 268, 716, 284, 738, 300);
  c.bezierCurveTo(752, 332, 744, 392, 722, 444);
  c.bezierCurveTo(716, 560, 714, 700, 712, 850);
  c.lineTo(288, 850);
  c.bezierCurveTo(286, 700, 284, 560, 278, 444);
  c.bezierCurveTo(256, 392, 248, 332, 262, 300);
  c.bezierCurveTo(284, 284, 320, 268, 370, 250);
  c.closePath();
});
const WAIST = P((c) => {
  c.moveTo(291, 794);
  c.lineTo(709, 794);
  c.bezierCurveTo(708, 820, 706, 846, 704, 868);
  c.quadraticCurveTo(500, 880, 296, 868);
  c.bezierCurveTo(294, 846, 292, 820, 291, 794);
  c.closePath();
});
const HOOD = P((c) => {
  c.moveTo(356, 300);
  c.bezierCurveTo(334, 212, 364, 84, 500, 64);
  c.bezierCurveTo(636, 84, 666, 212, 644, 300);
  c.bezierCurveTo(604, 334, 562, 346, 500, 348);
  c.bezierCurveTo(438, 346, 396, 334, 356, 300);
  c.closePath();
});
/** The face opening of the hood (front view). */
const FACE = P((c) => {
  c.moveTo(500, 104);
  c.bezierCurveTo(566, 108, 598, 180, 594, 244);
  c.bezierCurveTo(590, 296, 552, 330, 500, 334);
  c.bezierCurveTo(448, 330, 410, 296, 406, 244);
  c.bezierCurveTo(402, 180, 434, 108, 500, 104);
  c.closePath();
});
const POCKET = P((c) => {
  c.moveTo(384, 616);
  c.lineTo(616, 616);
  c.quadraticCurveTo(632, 690, 666, 772);
  c.lineTo(334, 772);
  c.quadraticCurveTo(368, 690, 384, 616);
  c.closePath();
});
const LEG = P((c) => {
  c.moveTo(304, 846);
  c.lineTo(494, 846);
  c.lineTo(484, 1352);
  c.lineTo(372, 1352);
  c.quadraticCurveTo(330, 1100, 304, 846);
  c.closePath();
});
const SHOE = P((c) => {
  c.moveTo(364, 1340);
  c.lineTo(488, 1340);
  c.quadraticCurveTo(498, 1366, 494, 1396);
  c.lineTo(348, 1396);
  c.quadraticCurveTo(340, 1360, 364, 1340);
  c.closePath();
});
const SILHOUETTE = (() => {
  const p = new Path2D();
  for (const q of [both(SLEEVE), both(CUFF), BODY, WAIST, HOOD]) p.addPath(q);
  return p;
})();

// sleeve fold lines (left sleeve; mirrored)
const FOLDS: [number, number][][] = [
  [[182, 548], [214, 566], [254, 586]],
  [[178, 604], [212, 614], [252, 626]],
  [[176, 700], [214, 712], [256, 718]],
  [[174, 738], [214, 748], [258, 750]],
];
const BODY_FOLDS: [number, number][][] = [
  [[300, 470], [318, 540], [336, 620]],
  [[306, 770], [360, 764], [420, 770]],
  [[580, 770], [640, 764], [694, 770]],
];

export interface Tones { base: string; hi: string; lo: string; deep: string; line: string; rib: string; dark: boolean }
const toneCache = new Map<string, Tones>();
export function tones(base: string): Tones {
  let t = toneCache.get(base);
  if (t) return t;
  const n = parseInt(base.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const dark = lum < 0.3;
  t = dark
    ? { base, hi: mix(base, '#FFFFFF', 0.07), lo: mix(base, '#000000', 0.55), deep: mix(base, '#000000', 0.8), line: mix(base, '#FFFFFF', 0.14), rib: mix(base, '#FFFFFF', 0.1), dark }
    : { base, hi: mix(base, '#FFFFFF', 0.3), lo: mix(base, '#000000', 0.1), deep: mix(base, '#000000', 0.22), line: mix(base, '#000000', 0.18), rib: mix(base, '#000000', 0.12), dark };
  toneCache.set(base, t);
  return t;
}

export interface PanelOpts {
  art?: Art | null;
  /** 0..1: how much of the zip around the edge is closed (1 = attached) */
  zip?: number;
  /** 0..1: hover off the back toward the camera */
  lift?: number;
  dx?: number; dy?: number; rot?: number; scale?: number;
  alpha?: number;
  /** replace the art with a flat colour (silhouette) — 0..1 amount */
  silhouette?: number;
  silhouetteColor?: string;
  /** painter over the art (clipped to the panel) */
  overlay?: Art;
  teeth?: string;
  /** show the slider when fully zipped (parked at the bottom centre) */
  parked?: boolean;
  /** a local zip wipe on the panel from `art` to `wipeTo`, 0..1 */
  wipe?: number;
  wipeTo?: Art | null;
  /** an ordinary printed back (no zip): the hoodies Stimpy replaces */
  printed?: boolean;
}

export interface HoodieOpts {
  x: number; y: number; s: number;
  rot?: number;
  /** squash & stretch: sx, sy multipliers */
  sx?: number; sy?: number;
  color?: string;
  /** 0 = back view, 1 = front view; in between is the 2D turn */
  turn?: number;
  panel?: PanelOpts | null;
  figure?: boolean;
  pants?: string;
  shoes?: string;
  /** ground shadow opacity (0 = none) */
  shadow?: number;
  shadowY?: number;
  /** rim light colour and width (units) */
  rim?: string | null;
  rimW?: number;
  /** flat single-colour silhouette of the whole garment */
  flat?: string | null;
  alpha?: number;
  /** lining colour inside the hood (front view) */
  lining?: string;
  /** clean seam where the panel docks when no panel is attached */
  dockSeam?: boolean;
}

function strokeLine(c: Ctx, pts: [number, number][]) {
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  if (pts.length === 3) c.quadraticCurveTo(pts[1]![0], pts[1]![1], pts[2]![0], pts[2]![1]);
  else for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.stroke();
}
function mirrorPts(pts: [number, number][]): [number, number][] { return pts.map(([x, y]) => [1000 - x, y]); }

function ribs(c: Ctx, clip: Path2D, x0: number, x1: number, y0: number, y1: number, color: string, step = 9) {
  c.save();
  c.clip(clip);
  c.strokeStyle = color;
  c.lineWidth = 2.2;
  c.beginPath();
  for (let x = x0; x <= x1; x += step) { c.moveTo(x, y0); c.lineTo(x, y1); }
  c.stroke();
  c.restore();
}

function drawLegs(c: Ctx, o: HoodieOpts) {
  const pants = o.pants ?? '#34343a', shoes = o.shoes ?? C.white;
  const pt = tones(pants);
  for (const m of [false, true]) {
    c.save();
    if (m) { c.translate(1000, 0); c.scale(-1, 1); }
    c.fillStyle = pants;
    c.fill(LEG);
    // inner-leg shade
    c.save();
    c.clip(LEG);
    c.fillStyle = pt.lo;
    c.globalAlpha = 0.6;
    c.beginPath();
    c.moveTo(452, 846); c.lineTo(500, 846); c.lineTo(488, 1352); c.lineTo(460, 1352); c.closePath();
    c.fill();
    c.globalAlpha = 1;
    // knee crease + hem
    c.strokeStyle = pt.hi;
    c.lineWidth = 3;
    strokeLine(c, [[352, 1100], [410, 1114], [478, 1106]]);
    c.strokeStyle = pt.lo;
    strokeLine(c, [[374, 1338], [430, 1342], [484, 1338]]);
    c.restore();
    c.fillStyle = shoes;
    c.fill(SHOE);
    c.fillStyle = C.coral; // coral sole stripe: the signature touch
    c.fillRect(346, 1384, 150, 12);
    c.restore();
  }
}

/** Draw a hoodie. */
export function drawHoodie(c: Ctx, o: HoodieOpts) {
  const turn = clamp(o.turn ?? 0);
  const front = turn > 0.5;
  const flip = Math.cos(turn * Math.PI); // 1 back … −1 front
  const T = tones(o.color ?? C.black);
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.translate(o.x, o.y);
  // ground shadow (not squashed by the turn)
  if (o.shadow) {
    c.save();
    c.fillStyle = `rgba(0,0,0,${0.22 * o.shadow})`;
    c.beginPath();
    c.ellipse(0, (o.shadowY ?? (o.figure ? 900 : 400)) * o.s, 260 * o.s, 34 * o.s, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  if (o.rot) c.rotate(o.rot);
  c.scale(o.s * (o.sx ?? 1) * Math.max(0.02, Math.abs(flip)), o.s * (o.sy ?? 1));
  // the turn: a slight skew sells the rotation
  if (turn > 0 && turn < 1) c.transform(1, Math.sin(turn * Math.PI) * 0.08 * Math.sign(flip || 1), 0, 1, 0, 0);
  c.translate(-500, -500);

  if (o.figure) drawLegs(c, o);

  if (o.rim) {
    c.save();
    c.strokeStyle = o.rim;
    c.lineWidth = (o.rimW ?? 6) * 2;
    c.lineJoin = 'round';
    c.stroke(SILHOUETTE);
    c.restore();
  }
  if (o.flat) {
    c.fillStyle = o.flat;
    c.fill(SILHOUETTE);
    c.restore();
    return;
  }

  // sleeves + cuffs
  c.fillStyle = T.base;
  c.fill(both(SLEEVE));
  c.save();
  c.clip(both(SLEEVE));
  c.fillStyle = T.lo;
  c.globalAlpha = 0.5;
  c.beginPath(); c.moveTo(250, 420); c.bezierCurveTo(262, 560, 258, 700, 262, 800); c.lineTo(300, 800); c.lineTo(300, 420); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(750, 420); c.bezierCurveTo(738, 560, 742, 700, 738, 800); c.lineTo(700, 800); c.lineTo(700, 420); c.closePath(); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = T.lo;
  c.lineWidth = 5;
  c.lineCap = 'round';
  for (const f of FOLDS) { strokeLine(c, f); strokeLine(c, mirrorPts(f)); }
  c.strokeStyle = T.hi;
  c.lineWidth = 3;
  for (const f of FOLDS) { strokeLine(c, f.map(([x, y]) => [x, y + 7] as [number, number])); strokeLine(c, mirrorPts(f.map(([x, y]) => [x, y + 7] as [number, number]))); }
  c.restore();
  c.fillStyle = T.base;
  c.fill(both(CUFF));
  ribs(c, both(CUFF), 160, 840, 770, 860, T.rib);

  // body
  c.fillStyle = T.base;
  c.fill(BODY);
  c.save();
  c.clip(BODY);
  // cel shade along the far side, and under the arms
  c.fillStyle = T.lo;
  c.globalAlpha = 0.35;
  c.beginPath(); c.moveTo(690, 300); c.bezierCurveTo(700, 500, 690, 700, 686, 860); c.lineTo(760, 860); c.lineTo(760, 300); c.closePath(); c.fill();
  c.globalAlpha = 0.18;
  c.beginPath(); c.moveTo(270, 300); c.bezierCurveTo(300, 500, 306, 700, 304, 860); c.lineTo(240, 860); c.lineTo(240, 300); c.closePath(); c.fill();
  c.globalAlpha = 1;
  // raglan seams
  c.strokeStyle = T.line;
  c.lineWidth = 3;
  c.lineCap = 'round';
  strokeLine(c, [[392, 258], [322, 330], [282, 446]]);
  strokeLine(c, mirrorPts([[392, 258], [322, 330], [282, 446]]));
  c.strokeStyle = T.lo;
  c.lineWidth = 4;
  for (const f of BODY_FOLDS) { strokeLine(c, f); strokeLine(c, mirrorPts(f)); }
  c.restore();

  if (front) {
    // kangaroo pocket
    c.save();
    c.fillStyle = T.hi;
    c.globalAlpha = 0.5;
    c.fill(POCKET);
    c.globalAlpha = 1;
    c.strokeStyle = T.line;
    c.lineWidth = 3;
    c.setLineDash([9, 7]);
    c.stroke(POCKET);
    c.setLineDash([]);
    c.strokeStyle = T.lo;
    c.lineWidth = 6;
    strokeLine(c, [[384, 618], [368, 690], [338, 770]]);
    strokeLine(c, [[616, 618], [632, 690], [662, 770]]);
    c.restore();
    // chest mark: the split S, embroidered small
    const chest = T.dark ? LOGO.onBlack : { solid: C.black, outline: C.coral, word: C.black };
    drawIcon(c, 592, 424, 40, chest, { strokeScale: 1.5 });
  } else if (!o.panel && o.dockSeam !== false) {
    // bare back: only a clean stitched seam shows where a Stimpie docks
    c.save();
    c.strokeStyle = T.line;
    c.globalAlpha = 0.55;
    c.lineWidth = 2.2;
    c.setLineDash([8, 7]);
    c.beginPath();
    c.roundRect(DOCK.x - DOCK.w / 2 - 6, DOCK.y - DOCK.h / 2 - 6, DOCK.w + 12, DOCK.h + 12, DOCK.r + 6);
    c.stroke();
    c.restore();
  }

  // waistband
  c.fillStyle = T.base;
  c.fill(WAIST);
  ribs(c, WAIST, 290, 712, 790, 880, T.rib);
  c.save();
  c.strokeStyle = T.lo;
  c.lineWidth = 4;
  strokeLine(c, [[291, 794], [500, 798], [709, 794]]);
  c.restore();

  // hood
  if (front) drawHoodFront(c, T, o.lining ?? C.coral);
  else drawHoodBack(c, T);

  // the Stimpie
  if (!front && o.panel) drawPanel(c, o.panel, T);

  c.restore();
}

function drawHoodBack(c: Ctx, T: Tones) {
  // shadow the hood casts on the shoulders
  c.save();
  c.clip(BODY);
  c.fillStyle = T.lo;
  c.globalAlpha = 0.45;
  c.beginPath();
  c.ellipse(500, 336, 160, 40, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.fillStyle = T.hi;
  c.fill(HOOD);
  c.save();
  c.clip(HOOD);
  c.fillStyle = T.base;
  c.beginPath();
  c.ellipse(560, 230, 120, 170, 0.25, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = T.lo;
  c.globalAlpha = 0.4;
  c.beginPath();
  c.ellipse(640, 250, 70, 150, 0.2, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  // centre seam
  c.strokeStyle = T.line;
  c.lineWidth = 3;
  strokeLine(c, [[500, 66], [502, 200], [500, 346]]);
  // a coral piping hint at the hood's lower edge (signature touch)
  c.strokeStyle = T.lo;
  c.lineWidth = 6;
  strokeLine(c, [[362, 300], [500, 352], [638, 300]]);
  c.restore();
}

function drawHoodFront(c: Ctx, T: Tones, lining: string) {
  c.fillStyle = T.hi;
  c.fill(HOOD);
  c.save();
  c.clip(HOOD);
  c.fillStyle = T.base;
  c.beginPath();
  c.ellipse(440, 220, 130, 170, -0.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // lining visible around the opening
  c.save();
  c.fillStyle = lining;
  c.translate(500, 219);
  c.scale(1.12, 1.07);
  c.translate(-500, -219);
  c.fill(FACE);
  c.restore();
  // the opening: a void — whoever wears it
  c.fillStyle = T.dark ? '#050505' : C.black;
  c.fill(FACE);
  c.save();
  c.clip(FACE);
  const g = c.createRadialGradient(470, 170, 10, 500, 230, 150);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fill(FACE);
  c.restore();
  // drawstrings with coral aglets
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = T.dark ? C.cream : C.white;
  c.lineWidth = 8;
  strokeLine(c, [[472, 330], [466, 400], [460, 470]]);
  strokeLine(c, [[528, 330], [536, 410], [542, 486]]);
  c.strokeStyle = lining;
  c.lineWidth = 11;
  strokeLine(c, [[460, 462], [459, 484]]);
  strokeLine(c, [[542, 478], [543, 500]]);
  c.restore();
}

/** The Stimpie panel on the dock (called inside the hoodie transform). */
export function drawPanel(c: Ctx, o: PanelOpts, T: Tones = tones(C.black)) {
  const { w, h, r } = DOCK;
  const lift = o.lift ?? 0;
  const zip = clamp(o.zip ?? 1);
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  // the panel's shadow on the back grows as it lifts
  if (lift > 0.001) {
    c.save();
    c.fillStyle = rgba('#000000', 0.35 * Math.min(1, lift * 3) * (1 - lift * 0.5));
    c.filter = `blur(${6 + lift * 30}px)`;
    c.beginPath();
    c.roundRect(DOCK.x - w / 2 + (o.dx ?? 0) * 0.5 + 10, DOCK.y - h / 2 + (o.dy ?? 0) * 0.5 + 16 + lift * 30, w, h, r);
    c.fill();
    c.restore();
  }
  c.translate(DOCK.x + (o.dx ?? 0), DOCK.y + (o.dy ?? 0) - lift * 40);
  if (o.rot) c.rotate(o.rot);
  const sc = (o.scale ?? 1) * (1 + lift * 0.18);
  c.scale(sc, sc);
  // body
  c.save();
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, r);
  c.clip();
  c.translate(-w / 2, -h / 2);
  c.fillStyle = C.cream;
  c.fillRect(0, 0, w, h);
  if (o.art) {
    if (o.wipe !== undefined && o.wipeTo) {
      const a = o.art, b = o.wipeTo;
      zipWipe(c, o.wipe, (k) => a(k, w, h), (k) => b(k, w, h), { W: w, H: h, dir: 'down', scale: 0.32, spread: 0.26, res: 2.2, teeth: C.white, tape: C.black });
    } else o.art(c, w, h);
  }
  if (o.silhouette) {
    c.globalAlpha = clamp(o.silhouette);
    c.fillStyle = o.silhouetteColor ?? C.black;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  if (o.overlay) o.overlay(c, w, h);
  // printed cotton: soft edge falloff + stitch line
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.restore();
  if (o.printed) { c.restore(); return; }
  // zip around the edge
  const teeth = o.teeth ?? (T.dark ? '#3a3a3a' : '#bdb6ab');
  closedTeeth(c, TRACK, 0, zip * TRACK.len, { pitch: 7, size: 6, color: teeth, tape: T.base, tapeW: 9 });
  if (zip > 0 && (zip < 1 || o.parked)) {
    const p = TRACK.at(zip * TRACK.len);
    drawPull(c, p.x, p.y, Math.atan2(p.ty, p.tx), 17, { tab: C.coral, body: '#2b2b2b', mark: false, shadow: 1 }, zip < 1 ? Math.sin(zip * 60) * 0.25 : 0);
  }
  c.restore();
}

/** Screen position of a hoodie-local point for a hoodie drawn with these options (no turn / squash). */
export function hoodiePoint(o: HoodieOpts, lx: number, ly: number): [number, number] {
  const cr = Math.cos(o.rot ?? 0), sr = Math.sin(o.rot ?? 0);
  const x = (lx - 500) * o.s * (o.sx ?? 1), y = (ly - 500) * o.s * (o.sy ?? 1);
  return [o.x + x * cr - y * sr, o.y + x * sr + y * cr];
}

/** Draw a Stimpie on its own (off the hoodie), centred at (x, y) with panel height h. */
export function drawStimpie(c: Ctx, art: Art, x: number, y: number, h: number, o: { rot?: number; zipTeeth?: boolean; shadow?: number } = {}) {
  const s = h / DOCK.h;
  c.save();
  c.translate(x, y);
  if (o.rot) c.rotate(o.rot);
  c.scale(s, s);
  if (o.shadow) {
    c.save();
    c.shadowColor = `rgba(0,0,0,${0.3 * o.shadow})`;
    c.shadowBlur = 40;
    c.shadowOffsetY = 18;
    c.fillStyle = C.black;
    c.beginPath(); c.roundRect(-DOCK.w / 2, -DOCK.h / 2, DOCK.w, DOCK.h, DOCK.r); c.fill();
    c.restore();
  }
  c.save();
  c.beginPath(); c.roundRect(-DOCK.w / 2, -DOCK.h / 2, DOCK.w, DOCK.h, DOCK.r); c.clip();
  c.translate(-DOCK.w / 2, -DOCK.h / 2);
  art(c, DOCK.w, DOCK.h);
  c.restore();
  if (o.zipTeeth !== false) closedTeeth(c, TRACK, 0, TRACK.len, { pitch: 7, size: 6, color: '#3a3a3a', tape: C.black, tapeW: 9 });
  c.restore();
}

export { lerp, ease };
