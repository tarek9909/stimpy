// 7 · COUNTDOWN (6 s per day, story format; launch day 8 s). One reusable template: the number itself
// changes identity each day, the way a hoodie does with a Stimpie.
//
// Each day:   the hoodie from behind → a Stimpie flies in, lands and zips on around its edge → the design
//             reveals that day's number (a different art style every day) → "Days left."
// Tomorrow:   the Stimpie reads "Tomorrow."
// Launch day: the hoodie turns to face you, a huge zipper runs down the screen and unzips to "Live now"
//             on electric blue, with room for the link sticker.
import { C, ink, rgba } from '../engine/brand';
import { drawLockup, drawIcon, LOGO, type LogoColors } from '../engine/logo';
import { drawHoodie, DOCK, type Art } from '../engine/hoodie';
import { text, type Ctx } from '../engine/draw';
import { zipWipe, closedTeeth, drawPull, Track } from '../engine/zipper';
import { art, DESIGNS, artStill } from '../art/designs';
import { FIVE, FOUR, THREE, TWO, ONE, TOMORROW, type NumberArt } from '../art/numbers';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, H, SAFE, fill, glow, kinetic, SIG_WIPE, wipeTravelStart } from './common';
import { ease, seg, clamp, pulse, mulberry, clock, spring, lerp, TAU, wobble } from '../engine/util';

const K = clock(120);
const b = K.b;

interface Day { id: string; label: string; n: number | null; bg: string; hoodie: string; art: NumberArt; panel: string; line: string; root: string; chord: string[] }
export const DAYS: Day[] = [
  { id: 'd5', label: '5 days', n: 5, bg: C.black, hoodie: C.cream, art: FIVE, panel: C.butter, line: 'Days left.', root: 'A', chord: ['A3', 'C4', 'E4', 'G4'] },
  { id: 'd4', label: '4 days', n: 4, bg: C.coral, hoodie: C.black, art: FOUR, panel: C.sky, line: 'Days left.', root: 'F', chord: ['F3', 'A3', 'C4', 'E4'] },
  { id: 'd3', label: '3 days', n: 3, bg: C.butter, hoodie: C.black, art: THREE, panel: C.lilac, line: 'Days left.', root: 'C', chord: ['C4', 'E4', 'G4', 'B4'] },
  { id: 'd2', label: '2 days', n: 2, bg: C.sky, hoodie: C.black, art: TWO, panel: C.coral, line: 'Days left.', root: 'G', chord: ['G3', 'B3', 'D4', 'F#4'] },
  { id: 'd1', label: '1 day', n: 1, bg: C.lilac, hoodie: C.black, art: ONE, panel: C.blue, line: 'Day left.', root: 'E', chord: ['E3', 'G#3', 'B3', 'D4'] },
  { id: 'tomorrow', label: 'Tomorrow', n: null, bg: C.cream, hoodie: C.black, art: TOMORROW, panel: C.cream, line: 'Be ready.', root: 'D', chord: ['D4', 'G4', 'A4', 'E5'] },
];

const HX = 540, HY = 920, HS = 0.86;
const TD = { fly: 0.4, land: b(3), zip1: b(5), reveal: b(5), line: b(5.5), push: b(5.8), end: 6 };

function logoFor(bg: string): LogoColors {
  if (bg === C.coral) return LOGO.main;
  if (bg === C.black) return LOGO.onBlack;
  if (bg === C.blue) return { ...LOGO.onBlack, outline: C.butter };
  return LOGO.onWhite;
}

/** The days track: 5 · 4 · 3 · 2 · 1 · ★, coloured by each day's Stimpie. */
function track(c: Ctx, cur: number, bg: string, t: number, y = SAFE.top + 92) {
  const fg = ink(bg);
  const items = DAYS;
  const gap = 78, x0 = W / 2 - ((items.length - 1) * gap) / 2;
  items.forEach((d, i) => {
    const x = x0 + i * gap;
    const done = i < cur, now = i === cur;
    // every day keeps its colour (the whole drop palette is always on screen); today is bigger and ringed
    const r = now ? 27 + 3 * pulse(t - TD.reveal, 8) : 19;
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.fillStyle = d.panel; c.fill();
    if (d.panel === bg) { c.lineWidth = 3; c.strokeStyle = rgba(fg, 0.5); c.stroke(); }
    if (now) { c.beginPath(); c.arc(x, y, r + 8, 0, TAU); c.lineWidth = 4; c.strokeStyle = fg; c.stroke(); }
    const label = d.n === null ? '★' : String(d.n);
    const col = ink(d.panel);
    c.save();
    c.globalAlpha = done || now ? 1 : 0.55;
    text(c, label, x, y + (now ? 10 : 8), { size: now ? 28 : 22, weight: 700, color: col, align: 'center' });
    c.restore();
    if (done) { c.strokeStyle = col; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 13, y + 13); c.lineTo(x + 13, y - 13); c.stroke(); }
  });
}

