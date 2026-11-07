// 04 · C · COLOUR LEAK WALK (10.6 s). Someone walks away down a dark corridor toward a single light. They are
// pure silhouette (the back is never seen), but the light changes colour on every footstep: coral, butter,
// sky, lilac, white. The back changes; the light gives it away. In real life: one RGB LED and a friend with
// its remote.
import { C, rgba, mixHex } from '../../../engine/brand';
import type { Ctx } from '../../../engine/draw';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { W, SAFE, glow, kinetic, kineticOut, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, pulse, clamp, clock } from '../../../engine/util';
import { corridor, COR, walker, poseAt, pr, scaleAt, reflect } from '../../shoot/walker';
import { lineCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(100);
const T = { walk0: 0.3, walk1: 8.0, text0: 2.6, text1: 5.8, flare0: 7.3, card: 8.0, end: 10.6 };
const CARD_AT = T.card + SIG_WIPE * 0.7;
const COLS = [C.coral, C.butter, C.sky, C.lilac, C.white];

/** One colour per footstep. */
function light(t: number) {
  const k = Math.max(0, Math.floor((t - T.walk0) / K.beat));
  const at = T.walk0 + k * K.beat;
  const cur = COLS[k % COLS.length]!, prev = COLS[(k + COLS.length - 1) % COLS.length]!;
  return { col: t < T.walk0 ? C.coral : mixHex(prev, cur, clamp((t - at) / 0.06)), at, k };
}
const camZ = (t: number) => 0.35 * ease.inOutQuad(seg(t, 0, T.card));
function figureZ(t: number) { const z0 = 1.35, z1 = COR.ZEND - 0.55; return z0 * (z1 / z0) ** seg(t, T.walk0, T.walk1); }

function scene(c: Ctx, t: number) {
  const L = light(t);
  const cz = camZ(t), fz = figureZ(t), z = fz - cz;
  const door = 1 + 0.25 * pulse(t - L.at, 6) + 1.6 * ease.inCubic(seg(t, T.flare0, T.card));
  corridor(c, { cz, light: L.col, fz: COR.ZEND - 1.5, door, doorCol: L.col });
  const s = scaleAt(z);
  const [, feet] = pr(0, COR.FLOOR, z);
  const p = poseAt(W / 2, feet, s, (Math.PI * Math.max(0, t - T.walk0)) / K.beat);
  // the coloured light floods the corridor from the far end, pools round their feet and wraps their edges
  const [dx, dy] = pr(0, 0.2, COR.ZEND - cz);
  c.save();
  c.globalCompositeOperation = 'lighter';
  glow(c, dx, dy, 1500, L.col, 0.34 * door);
  glow(c, dx, dy, 520, L.col, 0.5 * door);
  c.save(); c.translate(W / 2, feet); c.scale(1, 0.25); glow(c, 0, 0, 1100 * s + 300, L.col, 0.5); c.restore();
  c.restore();
  reflect(c, feet, s, (k) => walker(k, p, { flat: '#050505', rim: rgba(L.col, 0.9), rimW: 14 }), 0.35);
  // the silhouette, with a halo of the light bleeding round it
  c.save();
  c.globalCompositeOperation = 'lighter';
  glow(c, p.x, p.y + 100 * s, 800 * s + 80, L.col, 0.3);
  c.restore();
  walker(c, p, { flat: '#050505', rim: rgba(mixHex(L.col, C.white, 0.3), 0.95), rimW: 14 });
  const ty = SAFE.bottom - 50;
  const o = { size: 82, weight: 700, color: C.white, align: 'center' as const };
  if (t < T.text1) kinetic(c, 'The back changes.', W / 2, ty, t - T.text0, { ...o, stagger: 0.09, dur: 0.6 });
  else kineticOut(c, 'The back changes.', W / 2, ty, seg(t, T.text1, T.text1 + 0.35), o);
}

const def: ShootDef = {
  id: 'colourleak', title: '04 · C · Colour Leak Walk', code: '04 · C', duration: T.end,
  shots: [
    { t: 0, title: 'Dark corridor, one light', note: 'A dark hallway or alley at night. One RGB LED light at the far end, pointed back at the camera (hide it behind a doorframe or on the floor).' },
    { t: T.walk0, title: 'Walk toward the light', note: 'Subject walks slowly away from the camera into the light: a pure silhouette. Camera locked off, low, waist height.' },
    { t: T.walk0 + K.beat, title: 'A colour on every step', note: 'A friend changes the light with its remote on every footstep: coral, butter, sky, lilac, white. Count the steps out loud.' },
    { t: T.text0, title: 'Text', note: '"The back changes." (add in the edit).' },
    { t: T.flare0, title: 'Into the light', note: 'Full brightness as they reach it: they disappear into it.' },
    { t: T.card, title: 'End card', note: 'Zip to 00 · End cards → soon.' },
  ],
  draw(c, t, post) {
    post.vignette = 0.28; post.grain = 0.04;
    if (t < T.card) {
      scene(c, t);
      post.fade = 1 - ease.outCubic(seg(t, 0, 0.5)); post.fadeColor = '#050505';
      post.flash = 0.18 * ease.inCubic(seg(t, T.flare0, T.card)); post.flashColor = light(t).col;
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => lineCard(k, t - CARD_AT, { small: 'The back changes.', big: 'Soon.' }), { dir: 'down', teeth: C.cream, tape: '#0c0c0c' });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    // each footstep: a step sound and a new chord (the light changes with it)
    const chords = [chord('A3', 'C4', 'E4', 'G4'), chord('F3', 'A3', 'C4', 'E4'), chord('C4', 'E4', 'G4', 'B4'), chord('G3', 'B3', 'D4', 'F#4'), chord('E3', 'G3', 'B3', 'D4')];
    const roots = [n('A1'), n('F1'), n('C2'), n('G1'), n('E1')];
    S.pad(0.1, chord('A2', 'E3'), T.card, 0.3, { attack: 1.2, release: 0.3, cutoff: 600 });
    for (let k = 0; ; k++) {
      const tf = T.walk0 + k * K.beat;
      if (tf > T.walk1) break;
      const g = clamp(1.6 / (figureZ(tf) - camZ(tf)), 0.15, 1);
      S.thud(tf, 0.45 * g, 1.9, k % 2 ? 0.2 : -0.2);
      S.shaker(tf + 0.025, 0.5 * g, k % 2 ? 0.25 : -0.25);
      const ch = chords[k % 5]!;
      S.pluck(tf, ch[k % 4]! + 12, 0.2, 0.32, { pan: k % 2 ? 0.35 : -0.35 });
      S.bass(tf, roots[k % 5]!, K.beat * 0.9, 0.45);
      if (k >= 4) S.stab(tf, ch, 0.25, 0.35, { cutoff: 2200 });
      if (k >= 6) S.kick(tf, 0.5, { duck: 0.3 });
      S.tick(tf + 0.005, 0.25, 3400, 0.4); // the remote's click
    }
    S.riser(T.flare0 - 0.4, CARD_AT, 0.7);
    S.gate(T.card, 0.25, 0.1);
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE));
    S.gate(CARD_AT, 1, 0.02);
    S.boom(CARD_AT, 0.55);
    S.stab(CARD_AT, chord('A3', 'C4', 'E4', 'B4'), 0.6, 0.8);
    S.bell(CARD_AT + 0.02, n('E5'), 0.6, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    S.pad(CARD_AT, chord('A2', 'E3', 'B3', 'C4'), T.end - CARD_AT - 0.5, 0.45, { attack: 0.1, release: 0.5 });
    return S;
  },
};
export const makeColourLeak = (v: string) => shootFilm(def, v);
