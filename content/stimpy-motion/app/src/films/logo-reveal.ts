// 1 · LOGO REVEAL (10 s). The brand's first handshake: name, look, and the zip sound.
//
//  0.0–0.55  black, silence
//  0.55–2.0  the zip sound starts: a thin line of light is pulled down the dark, like a zipper in the dark
//  2.0–3.4   the line splits open like the back of a hoodie parting; coral light floods out; the split S
//            closes its two halves and the wordmark rises
//  4.0–6.0   one identity per beat: the letters flicker through flame, checkerboard, pastel print, graffiti
//            (then two quick 8th-note flickers)
//  6.0–8.0   it settles on the main logo; the tagline types itself underneath
//  8.0–9.2   the zipper closes back over everything (the signature zip)
//  9.2–10    "Coming soon."
import { C, TAGLINE, rgba } from '../engine/brand';
import { drawIcon, drawWord, lockup, LOGO, type LogoColors } from '../engine/logo';
import { typeOn, measure, text, type Ctx } from '../engine/draw';
import { closedTeeth, openTeeth, drawPull, zipWipe, Track, WIPE } from '../engine/zipper';
import { art, byId } from '../art/designs';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, H, fabricFill, fill, glow, kinetic, SIG_WIPE } from './common';
import { ease, seg, clamp, pulse, lerp } from '../engine/util';

const T = {
  zip0: 0.55, zip1: 1.95,
  open: 2.0, openEnd: 3.3,
  word0: 2.55,
  ids: 4.0, settle: 6.0,
  type0: 6.35, type1: 7.55,
  close: 8.05,
  soon: 9.2,
  end: 10,
};
const CLOSE_DUR = SIG_WIPE;

interface Identity { t: number; design: string; bg: string; outline: string; iy?: number }
const IDS: Identity[] = [
  { t: 4.0, design: 'flame', bg: C.butter, outline: C.coral, iy: -0.75 },
  { t: 4.5, design: 'static', bg: C.blue, outline: C.butter },
  { t: 5.0, design: 'bloom', bg: C.black, outline: C.lilac },
  { t: 5.5, design: 'tag', bg: C.sky, outline: C.white },
  { t: 5.75, design: 'halftone', bg: C.lilac, outline: C.black },
  { t: 5.875, design: 'night', bg: C.cream, outline: C.blue },
];

const LOGO_Y = 880, ICON_H = 252;

/** Pull position (0..1 of the frame height) during the dark line. */
const linePull = (u: number) => lerp(-0.02, 1.02, u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Draw a design scaled to cover a rect. */
function cover(c: Ctx, id: string, t: number, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / 300, h / 364);
  c.save();
  c.translate(x + (w - 300 * s) / 2, y + (h - 364 * s) / 2);
  c.scale(s, s);
  byId(id).draw(c, 300, 364, t);
  c.restore();
}

function logo(c: Ctx, t: number, col: LogoColors, o: { split?: number; scale?: number; word?: number; id?: Identity; alpha?: number }) {
  const L = lockup(ICON_H);
  const s = o.scale ?? 1;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.translate(W / 2, LOGO_Y);
  c.scale(s, s);
  const left = -L.total / 2;
  const id = o.id;
  drawIcon(c, left + L.solidLeft, 0, ICON_H, col, {
    split: o.split ?? 0,
    solidFill: id ? (k) => cover(k, id.design, t, -0.55, -0.1 + (id.iy ?? 0), 1.1, 1.3 - (id.iy ?? 0)) : undefined,
    outlineStyle: id ? id.outline : undefined,
  });
  drawWord(c, left + L.iconW + L.gap, 0, L.cap, col.word, {
    reveal: o.word ?? 1,
    fill: id ? (k) => cover(k, id.design, t + 0.3, -0.2, -1.5, 5.6, 2.0) : undefined,
  });
  c.restore();
}