function dayScene(c: Ctx, d: Day, idx: number, t: number, post: Post | null) {
  fill(c, d.bg);
  // soft spotlight behind the hoodie
  glow(c, HX, HY, 760, d.panel, 0.25 + 0.15 * pulse(t - TD.reveal, 3));
  drawLockup(c, W / 2, SAFE.top - 6, 44, logoFor(d.bg), { word: { reveal: seg(t, 0.05, 0.7) } });
  track(c, idx, d.bg, t);
  // the push-in onto the panel after the reveal
  const push = ease.inOutCubic(seg(t, TD.push, TD.end + 0.4));
  const zoom = 1 + 0.2 * push;
  const [px, py] = [HX, HY + (DOCK.y - 500) * HS];
  c.save();
  c.translate(px, py); c.scale(zoom, zoom); c.translate(-px, -py - 40 * push);
  // the Stimpie's flight
  const fall = seg(t, TD.fly, TD.land);
  const landAge = t - TD.land;
  const dy = t < TD.land ? lerp(-1500, 0, ease.inQuad(fall)) : 0;
  const rot = t < TD.land ? lerp(0.55, 0, ease.outCubic(fall)) : 0.04 * wobble(landAge, 4, 7);
  const lift = t < TD.land ? 1 - fall * 0.6 : Math.max(0, 0.4 - landAge * 4);
  const zip = ease.inOutQuad(seg(t, TD.land + 0.06, TD.zip1));
  const revealAge = t - TD.reveal;
  const panelArt: Art = (k, w, h) => d.art(k, w, h, revealAge);
  const squash = t >= TD.land ? 1 - 0.07 * wobble(landAge, 5, 8) : 1;
  drawHoodie(c, {
    x: HX, y: HY, s: HS, color: d.hoodie, shadow: 0.8, shadowY: 420,
    sy: 1 - 0.02 * pulse(landAge, 10), sx: 1 + 0.02 * pulse(landAge, 10),
    panel: t < TD.fly ? null : { art: panelArt, zip, lift, dy, rot, scale: (1 + 0.06 * pulse(revealAge, 9)) * squash, parked: true },
  });
  c.restore();
  // the line underneath
  kinetic(c, d.line, W / 2, SAFE.bottom - 40, t - TD.line, { size: 104, weight: 700, color: ink(d.bg), align: 'center', stagger: 0.1, dur: 0.6 });
  if (post) {
    post.flash = (d.bg === C.black ? 0.12 : 0.28) * pulse(revealAge, 10);
    post.flashColor = d.bg === C.black ? d.panel : C.white;
    post.ca = 0.9 * pulse(revealAge, 12);
    post.vignette = d.bg === C.black ? 0.3 : 0.14;
  }
}

// ---------------------------------------------------------------- launch day
const TL = { turn0: b(1.2), turn1: b(3.2), line0: b(3.6), line1: b(4.4), wipe: b(4.5), end: 8 };
const LIVE_AT = TL.wipe + SIG_WIPE * 0.62;

function launchFront(c: Ctx, t: number) {
  fill(c, C.black);
  glow(c, HX, HY, 800, C.coral, 0.22);
  drawLockup(c, W / 2, SAFE.top - 6, 44, LOGO.onBlack);
  track(c, DAYS.length, C.black, t);
  const turn = ease.inOutCubic(seg(t, TL.turn0, TL.turn1));
  const hop = Math.sin(Math.PI * turn) * 30;
  drawHoodie(c, {
    x: HX, y: HY - hop, s: HS, color: C.cream, turn, shadow: 0.6, shadowY: 420 + hop / HS,
    panel: { art: art('orbit', t), zip: 1, parked: true }, lining: C.coral,
  });
  kinetic(c, 'Launch day.', W / 2, SAFE.bottom - 40, t - 0.25, { size: 104, weight: 700, color: C.white, align: 'center', stagger: 0.1 });
  // the huge zipper runs down the screen before it opens
  const L = ease.inOutCubic(seg(t, TL.line0, TL.line1));
  if (L > 0) {
    const tr = new Track([[W / 2, 0], [W / 2, H]]);
    closedTeeth(c, tr, 0, L * H, { pitch: 22 * 2.2, size: 16 * 2.2, color: C.white, tape: C.black, tapeW: 30 * 2.2, shade: rgba(C.black, 0.4) });
    drawPull(c, W / 2, -0.04 * H + (1 - L) * 0, Math.PI / 2, 46 * 2.2, { tab: C.coral }, 0);
  }
}

