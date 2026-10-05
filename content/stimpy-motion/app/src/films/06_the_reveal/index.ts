// 6 · THE REVEAL (14.5 s). The most important video of the campaign: the full swap in a few seconds, then
// the person turns around, and it ends on the launch date.
//
//  0.0–0.5    black
//  0.5–1.25   close on the back of a black hoodie wearing FLAME. A hand reaches in for the coral pull
//  1.35–2.55  it unzips the Stimpie all the way round (one click per tooth)
//  2.6–3.15   peels it off and throws it out of frame
//  2.95–3.45  a second hand brings in WAVE; it lands with a squash
//  3.55–4.75  zips it on, all the way round
//  5.0        SNAP: the drop. The world bursts from coral to sky out of the panel
//  5.0–6.25   the camera pulls back to the whole figure while the back keeps changing on the beat
//             (night → bloom → sun → tag), each change re-colouring the world. "One hoodie." /
//             "Multiple identities."
//  8.0–9.0    the person turns around to face you (coral hood lining, the split S on the chest)
//  9.5        signature zip wipe → the launch date on coral
import { C, ink, rgba, mix } from '../../engine/brand';
import { drawLockup, LOGO } from '../../engine/logo';
import { text, type Ctx } from '../../engine/draw';
import { drawHoodie, drawPanel, tones, hoodiePoint, DOCK, type HoodieOpts, type PanelOpts } from '../../engine/hoodie';
import { roundRectTrack, zipWipe } from '../../engine/zipper';
import { hand } from '../shoot/hands';
import { art, byId } from '../../art/designs';
import type { Film, Post } from '../../engine/engine';
import { Score, n, chord } from '../../audio/score';
import { W, H, SAFE, fill, glow, kinetic, kineticOut, pill, SIG_WIPE, wipeTravelStart } from '../common';
import { ease, seg, clamp, pulse, lerp, TAU, clock, wobble, mulberry } from '../../engine/util';

/**
 * The launch date shown on the end card. PLACEHOLDER: the date is not set yet (master plan checklist:
 * "Set the launch date"). Change it here and re-render.
 */
export const LAUNCH = { label: 'LAUNCH DAY', date: '14.11' };

const K = clock(120);
const b = K.b;
const T = {
  handIn: 0.5, grab: 1.25, unzip0: 1.35, unzip1: 2.55,
  peel0: 2.6, peel1: 3.15,
  newIn: 2.95, land: 3.45, zip0: 3.55, zip1: 4.75, release: 4.85,
  snap: b(10),
  pull0: b(10), pull1: b(12.5),
  text0: b(12.6), text1: b(13.5), textOut: 7.85,
  turn0: b(16), turn1: b(18),
  wipe: b(19), end: 14.5,
};
const CARD_AT = T.wipe + SIG_WIPE * 0.7;

const FIRST = 'flame', SECOND = 'wave';
/** The back keeps changing on the beat once the second Stimpie is on. */
const SWAPS = [{ t: b(12), id: 'night' }, { t: b(13), id: 'bloom' }, { t: b(14), id: 'sun' }, { t: b(15), id: 'tag' }];
const SWAP_DUR = 0.34;
/** World colour changes: they burst out of the panel. */
const WORLDS = [{ t: T.snap, col: byId(SECOND).world }, ...SWAPS.map((s) => ({ t: s.t, col: byId(s.id).world }))];

const TRACK = roundRectTrack(0, 0, DOCK.w, DOCK.h, DOCK.r);
const HOODIE = '#161616';

// ---------------------------------------------------------------- camera
function cam(t: number) {
  const close = 2.1 + 0.15 * seg(t, 0, T.snap);
  const p = ease.inOutCubic(seg(t, T.pull0, T.pull1));
  const s = lerp(close, 0.86, p) * (1 + 0.035 * pulse(t - T.snap, 7));
  const px = W / 2, py = lerp(905, 880, p);
  return { s, x: px, y: py - (DOCK.y - 500) * s, p };
}

// ---------------------------------------------------------------- the panels
interface PanelState { opts: PanelOpts; id: string }

