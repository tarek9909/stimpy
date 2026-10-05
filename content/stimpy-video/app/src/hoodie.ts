// The ghost hoodie. Drawn in local units (about 840 x 1060, origin mid-back),
// into its own offscreen canvas so lighting can be composited onto the fabric only.
import { cardCanvas } from './cards';
import { clamp } from './util';
import { avatar } from './avatar';

export type HoodieOpts = {
  x: number;
  y: number;
  s: number; // screen pixels per local unit
  walk: number; // walk phase (radians)
  walkAmt: number; // 0 = floating still, 1 = walking
  t: number;
  turn?: number; // 0 = back view, PI = front view
  rim?: string;
  rimAmt?: number;
  tint?: string; // ambient light color on the fabric
  tintAmt?: number;
  card?: number | null; // attached stimpie
  cardSettle?: number; // 0..1, the little bounce right after the click
  slotGlow?: number;
  snapFlash?: number;
  alpha?: number;
  sad?: number; // 3D avatar: slumped pose weight
};

// slot for the stimpie, in local units
export const SLOT = { x: -165, y: -235, w: 330, h: 515 };
const PAD = 70;
const BX0 = -430, BY0 = -610, BW = 860, BH = 1080;

let off: HTMLCanvasElement | null = null;

type P = [number, number];
const rot = (p: P, c: P, a: number): P => {
  const s = Math.sin(a), co = Math.cos(a);
  const dx = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co];
};

function sleeve(side: number, swing: number) {
  const pv: P = [side * 298, -275];
  const R = (x: number, y: number) => rot([side * x, y], pv, swing * side);
  const body = new Path2D();
  const a = R(300, -292), c1 = R(356, -250), c2 = R(386, -60), b = R(392, 300);
  const d = R(302, 305), c3 = R(298, 120), c4 = R(290, -60), e = R(284, -160);
  body.moveTo(...a);
  body.bezierCurveTo(...c1, ...c2, ...b);
  body.lineTo(...d);
  body.bezierCurveTo(...c3, ...c4, ...e);
  body.closePath();
  const cuff = new Path2D();
  const f = R(395, 360), g = R(298, 364);
  cuff.moveTo(...b);
  cuff.lineTo(...f);
  cuff.lineTo(...g);
  cuff.lineTo(...d);
  cuff.closePath();
  const crease = [R(305, 30), R(340, 55), R(385, 40), R(300, 90), R(345, 105), R(388, 95)];
  const ribs: [P, P][] = [];
  for (let i = 1; i < 12; i++) {
    const u = i / 12;
    ribs.push([
      [b[0] + (d[0] - b[0]) * u, b[1] + (d[1] - b[1]) * u],
      [f[0] + (g[0] - f[0]) * u, f[1] + (g[1] - f[1]) * u],
    ]);
  }
  return { body, cuff, crease, ribs, seam: [R(300, -290), R(286, -165)] as [P, P] };
}

function bodyPath(hem: number) {
  const p = new Path2D();
  p.moveTo(-150, -345);
  p.bezierCurveTo(-210, -330, -270, -310, -302, -288);
  p.lineTo(-297, 150);
  p.bezierCurveTo(-294, 250, -291 + hem, 300, -288 + hem, 338);
  p.lineTo(288 + hem, 338);
  p.bezierCurveTo(291 + hem, 300, 294, 250, 297, 150);
  p.lineTo(302, -288);
  p.bezierCurveTo(270, -310, 210, -330, 150, -345);
  p.closePath();
  return p;
}

function bandPath(hem: number) {
  const p = new Path2D();
  p.moveTo(-288 + hem, 336);
  p.lineTo(288 + hem, 336);
  p.lineTo(277 + hem * 1.3, 425);
  p.lineTo(-277 + hem * 1.3, 425);
  p.closePath();
  return p;
}

