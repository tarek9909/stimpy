// 10 · THE SPLIT SCREEN (15 s, 128 BPM, loops seamlessly). The whole concept in seconds, without words.
//
//  0–2.8     a figure, back to camera, plain hoodie. The music starts (filter opening)
//  2.8–6.6   on every beat a zip runs down their back: a new Stimpie, and the world changes colour with it
//  6.6–8.0   the swaps go to 8ths…
//  8.0–9.8   …the screen splits into four panels, same figure, different backs, all moving in sync (16ths)
//  9.8–11.7  on the drop the panels slam into one and freeze on the plain hoodie: "Same hoodie."
//  11.7–13.8 one final zip, a new Stimpie: "Different you."
//  13.8–15   it unzips back to the plain hoodie it started with; the last frame leads into the first
import { C, ink, mix } from '../engine/brand';
import { drawIcon, LOGO } from '../engine/logo';
import { drawHoodie, type Art } from '../engine/hoodie';
import type { Ctx } from '../engine/draw';
import { artStill, art, byId, DESIGNS } from '../art/designs';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, H, SAFE, fill, kinetic, kineticOut } from './common';
import { ease, seg, clamp, pulse, clock, lerp, lastEvent, wobble } from '../engine/util';

const K = clock(128);
const b = K.b;
const PLAIN_BG = C.cream;

interface Swap { t: number; dur: number; design: string | null }
// quarter-note swaps, then 8ths
const SEQ1 = ['flame', 'wave', 'bloom', 'static', 'night', 'sun', 'tag', 'orbit'];
const SEQ2 = ['halftone', 'checker', 'eye', 'pixel', 'flame', 'bloom'];
const T = { first: b(6), eighths: b(14), split: b(17), drop: b(21), final: b(25), off: b(29.5), end: b(32) };

const SWAPS: Swap[] = [
  ...SEQ1.map((d, i) => ({ t: b(6 + i), dur: 0.3, design: d })),
  ...SEQ2.map((d, i) => ({ t: b(14 + i * 0.5), dur: 0.2, design: d })),
];
// the four panels (16ths, each offset); the drop resets everything to plain
const QUAD_SEQ = [
  ['sun', 'orbit', 'tag', 'wave', 'flame', 'pixel', 'night', 'static'],
  ['bloom', 'halftone', 'eye', 'checker', 'sun', 'wave', 'orbit', 'tag'],
  ['night', 'static', 'flame', 'bloom', 'pixel', 'eye', 'halftone', 'sun'],
  ['checker', 'pixel', 'wave', 'night', 'static', 'tag', 'bloom', 'orbit'],
];
const quadSwaps = (q: number): Swap[] => QUAD_SEQ[q]!.map((d, i) => ({ t: T.split + b(i * 0.5 + (q % 2) * 0.25) - b(0), dur: 0.14, design: d }));
const FINAL: Swap[] = [{ t: T.drop, dur: 0, design: null }, { t: T.final, dur: 0.42, design: 'signature' }, { t: T.off, dur: 0.42, design: null }];

function world(d: string | null) { return d ? byId(d).world : PLAIN_BG; }

interface Look { design: string | null; prev: string | null; p: number; dur: number; age: number }
function lookAt(swaps: Swap[], t: number, start: string | null = null): Look {
  const [k, tk] = lastEvent(swaps.map((s) => s.t), t);
  if (k < 0) return { design: start, prev: start, p: 1, dur: 0, age: 99 };
  const s = swaps[k]!;
  const prev = k > 0 ? swaps[k - 1]!.design : start;
  return { design: s.design, prev, p: s.dur > 0 ? clamp((t - tk) / s.dur) : 1, dur: s.dur, age: t - tk };
}

const FIG = { x: 540, y: 800, s: 0.74 };

