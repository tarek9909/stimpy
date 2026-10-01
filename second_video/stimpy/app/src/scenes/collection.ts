// 40–48 s — THE COLLECTION. Breakdown. A wall of holographic Stimpie cards turns over one by one:
// collect them, swap them, trade them. Then the empty slot — "your design here" — lifts out and flies
// into the lens.
import type { Stage } from '../engine/stage';
import { W, H, DIST, SAFE } from '../engine/gl';
import { seg, ease, lerp, clamp, pulse } from '../engine/util';
import { CARD } from '../engine/cards';
import { EV, INK, BLUE, mono, display, riseText } from './common';

const COLS = 3, ROWS = 4, GAP = 30, Z = -800, GY = -120;
const PICK = 11;

function slot(i: number): [number, number] {
  const col = i % COLS, row = Math.floor(i / COLS);
  return [(col - (COLS - 1) / 2) * (CARD.w + GAP), GY + ((ROWS - 1) / 2 - row) * (CARD.h + GAP)];
}

export function collection(S: Stage, t: number) {
  S.hoodie.group.visible = false;
  const c = S.bgc();
  c.fillStyle = '#EDE8DE';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(14,14,16,0.07)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  // camera: from close on one card, pulling back to the wall
  const pull = ease.inOutCubic(seg(t, 40, 41.8));
  const [fx, fy] = slot(4);
  S.cam({ tx: lerp(fx, 0, pull), ty: lerp(fy, 0, pull), tz: lerp(Z, 0, pull), dist: lerp(900, DIST, pull), yaw: lerp(0.25, 0, pull), roll: lerp(-0.05, 0, pull) });
  S.light.uL.value.set(-0.3, 0.5, 0.8).normalize();

  const pick = seg(t, EV.pick, EV.pick + 0.9);
  const fly = ease.inExpo(seg(t, EV.fly - 0.2, 48.0));
  for (let i = 0; i < 12; i++) {
    const [x, y] = slot(i);
    const flipU = seg(t, EV.flips[i]!, EV.flips[i]! + 0.55);
    const ry = Math.PI * (1 - ease.outBack(flipU, 1.6));
    const wave = Math.sin(t * 1.4 + i * 0.7) * 0.1;
    const col = i % COLS;
    if (i === PICK) {
      const lift = ease.outCubic(pick);
      S.cards.set(i, {
        x: lerp(x, 0, lift), y: lerp(y, GY, lift), z: Z + lift * 900 + fly * (DIST - 420 - Z - 900),
        rx: wave * (1 - lift), ry: ry + (Math.sin(t * 1.1 + col) * 0.12) * (1 - lift), rz: lerp(0, -0.04, lift) * (1 - fly),
        scale: 1 + 0.2 * lift, glint: t * 0.5 + i * 0.13,
      });
    } else {
      S.cards.set(i, {
        x, y, z: Z - pick * 80, rx: wave, ry: ry + Math.sin(t * 1.1 + col * 0.8) * 0.14, glint: t * 0.5 + i * 0.13,
        opacity: 1 - 0.55 * pick,
      });
    }
  }

  // one headline at a time above the wall
  const f = S.fgc();
  const lines = ['COLLECT THEM.', 'SWAP THEM.', 'TRADE THEM.'];
  const hy = SAFE.top + 130;
  lines.forEach((s, i) => {
    const t0 = 42 + i * 1.4, t1 = i < 2 ? t0 + 1.4 : EV.pick;
    if (t < t0 || t >= t1) return;
    riseText(f, seg(t, t0, t0 + 0.5), 0, hy, 90, (dy) => display(f, s, W / 2, hy + dy, { size: 80, color: i === 2 ? BLUE : INK }));
  });
  mono(f, 'DROP 01 — 11 STIMPIES + 1', SAFE.left, SAFE.top + 20, { color: INK, size: 20, weight: 700, alpha: seg(t, 41.5, 41.9) });
  const owned = Math.min(11, Math.max(0, Math.floor((t - 40.5) / 0.25) + 1));
  mono(f, `${String(owned).padStart(2, '0')} / 12`, SAFE.right, SAFE.top + 20, { color: INK, size: 20, align: 'right', alpha: seg(t, 41.5, 41.9) });
  if (t > EV.pick) {
    riseText(f, seg(t, EV.pick + 0.2, EV.pick + 0.6), 0, hy, 90, (dy) => display(f, 'ONE SLOT LEFT.', W / 2, hy + dy, { size: 80, color: INK, alpha: 1 - fly }));
  }
  S.post.flash = clamp(fly * 1.3 - 0.3) + 0.12 * pulse(t - 40, 6);
  S.post.flashColor.set('#F6F1E6');
  S.post.vignette = 0.25;
  S.post.grain = 0.04;
  S.post.fade = 1 - clamp((t - 40) / 0.08);
  void H;
}
