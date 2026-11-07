// The macro zipper: a tilt-shift close-up of real zipper hardware (metal teeth meshing one by one, the
// slider with its coral split-S tab, woven tape, a top stop), with depth of field, rim light and dust.
// Shared by the Zipper Close-Up shoot animatics.
import { C, rgba, mix } from '../../engine/brand';
import { drawIcon, LOGO } from '../../engine/logo';
import { scratch, blit, type Ctx } from '../../engine/draw';
import { Track } from '../../engine/zipper';
import { W, H, fabricFill, glow } from '../common';
import { clamp, TAU, mulberry, smooth, wobble } from '../../engine/util';

// ---------------------------------------------------------------- macro geometry (world px)
/** tooth pitch along one row (the two rows are offset by half of it) */
export const P = 56;
/** tooth length across the line */
export const TH = 74;
/** tooth width along the line */
export const TW = P * 0.44;
export const TAPE = 92;
/** max half-opening of the rows ahead of the slider, and the length of the V */
export const GAP = 112, VLEN = 760;
export const SL = 150; // slider size

export const smax = (a: number, b: number, k: number) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2;

// ---------------------------------------------------------------- drawing
export interface ShotOpts {
  /** when the slider hit its stop (the tab swings) */
  hit?: number;
  tr: Track;
  /** slider arc position (or null when off the track) */
  sx: number | null;
  camS: number;
  zoom: number;
  /** roll on top of the track direction */
  roll: number;
  /** follow the track's direction with the camera (shot 2) */
  follow: boolean;
  /** teeth end here (top stop), or never */
  stopAt?: number;
  /** light sweep position along the track */
  sweep?: number;
  /** what glows through the open gap */
  leak: string;
  leakA: number;
  t: number;
  /** extra visible range (pull back) */
  reach?: number;
}

export function gapAt(s: number, sx: number | null) {
  if (sx === null) return GAP;
  return GAP * smooth((s - sx) / VLEN) * (s > sx ? 1 : 0);
}

/** One tooth in tooth-local coordinates: root at +y (the tape), rounded head poking past the centre line. */
function toothPath(c: Ctx) {
  const hw = TW / 2;
  c.beginPath();
  c.moveTo(-hw, TH * 0.8);
  c.lineTo(-hw, TH * 0.02);
  c.bezierCurveTo(-hw, -TH * 0.2, -hw * 0.45, -TH * 0.27, 0, -TH * 0.27);
  c.bezierCurveTo(hw * 0.45, -TH * 0.27, hw, -TH * 0.2, hw, TH * 0.02);
  c.lineTo(hw, TH * 0.8);
  c.closePath();
}

function drawTooth(c: Ctx, lit: number, spec: number, rim: number) {
  const hw = TW / 2;
  toothPath(c);
  const g = c.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0, '#0d0d0d');
  g.addColorStop(0.18, '#3a3530');
  g.addColorStop(clamp(spec, 0.25, 0.7), mix('#5a524a', C.cream, clamp(lit)));
  g.addColorStop(0.8, '#433d37');
  g.addColorStop(0.94, '#151412');
  g.addColorStop(1, rim > 0.01 ? rgba(C.coral, Math.min(0.9, rim)) : '#151412');
  c.fillStyle = g;
  c.fill();
  // ambient occlusion into the tape
  const ao = c.createLinearGradient(0, TH * 0.8, 0, TH * 0.2);
  ao.addColorStop(0, 'rgba(0,0,0,0.7)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ao;
  c.fill();
  // the cup on the head catches the light
  c.fillStyle = rgba(C.cream, 0.18 + 0.55 * clamp(lit));
  c.beginPath();
  c.ellipse(-hw * 0.18, -TH * 0.1, hw * 0.32, TH * 0.07, 0, 0, TAU);
  c.fill();
}

