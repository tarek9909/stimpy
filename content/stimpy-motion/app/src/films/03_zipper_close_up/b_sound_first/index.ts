// 03 · B · SOUND FIRST (9.2 s). Black screen, only the zip sound: the scroll stops. Hard cut to the macro
// just as the pull finishes, clack. Then it opens again slowly (colour underneath) and snaps shut. Logo.
import { C } from '../../../engine/brand';
import { text, type Ctx } from '../../../engine/draw';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { W, H, fill, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, lerp, TAU, pulse, wobble, noise1, clamp } from '../../../engine/util';
import { macro, motes, lights, straightTrack, P } from '../../shoot/macro';
import { logoCard, shootFilm, type ShootDef } from '../../shoot/cards';

const T = { zip0: 0.45, cut: 2.6, stop: 3.15, open0: 4.3, open1: 5.9, close0: 6.25, close1: 6.75, card: 7.4, end: 9.2 };
const TR = straightTrack(8000);
const S = { start: 1300, end: 4960, stopAt: 5020, open: 4280 };

function slider(t: number) {
  if (t < T.stop) { const u = seg(t, T.zip0, T.stop); return lerp(S.start, S.end, lerp(u, ease.inCubic(u), 0.35) + 0.005 * Math.sin(u * TAU * 11)); }
  if (t < T.close0) return lerp(S.end, S.open, ease.inOutCubic(seg(t, T.open0, T.open1)));
  return lerp(S.open, S.end, ease.inQuad(seg(t, T.close0, T.close1)));
}

/** "Sound on", with a little level meter that follows the zip. */
function black(c: Ctx, t: number) {
  fill(c, '#050505');
  const a = clamp((t - 0.2) * 3) * (1 - seg(t, T.cut - 0.15, T.cut));
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a * 0.75;
  const y = H / 2 + 40;
  for (let i = 0; i < 9; i++) {
    const lv = t > T.zip0 ? 0.25 + 0.75 * Math.abs(noise1(t * 22 + i * 3.7)) : 0.12;
    const h = 16 + 120 * lv * (1 - Math.abs(i - 4) / 6);
    c.fillStyle = i === 4 ? C.coral : C.cream;
    c.beginPath(); c.roundRect(W / 2 - 4 * 30 + i * 30 - 6, y - h / 2, 12, h, 6); c.fill();
  }
  text(c, 'SOUND ON', W / 2, y + 150, { size: 30, weight: 600, color: C.cream, align: 'center', track: 0.35 });
  c.restore();
}

function scene(c: Ctx, t: number) {
  const sx = slider(t);
  const camS = t < T.open0 ? S.end - 90 : lerp(S.end - 90, S.open + 120, ease.inOutCubic(seg(t, T.open0, T.open1 + 0.3)));
  const zoom = lerp(2.0, 1.75, ease.inOutCubic(seg(t, T.stop, T.open1))) + 0.05 * pulse(t - T.stop, 6) + 0.05 * pulse(t - T.close1, 6);
  fill(c, '#0b0b0b');
  const leakA = 0.35 + 0.65 * seg(t, T.open0, T.open1);
  macro(c, { tr: TR, sx, camS, zoom, roll: -0.38, follow: false, stopAt: S.stopAt, leak: C.coral, leakA, t, hit: t < T.close1 ? T.stop : T.close1 }, 1, 11);
  lights(c, t, 1);
  motes(c, t, 1);
}

const def: ShootDef = {
  id: 'soundfirst', title: '03 · B · Sound First', code: '03 · B', duration: T.end,
  shots: [
    { t: 0, title: 'Black, sound only', note: 'In the edit: 2–3 s of black over the real zip sound. Record it in a quiet room, phone mic 5 cm from the zipper.' },
    { t: T.cut, title: 'Hard cut on the last teeth', note: 'Cut to the macro just as the pull finishes its run. Same setup as the Edge Zip.' },
    { t: T.stop, title: 'Clack', note: 'The pull hits the stop. Hold still.' },
    { t: T.open0, title: 'Open it again, slowly', note: 'Pull back slowly: the teeth part and the colour underneath glows through.' },
    { t: T.close0, title: 'Snap shut', note: 'One fast close. Cut on the click.' },
    { t: T.card, title: 'End card', note: 'Add 00 · End cards → logo-black.' },
  ],
  draw(c, t, post) {
    post.vignette = 0.38; post.grain = 0.04;
    if (t < T.cut) { black(c, t); post.vignette = 0.2; return; }
    if (t < T.card) {
      scene(c, t);
      const hit = t < T.close1 ? T.stop : T.close1;
      post.shakeX = 6 * wobble(t - hit, 14, 12);
      post.flash = 0.05 * pulse(t - hit, 9); post.flashColor = C.coral;
      post.ca = 0.4 + 0.9 * pulse(t - T.cut, 8);
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => logoCard(k, t - T.card - SIG_WIPE * 0.7), { dir: 'right', teeth: C.cream, tape: '#0c0c0c' });
    post.vignette = 0.3;
  },
  score() {
    const Sc = new Score(T.end, { verbSize: 3, delayTime: 0.5 });
    const teeth = (a: number, b: number) => Math.round(Math.abs(b - a) / (P / 2));
    const run = (t0: number, t1: number, a: number, b: number, g: number) =>
      Sc.zip(t0, t1, (u) => (slider(t0 + u * (t1 - t0)) - Math.min(a, b)) / Math.abs(b - a), teeth(a, b), g, { stop: false, bright: 0.9, verb: 0.25 });
    run(T.zip0, T.stop, S.start, S.end, 1.15);
    Sc.snap(T.stop, 1.4); Sc.thud(T.stop, 0.9, 1.7);
    Sc.pad(T.stop, chord('D2', 'A2', 'E3'), T.card - T.stop, 0.3, { attack: 0.6, release: 0.5, cutoff: 520 });
    Sc.sub(T.stop, n('D1'), T.card - T.stop, 0.35);
    run(T.open0, T.open1, S.open, S.end, 0.9);
    Sc.pad(T.open0, chord('D3', 'F#3', 'A3', 'C#4'), T.open1 - T.open0, 0.3, { attack: 0.8, release: 0.6, cutoff: 1600 });
    run(T.close0, T.close1, S.open, S.end, 1.1);
    Sc.snap(T.close1, 1.3); Sc.thud(T.close1, 0.8, 1.7);
    Sc.signatureZip(wipeTravelStart(T.card, SIG_WIPE));
    const hit = T.card + SIG_WIPE * 0.7;
    Sc.bell(hit, n('D5'), 0.6, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    Sc.bell(hit, n('A5'), 0.35, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    Sc.pad(hit, chord('D3', 'A3', 'F#4', 'C#5'), T.end - hit - 0.5, 0.4, { attack: 0.2, release: 0.5 });
    return Sc;
  },
};
export const makeSoundFirst = (v: string) => shootFilm(def, v);