/** The world behind the back: coral, a flood of light, the logo. */
function behind(c: Ctx, t: number) {
  fill(c, C.coral);
  // light flood: strongest as the back parts
  const flood = pulse(t - T.open, 1.6) * 0.95 + (t < T.open ? 0.9 : 0);
  glow(c, W / 2, LOGO_Y, 1100, C.cream, Math.min(1, flood));
  glow(c, W / 2, LOGO_Y, 420, C.white, Math.min(1, flood * 1.1));
  // rays fanning out of the seam
  const rays = t < T.open ? 1 : pulse(t - T.open, 1.2);
  if (rays > 0.01) {
    c.save();
    c.globalAlpha = 0.18 * rays;
    c.fillStyle = C.cream;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t * 0.15;
      c.beginPath();
      c.moveTo(W / 2, LOGO_Y);
      c.lineTo(W / 2 + Math.cos(a) * 2400, LOGO_Y + Math.sin(a) * 2400);
      c.lineTo(W / 2 + Math.cos(a + 0.09) * 2400, LOGO_Y + Math.sin(a + 0.09) * 2400);
      c.fill();
    }
    c.restore();
  }
  if (t >= T.open) {
    const e = seg(t, T.open + 0.12, T.open + 0.95);
    logo(c, t, LOGO.main, {
      split: 0.55 * (1 - ease.outExpo(e)),
      scale: lerp(1.16, 1, ease.outCubic(seg(t, T.open, T.open + 1.2))),
      word: seg(t, T.word0, T.word0 + 0.9),
      alpha: ease.outCubic(seg(t, T.open + 0.05, T.open + 0.4)),
    });
  }
}

/** The back of the hoodie in the dark, with the seam of light pulled open to `pull` (px). */
function darkBack(c: Ctx, t: number, pull: number, open: number) {
  const gap = (y: number) => Math.max(0, pull - y) * 0.0065 + open * W * 0.62 * (1 + 0.3 * (1 - y / H)) + (open > 0 ? 6 * ease.outCubic(open * 8) : 0);
  // light behind (only visible through the seam)
  behind(c, t);
  // the two halves of fabric
  const edge = (side: -1 | 1) => {
    const p = new Path2D();
    const x0 = side < 0 ? -40 : W + 40;
    p.moveTo(x0, -40);
    const pts: { x: number; y: number }[] = [];
    for (let y = -20; y <= H + 20; y += 12) { const x = W / 2 + side * gap(y); pts.push({ x, y }); p.lineTo(x, y); }
    p.lineTo(x0, H + 40);
    p.closePath();
    return { p, pts };
  };
  const Lh = edge(-1), Rh = edge(1);
  for (const half of [Lh, Rh]) {
    c.save();
    c.shadowColor = rgba(C.black, 0.6);
    c.shadowBlur = 50;
    fabricFill(c, '#141414', half.p);
    c.restore();
  }
  // edges: teeth catching the light, only where the seam is open
  const lit = C.cream;
  const openPts = (pts: { x: number; y: number }[]) => pts.filter((q) => q.y <= Math.max(pull, open > 0 ? H + 40 : pull));
  const st = { pitch: 21, size: 13, color: rgba(lit, 0.9), tape: '#0c0c0c', tapeW: 18 };
  const lp = openPts(Lh.pts), rp = openPts(Rh.pts);
  if (lp.length > 1) {
    openTeeth(c, lp, st, -1, 0);
    openTeeth(c, rp, st, 1, st.pitch / 2);
  }
  // the still-closed zipper below the pull (barely visible in the dark)
  if (open <= 0 && pull < H) {
    const tr = new Track([[W / 2, Math.max(0, pull)], [W / 2, H + 20]]);
    closedTeeth(c, tr, 0, tr.len, { pitch: 21, size: 13, color: '#262626', tape: '#0e0e0e', tapeW: 26 });
    // light leaking at the slider
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, W / 2, pull, 170, C.coral, 0.35);
    glow(c, W / 2, pull, 60, C.cream, 0.5);
    c.restore();
  }
  // the seam glows: a bloom over the fabric edges
  if (open < 0.6) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 1 - seg(open, 0, 0.6);
    c.shadowColor = C.coral;
    c.shadowBlur = 45;
    c.strokeStyle = rgba(C.cream, 0.55);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W / 2, -10);
    c.lineTo(W / 2, open > 0 ? H + 10 : Math.max(-10, pull));
    c.stroke();
    c.restore();
  }
  // the slider
  if (open < 0.25 && pull > -60) {
    c.save();
    c.globalAlpha = 1 - seg(open, 0, 0.25);
    drawPull(c, W / 2, Math.min(pull, H + 40), Math.PI / 2, 44, { tab: C.coral, body: '#2d2d2d' }, Math.sin(t * 13) * 0.1 * (pull < H ? 1 : 0));
    c.restore();
  }
}