// confetti: brand-coloured shapes and tiny Stimpies
interface Bit { x: number; y: number; vx: number; vy: number; rot: number; vr: number; kind: number; color: string; size: number; design: string; delay: number }
const BITS: Bit[] = (() => {
  const r = mulberry(77);
  const cols = [C.coral, C.butter, C.sky, C.lilac, C.cream, C.white, C.black];
  return Array.from({ length: 70 }, (_, i) => ({
    x: W / 2 + (r() - 0.5) * 300, y: H + 60, vx: (r() - 0.5) * 1400, vy: -(1500 + r() * 1300), rot: r() * TAU, vr: (r() - 0.5) * 10,
    kind: i % 7 === 0 ? 3 : Math.floor(r() * 3), color: cols[i % cols.length]!, size: 16 + r() * 22, design: DESIGNS[i % DESIGNS.length]!.id, delay: r() * 0.35,
  }));
})();

function live(c: Ctx, t: number) {
  fill(c, C.blue);
  const age = t - LIVE_AT;
  glow(c, W / 2, 800, 900, C.sky, 0.35 * pulse(age, 1.5) + 0.1);
  // confetti
  for (const q of BITS) {
    const a = age - q.delay;
    if (a < 0) continue;
    const g = 2600;
    const x = q.x + q.vx * a * Math.exp(-a * 0.3), y = q.y + q.vy * a + 0.5 * g * a * a;
    if (y > H + 200) continue;
    c.save();
    c.translate(x, y); c.rotate(q.rot + q.vr * a);
    c.fillStyle = q.color;
    if (q.kind === 0) { c.beginPath(); c.arc(0, 0, q.size * 0.5, 0, TAU); c.fill(); }
    else if (q.kind === 1) { c.fillRect(-q.size * 0.6, -q.size * 0.2, q.size * 1.2, q.size * 0.4); }
    else if (q.kind === 2) { c.lineWidth = 6; c.strokeStyle = q.color; c.lineCap = 'round'; c.beginPath(); c.moveTo(-q.size, 0); c.quadraticCurveTo(-q.size / 2, -q.size, 0, 0); c.quadraticCurveTo(q.size / 2, q.size, q.size, 0); c.stroke(); }
    else { c.scale(0.22, 0.22); c.translate(-150, -182); artStill(q.design)(c, 300, 364); }
    c.restore();
  }
  // the words
  const s = 1 + 0.06 * pulse(age, 6);
  c.save();
  c.translate(W / 2, 830); c.scale(s, s); c.translate(-W / 2, -830);
  kinetic(c, 'Live', W / 2, 760, age - 0.02, { size: 230, weight: 800, color: C.white, align: 'center', dur: 0.5 });
  kinetic(c, 'now.', W / 2, 960, age - 0.14, { size: 230, weight: 800, color: C.white, align: 'center', dur: 0.5 });
  c.restore();
  // pointing at the link sticker (placed in Instagram)
  const ar = ease.outBack(seg(age, 0.6, 1.0));
  if (ar > 0) {
    const y = 1110 + Math.sin(age * 6) * 10;
    c.save();
    c.globalAlpha = clamp(ar);
    text(c, 'Tap the link', W / 2, y, { size: 40, weight: 600, color: C.white, align: 'center' });
    c.strokeStyle = C.butter; c.lineWidth = 8; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(W / 2, y + 26); c.lineTo(W / 2, y + 86); c.moveTo(W / 2 - 22, y + 64); c.lineTo(W / 2, y + 88); c.lineTo(W / 2 + 22, y + 64); c.stroke();
    c.restore();
  }
  drawIcon(c, W / 2, SAFE.bottom - 20, 70, { solid: C.white, outline: C.butter, word: C.white }, { alpha: clamp(age * 2) });
}

