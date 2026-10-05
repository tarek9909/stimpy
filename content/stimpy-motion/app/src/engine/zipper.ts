// The zipper: Stimpy's visual signature. Teeth, the slider and its coral pull tab, tracks (polylines with
// arc length), and the ZIP WIPE: a zipper line crosses the frame, the pull runs along it and the current
// scene parts in a V behind the pull like fabric, revealing the next scene.
import { C, rgba } from './brand';
import { drawIcon, LOGO } from './logo';
import { scratch, type Ctx } from './draw';
import { clamp, ease, seg, lerp } from './util';

export interface TrackPt { x: number; y: number; tx: number; ty: number; s: number }

/** A polyline with arc-length parametrisation. */
export class Track {
  pts: TrackPt[] = [];
  len = 0;
  constructor(raw: [number, number][], closed = false) {
    const p = closed ? [...raw, raw[0]!] : raw;
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const [x, y] = p[i]!;
      if (i > 0) s += Math.hypot(x - p[i - 1]![0], y - p[i - 1]![1]);
      const a = p[Math.max(0, i - 1)]!, b = p[Math.min(p.length - 1, i + 1)]!;
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      this.pts.push({ x, y, tx: (b[0] - a[0]) / dl, ty: (b[1] - a[1]) / dl, s });
    }
    this.len = s;
  }
  at(s: number): TrackPt {
    const P = this.pts;
    s = clamp(s, 0, this.len);
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m]!.s <= s) lo = m; else hi = m; }
    const a = P[lo]!, b = P[hi]!;
    const u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    const tx = lerp(a.tx, b.tx, u), ty = lerp(a.ty, b.ty, u), tl = Math.hypot(tx, ty) || 1;
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), tx: tx / tl, ty: ty / tl, s };
  }
}

/** Rounded rectangle perimeter as a closed track, starting at the bottom centre and running clockwise
 * on screen (toward the bottom-left corner first). */
export function roundRectTrack(cx: number, cy: number, w: number, h: number, r: number, n = 400) {
  const pts: [number, number][] = [];
  const hx = w / 2, hy = h / 2;
  const segs: (() => void)[] = [];
  const arc = (ax: number, ay: number, a0: number, a1: number) => {
    const k = 10;
    for (let i = 0; i <= k; i++) { const a = lerp(a0, a1, i / k); pts.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); }
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.round((L / (2 * (w + h))) * n));
    for (let i = 0; i <= k; i++) pts.push([lerp(x0, x1, i / k), lerp(y0, y1, i / k)]);
  };
  segs.push(() => line(cx, cy + hy, cx - hx + r, cy + hy));
  segs.push(() => arc(cx - hx + r, cy + hy - r, Math.PI / 2, Math.PI));
  segs.push(() => line(cx - hx, cy + hy - r, cx - hx, cy - hy + r));
  segs.push(() => arc(cx - hx + r, cy - hy + r, Math.PI, Math.PI * 1.5));
  segs.push(() => line(cx - hx + r, cy - hy, cx + hx - r, cy - hy));
  segs.push(() => arc(cx + hx - r, cy - hy + r, -Math.PI / 2, 0));
  segs.push(() => line(cx + hx, cy - hy + r, cx + hx, cy + hy - r));
  segs.push(() => arc(cx + hx - r, cy + hy - r, 0, Math.PI / 2));
  segs.push(() => line(cx + hx - r, cy + hy, cx, cy + hy));
  segs.forEach((f) => f());
  // drop consecutive duplicates
  const out = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 1e-6);
  return new Track(out, false);
}

export interface TeethStyle {
  /** tooth pitch along the track (distance between teeth on one side) */
  pitch: number;
  /** tooth length across the track */
  size: number;
  color: string;
  /** darker edge / shade colour */
  shade?: string;
  tape?: string | null;
  tapeW?: number;
}

function tooth(c: Ctx, x: number, y: number, tx: number, ty: number, nx: number, ny: number, L: number, Wd: number) {
  // rounded tooth centred at (x,y), long axis along the normal
  const hw = Wd / 2, hl = L / 2;
  c.moveTo(x - nx * hl - tx * hw, y - ny * hl - ty * hw);
  c.lineTo(x + nx * (hl - hw) - tx * hw, y + ny * (hl - hw) - ty * hw);
  c.quadraticCurveTo(x + nx * hl - tx * hw, y + ny * hl - ty * hw, x + nx * hl, y + ny * hl);
  c.quadraticCurveTo(x + nx * hl + tx * hw, y + ny * hl + ty * hw, x + nx * (hl - hw) + tx * hw, y + ny * (hl - hw) + ty * hw);
  c.lineTo(x - nx * hl + tx * hw, y - ny * hl + ty * hw);
  c.closePath();
}

