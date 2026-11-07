// 04 · A · THE SHY BACK (10.4 s). The camera circles someone to see their back, and they keep turning to
// face it: a beat late, then a fake-out, then a full spin that gets out of hand. Dizzy. Then, finally,
// they start to turn away… and the zip cuts it off: "The back changes. Soon."
import { C, rgba } from '../../../engine/brand';
import type { Ctx } from '../../../engine/draw';
import { drawHoodie } from '../../../engine/hoodie';
import { zipWipe } from '../../../engine/zipper';
import { Score, n, chord } from '../../../audio/score';
import { W, H, fill, glow, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, pulse, wobble, clamp, TAU, clock, noise1 } from '../../../engine/util';
import { lineCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(128);
const T = { start: 1.2, late: 1.25, snap: 1.75, fake0: 1.95, fake1: 2.9, spin0: 3.0, spin1: 6.2, dizzy: 6.2, away0: 7.0, card: 7.8, end: 10.4 };
const SPIN_TURNS = 4.5;

/** The camera's angle round the subject (radians). */
function orbit(t: number) {
  let a = 1.2 * ease.inOutQuad(seg(t, 0.3, T.fake0));
  a -= 1.7 * ease.inOutCubic(seg(t, T.fake0, T.fake1));
  const u = seg(t, T.spin0, T.spin1);
  a += SPIN_TURNS * TAU * (u < 0.85 ? ease.inCubic(u / 0.85) * 0.9 : 0.9 + 0.1 * ease.outCubic((u - 0.85) / 0.15));
  return a;
}
/** How much the subject faces the lens (1 = square on; below 0.5 we'd see the back, which never happens). */
function facing(t: number) {
  let f = 1;
  f -= 0.36 * Math.sin(Math.PI * seg(t, T.late - 0.2, T.snap)) * (t < T.snap ? 1 : 0);
  f -= 0.12 * Math.abs(wobble(t - T.snap, 6, 9));
  f -= 0.2 * Math.abs(Math.sin(Math.PI * seg(t, T.fake0, T.fake0 + 0.35)));
  const u = seg(t, T.spin0, T.spin1);
  if (u > 0 && u < 1) f -= 0.36 * Math.abs(Math.sin(u * u * 26)) * Math.sin(Math.PI * u);
  f -= 0.47 * ease.inOutCubic(seg(t, T.away0, T.card + 0.2));
  return clamp(f, 0.52, 1);
}

// the room: coloured flats standing round the subject, so the orbit reads in the background
const FLATS = [C.coral, C.butter, C.sky, C.lilac, C.coral, C.white, C.butter, C.lilac, C.sky, C.cream];

function room(c: Ctx, t: number, a: number) {
  fill(c, C.cream);
  const hor = 1180;
  // back wall flats: things behind the subject, as seen from the camera
  FLATS.forEach((col, i) => {
    const phi = (i / FLATS.length) * TAU;
    const rel = phi - (a + Math.PI);
    const cz = Math.cos(rel);
    if (cz <= 0.05) return;
    const x = W / 2 + Math.sin(rel) * 1300;
    const w = 260 * cz, hh = 900 * (0.75 + 0.25 * cz);
    c.fillStyle = col;
    c.globalAlpha = 0.35 + 0.65 * cz;
    c.beginPath(); c.roundRect(x - w / 2, hor - hh, w, hh, 18); c.fill();
    c.globalAlpha = 1;
  });
  // the floor and the coral marker circle round the subject
  const fg = c.createLinearGradient(0, hor, 0, H);
  fg.addColorStop(0, '#EADFD0'); fg.addColorStop(1, '#F6EDE1');
  c.fillStyle = fg;
  c.fillRect(0, hor, W, H - hor);
  const cx = W / 2, cy = 1560, rx = 420, ry = 110;
  c.strokeStyle = rgba(C.coral, 0.85);
  c.lineWidth = 8;
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.stroke();
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * TAU - a;
    const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
    c.fillStyle = k === 0 ? C.blue : C.black;
    c.beginPath(); c.arc(x, y, k === 0 ? 14 : 8, 0, TAU); c.fill();
  }
  glow(c, W / 2, 900, 900, C.white, 0.35);
}

function scene(c: Ctx, t: number) {
  const a = orbit(t);
  room(c, t, a);
  const f = facing(t);
  const spinU = seg(t, T.spin0, T.spin1);
  const dz = wobble(t - T.dizzy, 1.6, 2.2);
  const hop = Math.abs(Math.sin(Math.PI * seg(t, T.fake0, T.fake0 + 0.35))) * 40 + Math.abs(wobble(t - T.snap, 4, 8)) * 20;
  drawHoodie(c, {
    x: W / 2 + 40 * dz, y: 1560 - 900 * 0.86 - hop, s: 0.86, color: C.black, figure: true, lining: C.coral, pants: '#2a2a30',
    turn: f, rot: 0.12 * dz + 0.03 * Math.sin(spinU * 40) * Math.sin(Math.PI * spinU),
    shadow: 0.8, shadowY: 900 + hop / 0.86,
  });
  // speed lines in the spin
  const sp = Math.sin(Math.PI * spinU) * (spinU > 0 ? 1 : 0);
  if (sp > 0.2) {
    c.save();
    c.strokeStyle = rgba(C.black, 0.18 * sp);
    c.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = 300 + i * 95 + noise1(i * 3 + t * 8) * 30;
      const x = ((i * 260 + t * 3200) % (W + 600)) - 300;
      c.lineWidth = 6 + (i % 3) * 3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 240 * sp, y); c.stroke();
    }
    c.restore();
  }
}