/** The slider (wide mouth toward +x, the open side) with its coral tab trailing over the closed teeth. */
export function drawSlider(c: Ctx, screenAngle: number, swing: number, lit: number) {
  const S = SL;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.75)';
  c.shadowBlur = 50;
  c.shadowOffsetX = 14; c.shadowOffsetY = 26;
  const body = new Path2D();
  body.moveTo(-0.55 * S, -0.3 * S);
  body.lineTo(0.45 * S, -0.62 * S);
  body.quadraticCurveTo(0.64 * S, -0.68 * S, 0.64 * S, -0.5 * S);
  body.lineTo(0.64 * S, 0.5 * S);
  body.quadraticCurveTo(0.64 * S, 0.68 * S, 0.45 * S, 0.62 * S);
  body.lineTo(-0.55 * S, 0.3 * S);
  body.quadraticCurveTo(-0.68 * S, 0.26 * S, -0.68 * S, 0.12 * S);
  body.lineTo(-0.68 * S, -0.12 * S);
  body.quadraticCurveTo(-0.68 * S, -0.26 * S, -0.55 * S, -0.3 * S);
  body.closePath();
  const g = c.createLinearGradient(0, -0.66 * S, 0, 0.66 * S);
  g.addColorStop(0, '#0b0b0b');
  g.addColorStop(0.26, '#4d4843');
  g.addColorStop(0.4, mix('#8a8279', C.cream, 0.4 * lit));
  g.addColorStop(0.55, '#3b3733');
  g.addColorStop(0.85, '#1a1918');
  g.addColorStop(1, rgba(C.coral, 0.55));
  c.fillStyle = g;
  c.fill(body);
  c.restore();
  // bevel
  c.save();
  c.strokeStyle = 'rgba(255,244,230,0.16)';
  c.lineWidth = 3;
  c.stroke(body);
  c.restore();
  // the bridge that holds the tab
  c.save();
  const bg = c.createLinearGradient(0, -0.18 * S, 0, 0.18 * S);
  bg.addColorStop(0, '#2a2826'); bg.addColorStop(0.45, mix('#6b645d', C.cream, 0.35 * lit)); bg.addColorStop(1, '#141312');
  c.fillStyle = bg;
  c.beginPath(); c.roundRect(-0.36 * S, -0.17 * S, 0.74 * S, 0.34 * S, 0.17 * S); c.fill();
  c.restore();
  // the tab, hinged at the bridge, lying back over the closed teeth
  c.save();
  c.translate(-0.22 * S, 0);
  c.rotate(swing);
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 36; c.shadowOffsetX = 10; c.shadowOffsetY = 20;
  const tab = new Path2D();
  tab.roundRect(-1.95 * S, -0.31 * S, 1.95 * S, 0.62 * S, 0.31 * S);
  const tg = c.createLinearGradient(0, -0.31 * S, 0, 0.31 * S);
  tg.addColorStop(0, mix(C.coral, C.cream, 0.35));
  tg.addColorStop(0.35, C.coral);
  tg.addColorStop(1, mix(C.coral, '#000000', 0.35));
  c.fillStyle = tg;
  c.fill(tab);
  c.shadowColor = 'transparent';
  c.strokeStyle = rgba(C.cream, 0.35);
  c.lineWidth = 2.5;
  c.stroke(tab);
  // the hinge slot
  c.fillStyle = '#1a1a1a';
  c.beginPath(); c.roundRect(-0.36 * S, -0.12 * S, 0.24 * S, 0.24 * S, 0.1 * S); c.fill();
  // the split S, kept upright on screen (the logo is never rotated)
  c.save();
  c.translate(-1.2 * S, 0);
  c.rotate(-screenAngle - swing);
  drawIcon(c, 0, 0, 0.5 * S, LOGO.main, { strokeScale: 1.5 });
  c.restore();
  c.restore();
}