/**
 * Interlocked (closed) teeth along a track between arc positions s0..s1: two rows meshing on the line.
 */
export function closedTeeth(c: Ctx, tr: Track, s0: number, s1: number, st: TeethStyle) {
  if (s1 <= s0) return;
  const half = st.pitch / 2;
  if (st.tape) {
    c.save();
    c.strokeStyle = st.tape;
    c.lineWidth = st.tapeW ?? st.size * 2.6;
    c.lineCap = 'butt';
    c.beginPath();
    for (let s = s0, i = 0; s <= s1 + 0.01; s += Math.max(2, (s1 - s0) / 200), i++) { const p = tr.at(Math.min(s, s1)); if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
    c.stroke();
    c.restore();
  }
  c.beginPath();
  const k0 = Math.ceil(s0 / half), k1 = Math.floor(s1 / half);
  for (let k = k0; k <= k1; k++) {
    const p = tr.at(k * half);
    const nx = -p.ty, ny = p.tx;
    const side = k % 2 === 0 ? 1 : -1;
    tooth(c, p.x + nx * side * st.size * 0.28, p.y + ny * side * st.size * 0.28, p.tx, p.ty, nx, ny, st.size * 1.25, half * 0.95);
  }
  c.fillStyle = st.color;
  c.fill();
  if (st.shade) {
    // a thin shade line down the mesh
    c.save();
    c.strokeStyle = st.shade;
    c.lineWidth = Math.max(0.6, st.size * 0.1);
    c.beginPath();
    for (let s = s0, i = 0; s <= s1; s += Math.max(2, (s1 - s0) / 200), i++) { const p = tr.at(s); if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
    c.stroke();
    c.restore();
  }
}

/** One open row of teeth along an edge polyline (points with tangents); `side` flips the normal. */
export function openTeeth(c: Ctx, pts: { x: number; y: number }[], st: TeethStyle, side: 1 | -1, phase = 0) {
  if (pts.length < 2) return;
  // resample by arc length
  const tr = new Track(pts.map((p) => [p.x, p.y] as [number, number]));
  if (st.tape) {
    c.save();
    c.strokeStyle = st.tape;
    c.lineWidth = st.tapeW ?? st.size * 1.6;
    c.beginPath();
    tr.pts.forEach((p, i) => {
      const nx = -p.ty * side, ny = p.tx * side;
      const o = -(st.tapeW ?? st.size * 1.6) / 2 + st.size * 0.1;
      if (i === 0) c.moveTo(p.x + nx * o, p.y + ny * o); else c.lineTo(p.x + nx * o, p.y + ny * o);
    });
    c.stroke();
    c.restore();
  }
  c.beginPath();
  for (let s = phase; s <= tr.len; s += st.pitch) {
    const p = tr.at(s);
    const nx = -p.ty * side, ny = p.tx * side;
    tooth(c, p.x + nx * st.size * 0.3, p.y + ny * st.size * 0.3, p.tx, p.ty, nx, ny, st.size * 0.95, st.pitch * 0.48);
  }
  c.fillStyle = st.color;
  c.fill();
}

export interface PullStyle { body?: string; tab?: string; mark?: boolean; shadow?: number }

/**
 * The slider and pull tab at (x, y). `angle` is the direction of travel; the tab hangs back from it
 * (swing adds a pendulum offset in radians).
 */
export function drawPull(c: Ctx, x: number, y: number, angle: number, size: number, o: PullStyle = {}, swing = 0) {
  c.save();
  c.translate(x, y);
  const rot = angle - Math.PI / 2;
  c.rotate(rot); // local +y = direction of travel
  const s = size;
  if (o.shadow !== 0) { c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = s * 0.5; c.shadowOffsetY = s * 0.12; }
  // slider body: a rounded trapezoid, wider at the back
  c.fillStyle = o.body ?? '#2a2a2a';
  c.beginPath();
  c.moveTo(-s * 0.42, -s * 0.55);
  c.lineTo(s * 0.42, -s * 0.55);
  c.quadraticCurveTo(s * 0.5, -s * 0.55, s * 0.46, -s * 0.4);
  c.lineTo(s * 0.26, s * 0.5);
  c.quadraticCurveTo(0, s * 0.62, -s * 0.26, s * 0.5);
  c.lineTo(-s * 0.46, -s * 0.4);
  c.quadraticCurveTo(-s * 0.5, -s * 0.55, -s * 0.42, -s * 0.55);
  c.closePath();
  c.fill();
  c.shadowColor = 'transparent';
  // the tab hangs behind the slider (toward −y), swinging
  c.save();
  c.translate(0, -s * 0.3);
  c.rotate(swing);
  c.fillStyle = o.tab ?? C.coral;
  if (o.shadow !== 0) { c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = s * 0.4; c.shadowOffsetY = s * 0.1; }
  c.beginPath();
  c.roundRect(-s * 0.3, -s * 1.55, s * 0.6, s * 1.45, s * 0.3);
  c.fill();
  c.shadowColor = 'transparent';
  // hole
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.roundRect(-s * 0.12, -s * 1.42, s * 0.24, s * 0.36, s * 0.12);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  // the signature split S on the tab (flipped upright: tab hangs "down" the travel axis)
  if (o.mark !== false) {
    c.save();
    c.translate(0, -s * 0.62);
    c.rotate(-rot - swing); // keep the mark upright on screen
    drawIcon(c, 0, 0, s * 0.5, { solid: C.black, outline: C.white, word: C.black }, { strokeScale: 1.6 });
    c.restore();
  }
  c.restore();
  // body highlight
  c.fillStyle = 'rgba(255,255,255,0.14)';
  c.beginPath();
  c.roundRect(-s * 0.3, -s * 0.45, s * 0.14, s * 0.7, s * 0.07);
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- the zip wipe

export interface ZipWipeOpts {
  /** direction the pull travels */
  dir?: 'down' | 'up' | 'right' | 'left';
  /** position of the zip line across the frame (px, default: frame centre) */
  at?: number;
  /** V opening: half-gap per px behind the pull */
  spread?: number;
  teeth?: string;
  tape?: string;
  tab?: string;
  body?: string;
  /** tooth size multiplier (1 → 16 px teeth) */
  scale?: number;
  W?: number;
  H?: number;
  /** keep the halves from flying fully apart (for partial opens): 0..1 of the final open phase */
  maxOpen?: number;
  /** offscreen resolution multiplier (for wipes drawn scaled up, e.g. on a panel) */
  res?: number;
  /** the zipper line is already on screen (skip drawing it on) */
  drawn?: boolean;
}

/** Phase windows of a wipe (fractions of its duration). */
export const WIPE = { draw: [0, 0.14] as const, travel: [0.08, 0.72] as const, open: [0.62, 1] as const };
/** Pull position along the travel axis, 0..1 (can exceed slightly: it enters and exits the frame). */
export function wipePull(p: number) { return lerp(-0.04, 1.04, ease.inOutCubic(seg(p, WIPE.travel[0], WIPE.travel[1]))); }
export function wipeOpen(p: number) { return ease.inCubic(seg(p, WIPE.open[0], WIPE.open[1])); }

/**
 * Zip wipe at progress p (0 → only `from`, 1 → only `to`). Scenes are painters that draw a full frame.
 */
export function zipWipe(c: Ctx, p: number, from: (c: Ctx) => void, to: (c: Ctx) => void, o: ZipWipeOpts = {}) {
  const W = o.W ?? 1080, H = o.H ?? 1920;
  if (p <= 0) { from(c); return; }
  if (p >= 1) { to(c); return; }
  const dir = o.dir ?? 'down';
  const vertical = dir === 'down' || dir === 'up';
  const L = vertical ? H : W;            // travel length
  const A = vertical ? W : H;            // across length
  const at = o.at ?? A / 2;
  const sc = o.scale ?? 1;
  const spread = o.spread ?? 0.2;
  const pull = wipePull(p) * L;          // distance travelled from the start edge
  const open = wipeOpen(p) * (o.maxOpen ?? 1);
  const draw = o.drawn ? 1 : ease.outCubic(seg(p, WIPE.draw[0], WIPE.draw[1]));
  // travel coordinate u (0 at the start edge) → frame coordinate along the axis
  const rev = dir === 'up' || dir === 'left';
  const U = (u: number) => (rev ? L - u : u);
  const gap = (u: number) => Math.max(0, pull - u) * spread + open * A * 0.62 * (1 + 0.25 * (1 - u / L));

  to(c);

  const F = scratch(W, H, o.res ?? 1);
  from(F.c);
  const step = 6;
  // closed region ahead of the pull: one blit
  const closedFrom = clamp(pull, 0, L);
  c.save();
  if (open <= 0 && closedFrom < L) {
    const a = U(closedFrom), b = U(L);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (vertical) c.drawImage(F.cv, 0, lo * pixel(F.cv, W), F.cv.width, (hi - lo) * pixel(F.cv, W), 0, lo, W, hi - lo);
    else c.drawImage(F.cv, lo * pixel(F.cv, W), 0, (hi - lo) * pixel(F.cv, W), F.cv.height, lo, 0, hi - lo, H);
  }
  const pxs = pixel(F.cv, W);
  const u1 = open > 0 ? L : closedFrom;
  for (let u = 0; u < u1; u += step) {
    const h = Math.min(step, u1 - u);
    const g = gap(u + h / 2);
    const f0 = U(rev ? u + h : u); // frame coordinate of the slice start
    const f = Math.min(f0, U(rev ? u : u + h));
    if (vertical) {
      c.drawImage(F.cv, 0, f * pxs, at * pxs, h * pxs + 1, -g, f, at, h + 0.5);
      c.drawImage(F.cv, at * pxs, f * pxs, (W - at) * pxs, h * pxs + 1, at + g, f, W - at, h + 0.5);
    } else {
      c.drawImage(F.cv, f * pxs, 0, h * pxs + 1, at * pxs, f, -g, h + 0.5, at);
      c.drawImage(F.cv, f * pxs, at * pxs, h * pxs + 1, (H - at) * pxs, f, at + g, h + 0.5, H - at);
    }
  }
  c.restore();
  F.release();

  // zipper hardware in frame space
  const P = (u: number, across: number) => (vertical ? { x: across, y: U(u) } : { x: U(u), y: across });
  const st: TeethStyle = { pitch: 22 * sc, size: 16 * sc, color: o.teeth ?? C.white, tape: o.tape ?? C.black, tapeW: 22 * sc };
  const openEnd = clamp(open > 0 ? L : pull, 0, L);
  const drawLen = draw * L;
  // open edges (with a soft shadow cast into the gap)
  if (openEnd > 0) {
    const left: { x: number; y: number }[] = [], right: { x: number; y: number }[] = [];
    for (let u = 0; u <= openEnd + 0.01; u += 12) { const uu = Math.min(u, openEnd), g = gap(uu); left.push(P(uu, at - g)); right.push(P(uu, at + g)); }
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)';
    c.shadowBlur = 40 * sc;
    const sideL = (vertical ? (rev ? 1 : -1) : (rev ? -1 : 1)) as 1 | -1;
    openTeeth(c, left, st, sideL, 0);
    openTeeth(c, right, st, (-sideL) as 1 | -1, st.pitch / 2);
    c.restore();
  }
  // closed teeth from the pull onward (drawn on as the line appears)
  if (open <= 0) {
    const pts: [number, number][] = [];
    for (let u = Math.max(0, pull); u <= L; u += 20) { const q = P(u, at); pts.push([q.x, q.y]); }
    const q = P(L, at); pts.push([q.x, q.y]);
    if (pts.length >= 2) {
      const tr = new Track(pts);
      const s1 = Math.min(tr.len, drawLen - Math.max(0, pull));
      closedTeeth(c, tr, 0, s1, { ...st, tape: st.tape, tapeW: 30 * sc, shade: rgba(C.black, 0.4) });
    }
  }
  // the pull
  if (pull > -40 && pull < L + 60 && open < 0.35) {
    const q = P(clamp(pull, -30, L + 30), at);
    const ang = vertical ? (rev ? -Math.PI / 2 : Math.PI / 2) : (rev ? Math.PI : 0);
    const speed = ease.inOutCubic(seg(p, WIPE.travel[0], WIPE.travel[1]));
    const swing = Math.sin(p * 40) * 0.12 * (1 - Math.abs(speed * 2 - 1));
    c.save();
    c.globalAlpha = 1 - seg(open, 0.1, 0.35);
    drawPull(c, q.x, q.y, ang, 46 * sc, { tab: o.tab ?? C.coral, body: o.body }, swing);
    c.restore();
  }
}

function pixel(cv: HTMLCanvasElement, W: number) { return cv.width / W; }

/** Convenience: which painter to show for a wipe window [t0, t0 + dur]. */
export function wipeAt(c: Ctx, t: number, t0: number, dur: number, from: (c: Ctx) => void, to: (c: Ctx) => void, o?: ZipWipeOpts) {
  zipWipe(c, (t - t0) / dur, from, to, o);
}