function hoodPath(front: boolean) {
  const p = new Path2D();
  const w = front ? 178 : 186;
  p.moveTo(-w, -325);
  p.bezierCurveTo(-w - 30, -420, -168, -548, -72, -580);
  p.bezierCurveTo(-36, -592, -12, -599, 0, -602);
  p.bezierCurveTo(12, -599, 36, -592, 72, -580);
  p.bezierCurveTo(168, -548, w + 30, -420, w, -325);
  if (front) p.bezierCurveTo(110, -298, -110, -298, -w, -325);
  else {
    // from behind, the hood hangs in a soft point down the back
    p.bezierCurveTo(130, -296, 62, -268, 0, -250);
    p.bezierCurveTo(-62, -268, -130, -296, -w, -325);
  }
  p.closePath();
  return p;
}

const FABRIC = '#121214';

export function slotRect(o: HoodieOpts) {
  if (avatar.ready) return avatar.slotRect(o);
  const bob = hoodieBob(o);
  return {
    cx: o.x + (SLOT.x + SLOT.w / 2) * o.s,
    cy: o.y + bob + (SLOT.y + SLOT.h / 2) * o.s,
    w: SLOT.w * o.s,
    h: SLOT.h * o.s,
    rot: hoodieSway(o),
  };
}
export const hoodieBob = (o: HoodieOpts) => Math.sin(o.t * 1.6) * 10 * o.s + Math.abs(Math.sin(o.walk)) * -12 * o.s * o.walkAmt;
export const hoodieSway = (o: HoodieOpts) => Math.sin(o.walk) * 0.018 * o.walkAmt + Math.sin(o.t * 0.9) * 0.01;

