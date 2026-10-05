// A person seen from behind, walking (legs with lifting soles, bob and sway), plus the places they walk:
// a dark corridor in one-point perspective and a bright street. Also the censoring mosaic.
import { C, rgba, mix } from '../../engine/brand';
import { scratch, blit, pixelScale, type Ctx } from '../../engine/draw';
import { drawHoodie, type Art, type PanelOpts } from '../../engine/hoodie';
import { byId } from '../../art/designs';
import { W, H, fill, glow } from '../common';
import { hash, noise1 } from '../../engine/util';

// ---------------------------------------------------------------- perspective
export const F = 900;
export const VP = { x: W / 2, y: 700 };
export const pr = (x: number, y: number, z: number, vp = VP): [number, number] => [vp.x + (x * F) / z, vp.y + (y * F) / z];
export function quad(c: Ctx, pts: [number, number][], fillStyle: string | CanvasGradient) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fillStyle;
  c.fill();
}
/** Hoodie scale for a 1.75-unit-tall person at depth z. */
export const scaleAt = (z: number) => ((1.75 / 1332) * F) / z;

// ---------------------------------------------------------------- the walker
export interface Pose { x: number; y: number; s: number; rot: number; phase: number }
/** A pose from the feet position: `phase` advances π per step. */
export function poseAt(x: number, feet: number, s: number, phase: number): Pose {
  const bob = -Math.abs(Math.sin(phase)) * 14 * s;
  return { x: x + Math.sin(phase) * 6 * s, y: feet - (1396 - 500) * s + bob, s, rot: 0.022 * Math.sin(phase), phase };
}

export function legs(c: Ctx, p: Pose, pants = '#2e2e35', flat?: string) {
  const pt = mix(pants, '#000000', 0.45);
  c.save();
  c.translate(p.x, p.y); c.rotate(p.rot); c.scale(p.s, p.s); c.translate(-500, -500);
  for (const side of [-1, 1] as const) {
    // seen from behind, the swing leg's foot lifts and its coral sole turns toward us
    const lift = Math.max(0, Math.sin(p.phase) * side);
    const ay = 1338 - 150 * lift, kx = 8 * lift;
    c.save();
    if (side > 0) { c.translate(1000, 0); c.scale(-1, 1); }
    c.fillStyle = flat ?? pants;
    c.beginPath();
    c.moveTo(302, 836); c.lineTo(496, 836); c.lineTo(486 + kx, ay); c.lineTo(374 + kx, ay);
    c.quadraticCurveTo(326, 1080, 302, 836);
    c.closePath();
    c.fill();
    if (!flat) {
      c.fillStyle = pt;
      c.globalAlpha = 0.7;
      c.beginPath(); c.moveTo(452, 836); c.lineTo(496, 836); c.lineTo(486 + kx, ay); c.lineTo(462 + kx, ay); c.closePath(); c.fill();
      c.globalAlpha = 1;
    }
    const sh = 54 + 24 * lift;
    c.fillStyle = flat ?? C.white;
    c.beginPath(); c.roundRect(360 + kx, ay - 18, 136, sh, 22); c.fill();
    c.fillStyle = flat ?? C.coral;
    const st = 12 + 30 * lift;
    c.beginPath(); c.roundRect(356 + kx, ay - 18 + sh - st * 0.6, 144, st, Math.min(st / 2, 14)); c.fill();
    c.restore();
  }
  c.restore();
}

export interface WalkerOpts { panel?: PanelOpts | null; color?: string; rim?: string | null; rimW?: number; flat?: string; pants?: string }
export function walker(c: Ctx, p: Pose, o: WalkerOpts = {}) {
  legs(c, p, o.pants, o.flat);
  drawHoodie(c, {
    x: p.x, y: p.y, s: p.s, rot: p.rot, color: o.color ?? '#191919', flat: o.flat ?? null,
    rim: o.rim ?? null, rimW: o.rimW ?? 3 + 2 / Math.max(0.2, p.s),
    panel: o.panel === undefined ? null : o.panel,
  });
}