function identityAt(t: number): Identity | null {
  if (t < T.ids || t >= T.settle) return null;
  let cur: Identity | null = null;
  for (const id of IDS) if (t >= id.t) cur = id;
  return cur;
}

/** The logo world after the reveal (identities, settle, tagline). */
function world(c: Ctx, t: number, post: Post | null) {
  const id = identityAt(t);
  if (t < T.ids) { behind(c, t); return; }
  if (id) {
    fill(c, id.bg);
    const age = t - id.t;
    const punch = 1 + 0.05 * pulse(age, 14);
    const col: LogoColors = { solid: C.black, outline: id.outline, word: C.black };
    logo(c, t, col, { id, scale: punch });
    if (post) { post.ca = 1.4 * pulse(age, 18); post.flash = 0.12 * pulse(age, 30); post.flashColor = C.white; }
    return;
  }
  // settled
  fill(c, C.coral);
  glow(c, W / 2, LOGO_Y, 900, C.cream, 0.18 * (1 - pulse(t - T.settle, 3)) + 0.1);
  const age = t - T.settle;
  logo(c, t, LOGO.main, { scale: 1 + 0.04 * pulse(age, 9) });
  if (post) { post.flash = 0.25 * pulse(age, 10); post.flashColor = C.cream; }
  // tagline
  const o = { size: 58, weight: 500, color: C.black };
  const wTag = measure(c, TAGLINE, o);
  const size = wTag > 880 ? (58 * 880) / wTag : 58;
  const p = seg(t, T.type0, T.type1);
  const blink = t < T.type1 ? 1 : (Math.floor((t - T.type1) / 0.35) % 2 === 0 ? 1 : 0);
  typeOn(c, TAGLINE, W / 2, LOGO_Y + 230, { ...o, size, align: 'center' }, p, t > T.type0 - 0.3 ? blink : 0);
}

/** "Coming soon." on the closed back. */
function closed(c: Ctx, t: number) {
  fabricFill(c, '#111111');
  const age = t - T.soon;
  if (age <= 0) return;
  kinetic(c, 'Coming soon.', W / 2, H / 2 + 30, age, { size: 92, weight: 700, color: C.white, align: 'center', stagger: 0.09, dur: 0.6 });
  // the electric-blue underline: the call to attention
  const u = ease.outExpo(seg(age, 0.3, 0.9));
  if (u > 0) {
    c.fillStyle = C.blue;
    const w = 520 * u;
    c.beginPath(); c.roundRect(W / 2 - w / 2, H / 2 + 80, w, 12, 6); c.fill();
  }
}