export function drawHoodie(ctx: CanvasRenderingContext2D, o: HoodieOpts) {
  if (avatar.ready) return avatar.draw(ctx, o);
  const s = o.s;
  const W = Math.ceil((BW + PAD * 2) * s), H = Math.ceil((BH + PAD * 2) * s);
  if (!off) off = document.createElement('canvas');
  if (off.width < W || off.height < H) {
    off.width = Math.max(off.width, W);
    off.height = Math.max(off.height, H);
  }
  const c = off.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W + 2, H + 2);
  c.setTransform(s, 0, 0, s, (-BX0 + PAD) * s, (-BY0 + PAD) * s);

  const turn = o.turn ?? 0;
  const front = Math.cos(turn) < 0;
  const swing = Math.sin(o.walk) * 0.09 * o.walkAmt + Math.sin(o.t * 1.3) * 0.02;
  const hem = Math.sin(o.walk + 0.6) * 5 * o.walkAmt;
  const L = sleeve(-1, front ? swing : -swing);
  const R = sleeve(1, front ? -swing : swing);
  const body = bodyPath(hem);
  const band = bandPath(hem);
  const hood = hoodPath(front);

  const fill = (p: Path2D, top = '#1b1b1e', bot = '#0c0c0d', y0 = -350, y1 = 430) => {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.fill(p);
  };
  const soft = (fn: () => void, blur: number) => {
    c.save();
    c.filter = `blur(${blur * s}px)`;
    fn();
    c.restore();
  };
  const stitch = (pts: P[], alpha = 0.13) => {
    c.save();
    c.strokeStyle = `rgba(255,255,255,${alpha})`;
    c.lineWidth = 1.6;
    c.setLineDash([7, 6]);
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
    c.stroke();
    c.restore();
  };

  // sleeves
  for (const sl of [L, R]) {
    fill(sl.body, '#18181b', '#0e0e10');
    fill(sl.cuff, '#101012', '#0a0a0b');
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1.2;
    for (const [a, b] of sl.ribs) {
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.stroke();
    }
    soft(() => {
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 9;
      for (let i = 0; i < sl.crease.length; i += 3) {
        c.beginPath();
        c.moveTo(...sl.crease[i]);
        c.quadraticCurveTo(...sl.crease[i + 1], ...sl.crease[i + 2]);
        c.stroke();
      }
    }, 4);
  }

  // body
  fill(body, '#1c1c1f', '#0d0d0f');
  c.save();
  c.clip(body);
  // shoulder-blade light + drape folds
  for (const sx of [-1, 1]) {
    const g = c.createRadialGradient(sx * 120, -170, 10, sx * 120, -170, 230);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-320, -400, 640, 500);
  }
  soft(() => {
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 16;
    c.beginPath();
    c.moveTo(-250, -190);
    c.bezierCurveTo(-225, 0, -250 + hem, 200, -222 + hem, 340);
    c.moveTo(250, -190);
    c.bezierCurveTo(228, 0, 252 + hem, 200, 225 + hem, 340);
    c.stroke();
    c.lineWidth = 10;
    for (let i = 0; i < 5; i++) {
      const x = -200 + i * 100 + hem;
      c.beginPath();
      c.moveTo(x - 40, 318);
      c.quadraticCurveTo(x, 290 + (i % 2) * 10, x + 40, 322);
      c.stroke();
    }
    // shadow under the hood
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.beginPath();
    c.ellipse(0, -282, 180, 50, 0, 0, Math.PI * 2);
    c.fill();
  }, 9);
  c.restore();
  stitch([[-302, -288], [-286, -165]]);
  stitch([[302, -288], [286, -165]]);

  // band
  fill(band, '#101012', '#09090a', 336, 425);
  c.strokeStyle = 'rgba(255,255,255,0.045)';
  c.lineWidth = 1.2;
  for (let i = 1; i < 60; i++) {
    const u = i / 60;
    c.beginPath();
    c.moveTo(-288 + hem + 576 * u, 338);
    c.lineTo(-277 + hem * 1.3 + 554 * u, 423);
    c.stroke();
  }

  if (!front) drawSlot(c, o);
  else drawFront(c, hem);

  // hood
  const hg = c.createRadialGradient(-30, -540, 10, 0, -450, 280);
  hg.addColorStop(0, front ? '#1a1a1d' : '#232327');
  hg.addColorStop(1, '#0d0d0f');
  c.fillStyle = hg;
  c.fill(hood);
  if (front) {
    // the face opening: nobody home
    c.save();
    c.clip(hood);
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(0, -425, 108, 128, 0, 0, Math.PI * 2);
    c.fill();
    const ig = c.createRadialGradient(0, -420, 5, 0, -420, 120);
    ig.addColorStop(0, 'rgba(255,42,26,0.22)');
    ig.addColorStop(1, 'rgba(255,42,26,0)');
    c.fillStyle = ig;
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 5;
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(236,230,218,0.5)';
    c.lineWidth = 3;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx * 40, -305);
      c.quadraticCurveTo(sx * 46, -220, sx * 38, -150);
      c.stroke();
    }
  } else {
    stitch([[0, -600], [0, -254]], 0.1);
    soft(() => {
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 12;
      c.beginPath();
      c.moveTo(-150, -350);
      c.quadraticCurveTo(-120, -450, -80, -520);
      c.moveTo(150, -350);
      c.quadraticCurveTo(120, -450, 80, -520);
      c.stroke();
    }, 7);
  }

  // light: rim along every edge, then an ambient tint, fabric only (source-atop)
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const rimAmt = o.rimAmt ?? 0;
  if (rimAmt > 0 && o.rim) {
    c.strokeStyle = o.rim;
    // a soft glow rather than a hard outline: wide + blurred, then a faint thin core
    c.save();
    c.filter = `blur(${6 * s}px)`;
    c.globalAlpha = clamp(rimAmt) * 0.9;
    c.lineWidth = 16;
    for (const p of [L.body, R.body, body, hood, band, L.cuff, R.cuff]) c.stroke(p);
    c.restore();
    c.globalAlpha = clamp(rimAmt) * 0.45;
    c.filter = `blur(${1.2 * s}px)`;
    c.lineWidth = 3;
    for (const p of [L.body, R.body, body, hood]) c.stroke(p);
    c.filter = 'none';
    const g = c.createLinearGradient(0, -600, 0, 100);
    g.addColorStop(0, o.rim);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.shadowBlur = 0;
    c.globalAlpha = clamp(rimAmt) * 0.22;
    c.fillStyle = g;
    c.fillRect(BX0, BY0, BW, BH);
  }
  if (o.tint && (o.tintAmt ?? 0) > 0) {
    c.globalAlpha = o.tintAmt!;
    c.fillStyle = o.tint;
    c.fillRect(BX0, BY0, BW, BH);
  }
  c.restore();

  // composite onto the frame (turn = horizontal squash + a side shade)
  const sx = Math.max(0.04, Math.abs(Math.cos(turn)));
  const bob = hoodieBob(o);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(o.x, o.y + bob);
  ctx.rotate(hoodieSway(o));
  ctx.scale(sx, 1);
  ctx.drawImage(off, 0, 0, W, H, (BX0 - PAD) * s, (BY0 - PAD) * s, W, H);
  ctx.restore();
}