/** The panel that stays on the hoodie (FLAME until it is peeled off, then WAVE). */
function onPanel(t: number): PanelState | null {
  if (t < T.peel0) {
    const zip = t < T.unzip0 ? 1 : 1 - ease.inOutQuad(seg(t, T.unzip0, T.unzip1));
    return { id: FIRST, opts: { art: art(FIRST, t), zip, parked: zip >= 1 } };
  }
  if (t < T.newIn) return null;
  const id = SECOND;
  const fly = seg(t, T.newIn, T.land);
  const landAge = t - T.land;
  if (t < T.land) {
    const e = ease.outCubic(fly);
    return { id, opts: { art: art(id, t), zip: 0, dx: lerp(1250, 0, e), dy: lerp(-160, 0, e), rot: lerp(0.45, 0, e), lift: 1 - e * 0.85 } };
  }
  const squash = 1 - 0.06 * wobble(landAge, 5, 8);
  const zip = ease.inOutQuad(seg(t, T.zip0, T.zip1));
  const o: PanelOpts = { art: art(id, t), zip, lift: Math.max(0, 0.15 - landAge * 2), rot: 0.03 * wobble(landAge, 4, 7), scale: squash * (1 + 0.07 * pulse(t - T.snap, 9)), parked: zip >= 1 };
  // the swaps on the beat: a zip wipe across the panel itself
  let cur = id;
  for (const s of SWAPS) {
    const w0 = s.t - SWAP_DUR * 0.62;
    if (t >= w0 && t < w0 + SWAP_DUR) { o.art = art(cur, t); o.wipe = (t - w0) / SWAP_DUR; o.wipeTo = art(s.id, t); o.scale = (o.scale ?? 1) * (1 + 0.05 * Math.sin(Math.PI * o.wipe)); return { id: s.id, opts: o }; }
    if (t >= w0 + SWAP_DUR) cur = s.id;
  }
  o.art = art(cur, t);
  const last = [...SWAPS].reverse().find((s) => t >= s.t);
  if (last) o.scale = (o.scale ?? 1) * (1 + 0.05 * pulse(t - last.t, 10));
  return { id: cur, opts: o };
}

/** FLAME, peeled off and thrown out of frame. */
function offPanel(t: number): PanelOpts | null {
  if (t < T.peel0 || t > T.peel1 + 0.3) return null;
  const lift = ease.outCubic(seg(t, T.peel0, T.peel0 + 0.22));
  const f = ease.inCubic(seg(t, T.peel0 + 0.12, T.peel1));
  return { art: art(FIRST, t), zip: 0, lift, dx: -1350 * f, dy: 60 * f - 30 * lift, rot: -0.6 * f };
}

/** Screen position of a panel-local point (panel centre = 0, 0) for a panel drawn on hoodie `h`. */
function panelPoint(h: HoodieOpts, o: PanelOpts, lx: number, ly: number): [number, number] {
  const lift = o.lift ?? 0;
  const sc = (o.scale ?? 1) * (1 + lift * 0.18);
  const r = o.rot ?? 0, cr = Math.cos(r), sr = Math.sin(r);
  const x = (lx * cr - ly * sr) * sc, y = (lx * sr + ly * cr) * sc;
  return hoodiePoint(h, DOCK.x + (o.dx ?? 0) + x, DOCK.y + (o.dy ?? 0) - lift * 40 + y);
}
/** Where a hand pinches the coral pull at zip position z (0..1 round the edge). */
function pullPoint(z: number): [number, number] {
  const p = TRACK.at(z * TRACK.len);
  return [p.x - p.tx * 21, p.y - p.ty * 21];
}

const ARM_A: [number, number] = [-700, 2700]; // the unzipping hand reaches in from the bottom left
const ARM_B: [number, number] = [1800, 2600]; // the zipping hand from the bottom right

function hands(c: Ctx, t: number, h: HoodieOpts, on: PanelState | null, off: PanelOpts | null) {
  const hs = h.s * 0.56;
  // hand A: reach, grab, unzip, peel, throw
  if (t >= T.handIn && t < T.peel1 + 0.3) {
    let p: [number, number];
    if (t < T.peel0 && on) {
      const z = on.opts.zip ?? 1;
      const [lx, ly] = pullPoint(z);
      const target = panelPoint(h, on.opts, lx, ly);
      const e = ease.outCubic(seg(t, T.handIn, T.grab));
      p = [lerp(target[0] + (ARM_A[0] - target[0]) * 0.55, target[0], e), lerp(target[1] + (ARM_A[1] - target[1]) * 0.55, target[1], e)];
    } else {
      p = panelPoint(h, off!, 0, DOCK.h / 2 + 10);
    }
    hand(c, p[0], p[1], ARM_A, hs, ease.outCubic(seg(t, T.grab - 0.08, T.grab + 0.04)));
  }
  // hand B: bring the new one in, zip it on, let go
  if (t >= T.newIn && t < T.release + 0.6 && on) {
    let p: [number, number];
    if (t < T.zip0) p = panelPoint(h, on.opts, 0, DOCK.h / 2 + 10);
    else {
      const [lx, ly] = pullPoint(Math.min(on.opts.zip ?? 1, 0.9999));
      p = panelPoint(h, on.opts, lx, ly);
    }
    const out = ease.inCubic(seg(t, T.release, T.release + 0.55));
    p = [lerp(p[0], ARM_B[0], out * 0.6), lerp(p[1], ARM_B[1], out * 0.6)];
    hand(c, p[0], p[1], ARM_B, hs, 1 - seg(t, T.release - 0.05, T.release + 0.05));
  }
}