/** Paint a macro shot in screen space. */
export function shot(c: Ctx, o: ShotOpts) {
  const { tr, sx, camS, zoom, t } = o;
  const cam = tr.at(camS);
  const trackAng = Math.atan2(cam.ty, cam.tx);
  const rot = o.roll - (o.follow ? trackAng : 0);
  c.save();
  c.translate(W / 2, H / 2 + 40);
  c.rotate(rot);
  c.scale(zoom, zoom);
  c.translate(-cam.x, -cam.y);
  fabricFill(c, '#181818');

  const reach = (o.reach ?? 1) * 1250 / zoom;
  const s0 = Math.max(0, camS - reach), s1 = Math.min(tr.len, camS + reach);
  const end = o.stopAt ?? Infinity;
  // sampled edges
  const step = 10;
  const rows: { x: number; y: number; nx: number; ny: number; g: number; s: number }[] = [];
  for (let s = s0; s <= s1 + 0.01; s += step) {
    const p = tr.at(s);
    rows.push({ x: p.x, y: p.y, nx: -p.ty, ny: p.tx, g: gapAt(s, sx), s });
  }
  const off = (r: (typeof rows)[number], d: number) => [r.x + r.nx * d, r.y + r.ny * d] as const;

  // the gap: dark, with light leaking from underneath
  const openRows = rows.filter((r) => r.g > 2);
  if (openRows.length > 1) {
    const gp = new Path2D();
    openRows.forEach((r, i) => { const [x, y] = off(r, -(r.g - TH * 0.15)); if (i === 0) gp.moveTo(x, y); else gp.lineTo(x, y); });
    for (let i = openRows.length - 1; i >= 0; i--) { const [x, y] = off(openRows[i]!, r(openRows[i]!)); gp.lineTo(x, y); }
    gp.closePath();
    c.save();
    c.clip(gp);
    c.fillStyle = '#050505';
    c.fillRect(-9000, -9000, 18000, 18000);
    if (o.leakA > 0) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < openRows.length; i += 4) {
        const q = openRows[i]!;
        glow(c, q.x, q.y, q.g * 1.1, o.leak, o.leakA * clamp(q.g / GAP) * 0.55);
      }
      c.strokeStyle = rgba(C.cream, 0.35 * o.leakA);
      c.lineWidth = 4;
      c.beginPath();
      openRows.forEach((q, i) => { if (i === 0) c.moveTo(q.x, q.y); else c.lineTo(q.x, q.y); });
      c.stroke();
    }
    c.restore();
  }
  function r(q: (typeof rows)[number]) { return q.g - TH * 0.15; }

  // the two tapes
  for (const side of [-1, 1] as const) {
    const a = TH * 0.42, b = TH * 0.42 + TAPE;
    const tp = new Path2D();
    rows.forEach((q, i) => { const [x, y] = off(q, side * (q.g + a)); if (i === 0) tp.moveTo(x, y); else tp.lineTo(x, y); });
    for (let i = rows.length - 1; i >= 0; i--) { const q = rows[i]!; const [x, y] = off(q, side * (q.g + b)); tp.lineTo(x, y); }
    tp.closePath();
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 24;
    c.fillStyle = '#0f0f0f';
    c.fill(tp);
    c.shadowColor = 'transparent';
    c.clip(tp);
    // the weave and the stitch line
    c.lineWidth = 1.6;
    for (let k = 0; k < 9; k++) {
      const d = a + 8 + k * ((TAPE - 12) / 8);
      c.strokeStyle = `rgba(255,255,255,${k === 7 ? 0.1 : 0.035})`;
      c.setLineDash(k === 7 ? [12, 9] : [3, 5]);
      c.beginPath();
      rows.forEach((q, i) => { const [x, y] = off(q, side * (q.g + d)); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); });
      c.stroke();
    }
    c.setLineDash([]);
    c.restore();
  }

  // teeth
  const sweep = o.sweep ?? -1e9;
  const sliderLit = (s: number) => (sx === null ? 0 : 0.35 * Math.exp(-(((s - sx) / 260) ** 2)));
  const teeth: { x: number; y: number; ang: number; side: 1 | -1; lit: number; spec: number; rim: number }[] = [];
  const k0 = Math.floor(s0 / (P / 2)), k1 = Math.ceil(s1 / (P / 2));
  for (let k = k0; k <= k1; k++) {
    const s = k * (P / 2);
    if (s < 0 || s > end) continue;
    const side: 1 | -1 = k % 2 === 0 ? -1 : 1;
    const p = tr.at(s);
    const g = gapAt(s, sx);
    const dg = (gapAt(s + 4, sx) - gapAt(s - 4, sx)) / 8;
    const nx = -p.ty, ny = p.tx;
    // the meshing offset: closed teeth sit across the centre line
    const d = side * g;
    const ang = Math.atan2(p.ty, p.tx) + side * Math.atan(dg) * 0.9;
    const lit = 0.32 + 0.9 * Math.exp(-(((s - sweep) / 240) ** 2)) + sliderLit(s);
    const spec = 0.44 + 0.12 * Math.sin(s * 0.0045 + camS * 0.0021 + side);
    teeth.push({ x: p.x + nx * d, y: p.y + ny * d, ang, side, lit, spec, rim: side < 0 ? 0.55 : 0.12 });
  }
  // soft shadows under the teeth (one blurred pass)
  c.save();
  c.filter = 'blur(7px)';
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.beginPath();
  for (const q of teeth) {
    const cx = q.x + 8 - Math.sin(q.ang) * q.side * TH * 0.25, cy = q.y + 14 + Math.cos(q.ang) * q.side * TH * 0.25;
    c.moveTo(cx + TW * 0.6, cy);
    c.ellipse(cx, cy, TW * 0.6, TH * 0.5, q.ang + Math.PI / 2, 0, TAU);
  }
  c.fill();
  c.restore();
  for (const q of teeth) {
    c.save();
    c.translate(q.x, q.y);
    c.rotate(q.ang);
    c.scale(1, q.side);
    drawTooth(c, q.lit, q.spec, q.rim);
    c.restore();
  }

  // the top stop
  if (Number.isFinite(end)) {
    const p = tr.at(end + 26);
    for (const side of [-1, 1]) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.atan2(p.ty, p.tx));
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 20; c.shadowOffsetY = 10;
      const g = c.createLinearGradient(-18, 0, 18, 0);
      g.addColorStop(0, '#141414'); g.addColorStop(0.45, '#7a726a'); g.addColorStop(1, '#141414');
      c.fillStyle = g;
      c.beginPath(); c.roundRect(-18, side < 0 ? -TH * 0.95 : TH * 0.2, 36, TH * 0.75, 8); c.fill();
      c.restore();
    }
  }

  // the slider
  if (sx !== null && sx > s0 - 400 && sx < s1 + 400) {
    const p = tr.at(sx);
    const a = Math.atan2(p.ty, p.tx);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(a);
    const swing = 0.05 * Math.sin(t * 3.1) + 0.12 * wobble(t - (o.hit ?? -9), 3, 4);
    drawSlider(c, rot + a, swing, 0.6 + 0.4 * Math.exp(-(((sx - sweep) / 300) ** 2)));
    c.restore();
  }
  c.restore();
  return { rot, trackAng };
}