function drawSlot(c: CanvasRenderingContext2D, o: HoodieOpts) {
  const { x, y, w, h } = SLOT;
  const glow = o.slotGlow ?? 0;
  if (o.card != null) {
    const st = o.cardSettle ?? 0;
    const k = 1 + 0.05 * st;
    const cw = w * k, ch = h * k;
    const cx = x + w / 2, cy = y + h / 2;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 18;
    c.shadowOffsetY = 6;
    c.fillStyle = '#000';
    c.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
    c.restore();
    c.drawImage(cardCanvas(o.card), cx - cw / 2, cy - ch / 2, cw, ch);
    // the card sits on fabric: darken edges, let the drape run through it
    c.save();
    c.beginPath();
    c.rect(cx - cw / 2, cy - ch / 2, cw, ch);
    c.clip();
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.2, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = g;
    c.fillRect(x - 20, y - 20, w + 40, h + 40);
    c.filter = 'blur(10px)';
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 18;
    c.beginPath();
    c.moveTo(x + 60, y);
    c.bezierCurveTo(x + 80, y + 200, x + 40, y + 360, x + 70, y + h);
    c.moveTo(x + w - 50, y);
    c.bezierCurveTo(x + w - 80, y + 220, x + w - 40, y + 380, x + w - 70, y + h);
    c.stroke();
    c.restore();
  } else {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 2;
    c.setLineDash([9, 7]);
    c.strokeRect(x, y, w, h);
    if (glow > 0) {
      c.strokeStyle = `rgba(255,42,26,${clamp(glow)})`;
      c.shadowColor = '#ff2a1a';
      c.shadowBlur = 30 * glow;
      c.lineWidth = 3.5;
      c.strokeRect(x, y, w, h);
    }
    c.restore();
  }
  // snap studs: the attachment mechanism
  const f = o.snapFlash ?? 0;
  for (const [sx, sy] of [[x + 20, y + 20], [x + w - 20, y + 20], [x + 20, y + h - 20], [x + w - 20, y + h - 20]]) {
    const g = c.createRadialGradient(sx - 3, sy - 3, 1, sx, sy, 11);
    g.addColorStop(0, '#9a9a9f');
    g.addColorStop(0.5, '#3a3a3e');
    g.addColorStop(1, '#141416');
    c.fillStyle = g;
    c.beginPath();
    c.arc(sx, sy, 10, 0, Math.PI * 2);
    c.fill();
    if (f > 0.01 || glow > 0.01) {
      c.save();
      c.globalAlpha = clamp(Math.max(f, glow * 0.7));
      c.fillStyle = f > glow ? '#fff' : '#ff2a1a';
      c.shadowColor = '#ff2a1a';
      c.shadowBlur = 30;
      c.beginPath();
      c.arc(sx, sy, 6 + 6 * f, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
}

function drawFront(c: CanvasRenderingContext2D, hem: number) {
  // kangaroo pocket
  c.strokeStyle = 'rgba(255,255,255,0.1)';
  c.lineWidth = 2;
  c.setLineDash([7, 6]);
  c.beginPath();
  c.moveTo(-170 + hem, 330);
  c.lineTo(-130, 150);
  c.lineTo(130, 150);
  c.lineTo(170 + hem, 330);
  c.stroke();
  c.setLineDash([]);
  // chest print: front = brand
  c.fillStyle = '#ece6da';
  c.font = '900 34px ArchivoX';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('STIMPY', 150, -200);
  c.fillStyle = '#ff2a1a';
  c.beginPath();
  c.moveTo(138, -172);
  c.lineTo(162, -172);
  c.lineTo(150, -158);
  c.closePath();
  c.fill();
}
