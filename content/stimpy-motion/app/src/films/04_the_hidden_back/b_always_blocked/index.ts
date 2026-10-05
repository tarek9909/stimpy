// 04 · B · ALWAYS BLOCKED (10 s). A running gag: we follow someone from behind through five different streets,
// and every single time something is exactly in the way of the back: a box, a pole, a hand on the lens, a
// jacket, a "Not yet." pop-up. Then the zip itself closes over everything: "The back changes. Soon."
import { C, rgba, mix } from '../../../engine/brand';
import { text, type Ctx } from '../../../engine/draw';
import { zipWipe } from '../../../engine/zipper';
import { art } from '../../../art/designs';
import { Score, n, chord } from '../../../audio/score';
import { W, H, SIG_WIPE, wipeTravelStart } from '../../common';
import { ease, seg, lerp, pulse, wobble, clamp, TAU, clock } from '../../../engine/util';
import { street, STREETS, walker, poseAt, panelRect, footShadow, pr, scaleAt, type Pose } from '../../shoot/walker';
import { lineCard, shootFilm, type ShootDef } from '../../shoot/cards';

const K = clock(120);
const CLIP = K.beat * 3; // 1.5 s per street, cut on the beat
const T = { card: CLIP * 5, end: 10 };
const Z = 1.75; // the walker stays this far ahead: we are tracking with them
const KINDS = ['box', 'pole', 'hand', 'jacket', 'popup'] as const;

function pose(t: number): Pose {
  const s = scaleAt(Z);
  const [, feet] = pr(0, 1, Z);
  return poseAt(W / 2, feet, s, (Math.PI * t) / K.beat);
}

// ---------------------------------------------------------------- the blockers
function box(c: Ctx, r: { x: number; y: number; w: number; h: number }, u: number, t: number) {
  // a friend carrying a big box across, right in the way
  const cx = lerp(r.x + r.w / 2 + 120, r.x + r.w / 2 - 120, u), cy = r.y + r.h / 2 + 30;
  const bw = 560, bh = 470;
  const step = (Math.PI * t) / (K.beat * 0.8);
  // their legs under the box
  for (const side of [-1, 1]) {
    const lift = Math.max(0, Math.sin(step) * side);
    c.fillStyle = '#3a4a6a';
    c.beginPath(); c.roundRect(cx + side * 70 - 40, cy + bh / 2 - 20, 80, 600 - lift * 40, 20); c.fill();
    c.fillStyle = C.white;
    c.beginPath(); c.roundRect(cx + side * 70 - 52 + side * 10, cy + bh / 2 + 560 - lift * 60, 104, 50, 18); c.fill();
  }
  c.save();
  c.translate(cx, cy + Math.abs(Math.sin(step)) * -10);
  c.rotate(0.02 * Math.sin(step));
  c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 40; c.shadowOffsetY = 20;
  c.fillStyle = '#C89B6C';
  c.beginPath(); c.roundRect(-bw / 2, -bh / 2, bw, bh, 10); c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(-bw / 2, -bh / 2, bw, 70);
  c.fillStyle = '#E7D3B5';
  c.fillRect(-40, -bh / 2, 80, bh);
  text(c, 'THIS SIDE UP', 0, 60, { size: 40, weight: 800, color: 'rgba(17,17,17,0.55)', align: 'center', track: 0.1 });
  c.strokeStyle = 'rgba(17,17,17,0.55)'; c.lineWidth = 10; c.lineCap = 'round';
  for (const ax of [-170, 170]) { c.beginPath(); c.moveTo(ax, 150); c.lineTo(ax, 90); c.moveTo(ax - 22, 112); c.lineTo(ax, 88); c.lineTo(ax + 22, 112); c.stroke(); }
  // their hands on the sides
  c.fillStyle = C.cream;
  for (const side of [-1, 1]) { c.beginPath(); c.roundRect(side * (bw / 2) - 34, -40, 68, 110, 30); c.fill(); }
  c.restore();
}

function pole(c: Ctx, r: { x: number; y: number; w: number; h: number }, u: number) {
  // a lamp post in the foreground, out of focus, sliding by with the parallax
  const cx = lerp(r.x + r.w / 2 + 70, r.x + r.w / 2 - 70, u);
  c.save();
  c.filter = 'blur(10px)';
  const g = c.createLinearGradient(cx - 200, 0, cx + 200, 0);
  g.addColorStop(0, '#1b1b1b'); g.addColorStop(0.35, '#4a4a4a'); g.addColorStop(0.5, '#2a2a2a'); g.addColorStop(1, '#141414');
  c.fillStyle = g;
  c.fillRect(cx - 200, -100, 400, H + 200);
  // a sticker on it, the only sharp-ish thing
  c.fillStyle = C.coral;
  c.beginPath(); c.arc(cx, 980, 90, 0, TAU); c.fill();
  c.restore();
}

