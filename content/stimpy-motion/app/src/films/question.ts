// 2 · THE QUESTION (15 s, 128 BPM). Make the viewer feel the problem before seeing the solution.
//
//  0–2.8     cream. "How many hoodies do you own…" — a single hoodie drops and lands with a soft thud
//  2.8–6.2   "…just because of the back design?" — more hoodies fall, faster and faster, each with a
//            different back; the counter ticks 3… 7… 12… 20
//  6.2–7.5   the pile towers, wobbles and collapses in a heap; the music cuts out
//  8.3–9.4   silence, then the pile is sucked into the centre like a vacuum and collapses into ONE hoodie
//  9.4–11.25 its back flickers through every design from the pile, slowing like a slot machine
//  11.25–13  "What if you only needed one?"
//  13–15     zip wipe to the logo
import { C, TAGLINE } from '../engine/brand';
import { drawLockup, LOGO } from '../engine/logo';
import { drawHoodie } from '../engine/hoodie';
import { text, type Ctx } from '../engine/draw';
import { zipWipe } from '../engine/zipper';
import { DESIGNS, art, artStill, byId } from '../art/designs';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, SAFE, fill, glow, kinetic, kineticOut, SIG_WIPE, wipeTravelStart } from './common';
import { ease, seg, clamp, pulse, lerp, mulberry, clock, spring, lastEvent, TAU } from '../engine/util';

const K = clock(128);
const b = K.b;
const FLOOR = 1650;
const CX = 540, HERO_Y = 1040, HERO_S = 0.8;
const T = {
  textA: 0.25, textAout: b(6) - 0.2, textB: b(6),
  wobble: b(13.25), collapse: b(14.75), cut: b(16), textBout: b(14.75),
  vacuum: b(17.75), merge: b(20),
  flickEnd: b(24), textD: b(24) + 0.05,
  wipe: b(27.6), end: b(32),
};
// landing beats: one, then 19 more accelerating (counter hits 3, 7, 12, 20 along the way)
const LAND_BEATS = [4, 7, 8, 8.75, 9.5, 10, 10.5, 10.875, 11.25, 11.5, 11.75, 12, 12.25, 12.375, 12.5, 12.625, 12.75, 12.875, 13, 13.125];
const LANDS = LAND_BEATS.map(b);
const FALL = 0.42;
const HOODIE_COLORS = [C.black, C.sky, C.coral, C.black, C.lilac, C.blue, C.butter, C.black, C.coral, C.sky, C.lilac, C.black, C.butter, C.blue, C.black, C.coral, C.sky, C.black, C.lilac, C.butter];

interface Item {
  i: number; land: number; s: number; color: string; design: string;
  x: number; y: number; rot: number; hf: number;
  // heap (after the collapse)
  x1: number; y1: number; rot1: number; delay: number; dur: number;
  // vacuum
  vdelay: number; vdir: number;
}

function buildPile(): Item[] {
  const r = mulberry(2026);
  const cols = new Float32Array(120); // 9 px columns of pile height
  const items: Item[] = [];
  LANDS.forEach((land, i) => {
    const s = 0.34 + r() * 0.06;
    const half = 300 * s;
    const x = i === 0 ? CX : clamp(CX + (r() - 0.5) * 2 * (140 + (i % 3) * 30), 210, 870);
    let top = 0;
    for (let k = Math.floor((x - half * 0.75) / 9); k <= Math.ceil((x + half * 0.75) / 9); k++) top = Math.max(top, cols[clamp(k, 0, 119)]!);
    const bottom = FLOOR - top;
    const y = bottom - 372 * s;
    const thick = 0.34 * 816 * s;
    for (let k = Math.floor((x - half) / 9); k <= Math.ceil((x + half) / 9); k++) {
      const kk = clamp(k, 0, 119), dx = (kk * 9 - x) / half;
      cols[kk] = Math.max(cols[kk]!, top + thick * (1 - 0.55 * dx * dx));
    }
    items.push({
      i, land, s, color: HOODIE_COLORS[i]!, design: DESIGNS[i % DESIGNS.length]!.id,
      x, y, rot: (r() - 0.5) * 0.36, hf: 0,
      x1: 0, y1: 0, rot1: 0, delay: 0, dur: 0, vdelay: r() * 0.28, vdir: r() < 0.5 ? -1 : 1,
    });
  });
  const minY = Math.min(...items.map((it) => it.y));
  for (const it of items) {
    it.hf = clamp((FLOOR - it.y) / (FLOOR - minY));
    const side = it.x >= CX ? 1 : -1;
    it.x1 = clamp(it.x + side * (120 + r() * 260) * (0.3 + it.hf) + 140 * it.hf, 110, 970);
    it.y1 = FLOOR - 250 * it.s - r() * 70 * (1 - it.hf);
    it.rot1 = side * (0.5 + r() * 1.3) + (r() - 0.5) * 0.4;
    it.delay = (1 - it.hf) * 0.16;
    it.dur = 0.42 + it.hf * 0.3;
  }
  return items;
}
const PILE = buildPile();