export function makeCountdown(v: string): Film {
  if (v === 'launch') return makeLaunch();
  const idx = Math.max(0, DAYS.findIndex((d) => d.id === v));
  const d = DAYS[idx]!;
  return {
    id: 'countdown', title: `07 · Countdown — ${d.label}`, duration: TD.end,
    marks: [{ t: 0, label: 'hoodie' }, { t: TD.fly, label: 'stimpie in' }, { t: TD.land, label: 'zip on' }, { t: TD.reveal, label: 'reveal' }, { t: TD.push, label: 'push in' }],
    draw(c, t, post) { dayScene(c, d, idx, t, post); },
    score() {
      const S = new Score(TD.end, { delayTime: K.beat * 0.75 });
      const root = n(`${d.root}1`);
      const ch = d.chord.map(n);
      // clock: tick… tock…
      for (let q = 0; q < 12; q++) S.clockTick(b(q), q < 5 ? 0.8 : 0.5, q % 2 === 0);
      S.sub(0, root, TD.reveal, 0.45);
      S.pad(0, ch, TD.reveal, 0.3, { attack: 1.2, cutoff: 800 });
      // the Stimpie arrives and zips on
      S.whoosh(TD.fly, TD.land - TD.fly, 0.8, { from: 300, to: 2400, panFrom: 0, panTo: 0 });
      S.thud(TD.land, 1, 1.1);
      S.zip(TD.land + 0.06, TD.zip1, (u) => ease.inOutQuad(u), 70, 0.9, { stop: true });
      // reveal
      S.kick(TD.reveal, 1.1);
      S.clap(TD.reveal, 0.6);
      S.stab(TD.reveal, ch.map((x) => x + 12), 0.5, 1);
      S.bass(TD.reveal, root + 12, 0.6, 0.9);
      S.bell(TD.reveal + 0.01, ch[3]! + 24, 0.7, { bus: 'sfx' });
      S.sparkle(TD.reveal + 0.05, 0.4, 0.5, ch[0]! + 36);
      for (let q = 6; q < 12; q++) {
        S.kick(b(q), 0.85);
        S.hat(b(q + 0.5), 0.5);
        if (q % 2) S.clap(b(q), 0.4);
        S.bass(b(q), root + (q % 4 === 3 ? 19 : 12), K.beat * 0.45, 0.7);
        S.pluck(b(q + 0.5), ch[q % 4]! + 12, 0.18, 0.35, { pan: q % 2 ? 0.3 : -0.3 });
      }
      S.swell(TD.end, 0.6, 0.4);
      return S;
    },
  };
}

function makeLaunch(): Film {
  return {
    id: 'countdown', title: '07 · Countdown — Launch day', duration: TL.end,
    marks: [{ t: 0, label: 'launch day' }, { t: TL.turn0, label: 'turn' }, { t: TL.line0, label: 'huge zipper' }, { t: TL.wipe, label: 'unzip' }, { t: LIVE_AT, label: 'live now' }],
    draw(c, t, post) {
      post.vignette = 0.2;
      if (t < TL.wipe) { launchFront(c, t); return; }
      zipWipe(c, (t - TL.wipe) / SIG_WIPE, (k) => launchFront(k, t), (k) => live(k, t), { dir: 'down', scale: 2.2, teeth: C.white, tape: C.black, drawn: true });
      if (t > LIVE_AT) { post.flash = 0.4 * pulse(t - LIVE_AT, 7); post.flashColor = C.white; post.ca = 1.2 * pulse(t - LIVE_AT, 8); }
    },
    score() {
      const S = new Score(TL.end, { delayTime: K.beat * 0.75 });
      for (let q = 0; q < 9; q++) S.clockTick(b(q), 0.7, q % 2 === 0);
      S.pad(0, chord('D3', 'A3', 'E4'), TL.wipe, 0.35, { attack: 1, cutoff: 900 });
      S.sub(0, n('D1'), TL.wipe, 0.5);
      S.whoosh(TL.turn0, TL.turn1 - TL.turn0, 0.9, { from: 250, to: 1800, panFrom: -0.5, panTo: 0.5 });
      // the zipper line running down
      S.zip(TL.line0, TL.line1, (u) => ease.inOutCubic(u), 40, 0.35, { stop: false, bright: 0.7 });
      S.riser(TL.line0, LIVE_AT, 0.7);
      S.signatureZip(wipeTravelStart(TL.wipe, SIG_WIPE), 1.1);
      // live now
      S.boom(LIVE_AT, 0.8);
      S.sparkle(LIVE_AT, 0.8, 1, n('D6'));
      const prog = [chord('D4', 'F#4', 'A4', 'C#5'), chord('B3', 'D4', 'F#4', 'A4'), chord('G3', 'B3', 'D4', 'F#4'), chord('A3', 'C#4', 'E4', 'G4')];
      const roots = [n('D2'), n('B1'), n('G1'), n('A1')];
      for (let q = 0; q < 16; q++) {
        const tq = LIVE_AT + q * K.beat;
        if (tq > TL.end - 0.1) break;
        const bar = Math.floor(q / 2) % 4;
        S.kick(tq, 1);
        S.hat(tq + K.beat / 2, 0.6, q % 4 === 3);
        if (q % 2) S.clap(tq, 0.7);
        S.bass(tq, roots[bar]!, K.beat * 0.45, 0.85);
        S.bass(tq + K.beat / 2, roots[bar]! + 12, K.beat * 0.3, 0.6);
        if (q % 2 === 0) S.stab(tq, prog[bar]!, 0.3, 0.8);
        S.pluck(tq + K.beat * 0.75, prog[bar]![q % 4]! + 12, 0.15, 0.35, { pan: q % 2 ? 0.4 : -0.4 });
      }
      return S;
    },
  };
}

export const COUNTDOWN_VARIANTS = [...DAYS.map((d) => ({ id: d.id, label: d.label })), { id: 'launch', label: 'Launch day' }];