/** One figure in its world, drawn in a full W×H frame. */
function figure(c: Ctx, t: number, L: Look, live: boolean, beatAge: number) {
  // the world: the new colour is pulled down with the zip
  const edge = ease.inOutCubic(L.p) * (H + 40);
  fill(c, world(L.prev));
  if (L.design !== L.prev) {
    c.fillStyle = world(L.design);
    c.fillRect(-50, -50, W + 100, edge + 50);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(-50, edge, W + 100, 10);
  }
  const bob = 7 * pulse(beatAge, 9);
  const sway = Math.sin(t * K.bpm / 60 * Math.PI) * 0.012;
  const paint = (d: string | null): Art | null => (d ? (live ? art(d, t) : artStill(d)) : null);
  const zipping = L.design !== L.prev && L.p < 1;
  let panel = null;
  if (zipping) {
    // a Stimpie is on (or arriving): zip wipe down the back from the old back to the new one
    const from = paint(L.prev), to = paint(L.design);
    const blank: Art = (k, w, h) => { k.fillStyle = '#111111'; k.fillRect(0, 0, w, h); };
    panel = { art: from ?? blank, wipeTo: to ?? blank, wipe: L.p, zip: 1, parked: false };
  } else if (L.design) panel = { art: paint(L.design), zip: 1, parked: true };
  drawHoodie(c, { x: FIG.x, y: FIG.y + bob, s: FIG.s, rot: sway, color: C.black, figure: true, shadow: 0.7, shadowY: 902, panel, sy: 1 - 0.012 * pulse(beatAge, 9) });
}

function beats(t: number) { return t < 0 ? 99 : (t % K.beat); }

function wordmark(c: Ctx, bg: string) {
  drawIcon(c, W / 2, SAFE.top - 40, 72, bg === C.coral ? LOGO.main : bg === C.black || bg === C.blue ? LOGO.onBlack : LOGO.onWhite);
}