/** Tower sway angle (radians) around its base, before the collapse. */
function sway(t: number) {
  const a = seg(t, T.wobble - 0.3, T.collapse);
  const amp = 0.012 + 0.07 * ease.inQuad(a);
  return (t < T.wobble - 0.3 ? 0 : amp * Math.sin((t - T.wobble) * TAU * 1.7)) + 0.05 * ease.inCubic(a);
}

function itemState(it: Item, t: number): { x: number; y: number; rot: number; s: number; sx: number; sy: number; visible: boolean } | null {
  if (t < it.land - FALL) return null;
  // falling
  if (t < it.land) {
    const u = seg(t, it.land - FALL, it.land);
    return { x: it.x, y: lerp(-420, it.y, u * u), rot: it.rot + (1 - u) * 0.6 * (it.i % 2 ? 1 : -1), s: it.s, sx: 0.94, sy: 1.08, visible: true };
  }
  // landed: squash & settle, bouncing when later ones land on it
  let sq = 0.17 * Math.exp(-(t - it.land) * 9) * Math.cos((t - it.land) * 26);
  for (const L of LANDS) if (L > it.land && t >= L) sq += 0.04 * Math.exp(-(t - L) * 12) * Math.cos((t - L) * 30);
  let x = it.x, y = it.y + sq * 372 * it.s, rot = it.rot;
  // tower sway (bend: higher items move more)
  if (t < T.collapse + it.delay) {
    const a = sway(t) * Math.pow(it.hf, 1.3);
    const dx = x - CX, dy = y - FLOOR;
    x = CX + dx * Math.cos(a) - dy * Math.sin(a);
    y = FLOOR + dx * Math.sin(a) + dy * Math.cos(a);
    rot += a;
    return { x, y, rot, s: it.s, sx: 1 + sq * 0.6, sy: 1 - sq, visible: true };
  }
  // collapse: tumble to the heap
  const cStart = T.collapse + it.delay;
  const a0 = sway(cStart) * Math.pow(it.hf, 1.3);
  const x0 = CX + (it.x - CX) * Math.cos(a0) - (it.y - FLOOR) * Math.sin(a0);
  const y0 = FLOOR + (it.x - CX) * Math.sin(a0) + (it.y - FLOOR) * Math.cos(a0);
  const u = seg(t, cStart, cStart + it.dur);
  let hx = lerp(x0, it.x1, ease.outQuad(u));
  let hy = lerp(y0, it.y1, u * u) - Math.sin(Math.PI * u) * 90 * it.hf;
  let hr = lerp(it.rot + a0, it.rot1, ease.outCubic(u));
  const landAge = t - (cStart + it.dur);
  const bounce = landAge > 0 ? 0.12 * Math.exp(-landAge * 10) * Math.cos(landAge * 30) : 0;
  let s = it.s;
  // vacuum: spiral into the centre
  if (t >= T.vacuum) {
    const v = ease.inCubic(seg(t, T.vacuum + it.vdelay, T.merge));
    const dx = hx - CX, dy = hy - HERO_Y;
    const R = Math.hypot(dx, dy) * (1 - v), A = Math.atan2(dy, dx) + v * 2.6 * it.vdir;
    hx = CX + Math.cos(A) * R; hy = HERO_Y + Math.sin(A) * R;
    hr += v * 7 * it.vdir;
    s *= 1 - 0.75 * v;
    // a little anticipation: everything leans back before the pull
    const ant = seg(t, T.vacuum - 0.25, T.vacuum + 0.05) * (1 - seg(t, T.vacuum + 0.05, T.vacuum + 0.3));
    hx += (hx - CX) * 0.04 * ant; hy += (hy - HERO_Y) * 0.04 * ant;
    if (t >= T.merge) return null;
  }
  return { x: hx, y: hy, rot: hr, s, sx: 1 + bounce, sy: 1 - bounce, visible: true };
}

