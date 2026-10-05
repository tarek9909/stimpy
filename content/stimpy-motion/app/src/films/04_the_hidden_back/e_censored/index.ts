// 04 · E · CENSORED (10.4 s). Bright and sunny, camera locked off: someone walks away down the street and the
// back is pixelated like censored footage, tracked to them. It keeps changing under the mosaic, and twice it
// glitches: a band of blocks slips for two frames and a sliver of real colour shows. "The back changes. Soon."
import { C } from '../../../engine/brand';
import type { Ctx } from '../../../engine/draw';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { W, SAFE, kinetic, kineticOut, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, pulse, clock, clamp } from '../../../engine/util';
import { street, STREETS, walker, poseAt, pr, scaleAt, mosaic, footShadow } from '../../shoot/walker';
import { lineCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(100);
const T = { walk0: 0.2, walk1: 7.6, text0: 3.6, text1: 6.6, card: 7.6, end: 10.4 };
const CARD_AT = T.card + SIG_WIPE * 0.7;
const SEQ = ['flame', 'wave', 'bloom', 'sun', 'tag', 'halftone'];
const CHANGES = SEQ.map((_, i) => K.b(2 + i * 2) - K.beat);
/** The glitches: a band of blocks slips for a moment. */
const GLITCHES = [2.9, 5.3, 6.95];

function back(t: number) {
  let i = 0;
  for (let k = 1; k < SEQ.length; k++) if (t >= CHANGES[k]!) i = k;
  return { id: SEQ[i]!, prev: i > 0 ? SEQ[i - 1] : undefined, at: i > 0 ? CHANGES[i]! : -9, i };
}
function slip(t: number) {
  let s = 0;
  for (const g of GLITCHES) s = Math.max(s, t >= g && t < g + 0.07 ? 1 : 0);
  return s;
}
function figureZ(t: number) { const z0 = 1.35, z1 = 6.5; return z0 * (z1 / z0) ** seg(t, T.walk0, T.walk1); }

function scene(c: Ctx, t: number) {
  street(c, STREETS[0]!, 0);
  const z = figureZ(t);
  const s = scaleAt(z);
  const [, feet] = pr(0, 1, z);
  const p = poseAt(W / 2, feet, s, (Math.PI * Math.max(0, t - T.walk0)) / K.beat);
  footShadow(c, p.x, feet, s);
  const b = back(t);
  walker(c, p, { panel: { art: mosaic(b.id, t, { prev: b.prev, changeAt: b.at, seed: b.i, slip: slip(t) }), zip: 1, teeth: '#4a4a4a' } });
  const ty = SAFE.bottom - 50;
  const o = { size: 82, weight: 700, color: C.black, align: 'center' as const };
  if (t < T.text1) kinetic(c, 'The back changes.', W / 2, ty, t - T.text0, { ...o, stagger: 0.09, dur: 0.6, halo: C.cream, haloW: 14 });
  else kineticOut(c, 'The back changes.', W / 2, ty, seg(t, T.text1, T.text1 + 0.35), { ...o, halo: C.cream, haloW: 14 });
}

const def: ShootDef = {
  id: 'censored', title: '04 · E · Censored', code: '04 · E', duration: T.end,
  shots: [
    { t: 0, title: 'Walk away, locked off', note: 'Tripod at waist height on a sunny street. The subject walks away from the camera, back to us, Stimpie on.' },
    { t: CHANGES[1]!, title: 'Mosaic in the edit', note: 'In CapCut: Effects → Mosaic on the back, tracked to it. Big blocks. Swap Stimpies between takes and cut on the beat so it changes underneath.' },
    { t: GLITCHES[0]!, title: 'Glitch', note: 'Two or three 2-frame moments where the mosaic slips and a sliver of real colour shows (keyframe the effect off).' },
    { t: T.text0, title: 'Text', note: '"The back changes." (add in the edit).' },
    { t: T.card, title: 'End card', note: 'Zip to 00 · End cards → soon.' },
  ],
  draw(c, t, post) {
    post.vignette = 0.12;
    if (t < T.card) {
      scene(c, t);
      const g = slip(t);
      post.ca = 2.5 * g + 0.6 * pulse(t - back(t).at, 8);
      post.shakeX = 10 * g;
      post.fade = 1 - ease.outCubic(seg(t, 0, 0.4)); post.fadeColor = C.cream;
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => lineCard(k, t - CARD_AT, { small: 'The back changes.', big: 'Soon.' }), { dir: 'down', teeth: C.white, tape: C.black });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    const prog = [chord('D4', 'F#4', 'A4', 'C#5'), chord('B3', 'D4', 'F#4', 'A4'), chord('G3', 'B3', 'D4', 'F#4'), chord('A3', 'C#4', 'E4', 'G4')];
    const roots = [n('D2'), n('B1'), n('G1'), n('A1')];
    for (let q = 0; K.b(q) < T.card; q++) {
      const tq = K.b(q), bar = Math.floor(q / 2) % 4;
      S.kick(tq, q % 2 ? 0.55 : 0.8);
      S.hat(tq + K.beat / 2, 0.45);
      if (q % 2) S.clap(tq, 0.4);
      S.bass(tq, roots[bar]!, K.beat * 0.45, 0.7);
      S.pluck(tq + K.beat * 0.5, prog[bar]![q % 4]! + 12, 0.15, 0.28, { pan: q % 2 ? 0.3 : -0.3 });
      const z = figureZ(tq);
      S.shaker(tq + 0.02, clamp(1.4 / z, 0.15, 0.6), q % 2 ? 0.25 : -0.25);
    }
    CHANGES.forEach((tc, i) => { if (i) { S.zip(tc - 0.18, tc, (u) => ease.inQuad(u), 16, 0.5, { stop: true, bright: 1.1 }); S.bell(tc + 0.01, prog[i % 4]![3]! + 12, 0.3, { bus: 'sfx', decay: 1 }); } });
    // the glitches: a digital crackle and a dropout
    for (const g of GLITCHES) { S.crack(g, 0.08, 0.9); S.gate(g, 0.1, 0.005); S.gate(g + 0.08, 1, 0.01); }
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE));
    S.boom(CARD_AT, 0.5);
    S.stab(CARD_AT, chord('D4', 'F#4', 'A4', 'E5'), 0.5, 0.8);
    S.bell(CARD_AT + 0.02, n('A5'), 0.5, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    S.pad(CARD_AT, chord('D3', 'A3', 'F#4', 'C#5'), T.end - CARD_AT - 0.5, 0.45, { attack: 0.1, release: 0.5 });
    return S;
  },
};
export const makeCensored = (v: string) => shootFilm(def, v);