export function makeLogoReveal(): Film {
  return {
    id: 'logo', title: '01 · Logo Reveal', duration: T.end,
    marks: [
      { t: 0, label: 'dark' }, { t: T.zip0, label: 'zip line' }, { t: T.open, label: 'light floods' }, { t: T.ids, label: 'identities' },
      { t: T.settle, label: 'settle + tagline' }, { t: T.close, label: 'zip closes' }, { t: T.soon, label: 'coming soon' },
    ],
    draw(c, t, post) {
      post.vignette = 0.18;
      if (t < T.zip0) { fabricFill(c, '#111111'); post.vignette = 0.3; return; }
      if (t < T.open) {
        const u = seg(t, T.zip0, T.zip1);
        darkBack(c, t, linePull(u) * H, 0);
        post.vignette = 0.35;
        return;
      }
      if (t < T.openEnd + 0.1) {
        const open = ease.inOutCubic(seg(t, T.open, T.openEnd));
        darkBack(c, t, H + 60, open);
        post.flash = 0.3 * pulse(t - T.open, 7);
        post.flashColor = C.cream;
        post.ca = 1.2 * pulse(t - T.open, 6);
        return;
      }
      if (t < T.close) { world(c, t, post); return; }
      // the zipper closes back over everything: an opening wipe played backwards (the pull climbs)
      const p = 1 - clamp((t - T.close) / CLOSE_DUR);
      zipWipe(c, p, (k) => closed(k, t), (k) => world(k, t, null), { dir: 'down', teeth: C.cream, tape: '#0c0c0c', tab: C.coral, spread: 0.22 });
      if (t > T.close + CLOSE_DUR) post.vignette = 0.3;
    },
    score() {
      const S = new Score(T.end, { delayTime: 0.375 });
      // the zip in the dark
      S.zip(T.zip0, T.zip1, linePull, 96, 0.95, { stop: false });
      S.pad(T.zip0, chord('D2', 'A2'), 1.3, 0.35, { attack: 1.2, release: 0.3, cutoff: 500 });
      S.swell(T.open, 1.2, 0.8);
      // light floods
      S.boom(T.open, 1);
      S.pad(T.open, chord('D3', 'F#3', 'A3', 'C#4', 'E4'), 1.7, 0.9, { attack: 0.02, release: 0.6, cutoff: 3200 });
      S.sub(T.open, n('D1'), 1.5, 0.8);
      S.sparkle(T.open + 0.05, 0.7, 0.9, n('D6'));
      // wordmark letters rising
      for (let i = 0; i < 6; i++) S.pop(T.word0 + 0.1 + i * 0.1, 0.6, 1 + i * 0.12);
      S.swell(T.ids, 0.7, 0.6);
      // one identity per beat
      const stabs = [chord('B3', 'D4', 'F#4', 'A4'), chord('G3', 'B3', 'D4', 'F#4'), chord('A3', 'C#4', 'E4', 'G4'), chord('F#3', 'A3', 'C#4', 'E4'), chord('G3', 'B3', 'D4', 'F#4'), chord('A3', 'C#4', 'E4', 'A4')];
      IDS.forEach((id, i) => {
        const big = i < 4;
        S.kick(id.t, big ? 1 : 0.6);
        S.stab(id.t, stabs[i]!, big ? 0.32 : 0.12, big ? 0.9 : 0.6);
        S.bass(id.t, [n('B1'), n('G1'), n('A1'), n('F#1'), n('G1'), n('A1')][i]!, big ? 0.4 : 0.12, 0.8);
        if (big) S.clap(id.t, 0.35);
        S.hat(id.t + 0.25, 0.5);
      });
      // settle
      S.kick(T.settle, 1.1);
      S.stab(T.settle, chord('D4', 'F#4', 'A4', 'C#5', 'E5'), 0.6, 1);
      S.bass(T.settle, n('D2'), 1.8, 0.8);
      S.pad(T.settle, chord('D3', 'A3', 'F#4', 'C#5'), 2, 0.5, { attack: 0.3, release: 0.8 });
      for (let b = 1; b < 4; b++) { S.kick(T.settle + b * 0.5, 0.75); S.hat(T.settle + b * 0.5 + 0.25, 0.4); }
      const arp = chord('D5', 'F#5', 'A5', 'C#6', 'E6', 'C#6', 'A5', 'F#5');
      arp.forEach((m, i) => S.pluck(T.settle + 0.25 + i * 0.25, m, 0.2, 0.3, { pan: i % 2 ? 0.3 : -0.3 }));
      // typing
      const chars = TAGLINE.length;
      for (let i = 0; i < chars; i++) if (TAGLINE[i] !== ' ') S.key(T.type0 + ((i + 1) / chars) * (T.type1 - T.type0) - 0.004, 0.8, (i / chars - 0.5) * 0.4);
      // the zipper closes: the signature zip (the pull travels back up)
      S.lowpass(T.close, 900, 0.5);
      S.gate(T.close + 0.3, 0.0, 0.8);
      // played backwards, the wipe's travel window [0.08, 0.72] starts at 1 − 0.72 of its duration
      S.signatureZip(T.close + (1 - WIPE.travel[1]) * CLOSE_DUR);
      S.thud(T.soon - 0.05, 0.7, 0.7);
      S.bell(T.soon + 0.05, n('D5'), 0.7, { bus: 'sfx', decay: 2.2, verb: 0.6 });
      S.bell(T.soon + 0.05, n('A5'), 0.4, { bus: 'sfx', decay: 2.2, verb: 0.6 });
      return S;
    },
  };
}
