// 04 · D · OUT OF FRAME (10 s). A handheld follow from behind where the camera is clearly not allowed to show
// the back: shoes only (a tilt up… snapped back down), the hood only (a tilt down… jerked back up), a sleeve,
// a whip pan across the back so fast it's a smear, then only their shadow on the pavement. A final tilt up…
// and the zip cuts it: "The back changes. Soon."
import { C } from '../../../engine/brand';
import { scratch, blit, type Ctx } from '../../../engine/draw';
import { zipWipe } from '../../../engine/zipper';
import { art } from '../../../art/designs';
import { Score, n, chord } from '../../../audio/score';
import { W, H, fill, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, lerp, pulse, clock, noise1, wobble } from '../../../engine/util';
import { walker, legs, poseAt, STREETS, type Pose } from '../../shoot/walker';
import { lineCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(110);
const T = { hood: 1.9, sleeve: 3.6, whip0: 4.5, whip1: 4.72, shadow: 5.1, last: 6.8, card: 7.5, end: 10 };
const LOOK = STREETS[0]!;
const GROUND = 1100;
const phaseAt = (t: number) => (Math.PI * t) / K.beat;

/** A bump: 0 → 1 over [a, b], then snaps back to 0 over [b, c]. */
const bump = (t: number, a: number, b: number, cc: number) => ease.inOutQuad(seg(t, a, b)) * (1 - ease.inCubic(seg(t, b, cc)));

interface Cam { cx: number; cy: number; S: number; vx: number; vy: number }
/** The camera in walker-local units (the walker's hoodie box: x 0..1000, feet at y 1396). */
function cam(t: number): Cam {
  let cx = 500, cy = 1255, S = 3.4, vx = 0, vy = 0;
  if (t < T.hood) {
    const up = bump(t, 1.0, 1.5, 1.62);
    cy = 1255 - 230 * up;
    if (t > 1.5 && t < 1.62) vy = 230 * 0.4;
  } else if (t < T.sleeve) {
    cy = 25 + 62 * bump(t, 2.7, 3.05, 3.15);
    if (t > 3.05 && t < 3.15) vy = -60 * 0.4;
  } else if (t < T.shadow) {
    S = 3.8; cy = 640;
    const w = ease.inOutCubic(seg(t, T.whip0, T.whip1));
    cx = lerp(200, 800, w);
    if (t > T.whip0 && t < T.whip1) vx = 600 * 0.35;
  } else {
    cy = 1255 - 160 * ease.inQuad(seg(t, T.last + 0.3, T.card + 0.2));
  }
  // handheld
  cx += 6 * noise1(t * 1.3);
  cy += 6 * noise1(t * 1.1 + 5);
  return { cx, cy, S, vx, vy };
}

function world(c: Ctx, t: number, p: Pose) {
  // the far street behind them
  const blocks = [LOOK.left, LOOK.right, LOOK.accent, C.cream, C.coral, C.lilac];
  for (let i = -6; i < 9; i++) {
    const x = i * 260, h = 900 + ((i * 397) % 500);
    c.fillStyle = blocks[(i + 12) % blocks.length]!;
    c.fillRect(x, GROUND - h, 262, h);
    c.fillStyle = 'rgba(17,17,17,0.75)';
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) c.fillRect(x + 50 + q * 100, GROUND - h + 90 + r * 190, 60, 110);
  }
  // the pavement, rushing under us
  c.fillStyle = LOOK.ground;
  c.fillRect(-3000, GROUND, 7000, 3000);
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 4;
  const off = (t * 520) % 180;
  for (let y = GROUND + off; y < GROUND + 2000; y += 180) { c.beginPath(); c.moveTo(-3000, y); c.lineTo(4000, y); c.stroke(); }
  for (let x = -3000; x < 4000; x += 240) { c.beginPath(); c.moveTo(x, GROUND); c.lineTo(x + (x - 500) * 0.4, GROUND + 2000); c.stroke(); }
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.filter = 'blur(10px)';
  c.beginPath(); c.ellipse(500, 1402, 270, 40, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  walker(c, p, { panel: { art: art('night', t), zip: 1 } });
}

/** Paint, with an extra smear along (vx, vy) local units: a whip pan. */
function framed(c: Ctx, t: number) {
  const k = cam(t);
  const p = poseAt(500, 1396, 1, phaseAt(t));
  const paint = (cc: Ctx, ox: number, oy: number) => {
    fill(cc, LOOK.sky);
    cc.save();
    cc.translate(W / 2, H / 2);
    cc.rotate(0.012 * noise1(t * 0.9 + 9));
    cc.scale(k.S, k.S);
    cc.translate(-k.cx - ox, -k.cy - oy);
    world(cc, t, p);
    cc.restore();
  };
  if (!k.vx && !k.vy) { paint(c, 0, 0); return; }
  const L = scratch();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1) - 0.5;
    paint(L.c, k.vx * f, k.vy * f);
    c.save();
    c.globalAlpha = 1 / (i + 1);
    blit(c, L.cv);
    c.restore();
  }
  L.release();
}

