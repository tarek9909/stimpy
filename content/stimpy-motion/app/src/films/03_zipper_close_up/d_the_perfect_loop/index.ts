// 03 · D · THE PERFECT LOOP (8 s, seamless). Overhead: the pull goes all the way round the Stimpie, the panel
// lifts a breath and settles, and the pull goes all the way back, landing on exactly the first frame. The
// Reel loops forever, so people watch it three times before they notice.
import type { Ctx } from '../../../engine/draw';
import { PANEL_PERIM, type HoodieOpts } from '../../../engine/hoodie';
import { Score, chord } from '../../../audio/score';
import { W } from '../../common';
import { ease, seg, clock } from '../../../engine/util';
import { artStill } from '../../../art/designs';
import { table, windowLight, flatHoodie, pullOnScreen, pinchHand, HOODIE } from '../../shoot/overhead';
import { shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(120); // 8 s = 16 beats exactly, so the music loops too
const T = { open0: K.b(1), open1: K.b(6.5), lift0: K.b(6.5), lift1: K.b(8.5), close0: K.b(9), close1: K.b(14.5), end: K.b(16) };
const ARM: [number, number] = [1500, 2500];
const DESIGN = 'bloom';

function zip(t: number) {
  if (t < T.open0) return 1;
  if (t < T.open1) return 1 - ease.inOutCubic(seg(t, T.open0, T.open1));
  if (t < T.close0) return 0;
  return ease.inOutCubic(seg(t, T.close0, T.close1));
}
const lift = (t: number) => Math.sin(Math.PI * ease.inOutQuad(seg(t, T.lift0, T.lift1))) * 0.45;

const H0: HoodieOpts = { x: W / 2 + 6, y: 960, s: 1.2, color: HOODIE };

function scene(c: Ctx, t: number) {
  table(c, t / T.end);
  const z = zip(t), l = lift(t);
  flatHoodie(c, H0, { art: artStill(DESIGN), zip: z, lift: l });
  pinchHand(c, pullOnScreen(H0, Math.max(z, 0.0001), l), ARM, H0.s * 0.56, 1);
  windowLight(c, t / T.end);
}

const def: ShootDef = {
  id: 'perfectloop', title: '03 · D · The Perfect Loop', code: '03 · D', duration: T.end, loop: true,
  shots: [
    { t: 0, title: 'Overhead, Stimpie on', note: 'Tripod straight above. Mark the pull\'s start with a small piece of tape so the first and last frames match.' },
    { t: T.open0, title: 'Unzip all the way round', note: 'One steady pull round the whole edge. Keep the hand at the same angle the whole way.' },
    { t: T.lift0, title: 'The breath', note: 'Lift the panel a few cm by the pull, and set it back down.' },
    { t: T.close0, title: 'Zip it back', note: 'Same speed, all the way back to the tape mark.' },
    { t: T.close1, title: 'Land on frame one', note: 'Stop exactly on the mark. Trim so the last frame = the first frame: it loops forever. No end card.' },
  ],
  draw(c, t, post) { scene(c, t); post.vignette = 0.16; },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    const prog = [chord('E4', 'G#4', 'B4', 'D#5'), chord('C#4', 'E4', 'G#4', 'B4'), chord('A3', 'C#4', 'E4', 'G#4'), chord('B3', 'D#4', 'F#4', 'A4')];
    for (let q = 0; q < 16; q++) {
      const tq = K.b(q), bar = Math.floor(q / 4) % 4;
      S.kick(tq, q % 2 ? 0.35 : 0.55, { duck: 0.3 });
      S.hat(tq + K.beat / 2, 0.35);
      S.pluck(tq + K.beat * 0.5, prog[bar]![q % 4]! + 12, 0.15, 0.25, { pan: q % 2 ? 0.35 : -0.35, verb: 0.1, delay: 0.05 });
      if (q % 4 === 0) S.pad(tq, prog[bar]!, K.beat * 3.6, 0.3, { attack: 0.2, release: 0.15, cutoff: 1800, verb: 0.15 });
    }
    S.zip(T.open0, T.open1, (u) => 1 - ease.inOutCubic(u), Math.round(PANEL_PERIM / 9), 0.9, { stop: false, verb: 0.05 });
    S.whoosh(T.lift0, T.lift1 - T.lift0, 0.35, { from: 300, to: 1200, panFrom: 0, panTo: 0 });
    S.zip(T.close0, T.close1, (u) => ease.inOutCubic(u), Math.round(PANEL_PERIM / 9), 0.9, { stop: true, verb: 0.05 });
    return S;
  },
};
export const makePerfectLoop = (v: string) => shootFilm(def, v);