function counterValue(t: number) { let k = 0; for (const L of LANDS) if (t >= L) k++; return k; }

function counter(c: Ctx, t: number) {
  const n = counterValue(t);
  if (n === 0 || t > T.textD + 0.4) return;
  const hero = t >= T.merge;
  const [, last] = lastEvent(hero ? [T.merge] : LANDS, t);
  const bump = pulse(t - last, 10);
  const inA = ease.outBack(seg(t, LANDS[0]!, LANDS[0]! + 0.35));
  const outA = seg(t, T.vacuum - 0.1, T.vacuum + 0.25) * (1 - seg(t, T.merge, T.merge + 0.3));
  const gone = seg(t, T.textD, T.textD + 0.35);
  const sc = inA * (1 + 0.14 * bump) * (1 - ease.inBack(outA)) * (1 - ease.inBack(gone));
  if (sc <= 0.001) return;
  const x = SAFE.right - 76, y = 640;
  c.save();
  c.translate(x, y);
  c.scale(sc, sc);
  c.rotate(-0.08 + 0.1 * bump * (n % 2 ? 1 : -1));
  c.fillStyle = hero ? C.coral : C.blue;
  c.beginPath(); c.arc(0, 0, 84, 0, TAU); c.fill();
  text(c, String(hero ? 1 : n), 0, 24, { size: n >= 10 && !hero ? 64 : 76, weight: 700, color: hero ? C.black : C.white, align: 'center' });
  text(c, hero ? 'hoodie' : n === 1 ? 'hoodie' : 'hoodies', 0, 58, { size: 20, weight: 600, color: hero ? C.black : C.white, align: 'center' });
  c.restore();
}

// flicker schedule: 26 flicks slowing down, landing on FLAME
const FLICKS = Array.from({ length: 26 }, (_, k) => T.merge + 0.06 + (T.flickEnd - T.merge - 0.06) * Math.pow(k / 25, 1.9));
function heroDesign(t: number): string {
  const [k] = lastEvent(FLICKS, t);
  if (k < 0) return DESIGNS[0]!.id;
  if (k === FLICKS.length - 1) return 'flame';
  return DESIGNS[(k * 5 + 3) % DESIGNS.length]!.id;
}

function headlines(c: Ctx, t: number) {
  // headline A / B
  if (t < T.textB) {
    const out = seg(t, T.textAout, T.textB);
    if (out <= 0) { kinetic(c, 'How many hoodies', X, Y1, t - T.textA, hl); kinetic(c, 'do you own…', X, Y2, t - T.textA - 0.25, hl); }
    else { kineticOut(c, 'How many hoodies', X, Y1, out, hl); kineticOut(c, 'do you own…', X, Y2, out, hl); }
  } else if (t < T.textBout + 0.4) {
    const out = seg(t, T.textBout, T.textBout + 0.3);
    if (out <= 0) { kinetic(c, '…just because of', X, Y1, t - T.textB, hl); kinetic(c, 'the back design?', X, Y2, t - T.textB - 0.2, { ...hl }); }
    else { kineticOut(c, '…just because of', X, Y1, out, hl); kineticOut(c, 'the back design?', X, Y2, out, hl); }
  }
}

const hl = { size: 92, weight: 700, color: C.black, align: 'left' as const, stagger: 0.07, halo: C.cream, haloW: 16 };
const X = SAFE.left, Y1 = SAFE.top + 120, Y2 = Y1 + 106;