export function makeSplitScreen(): Film {
  const quads = [0, 1, 2, 3].map(quadSwaps);
  return {
    id: 'split', title: '10 · The Split Screen', duration: T.end, loop: true,
    marks: [
      { t: 0, label: 'plain' }, { t: T.first, label: 'swap on the beat' }, { t: T.eighths, label: '8ths' }, { t: T.split, label: 'four panels' },
      { t: T.drop, label: 'same hoodie' }, { t: T.final, label: 'different you' }, { t: T.off, label: 'back to plain' },
    ],
    draw(c, t, post: Post) {
      const bAge = beats(t);
      post.vignette = 0.1;
      if (t < T.split) {
        const L = lookAt(SWAPS, t);
        figure(c, t, L, L.dur >= 0.3 || t < T.eighths, bAge);
        wordmark(c, L.p > 0.5 ? world(L.design) : world(L.prev));
        post.ca = 0.35 * pulse(L.age, 18);
        return;
      }
      if (t < T.drop) {
        // four panels: split in fast, then everything in sync
        const sp = ease.outExpo(seg(t, T.split, T.split + 0.22));
        const slam = ease.inExpo(seg(t, T.drop - 0.14, T.drop));
        const k = sp * (1 - slam);
        const cells = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
        cells.forEach(([i, j], q) => {
          const cx = lerp(W / 2, (i + 0.5) * (W / 2), k), cy = lerp(H / 2, (j + 0.5) * (H / 2), k);
          const sc = lerp(1, 0.5, k);
          c.save();
          c.beginPath();
          c.rect(lerp(0, i * W / 2, k), lerp(0, j * H / 2, k), lerp(W, W / 2, k), lerp(H, H / 2, k));
          c.clip();
          c.translate(cx, cy); c.scale(sc, sc); c.translate(-W / 2, -H / 2);
          const L = lookAt(quads[q]!, t, SEQ2[SEQ2.length - 1]!);
          figure(c, t, L, false, bAge);
          c.restore();
        });
        // gutters
        if (k > 0.02) {
          c.fillStyle = C.black;
          c.fillRect(W / 2 - 5 * k, 0, 10 * k, H);
          c.fillRect(0, H / 2 - 5 * k, W, 10 * k);
        }
        post.ca = 0.6 * pulse(t - T.split, 10) + 0.4 * slam;
        return;
      }
      // after the drop: plain → final zip → back to plain
      const L = lookAt(FINAL, t);
      const dropAge = t - T.drop;
      const sh = 16 * pulse(dropAge, 7);
      c.save();
      if (sh > 0.2) c.translate(Math.sin(dropAge * 80) * sh, Math.cos(dropAge * 67) * sh);
      figure(c, t, L, true, bAge);
      c.restore();
      const bg = L.p > 0.5 ? world(L.design) : world(L.prev);
      wordmark(c, bg);
      const col = ink(world(L.design ?? null) === PLAIN_BG ? PLAIN_BG : bg);
      const hl = { size: 118, weight: 700, color: col, align: 'center' as const, stagger: 0.08 };
      const y = SAFE.top + 150;
      if (t < T.final) kinetic(c, 'Same hoodie.', W / 2, y, dropAge - 0.05, { ...hl, color: ink(PLAIN_BG) });
      else if (t < T.final + 0.25) kineticOut(c, 'Same hoodie.', W / 2, y, seg(t, T.final, T.final + 0.2), { ...hl, color: ink(PLAIN_BG) });
      if (t >= T.final + 0.15 && t < T.off + 0.3) {
        const out = seg(t, T.off, T.off + 0.25);
        if (out > 0) kineticOut(c, 'Different you.', W / 2, y, out, { ...hl, color: ink(world('signature')) });
        else kinetic(c, 'Different you.', W / 2, y, t - T.final - 0.15, { ...hl, color: ink(world('signature')) });
      }
      post.flash = 0.35 * pulse(dropAge, 9) + 0.15 * pulse(t - T.final - 0.2, 10);
      post.flashColor = C.white;
      post.ca = 1.2 * pulse(dropAge, 8);
    },
    score() {
      const S = new Score(T.end, { delayTime: K.beat * 0.75 });
      const prog = [chord('C4', 'Eb4', 'G4', 'Bb4'), chord('Ab3', 'C4', 'Eb4', 'G4'), chord('F3', 'Ab3', 'C4', 'Eb4'), chord('G3', 'Bb3', 'D4', 'F4')];
      const roots = [n('C2'), n('Ab1'), n('F1'), n('G1')];
      // the loop point sits inside a filtered groove: the intro opens the filter, the outro closes it
      S.lowpass(0, 700, 0.01);
      S.lowpass(b(1), 18000, b(5));
      S.lowpass(T.off, 900, T.end - T.off - 0.05);
      for (let q = 0; q < 32; q++) {
        const tq = b(q);
        const bar = Math.floor(q / 4) % 4;
        const inDrop = tq >= T.drop - 0.02 && tq < T.final - 0.02;
        if (tq >= T.drop - 0.14 && tq < T.drop) continue;
        S.kick(tq, inDrop ? 0.8 : 1);
        if (q % 2 === 1 && !inDrop) S.clap(tq, 0.6);
        S.hat(tq + K.beat / 2, 0.55, q % 8 === 7);
        if (tq >= T.eighths && tq < T.drop) { S.hat(tq + K.beat / 4, 0.3); S.hat(tq + K.beat * 0.75, 0.3); }
        if (!inDrop) {
          S.bass(tq, roots[bar]!, K.beat * 0.4, 0.8);
          S.bass(tq + K.beat / 2, roots[bar]! + 12, K.beat * 0.3, 0.55);
        }
        if (q % 4 === 0) S.stab(tq, prog[bar]!, inDrop ? 1.6 : 0.28, inDrop ? 0.5 : 0.7);
        if (q % 2 === 0 && !inDrop) S.pluck(tq + K.beat * 0.75, prog[bar]![(q / 2) % 4]! + 12, 0.15, 0.3, { pan: q % 4 ? 0.35 : -0.35 });
      }
      // every swap is a zip
      const zipAll = (sw: Swap[], g: number) => sw.forEach((s, i) => { if (s.dur > 0) S.zip(s.t, s.t + s.dur, (u) => ease.inOutCubic(u), Math.max(8, Math.round(s.dur * 70)), g, { stop: s.dur > 0.25, pan: (i % 2 ? 0.15 : -0.15) }); });
      zipAll(SWAPS, 0.6);
      zipAll(quads[0]!, 0.35); zipAll(quads[1]!, 0.35);
      S.riser(T.split, T.drop - 0.1, 0.8);
      S.whoosh(T.drop - 0.2, 0.25, 0.8, { from: 3000, to: 400, panFrom: 0, panTo: 0 });
      // the drop: the panels slam into one
      S.boom(T.drop, 1);
      S.sub(T.drop, n('C1'), T.final - T.drop, 0.6);
      S.bell(T.drop + 0.05, n('G5'), 0.5, { bus: 'sfx', decay: 1.5 });
      // one final zip (the signature length), and back off to plain
      zipAll(FINAL, 1);
      S.sparkle(T.final + 0.42, 0.5, 0.6, n('C6'));
      return S;
    },
  };
}

export { mix, DESIGNS };