/** Screen rect of the back panel for a pose (no rotation). */
export function panelRect(p: Pose) {
  return { x: p.x - 150 * p.s, y: p.y + (555 - 182 - 500) * p.s, w: 300 * p.s, h: 364 * p.s };
}

/** A reflection in a polished floor, fading with distance from the feet. */
export function reflect(c: Ctx, feet: number, s: number, paint: (k: Ctx) => void, a = 0.2) {
  const R = scratch();
  R.c.translate(0, 2 * feet + 20 * s);
  R.c.scale(1, -1);
  paint(R.c);
  R.c.setTransform(pixelScale(), 0, 0, pixelScale(), 0, 0);
  R.c.globalCompositeOperation = 'destination-in';
  const g = R.c.createLinearGradient(0, feet, 0, feet + 620 * s);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  R.c.fillStyle = g;
  R.c.fillRect(0, 0, W, H);
  blit(c, R.cv);
  R.release();
}

// ---------------------------------------------------------------- the mosaic (a censored back)
interface Buf { cv: HTMLCanvasElement; c: Ctx }
let bufs: { mid: Buf; small: Map<string, Buf> }[] | null = null;
function mk(w: number, h: number): Buf {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return { cv, c: cv.getContext('2d')! };
}
function tiny(id: string, t: number, slot: number, cols: number, rows: number) {
  bufs ??= [0, 1].map(() => ({ mid: mk(75, 91), small: new Map() }));
  const B = bufs[slot]!;
  B.mid.c.setTransform(75 / 300, 0, 0, 91 / 364, 0, 0);
  byId(id).draw(B.mid.c, 300, 364, t);
  const key = `${cols}x${rows}`;
  let s = B.small.get(key);
  if (!s) { s = mk(cols, rows); B.small.set(key, s); }
  s.c.imageSmoothingEnabled = true;
  s.c.imageSmoothingQuality = 'high';
  s.c.clearRect(0, 0, cols, rows);
  s.c.drawImage(B.mid.cv, 0, 0, cols, rows);
  return s.cv;
}

/**
 * The design pixelated to cols × rows blocks. On a change (at `changeAt`, from `prev`) the blocks flip over
 * one by one; `slip` (0..1) shifts a band of blocks sideways so a sliver of the real art shows through.
 */
export function mosaic(id: string, t: number, o: { prev?: string; changeAt?: number; seed?: number; cols?: number; rows?: number; slip?: number } = {}): Art {
  const cols = o.cols ?? 5, rows = o.rows ?? 6;
  return (c, w, h) => {
    const at = o.changeAt ?? -9;
    const cur = tiny(id, t, 0, cols, rows);
    const prev = o.prev && t - at < 0.3 ? tiny(o.prev, t, 1, cols, rows) : cur;
    const bw = w / cols, bh = h / rows;
    c.save();
    // under the blocks: the real artwork (only shows where a band slips)
    if (o.slip) { c.save(); c.scale(w / 300, h / 364); byId(id).draw(c, 300, 364, t); c.restore(); }
    c.imageSmoothingEnabled = false;
    const band = Math.floor(hash(Math.floor(t * 8) + (o.seed ?? 0)) * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const src = t - at >= hash(k + (o.seed ?? 0) * 31) * 0.22 ? cur : prev;
      const dx = o.slip && j === band ? o.slip * bw * 1.6 : 0;
      c.drawImage(src, i, j, 1, 1, i * bw + dx, j * bh, bw + 0.6, bh + 0.6);
      const fl = noise1(t * 7 + k * 3.1) * 0.06;
      c.fillStyle = fl > 0 ? `rgba(255,255,255,${fl})` : `rgba(0,0,0,${-fl})`;
      c.fillRect(i * bw + dx, j * bh, bw, bh);
    }
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 1; i < cols; i++) { c.moveTo(i * bw, 0); c.lineTo(i * bw, h); }
    for (let j = 1; j < rows; j++) { c.moveTo(0, j * bh); c.lineTo(w, j * bh); }
    c.stroke();
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.restore();
  };
}