function lensHand(c: Ctx, r: { x: number; y: number; w: number; h: number }, t: number, u: number) {
  // the operator's hand comes up over the lens: huge, soft, warm
  const cx = r.x + r.w / 2 + 40 + 20 * Math.sin(t * 5), cy = r.y + r.h / 2 + lerp(500, 20, ease.outBack(seg(u, 0, 0.18)));
  c.save();
  c.filter = 'blur(14px)';
  c.translate(cx, cy);
  c.rotate(-0.12);
  const sk = mix(C.cream, C.coral, 0.25);
  c.fillStyle = sk;
  c.beginPath(); c.ellipse(0, 120, 330, 380, 0, 0, TAU); c.fill();
  const fingers = [[-230, -230, 70, 300], [-80, -330, 74, 340], [70, -320, 72, 330], [210, -230, 66, 280]] as const;
  for (const [x, y, w, h] of fingers) { c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, w / 2); c.fill(); }
  c.beginPath(); c.ellipse(-360, 120, 70, 190, -0.7, 0, TAU); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.beginPath(); c.ellipse(60, 220, 240, 200, 0, 0, TAU); c.fill();
  c.fillStyle = '#1c1c1c';
  c.fillRect(-380, 460, 760, 900);
  c.restore();
}

function jacket(c: Ctx, p: Pose, t: number) {
  // a coral jacket slung over the shoulder, hanging down the back and swinging with the walk
  c.save();
  c.translate(p.x, p.y); c.rotate(p.rot + 0.03 * Math.sin(p.phase + 0.6)); c.scale(p.s, p.s); c.translate(-500, -500);
  c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
  c.fillStyle = C.coral;
  c.beginPath();
  c.moveTo(300, 285); c.quadraticCurveTo(500, 255, 705, 290);
  c.lineTo(728, 800 + 10 * Math.sin(p.phase)); c.quadraticCurveTo(500, 830, 280, 800 + 10 * Math.sin(p.phase + 1));
  c.closePath(); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = mix(C.coral, '#000000', 0.25); c.lineWidth = 6; c.lineCap = 'round';
  for (const x of [400, 520, 630]) { c.beginPath(); c.moveTo(x, 320); c.quadraticCurveTo(x + 20, 560, x - 10, 790); c.stroke(); }
  c.fillStyle = mix(C.coral, '#000000', 0.18);
  c.beginPath(); c.roundRect(300, 270, 410, 60, 30); c.fill();
  // the hand holding it at the shoulder
  c.fillStyle = C.cream;
  c.beginPath(); c.roundRect(470, 230, 80, 90, 34); c.fill();
  c.restore();
}

function popup(c: Ctx, r: { x: number; y: number; w: number; h: number }, t: number, u: number) {
  const a = ease.outBack(seg(u, 0.05, 0.22), 2.2);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 10;
  const w = 600, h = 330;
  c.save();
  c.translate(cx, cy); c.scale(a, a);
  c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
  c.fillStyle = C.white;
  c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 36); c.fill();
  c.shadowColor = 'transparent';
  text(c, 'Not yet.', 0, -10, { size: 92, weight: 800, color: C.black, align: 'center' });
  text(c, 'The back is loading…', 0, 52, { size: 30, weight: 500, color: rgba(C.black, 0.6), align: 'center' });
  c.fillStyle = rgba(C.black, 0.1);
  c.beginPath(); c.roundRect(-220, 96, 440, 16, 8); c.fill();
  c.fillStyle = C.coral;
  c.beginPath(); c.roundRect(-220, 96, 440 * clamp(0.1 + 0.85 * seg(u, 0.2, 1) ** 0.5), 16, 8); c.fill();
  text(c, '×', w / 2 - 44, -h / 2 + 62, { size: 46, weight: 500, color: rgba(C.black, 0.4), align: 'center' });
  c.restore();
}

function scene(c: Ctx, t: number) {
  const k = Math.min(KINDS.length - 1, Math.floor(t / CLIP));
  const u = (t - k * CLIP) / CLIP;
  const look = STREETS[k % STREETS.length]!;
  street(c, look, t * 1.4 + k * 5);
  const p = pose(t);
  const [, feet] = pr(0, 1, Z);
  footShadow(c, p.x, feet, p.s);
  walker(c, p, { panel: { art: art('flame', t), zip: 1 } });
  const r = panelRect(p);
  const kind = KINDS[k]!;
  if (kind === 'box') box(c, r, u, t);
  else if (kind === 'pole') pole(c, r, u);
  else if (kind === 'hand') lensHand(c, r, t, u);
  else if (kind === 'jacket') jacket(c, p, t);
  else popup(c, r, t, u);
}

