// 03 · A · THE EDGE ZIP (10 s). One slow macro move along the edge of the Stimpie: the pull travels, turns
// a corner (why would a hoodie zipper turn a corner?), and the last tooth closes with a click. Logo.
import { C, mixHex } from '../../../engine/brand';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { fill, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, lerp, TAU, pulse, wobble, smooth } from '../../../engine/util';
import { macro, motes, lights, cornerTrack, P } from '../../shoot/macro';
import { logoCard, shootFilm, type ShootDef } from '../../shoot/cards';

const T = { rack1: 1.5, go: 0.9, stop: 6.6, card: 7.9, end: 10 };
const TR = cornerTrack(380, 1800);
const SX = { from: 700, to: 2900, stopAt: 2960 };

function slider(t: number) {
  const u = seg(t, T.go, T.stop);
  const e = lerp(u, ease.inOutCubic(u), 0.6);
  return lerp(SX.from, SX.to, e + 0.005 * Math.sin(e * TAU * 10));
}
/** The colour of the Stimpie edge showing through the open gap. */
function leak(t: number) { return mixHex(C.sky, C.lilac, smooth(seg(t, 2, 6))); }

function scene(c: CanvasRenderingContext2D, t: number) {
  const sx = slider(t);
  const camS = slider(Math.max(T.go, t - 0.15)) - 20 + (t < T.go ? (t - T.go) * 120 : 0);
  const focus = ease.inOutCubic(seg(t, 0.15, T.rack1)) * (1 - 0.15 * Math.sin(Math.max(0, t - T.stop) * 4) * seg(t, T.stop, T.stop + 0.3));
  const zoom = lerp(1.3, 1.75, ease.inOutCubic(seg(t, T.stop - 1.2, T.card))) + 0.04 * pulse(t - T.stop, 6);
  fill(c, '#0b0b0b');
  macro(c, { tr: TR, sx, camS, zoom, roll: -0.32, follow: true, stopAt: SX.stopAt, leak: leak(t), leakA: 0.8, t, hit: T.stop }, focus, lerp(16, 11, focus));
  lights(c, t, 0.5 + 0.5 * focus);
  motes(c, t, focus);
}

const def: ShootDef = {
  id: 'edgezip', title: '03 · A · The Edge Zip', code: '03 · A', duration: T.end,
  shots: [
    { t: 0, title: 'Teeth, out of focus', note: 'Macro lens 1–2 cm from the open zip. Black cloth under it, one LED low from the side, room dark. Start defocused and pull the focus in.' },
    { t: T.go, title: 'The pull arrives', note: 'Pull slowly and steadily, other hand out of frame. Keep the coral tab inside the sharp band.' },
    { t: 3.2, title: 'The corner', note: 'Follow the zip round the corner: rotate the phone with it (or keep it locked and let the corner turn in frame).' },
    { t: 5.4, title: 'The last tooth', note: 'Slow down for the last teeth. Stop on the tab with the logo sharp. Hold 1 s, do not move.' },
    { t: T.card, title: 'End card', note: 'Add 00 · End cards → logo-black (it carries the signature zip sound).' },
  ],
  draw(c, t, post) {
    post.vignette = 0.38; post.grain = 0.04;
    if (t < T.card) {
      scene(c, t);
      post.fade = 1 - ease.inOutCubic(seg(t, 0, 1));
      post.fadeColor = '#050505';
      post.shakeX = 5 * wobble(t - T.stop, 14, 12);
      post.flash = 0.05 * pulse(t - T.stop, 9); post.flashColor = C.coral;
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => logoCard(k, t - T.card - SIG_WIPE * 0.7), { dir: 'right', teeth: C.cream, tape: '#0c0c0c' });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { verbSize: 3.2, delayTime: 0.5 });
    S.pad(0.2, chord('D2', 'A2', 'E3'), T.card - 0.3, 0.3, { attack: 2, release: 0.6, cutoff: 480 });
    S.sub(0.3, n('D1'), T.card - 0.3, 0.3);
    S.whoosh(0.1, 1.4, 0.25, { from: 1500, to: 6000, panFrom: -0.5, panTo: 0.5 });
    const span = SX.to - SX.from;
    S.zip(T.go, T.stop, (u) => (slider(T.go + u * (T.stop - T.go)) - SX.from) / span, Math.round(span / (P / 2)), 1, { stop: false, bright: 0.9, verb: 0.2 });
    S.snap(T.stop, 1.3); S.thud(T.stop, 0.8, 1.7);
    S.bell(T.stop + 0.01, n('D4'), 0.35, { bus: 'sfx', decay: 2.4, verb: 0.6 });
    S.pad(3.2, chord('D3', 'F#3', 'A3', 'C#4'), 3.2, 0.3, { attack: 1, release: 1, cutoff: 1500 });
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE));
    const hit = T.card + SIG_WIPE * 0.7;
    S.bell(hit, n('D5'), 0.6, { bus: 'sfx', decay: 2.4, verb: 0.6 });
    S.bell(hit, n('A5'), 0.35, { bus: 'sfx', decay: 2.4, verb: 0.6 });
    S.pad(hit, chord('D3', 'A3', 'F#4', 'C#5'), T.end - hit - 0.5, 0.4, { attack: 0.2, release: 0.5 });
    return S;
  },
};
export const EDGE_ZIP = def;
export const makeEdgeZip = (v: string) => shootFilm(def, v);