function question(c: Ctx, t: number, post: Post | null) {
  fill(c, C.cream);
  // the floor line
  c.fillStyle = 'rgba(17,17,17,0.08)';
  c.fillRect(0, FLOOR + 6, W, 3);
  // the pile
  for (const it of PILE) {
    const st = itemState(it, t);
    if (!st) continue;
    drawHoodie(c, {
      x: st.x, y: st.y, s: st.s, rot: st.rot, sx: st.sx, sy: st.sy, color: it.color,
      panel: { art: artStill(it.design), zip: 0, printed: true },
      shadow: t < T.vacuum ? 0.5 : 0, shadowY: 400,
    });
  }
  // vacuum glow at the centre
  if (t > T.vacuum - 0.2 && t < T.merge + 0.5) {
    const g = seg(t, T.vacuum, T.merge) * (1 - seg(t, T.merge, T.merge + 0.5));
    glow(c, CX, HERO_Y, 520, C.white, 0.9 * g);
    glow(c, CX, HERO_Y, 260, C.butter, 0.35 * g);
  }
  // the one
  if (t >= T.merge) {
    const age = t - T.merge;
    const sp = spring(age, 2.4, 0.32);
    const d = heroDesign(t);
    const settled = t >= FLICKS[FLICKS.length - 1]!;
    const breathe = 1 + 0.008 * Math.sin(age * 2.2);
    drawHoodie(c, {
      x: CX, y: HERO_Y, s: HERO_S * sp * breathe, color: C.black,
      panel: { art: settled ? art(d, t) : artStill(d), zip: 1, parked: true },
      shadow: clamp(sp), shadowY: 420,
    });
    if (post) {
      post.flash = 0.35 * pulse(age, 8);
      post.flashColor = C.white;
      const [k, tk] = lastEvent(FLICKS, t);
      if (k >= 0) post.ca = 0.6 * pulse(t - tk, 25) * (k < FLICKS.length - 1 ? 1 : 2);
    }
  }
  headlines(c, t);
  counter(c, t);
  // headline D
  if (t >= T.textD) {
    kinetic(c, 'What if you only', X, Y1, t - T.textD, hl);
    const w = kinetic(c, 'needed one?', X, Y2, t - T.textD - 0.25, hl);
    // a coral marker swipes under "one?"
    const m = ease.outExpo(seg(t, T.textD + 0.75, T.textD + 1.2));
    if (m > 0) {
      const oneW = 214;
      c.save();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = C.coral;
      c.beginPath(); c.roundRect(X + w - oneW - 6, Y2 + 16, (oneW + 12) * m, 20, 10); c.fill();
      c.restore();
    }
  }
}

function endCard(c: Ctx, t: number) {
  fill(c, C.coral);
  const age = t - (T.wipe + SIG_WIPE * 0.62);
  drawLockup(c, W / 2, 900, 236, LOGO.main, { word: { reveal: clamp(age / 0.7 + 0.35) } });
  kinetic(c, TAGLINE, W / 2, 1110, age - 0.3, { size: 52, weight: 500, color: C.black, align: 'center', stagger: 0.05 });
}