// ---------------------------------------------------------------- the world
function worldAt(t: number) {
  let from: string = byId(FIRST).world, to = from, at = -Infinity;
  for (const w of WORLDS) if (t >= w.t) { from = to; to = w.col; at = w.t; }
  return { from, to, at, p: ease.outCubic(seg(t, at, at + 0.5)) };
}

function world(c: Ctx, t: number, origin: [number, number]) {
  const w = worldAt(t);
  fill(c, w.from);
  if (w.p > 0 && w.p < 1) {
    c.save();
    c.fillStyle = w.to;
    c.beginPath(); c.arc(origin[0], origin[1], w.p * 2400, 0, TAU); c.fill();
    // a white shock ring at the edge of the burst
    c.strokeStyle = rgba(C.white, 0.6 * (1 - w.p));
    c.lineWidth = 40 * (1 - w.p);
    c.stroke();
    c.restore();
  } else if (w.p >= 1) fill(c, w.to);
  return w.p >= 1 || w.p > 0.5 ? w.to : w.from;
}

function scene(c: Ctx, t: number, post: Post | null) {
  const k = cam(t);
  const turn = ease.inOutCubic(seg(t, T.turn0, T.turn1));
  const hop = Math.sin(Math.PI * turn) * 40;
  const h: HoodieOpts = { x: k.x, y: k.y - hop, s: k.s, color: HOODIE, figure: true, shadow: k.p * 0.7, shadowY: 900 + hop / k.s, turn, lining: C.coral, pants: '#26262b' };
  const on = onPanel(t);
  const off = offPanel(t);
  const centre = hoodiePoint(h, DOCK.x, DOCK.y);
  const bg = world(c, t, centre);
  // a soft light behind the figure, in the colour of the back
  const gl = on ? byId(on.id).glow : byId(FIRST).glow;
  glow(c, centre[0], centre[1], 900 * Math.max(0.8, k.s * 0.6), gl[1] ?? C.cream, 0.18);
  glow(c, centre[0], centre[1], 520 * Math.max(0.8, k.s * 0.5), C.white, 0.12 + 0.25 * pulse(t - T.snap, 3));
  drawHoodie(c, { ...h, panel: on ? on.opts : null });
  // the outgoing Stimpie flies over everything
  if (off) {
    c.save();
    c.translate(h.x, h.y); c.scale(h.s, h.s); c.translate(-500, -500);
    drawPanel(c, off, tones(HOODIE));
    c.restore();
  }
  hands(c, t, h, on, off);
  // the words
  const fg = ink(bg);
  const y1 = SAFE.top + 40, y2 = SAFE.top + 132;
  const o = { size: 92, weight: 700, color: fg, align: 'center' as const, stagger: 0.09, dur: 0.55 };
  if (t < T.textOut) {
    kinetic(c, 'One hoodie.', W / 2, y1, t - T.text0, o);
    kinetic(c, 'Multiple identities.', W / 2, y2, t - T.text1, { ...o, size: 78 });
  } else {
    kineticOut(c, 'One hoodie.', W / 2, y1, seg(t, T.textOut, T.textOut + 0.3), o);
    kineticOut(c, 'Multiple identities.', W / 2, y2, seg(t, T.textOut + 0.06, T.textOut + 0.36), { ...o, size: 78 });
  }
  if (post) {
    post.vignette = 0.22;
    post.fade = 1 - ease.outCubic(seg(t, 0.1, 0.7));
    const hits = [T.snap, ...SWAPS.map((s) => s.t), T.turn1];
    const last = [...hits].reverse().find((x) => t >= x) ?? -9;
    const big = last === T.snap || last === T.turn1;
    post.flash = (big ? 0.12 : 0.06) * pulse(t - last, big ? 7 : 12);
    post.flashColor = C.white;
    post.ca = (big ? 1.6 : 0.8) * pulse(t - last, 9);
    post.shakeX = (big ? 10 : 0) * wobble(t - last, 11, 10);
  }
}