const def: ShootDef = {
  id: 'blocked', title: '04 · B · Always Blocked', code: '04 · B', duration: T.end,
  shots: [
    { t: 0, title: 'The box', note: 'Tracking behind them down a street. A friend crosses in front with a big box, perfectly in the way of the back.' },
    { t: CLIP, title: 'The pole', note: 'Cut. Another street. Walk past a pole or tree that covers the back the whole time (camera low, pole close to the lens).' },
    { t: CLIP * 2, title: 'Hand on the lens', note: 'Cut. The operator\'s free hand comes up over the lens, right on the back.' },
    { t: CLIP * 3, title: 'The jacket', note: 'Cut. They have a jacket slung over the shoulder, hanging down the back.' },
    { t: CLIP * 4, title: 'Not yet.', note: 'Cut. A "Not yet." pop-up (made in the edit) lands on the back.' },
    { t: T.card, title: 'End card', note: 'Zip to 00 · End cards → soon ("The back changes. Soon.").' },
  ],
  draw(c, t, post) {
    post.vignette = 0.12;
    if (t < T.card) {
      scene(c, t);
      const cut = Math.floor(t / CLIP) * CLIP;
      post.flash = cut > 0 ? 0.12 * pulse(t - cut, 14) : 0;
      post.shakeY = 3 * Math.sin((Math.PI * t) / K.beat * 2) + 6 * wobble(t - cut, 10, 12);
      return;
    }
    zipWipe(c, (t - T.card) / SIG_WIPE, (k) => scene(k, t), (k) => lineCard(k, t - T.card - SIG_WIPE * 0.7, { small: 'The back changes.', big: 'Soon.' }), { dir: 'down', teeth: C.white, tape: C.black });
    post.vignette = 0.3;
  },
  score() {
    const S = new Score(T.end, { delayTime: K.beat * 0.75 });
    const prog = [chord('F4', 'A4', 'C5', 'E5'), chord('D4', 'F4', 'A4', 'C5'), chord('A#3', 'D4', 'F4', 'A4'), chord('C4', 'E4', 'G4', 'A#4'), chord('F4', 'A4', 'C5', 'E5')];
    const roots = [n('F1'), n('D2'), n('A#1'), n('C2'), n('F1')];
    for (let q = 0; K.b(q) < T.card; q++) {
      const tq = K.b(q), k = Math.floor(q / 3);
      S.kick(tq, 0.9);
      S.hat(tq + K.beat / 2, 0.5);
      if (q % 2) S.clap(tq, 0.5);
      S.bass(tq, roots[k]!, K.beat * 0.4, 0.75);
      S.bass(tq + K.beat / 2, roots[k]! + 12, K.beat * 0.25, 0.5);
      S.pluck(tq + K.beat * 0.75, prog[k]![q % 4]!, 0.15, 0.3, { pan: q % 2 ? 0.3 : -0.3 });
      if (q % 3 === 0) {
        // each cut: a stab and a cheeky "nope" bloop
        S.stab(tq, prog[k]!, 0.3, 0.7);
        S.pop(tq + 0.12, 0.8, 0.55); S.pop(tq + 0.2, 0.6, 0.45);
      }
    }
    // footsteps
    for (let q = 0; K.b(q) < T.card; q++) S.shaker(K.b(q) + 0.02, 0.4, q % 2 ? 0.3 : -0.3);
    S.whoosh(CLIP * 2 - 0.05, 0.3, 0.6, { from: 300, to: 1800, panFrom: 0.4, panTo: 0 });
    S.signatureZip(wipeTravelStart(T.card, SIG_WIPE), 1.1);
    const hit = T.card + SIG_WIPE * 0.7;
    S.boom(hit, 0.5);
    S.stab(hit, chord('F4', 'A4', 'C5', 'G5'), 0.5, 0.8);
    S.bell(hit + 0.02, n('C6'), 0.45, { bus: 'sfx', decay: 2, verb: 0.6 });
    S.pad(hit, chord('F3', 'C4', 'A4', 'E5'), T.end - hit - 0.4, 0.45, { attack: 0.1, release: 0.4 });
    return S;
  },
};
export const makeAlwaysBlocked = (v: string) => shootFilm(def, v);