export function makeQuestion(): Film {
  return {
    id: 'question', title: '02 · The Question', duration: T.end,
    marks: [
      { t: 0, label: 'how many…' }, { t: T.textB, label: 'raining hoodies' }, { t: T.wobble, label: 'wobble' }, { t: T.collapse, label: 'collapse' },
      { t: T.vacuum, label: 'vacuum' }, { t: T.merge, label: 'the one' }, { t: T.textD, label: 'only one?' }, { t: T.wipe, label: 'zip → logo' },
    ],
    draw(c, t, post) {
      post.vignette = 0.1;
      if (t < T.wipe) {
        // a subtle camera shake on the collapse
        const sh = pulse(t - T.collapse - 0.35, 5) * 10;
        c.save();
        if (sh > 0.1) c.translate(Math.sin(t * 90) * sh, Math.cos(t * 77) * sh);
        question(c, t, post);
        c.restore();
        return;
      }
      zipWipe(c, (t - T.wipe) / SIG_WIPE, (k) => question(k, t, null), (k) => endCard(k, t), { dir: 'down', teeth: C.white, tape: C.black });
    },
    score() {
      const S = new Score(T.end, { delayTime: K.beat * 0.75 });
      const A = chord('A3', 'C4', 'E4', 'G4'), F = chord('F3', 'A3', 'C4', 'E4'), Cc = chord('C4', 'E4', 'G4', 'B4'), G = chord('G3', 'B3', 'D4', 'F#4');
      const prog = [A, F, Cc, G];
      const roots = [n('A1'), n('F1'), n('C2'), n('G1')];
      // bar 0–1: intro — plucked chords on the offbeats, shaker
      for (let q = 0; q < 6; q++) { S.pluck(b(q + 0.5), prog[Math.floor(q / 4)]![1]! + 12, 0.2, 0.4, { pan: 0.2 }); S.shaker(b(q + 0.5), 0.6); }
      S.pad(0, A, b(6), 0.35, { attack: 0.8, cutoff: 900 });
      // the first hoodie lands
      S.thud(LANDS[0]!, 1, 1);
      // groove from beat 6
      for (let q = 6; q < 16; q++) {
        const bar = Math.floor((q - 6) / 4) % 4;
        S.kick(b(q), q < 8 ? 0.7 : 1);
        if (q % 2 === 1) S.clap(b(q), 0.55);
        S.hat(b(q + 0.5), 0.55);
        if (q >= 10) S.hat(b(q + 0.25), 0.3, false, -0.3);
        S.bass(b(q), roots[bar]!, K.beat * 0.45, 0.8);
        S.bass(b(q + 0.5), roots[bar]! + 12, K.beat * 0.3, 0.55);
        if (q % 4 === 0) S.stab(b(q), prog[bar]!, 0.25, 0.6);
        S.pluck(b(q + 0.75), prog[bar]![(q * 3) % 4]! + 12, 0.14, 0.35, { pan: q % 2 ? 0.35 : -0.35 });
      }
      S.riser(b(11), T.collapse, 0.8);
      // every landing: a thud (pitched up as the pile grows) + a counter tick
      LANDS.forEach((L, i) => {
        if (i > 0) S.thud(L, 0.6 + 0.02 * i, 1 + i * 0.03, (PILE[i]!.x - CX) / 700);
        S.tick(L + 0.01, 0.7, 2200 + i * 70);
      });
      // wobble creaks, then the collapse
      for (let k = 0; k < 4; k++) S.whoosh(T.wobble + k * 0.22, 0.25, 0.25, { from: 200, to: 700 });
      S.boom(T.collapse + 0.35, 0.7);
      PILE.forEach((it) => S.thud(T.collapse + it.delay + it.dur, 0.45, 0.8 + it.hf * 0.3, (it.x1 - CX) / 700));
      S.gate(T.cut - 0.02, 0, 0.03);
      // silence… then the vacuum
      S.whoosh(T.vacuum - 0.1, T.merge - T.vacuum + 0.15, 1.1, { from: 180, to: 5000, panFrom: -0.6, panTo: 0 });
      S.riser(T.vacuum, T.merge, 0.6);
      S.boom(T.merge, 0.8);
      S.pop(T.merge, 1, 0.6);
      // slot-machine flicker
      FLICKS.forEach((f, k) => S.tick(f, 0.8, 1800 + (k % 5) * 180));
      S.bell(T.flickEnd, n('E6'), 0.9, { bus: 'sfx', decay: 1.6 });
      S.bell(T.flickEnd, n('A5'), 0.6, { bus: 'sfx', decay: 1.6 });
      // the question hangs: music returns softly
      S.gate(T.flickEnd - 0.05, 1, 0.05);
      S.pad(T.flickEnd, chord('F3', 'A3', 'C4', 'E4', 'G4'), T.wipe - T.flickEnd + 0.3, 0.5, { attack: 0.4, release: 0.4 });
      for (let q = 24; q < 27.5; q += 0.5) S.pluck(b(q), [n('E5'), n('G5'), n('A5'), n('C6')][Math.round(q * 2) % 4]!, 0.2, 0.3, { pan: (q % 1) * 0.6 - 0.3 });
      // zip wipe to the logo: the signature zip, then the drop
      S.signatureZip(wipeTravelStart(T.wipe, SIG_WIPE));
      const drop = T.wipe + SIG_WIPE * 0.62;
      S.kick(drop, 1.1);
      S.stab(drop, chord('A3', 'C#4', 'E4', 'G#4', 'B4'), 0.7, 1);
      S.bass(drop, n('A1'), 1.2, 0.9);
      S.sparkle(drop + 0.05, 0.5, 0.7, n('A5'));
      for (let q = 0; q < 2.5; q++) { S.kick(drop + (q + 1) * K.beat, 0.8); S.hat(drop + (q + 1.5) * K.beat, 0.4); }
      return S;
    },
  };
}