// ---------------------------------------------------------------- the end card
const DOTS = (() => {
  const r = mulberry(606);
  const cols = [C.cream, C.butter, C.sky, C.lilac, C.white, C.black];
  return Array.from({ length: 34 }, (_, i) => ({ x: r() * W, y: r() * H, sz: 6 + r() * 16, vy: -(20 + r() * 50), col: cols[i % cols.length]!, ph: r() * TAU }));
})();

function card(c: Ctx, t: number) {
  fill(c, C.coral);
  const age = t - CARD_AT;
  glow(c, W / 2, 1060, 950, C.cream, 0.32 + 0.2 * pulse(age, 2));
  // drifting brand-colour motes
  for (const d of DOTS) {
    const y = ((d.y + d.vy * Math.max(0, age)) % H + H) % H;
    c.globalAlpha = 0.35 * clamp(age * 2);
    c.fillStyle = d.col;
    c.beginPath(); c.arc(d.x + Math.sin(age + d.ph) * 14, y, d.sz / 2, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  drawLockup(c, W / 2, 640, 112, LOGO.main, { word: { reveal: seg(age, 0.05, 0.75) }, icon: { split: 0.4 * (1 - ease.outExpo(seg(age, 0, 0.6))) } });
  const la = ease.outCubic(seg(age, 0.35, 0.8));
  text(c, LAUNCH.label, W / 2, 900 + (1 - la) * 20, { size: 40, weight: 600, color: C.black, align: 'center', track: 0.32, alpha: la });
  const s = 1 + 0.05 * pulse(age - 0.5, 6);
  c.save();
  c.translate(W / 2, 1080); c.scale(s, s); c.translate(-W / 2, -1080);
  kinetic(c, LAUNCH.date, W / 2, 1150, age - 0.5, { size: 250, weight: 800, color: C.black, align: 'center', dur: 0.55 });
  c.restore();
  const pa = ease.outBack(seg(age, 1.0, 1.4));
  if (pa > 0) {
    c.save();
    c.translate(W / 2, 1300); c.scale(pa, pa); c.translate(-W / 2, -1300);
    pill(c, 'Set a reminder', W / 2, 1300, { size: 42, bg: C.blue, color: C.white });
    c.restore();
  }
}

export function makeReveal(): Film {
  return {
    id: 'reveal', title: '06 · The Reveal', duration: T.end,
    marks: [
      { t: 0, label: 'close' }, { t: T.handIn, label: 'hand' }, { t: T.unzip0, label: 'unzip' }, { t: T.peel0, label: 'peel' },
      { t: T.newIn, label: 'new one' }, { t: T.zip0, label: 'zip on' }, { t: T.snap, label: 'SNAP' }, { t: SWAPS[0]!.t, label: 'swaps' },
      { t: T.turn0, label: 'turn' }, { t: T.wipe, label: 'zip' }, { t: CARD_AT, label: 'date' },
    ],
    draw(c, t, post) {
      if (t < T.wipe) { scene(c, t, post); return; }
      zipWipe(c, (t - T.wipe) / SIG_WIPE, (k) => scene(k, t, null), (k) => card(k, t), { dir: 'down', teeth: C.white, tape: C.black, tab: C.coral, scale: 1.4 });
      post.vignette = 0.16;
      if (t > CARD_AT) { post.flash = 0.3 * pulse(t - CARD_AT, 8); post.flashColor = C.cream; post.ca = 1 * pulse(t - CARD_AT, 9); }
    },
    score() {
      const S = new Score(T.end, { delayTime: K.beat * 0.75 });
      // tension: a low heartbeat under the close-up
      S.pad(0.2, chord('D2', 'A2', 'E3'), T.snap - 0.2, 0.32, { attack: 1.5, release: 0.2, cutoff: 650 });
      S.sub(0.3, n('D1'), T.snap - 0.3, 0.4);
      for (let q = 1; q < 10; q++) { S.kick(b(q), 0.35 + q * 0.03, { duck: 0.2, tone: 0.8 }); if (q >= 5) S.hat(b(q + 0.5), 0.25); }
      // hand A
      S.whoosh(T.handIn, T.grab - T.handIn, 0.35, { from: 250, to: 1400, panFrom: -0.5, panTo: 0 });
      S.snap(T.grab, 0.45, -0.1);
      S.zip(T.unzip0, T.unzip1, (u) => ease.inOutQuad(u), 86, 1.0, { stop: false, bright: 0.95 });
      S.whoosh(T.peel0, T.peel1 - T.peel0 + 0.1, 0.9, { from: 400, to: 3200, panFrom: 0, panTo: -0.9 });
      // hand B
      S.whoosh(T.newIn, T.land - T.newIn, 0.8, { from: 300, to: 2600, panFrom: 0.9, panTo: 0 });
      S.thud(T.land, 0.9, 1.2);
      S.zip(T.zip0, T.zip1, (u) => ease.inOutQuad(u), 86, 1.0, { stop: true, bright: 1 });
      S.riser(T.zip0, T.snap, 0.8);
      // SNAP: the drop
      S.snap(T.snap, 1.3);
      S.boom(T.snap, 0.9);
      S.sparkle(T.snap + 0.02, 0.6, 0.8, n('D6'));
      const prog = [chord('D4', 'F#4', 'A4', 'C#5'), chord('B3', 'D4', 'F#4', 'A4'), chord('G3', 'B3', 'D4', 'F#4'), chord('A3', 'C#4', 'E4', 'G4')];
      const roots = [n('D2'), n('B1'), n('G1'), n('A1')];
      for (let q = 10; q < 19; q++) {
        const tq = b(q), bar = Math.floor((q - 10) / 2) % 4;
        S.kick(tq, 1);
        S.hat(tq + K.beat / 2, 0.55, q % 4 === 3);
        if (q % 2) S.clap(tq, 0.65);
        S.bass(tq, roots[bar]!, K.beat * 0.45, 0.85);
        S.bass(tq + K.beat / 2, roots[bar]! + 12, K.beat * 0.3, 0.6);
        if (q % 2 === 0) S.stab(tq, prog[bar]!, 0.3, 0.75);
        S.pluck(tq + K.beat * 0.75, prog[bar]![q % 4]! + 12, 0.15, 0.32, { pan: q % 2 ? 0.4 : -0.4 });
      }
      // every swap: a quick zip and a bell on the beat
      SWAPS.forEach((s, i) => {
        const w0 = s.t - SWAP_DUR * 0.62;
        S.zip(w0 + SWAP_DUR * 0.08, w0 + SWAP_DUR * 0.62, (u) => ease.inOutCubic(u), 22, 0.6, { stop: true, bright: 1.15 });
        S.bell(s.t + 0.01, [n('A5'), n('F#5'), n('D6'), n('E6')][i]!, 0.45, { bus: 'sfx', decay: 1 });
      });
      // the turn
      S.lowpass(T.turn0, 1100, 0.6);
      S.whoosh(T.turn0, T.turn1 - T.turn0, 0.9, { from: 250, to: 2200, panFrom: -0.6, panTo: 0.6 });
      S.riser(T.turn0, T.turn1, 0.6);
      S.lowpass(T.turn1, 20000, 0.05);
      S.boom(T.turn1, 0.7);
      S.stab(T.turn1, chord('D4', 'F#4', 'A4', 'C#5', 'E5'), 0.5, 1);
      S.swell(T.wipe, 0.5, 0.5);
      // the signature zip into the date
      S.gate(T.wipe, 0.3, 0.1);
      S.signatureZip(wipeTravelStart(T.wipe, SIG_WIPE), 1.1);
      S.gate(CARD_AT, 1, 0.02);
      S.boom(CARD_AT, 0.5);
      S.bell(CARD_AT + 0.02, n('D5'), 0.7, { bus: 'sfx', decay: 2.4, verb: 0.6 });
      S.bell(CARD_AT + 0.02, n('A5'), 0.4, { bus: 'sfx', decay: 2.4, verb: 0.6 });
      S.pad(CARD_AT, chord('D3', 'A3', 'F#4', 'C#5'), T.end - CARD_AT - 0.7, 0.5, { attack: 0.1, release: 0.6 });
      S.sub(CARD_AT, n('D1'), T.end - CARD_AT - 0.5, 0.55);
      // a light groove under the date
      for (let q = 0; CARD_AT + q * K.beat < T.end - 0.8; q++) {
        const tq = CARD_AT + q * K.beat;
        S.kick(tq, 0.6, { duck: 0.3 });
        S.hat(tq + K.beat / 2, 0.4);
        S.pluck(tq + K.beat * 0.5, chord('D5', 'F#5', 'A5', 'C#6')[q % 4]!, 0.15, 0.25, { pan: q % 2 ? 0.35 : -0.35 });
      }
      S.bell(T.end - 0.75, n('D6'), 0.3, { bus: 'sfx', decay: 1.5 });
      return S;
    },
  };
}