/** Only their shadow, stretched down the pavement toward us. */
function shadowShot(c: Ctx, t: number) {
  fill(c, LOOK.ground);
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 8;
  const off = (t * 1500) % 420;
  for (let y = -420 + off; y < H; y += 420) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  for (let x = 60; x < W; x += 480) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  const feet = 170 + 6 * noise1(t * 2);
  const p = poseAt(W / 2 + 10 * noise1(t), feet, 1.35, phaseAt(t));
  const L = scratch();
  L.c.translate(0, feet);
  L.c.transform(1, 0, 0.1, -0.85, 0, 0);
  L.c.translate(0, -feet);
  walker(L.c, p, { flat: '#000000' });
  c.save();
  c.globalAlpha = 0.3;
  c.filter = 'blur(4px)';
  blit(c, L.cv);
  c.restore();
  L.release();
  // just the shoes at the top of frame
  legs(c, p);
}

function scene(c: Ctx, t: number) {
  if (t >= T.shadow && t < T.last) shadowShot(c, t);
  else framed(c, t);
}

const def: ShootDef = {
  id: 'outofframe', title: '04 · D · Out of Frame', code: '04 · D', duration: T.end,
  shots: [
    { t: 0, title: 'Shoes only', note: 'Handheld, following from behind, framed tight on the shoes. Tilt up slowly… stop at the hem and snap straight back down.' },
    { t: T.hood, title: 'Hood only', note: 'Cut. Framed on the hood. Start to tilt down, then jerk back up.' },
    { t: T.sleeve, title: 'A sleeve', note: 'Cut. Framed on one sleeve swinging as they walk.' },
    { t: T.whip0, title: 'Whip pan', note: 'Whip-pan hard across the back to the other sleeve. The motion blur hides everything.' },
    { t: T.shadow, title: 'Only the shadow', note: 'Cut. Point down at the pavement: shoes at the top, their shadow stretching toward you (sun low in front of them).' },
    { t: T.last, title: 'The final tilt…', note: 'Back on the shoes. Start tilting up…' },
    { t: T.card, title: '…cut', note: 'Zip to 00 · End cards → soon before anything shows.' },
  ],
  draw(c, t, post) {
    post.vignette = 0.16;
    if (t < T.card) {
      scene(c, t);
      const cuts = [T.hood, T.sleeve, T.shadow, T.last];
      const last = [...cuts].reverse().find((x) => t >= x) ?? -9;
      post.flash = 0.08 * pulse(t - last, 14);
      post.shakeY = 8 * wobble(t - 1.62, 9, 9) + 6 * wobble(t - 3.15, 9, 9);
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => lineCard(k, t - T.card - SIG_WIPE * 0.7, { small: 'The back changes.', big: 'Soon.' }), { dir: 'down', teeth: C.white, tape: C.black });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    // sneaky, tiptoeing bass and plucks
    const notes = [n('E2'), n('G2'), n('A2'), n('B2'), n('A2'), n('G2'), n('E2'), n('D2')];
    for (let q = 0; K.b(q) < T.card; q++) {
      const tq = K.b(q);
      S.bass(tq, notes[q % 8]!, K.beat * 0.35, 0.6, { cutoff: 700 });
      S.hat(tq + K.beat / 2, 0.35);
      if (q % 2 === 0) S.kick(tq, 0.55, { duck: 0.3 });
      S.shaker(tq + 0.02, 0.4, q % 2 ? 0.3 : -0.3); // footsteps
      if (q % 4 === 2) S.pluck(tq, [n('E5'), n('G5'), n('B5'), n('D6')][(q / 4 | 0) % 4]!, 0.15, 0.3);
    }
    // every "nope": a swish and a bloop
    for (const tn of [1.5, 3.05]) { S.whoosh(tn - 0.02, 0.18, 0.6, { from: 900, to: 3000, panFrom: 0, panTo: 0 }); S.pop(tn + 0.08, 0.8, 0.5); }
    for (const tc of [T.hood, T.sleeve, T.shadow, T.last]) S.snap(tc, 0.5);
    S.whoosh(T.whip0 - 0.05, T.whip1 - T.whip0 + 0.15, 1, { from: 300, to: 4500, panFrom: -0.9, panTo: 0.9 });
    S.riser(T.last + 0.2, T.card + 0.4, 0.6);
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE), 1.1);
    const hit = T.card + SIG_WIPE * 0.7;
    S.boom(hit, 0.5);
    S.stab(hit, chord('E4', 'G4', 'B4', 'F#5'), 0.5, 0.8);
    S.bell(hit + 0.02, n('B5'), 0.45, { bus: 'sfx', decay: 2, verb: 0.6 });
    S.pad(hit, chord('E3', 'B3', 'G4', 'D5'), T.end - hit - 0.4, 0.45, { attack: 0.1, release: 0.4 });
    return S;
  },
};
export const makeOutOfFrame = (v: string) => shootFilm(def, v);