// ---------------------------------------------------------------- the dark corridor
export const COR = { X: 0.82, FLOOR: 1.0, CEIL: -1.3, ZEND: 9.2 };

/** A dark corridor with a lit doorway at the end. `light` tints the ribs near depth `fz`. */
export function corridor(c: Ctx, o: { cz: number; light: string; fz: number; door: number; doorCol: string }) {
  const { X, FLOOR, CEIL, ZEND } = COR;
  const cz = o.cz, zn = 0.3, zf = ZEND - cz;
  fill(c, '#090909');
  const fg = c.createLinearGradient(0, H, 0, pr(0, FLOOR, zf)[1]);
  fg.addColorStop(0, '#171717'); fg.addColorStop(1, '#0b0b0b');
  quad(c, [pr(-X, FLOOR, zn), pr(X, FLOOR, zn), pr(X, FLOOR, zf), pr(-X, FLOOR, zf)], fg);
  quad(c, [pr(-X, CEIL, zn), pr(X, CEIL, zn), pr(X, CEIL, zf), pr(-X, CEIL, zf)], '#070707');
  for (const sx of [-1, 1]) quad(c, [pr(sx * X, CEIL, zn), pr(sx * X, FLOOR, zn), pr(sx * X, FLOOR, zf), pr(sx * X, CEIL, zf)], '#0e0e0e');
  quad(c, [pr(-X, CEIL, zf), pr(X, CEIL, zf), pr(X, FLOOR, zf), pr(-X, FLOOR, zf)], '#0c0c0c');
  const dk = o.door, dc = o.doorCol;
  const [dx0, dy0] = pr(-0.27, -0.62, zf), [dx1, dy1] = pr(0.27, FLOOR, zf);
  const dg = c.createLinearGradient(0, dy0, 0, dy1);
  dg.addColorStop(0, mix(dc, C.white, 0.35)); dg.addColorStop(1, dc);
  quad(c, [[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], dg);
  c.save();
  c.globalCompositeOperation = 'lighter';
  glow(c, (dx0 + dx1) / 2, (dy0 + dy1) / 2, 380 * dk, dc, 0.4 * Math.min(1.6, dk));
  glow(c, (dx0 + dx1) / 2, (dy0 + dy1) / 2, 120 * dk, C.cream, 0.5 * Math.min(1.6, dk));
  const [fx0, fy0] = pr(-0.27, FLOOR, zf), [fx1] = pr(0.27, FLOOR, zf);
  const [nx0, ny0] = pr(-0.6, FLOOR, 0.9), [nx1] = pr(0.6, FLOOR, 0.9);
  const sg = c.createLinearGradient(0, fy0, 0, ny0);
  sg.addColorStop(0, rgba(dc, 0.32 * Math.min(1.5, dk))); sg.addColorStop(1, rgba(dc, 0));
  quad(c, [[fx0, fy0], [fx1, fy0], [nx1, ny0], [nx0, ny0]], sg);
  c.restore();
  for (let Z = 1.15; Z < ZEND - 0.3; Z += 0.9) {
    const z = Z - cz;
    if (z < 0.35) continue;
    const near = Math.exp(-(((Z - o.fz) / 1.3) ** 2));
    const col = mix(C.cream, o.light, near * 0.85);
    const lw = 7 / z;
    const [x0, y0] = pr(-X, CEIL, z), [x1, y1] = pr(X, FLOOR, z);
    c.save();
    c.strokeStyle = col;
    c.globalAlpha = 0.06 + 0.32 * near;
    c.lineWidth = lw;
    c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    c.globalAlpha = 0.12 + 0.6 * near;
    c.lineWidth = lw * 2.2;
    c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const [ax, ay] = pr(sx * (X - 0.01), CEIL + 0.35, z), [, by] = pr(sx * (X - 0.01), FLOOR - 0.12, z);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, by); c.stroke();
      c.globalAlpha *= 0.25;
      c.beginPath(); c.moveTo(ax, by + 2 * (pr(0, FLOOR, z)[1] - by)); c.lineTo(ax, pr(0, FLOOR, z)[1] + 4); c.stroke();
      c.globalAlpha /= 0.25;
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- the bright street
export interface StreetLook { sky: string; left: string; right: string; ground: string; accent: string }
export const STREETS: StreetLook[] = [
  { sky: C.sky, left: C.cream, right: C.coral, ground: '#E6DACB', accent: C.butter },
  { sky: C.butter, left: C.lilac, right: C.cream, ground: '#E2D6C8', accent: C.coral },
  { sky: C.lilac, left: C.coral, right: C.butter, ground: '#E8DCCB', accent: C.sky },
  { sky: C.cream, left: C.sky, right: C.lilac, ground: '#E4D8CA', accent: C.coral },
  { sky: C.sky, left: C.butter, right: C.cream, ground: '#E6DACB', accent: C.lilac },
];

/** A sunny street in one-point perspective; `cz` is how far the camera has travelled (things slide by). */
export function street(c: Ctx, look: StreetLook, cz: number, vp = VP) {
  const X = 1.25, FLOOR = 1.0, TOP = -2.2, ZF = 40;
  const P = (x: number, y: number, z: number) => pr(x, y, z, vp);
  fill(c, look.sky);
  glow(c, vp.x, vp.y - 200, 900, C.white, 0.35);
  quad(c, [P(-X, FLOOR, 0.25), P(X, FLOOR, 0.25), P(X, FLOOR, ZF), P(-X, FLOOR, ZF)], look.ground);
  // the pavement joints rush toward us as we walk
  c.save();
  c.strokeStyle = 'rgba(0,0,0,0.07)';
  c.lineWidth = 3;
  for (let k = 0; k < 60; k++) {
    const z = 0.6 * Math.ceil((cz + 0.25) / 0.6) + k * 0.6 - cz;
    if (z > ZF) break;
    const [x0, y0] = P(-X, FLOOR, z), [x1] = P(X, FLOOR, z);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke();
  }
  for (const x of [-0.6, 0, 0.6]) { const [a, b2] = P(x, FLOOR, 0.25), [d, e] = P(x, FLOOR, ZF); c.beginPath(); c.moveTo(a, b2); c.lineTo(d, e); c.stroke(); }
  c.restore();
  for (const side of [-1, 1]) {
    const col = side < 0 ? look.left : look.right;
    quad(c, [P(side * X, TOP, 0.25), P(side * X, FLOOR, 0.25), P(side * X, FLOOR, ZF), P(side * X, TOP, ZF)], col);
    // shade on the far wall
    if (side > 0) quad(c, [P(X, TOP, 0.25), P(X, FLOOR, 0.25), P(X, FLOOR, ZF), P(X, TOP, ZF)], 'rgba(0,0,0,0.08)');
    // windows and doors passing by
    for (let k = 0; k < 24; k++) {
      const Z = 1.6 * Math.ceil((cz + 0.3) / 1.6) + k * 1.6;
      const z = Z - cz;
      if (z > ZF) break;
      const idx = Math.round(Z / 1.6);
      const door = (idx + (side > 0 ? 1 : 0)) % 3 === 0;
      const z0 = z, z1 = z + 0.7;
      const y0 = door ? -0.35 : -1.35, y1 = door ? FLOOR : -0.55;
      const pts: [number, number][] = [P(side * X, y0, z0), P(side * X, y0, z1), P(side * X, y1, z1), P(side * X, y1, z0)];
      quad(c, pts, door ? look.accent : 'rgba(17,17,17,0.82)');
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = Math.max(1, 5 / z);
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
      c.restore();
    }
  }
  // the sun: a warm wash
  c.save();
  c.globalCompositeOperation = 'soft-light';
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,244,230,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.restore();
}

/** A soft contact shadow under someone's feet. */
export function footShadow(c: Ctx, x: number, feet: number, s: number, a = 0.22) {
  c.save();
  c.fillStyle = `rgba(0,0,0,${a})`;
  c.filter = `blur(${Math.max(2, 14 * s)}px)`;
  c.beginPath(); c.ellipse(x, feet + 6 * s, 260 * s, 40 * s, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}
