// 03 · C · THE EMPTY FRAME (10 s). Overhead: a black hoodie flat on a cream table, back up, with NO Stimpie.
// A hand zips the empty zip track all the way round a rectangle: slow, then sped up, then slow for the last
// corner. Snap. The frame is closed around nothing. "Something goes here." Logo.
import { C, rgba } from '../../../engine/brand';
import type { Ctx } from '../../../engine/draw';
import { DOCK, PANEL_PERIM, hoodiePoint, type HoodieOpts } from '../../../engine/hoodie';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { W, SAFE, kinetic, glow, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, lerp, pulse, clock } from '../../../engine/util';
import { table, windowLight, flatHoodie, pullOnScreen, pinchHand, HOODIE } from '../../shoot/overhead';
import { logoCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(96);
const T = { handIn: 0.25, grab: 1.0, slow1: 2.0, fast1: 4.0, snap: 5.2, out: 5.4, text: 6.0, card: 8.2, end: 10 };
const ARM: [number, number] = [1500, 2500];

/** The zip's progress: slow start, a 5× speed ramp, then real speed for the last corner. */
function zip(t: number) {
  if (t < T.grab) return 0;
  if (t < T.slow1) return 0.12 * ease.inQuad(seg(t, T.grab, T.slow1)) ;
  if (t < T.fast1) return lerp(0.12, 0.88, ease.inOutQuad(seg(t, T.slow1, T.fast1)));
  return lerp(0.88, 1, ease.outQuad(seg(t, T.fast1, T.snap)));
}

function hoodie(t: number): HoodieOpts {
  const s = lerp(1.14, 1.24, ease.inOutQuad(seg(t, 0, T.card))) * (1 + 0.012 * pulse(t - T.snap, 6));
  return { x: W / 2 + 6, y: 960, s, color: HOODIE };
}

function scene(c: Ctx, t: number) {
  table(c, t / 10);
  const h = hoodie(t);
  const z = zip(t);
  flatHoodie(c, h, { art: null, zip: z });
  // once closed, the empty frame breathes: there is a space here
  const e = seg(t, T.text - 0.4, T.text + 0.6);
  if (e > 0) {
    const [cx, cy] = hoodiePoint(h, DOCK.x, DOCK.y);
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, cx, cy, 300 * h.s, C.coral, 0.12 * e * (0.7 + 0.3 * Math.sin(t * 4)));
    c.restore();
    c.save();
    c.strokeStyle = rgba(C.coral, 0.5 * e);
    c.setLineDash([14, 12]);
    c.lineDashOffset = -t * 30;
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(cx - (DOCK.w / 2 - 22) * h.s, cy - (DOCK.h / 2 - 22) * h.s, (DOCK.w - 44) * h.s, (DOCK.h - 44) * h.s, 14 * h.s);
    c.stroke();
    c.restore();
  }
  // the hand
  if (t > T.handIn && t < T.out + 0.7) {
    const at = pullOnScreen(h, Math.max(z, 0.0001));
    const reach = ease.outCubic(seg(t, T.handIn, T.grab));
    const away = ease.inCubic(seg(t, T.out, T.out + 0.6));
    const p: [number, number] = [lerp(lerp(at[0] + (ARM[0] - at[0]) * 0.5, at[0], reach), ARM[0], away * 0.55), lerp(lerp(at[1] + (ARM[1] - at[1]) * 0.5, at[1], reach), ARM[1], away * 0.55)];
    pinchHand(c, p, ARM, h.s * 0.56, ease.outCubic(seg(t, T.grab - 0.1, T.grab)) * (1 - seg(t, T.out - 0.05, T.out + 0.05)));
  }
  windowLight(c, t / 10);
  kinetic(c, 'Something goes here.', W / 2, SAFE.top + 60, t - T.text, { size: 74, weight: 700, color: C.black, align: 'center', stagger: 0.08 });
}

const def: ShootDef = {
  id: 'emptyframe', title: '03 · C · The Empty Frame', code: '03 · C', duration: T.end,
  shots: [
    { t: 0, title: 'Overhead, hoodie flat', note: 'Phone on a tripod or shelf straight above. Black hoodie back-up on a cream surface, NO Stimpie on it. Window daylight from one side.' },
    { t: T.grab, title: 'Start the zip, slow', note: 'A hand enters from the bottom right, pinches the coral pull and starts round the empty frame.' },
    { t: T.slow1, title: 'Speed ramp', note: 'One continuous take. In the edit, speed the middle up 4–6×.' },
    { t: T.fast1, title: 'The last corner', note: 'Back to real speed for the last stretch, so we hear the last teeth.' },
    { t: T.snap, title: 'Snap. Let go.', note: 'The hand leaves frame. Hold on the closed, empty frame for 2 s.' },
    { t: T.text, title: 'Text', note: '"Something goes here." (add in the edit).' },
    { t: T.card, title: 'End card', note: 'Add 00 · End cards → logo-coral.' },
  ],
  draw(c, t, post) {
    post.vignette = 0.16;
    if (t < T.card) { scene(c, t); post.fade = 1 - ease.outCubic(seg(t, 0, 0.5)); post.fadeColor = C.cream; post.flash = 0.08 * pulse(t - T.snap, 10); return; }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => logoCard(k, t - T.card - SIG_WIPE * 0.7, C.coral), { dir: 'down', teeth: C.white, tape: C.black });
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    // a light, curious plucked groove
    for (let q = 0; K.b(q) < T.card; q++) {
      const tq = K.b(q);
      if (q % 2 === 0) S.pluck(tq, [n('D5'), n('F#5'), n('A5'), n('E5')][(q / 2) % 4]!, 0.18, 0.28, { pan: q % 4 ? 0.3 : -0.3 });
      if (q >= 4) S.hat(tq + K.beat / 2, 0.3);
    }
    S.pad(0, chord('D3', 'A3', 'E4'), T.card, 0.25, { attack: 1, release: 0.5, cutoff: 1200 });
    S.whoosh(T.handIn, T.grab - T.handIn, 0.3, { from: 300, to: 1200, panFrom: 0.6, panTo: 0 });
    S.snap(T.grab, 0.4);
    // the zip, with the speed ramp: the clicks speed up with the pull
    S.zip(T.grab, T.snap, (u) => zip(T.grab + u * (T.snap - T.grab)), Math.round(PANEL_PERIM / 9), 0.95, { stop: true, bright: 1.05 });
    S.riser(T.slow1, T.fast1, 0.35);
    S.kick(T.snap, 0.8); S.bell(T.snap + 0.01, n('A5'), 0.4, { bus: 'sfx', decay: 1.6 });
    S.pad(T.text, chord('D3', 'F#3', 'A3', 'C#4'), T.card - T.text, 0.35, { attack: 0.3, release: 0.4 });
    for (let i = 0; i < 'Something goes here.'.split(' ').length; i++) S.pop(T.text + i * 0.08, 0.5, 1 + i * 0.1);
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE));
    const hit = T.card + SIG_WIPE * 0.7;
    S.bell(hit, n('D5'), 0.6, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    S.stab(hit, chord('D4', 'F#4', 'A4', 'C#5'), 0.4, 0.7);
    S.pad(hit, chord('D3', 'A3', 'F#4', 'C#5'), T.end - hit - 0.5, 0.4, { attack: 0.1, release: 0.5 });
    return S;
  },
};
export const makeEmptyFrame = (v: string) => shootFilm(def, v);