const def: ShootDef = {
  id: 'shyback', title: '04 · A · The Shy Back', code: '04 · A', duration: T.end,
  shots: [
    { t: 0, title: 'Front, mid shot', note: 'Camera 1.5 m away at chest height. Subject faces the lens, hood up. Plain wall, or put a few colourful boards around the room.' },
    { t: T.start, title: 'Camera starts circling', note: 'The operator walks a slow circle round them. Subject turns a beat late… then snaps back to face the lens.' },
    { t: T.fake0, title: 'Fake-out', note: 'The operator suddenly reverses direction. Subject catches it.' },
    { t: T.spin0, title: 'Faster, faster', note: 'The operator jogs the circle; the subject spins to keep up. Shoot 60 fps, keep the gimbal low.' },
    { t: T.dizzy, title: 'Stop. Dizzy.', note: 'The camera stops dead. Subject wobbles, laughs.' },
    { t: T.away0, title: 'The slow turn…', note: 'Subject finally starts to turn their back to the lens…' },
    { t: T.card, title: '…cut', note: 'Cut BEFORE the back shows: 00 · End cards → soon ("The back changes. Soon.").' },
  ],
  draw(c, t, post) {
    post.vignette = 0.14;
    if (t < T.card) {
      scene(c, t);
      post.flash = 0.06 * pulse(t - T.snap, 10);
      const u = seg(t, T.spin0, T.spin1);
      post.ca = 1.4 * Math.sin(Math.PI * u) * (u > 0 && u < 1 ? 1 : 0) + 0.8 * pulse(t - T.dizzy, 5);
      post.shakeX = 8 * wobble(t - T.dizzy, 9, 7);
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => lineCard(k, t - T.card - SIG_WIPE * 0.7, { small: 'The back changes.', big: 'Soon.' }), { dir: 'down', teeth: C.white, tape: C.black });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    const prog = [chord('C4', 'E4', 'G4', 'B4'), chord('A3', 'C4', 'E4', 'G4'), chord('F3', 'A3', 'C4', 'E4'), chord('G3', 'B3', 'D4', 'F4')];
    const roots = [n('C2'), n('A1'), n('F1'), n('G1')];
    // a cheeky bouncing groove
    for (let q = 0; K.b(q) < T.spin0; q++) {
      const tq = K.b(q), bar = Math.floor(q / 4) % 4;
      S.kick(tq, q % 2 ? 0.5 : 0.8);
      S.hat(tq + K.beat / 2, 0.4);
      S.bass(tq + K.beat / 2, roots[bar]! + 12, K.beat * 0.3, 0.5);
      S.pluck(tq, prog[bar]![q % 4]! + 12, 0.12, 0.3, { pan: q % 2 ? 0.3 : -0.3 });
    }
    // the snap back and the fake-out: boing
    S.pop(T.snap, 1, 0.6); S.pop(T.snap + 0.08, 0.7, 0.9);
    S.whoosh(T.fake0, T.fake1 - T.fake0, 0.5, { from: 400, to: 1800, panFrom: 0.6, panTo: -0.6 });
    S.pop(T.fake0 + 0.3, 0.8, 0.7);
    // the spin: accelerating whooshes and a riser
    for (let i = 0; i < 18; i++) {
      const u = (i / 18) ** 0.6;
      const tt = T.spin0 + u * (T.spin1 - T.spin0) * 0.95;
      S.whoosh(tt, 0.25, 0.25 + 0.4 * u, { from: 500, to: 2600, panFrom: -0.8, panTo: 0.8 });
    }
    S.riser(T.spin0, T.dizzy, 0.8);
    for (let q = 0; q < 24; q++) { const tq = T.spin0 + q * K.beat * 0.5; if (tq > T.dizzy) break; S.hat(tq, 0.35); if (q % 2 === 0) S.kick(tq, 0.7); }
    // dizzy stop: the music winds down
    S.gate(T.dizzy, 0.15, 0.3);
    S.snap(T.dizzy, 1); S.boom(T.dizzy, 0.4);
    S.bell(T.dizzy + 0.2, n('E5'), 0.4, { bus: 'sfx', decay: 1 }); S.bell(T.dizzy + 0.45, n('D5'), 0.35, { bus: 'sfx', decay: 1 }); S.bell(T.dizzy + 0.7, n('C5'), 0.3, { bus: 'sfx', decay: 1 });
    // the slow turn: tension
    S.gate(T.away0, 0.6, 0.2);
    S.pad(T.away0, chord('C3', 'F#3', 'B3'), T.card - T.away0, 0.4, { attack: 0.6, release: 0.2, cutoff: 900 });
    S.riser(T.away0, T.card + 0.3, 0.6);
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE), 1.1);
    const hit = T.card + SIG_WIPE * 0.7;
    S.gate(hit, 1, 0.02);
    S.boom(hit, 0.5);
    S.stab(hit, chord('C4', 'E4', 'G4', 'D5'), 0.5, 0.8);
    S.bell(hit + 0.02, n('G5'), 0.5, { bus: 'sfx', decay: 2.2, verb: 0.6 });
    S.pad(hit, chord('C3', 'G3', 'E4', 'B4'), T.end - hit - 0.5, 0.45, { attack: 0.1, release: 0.5 });
    return S;
  },
};
export const makeShyBack = (v: string) => shootFilm(def, v);