/** Tilt-shift depth of field: a sharp band along the zipper, the rest melts out of focus. */
export function macro(c: Ctx, o: ShotOpts, focus: number, blurPx = 11) {
  const L = scratch();
  const { rot, trackAng } = shot(L.c, o);
  const screenAng = rot + (o.follow ? trackAng : trackAng);
  c.save();
  c.filter = `blur(${blurPx}px)`;
  blit(c, L.cv);
  c.restore();
  if (focus > 0) {
    const M = scratch();
    const cx = W / 2, cy = H / 2 + 40, nx = -Math.sin(screenAng), ny = Math.cos(screenAng), D = 560;
    const g = M.c.createLinearGradient(cx - nx * D, cy - ny * D, cx + nx * D, cy + ny * D);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, `rgba(0,0,0,${focus})`);
    g.addColorStop(0.7, `rgba(0,0,0,${focus})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    M.c.fillStyle = g;
    M.c.fillRect(0, 0, W, H);
    M.c.globalCompositeOperation = 'source-in';
    blit(M.c, L.cv);
    blit(c, M.cv);
    M.release();
  }
  L.release();
}

// floating dust in the light (foreground bokeh)
const MOTES = (() => {
  const r = mulberry(303);
  return Array.from({ length: 26 }, () => ({ x: r() * W, y: r() * H, r: 14 + r() * 60, vx: (r() - 0.5) * 30, vy: -10 - r() * 26, a: 0.05 + r() * 0.12, coral: r() < 0.35, ph: r() * TAU }));
})();
export function motes(c: Ctx, t: number, a: number) {
  if (a <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const m of MOTES) {
    const x = ((m.x + m.vx * t) % W + W) % W, y = ((m.y + m.vy * t) % H + H) % H;
    glow(c, x, y, m.r, m.coral ? C.coral : C.cream, m.a * a * (0.7 + 0.3 * Math.sin(t * 1.3 + m.ph)));
  }
  c.restore();
}

/** Key and rim light over the frame. */
export function lights(c: Ctx, t: number, k: number) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  glow(c, W * 0.92, H * 0.12, 1100, C.coral, 0.16 * k);
  glow(c, W * 0.35, H * 0.62, 900, C.cream, 0.05 * k * (1 + 0.2 * Math.sin(t * 0.7)));
  c.restore();
}


/** A straight run along +x. */
export function straightTrack(len = 6000) { return new Track([[-len / 2, 0], [len / 2, 0]]); }
/** Straight → a rounded corner turning toward +y (the edge of a panel) → straight. */
export function cornerTrack(R = 380, run = 1800) {
  const pts: [number, number][] = [];
  for (let x = -run; x < 0; x += 40) pts.push([x, 0]);
  for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (i / 40) * (Math.PI / 2); pts.push([Math.cos(a) * R, R + Math.sin(a) * R]); }
  for (let y = R + 40; y <= R + run; y += 40) pts.push([R, y]);
  return new Track(pts);
}
