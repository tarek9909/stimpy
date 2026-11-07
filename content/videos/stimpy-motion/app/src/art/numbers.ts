// Countdown Stimpies: the design IS the number, in a different art style every day.
// Each painter draws a 300 × 364 panel; `age` is the time since the reveal (negative = not yet revealed).
import { C, rgba } from '../engine/brand';
import { drawIcon, LOGO } from '../engine/logo';
import { text, makeCanvas, type Ctx } from '../engine/draw';
import { TAU, clamp, ease, spring, mulberry, seg, hash } from '../engine/util';

export type NumberArt = (c: Ctx, w: number, h: number, age: number) => void;

function sign(c: Ctx, w: number, h: number, dark: boolean) {
  drawIcon(c, w - 26, h - 26, 20, dark ? LOGO.onBlack : LOGO.onWhite, { strokeScale: 1.7 });
}
function centered(c: Ctx, s: string, font: string, x: number, y: number) {
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const m = c.measureText(s);
  return { y: y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 };
}

/** 5 — bold pop-art graphic: a heavy black 5 with a coral drop shadow on butter, halftone corners. */
export const FIVE: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.butter; c.fillRect(0, 0, w, h);
  c.fillStyle = rgba(C.coral, 0.9);
  for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 14) {
    const d = Math.min(Math.hypot(x, y), Math.hypot(w - x, h - y)) / 210;
    const r = (1 - d) * 5.5;
    if (r > 0.3) { c.beginPath(); c.arc(x + ((y / 14) % 2 ? 7 : 0), y, r, 0, TAU); c.fill(); }
  }
  const s = age < 0 ? 0.001 : spring(age, 2.6, 0.38);
  const off = 16 * ease.outCubic(seg(age, 0.1, 0.45));
  c.save();
  c.translate(w / 2, h / 2 + 10);
  c.scale(s, s);
  c.rotate(-0.06);
  const f = '900 330px Poppins';
  const { y } = centered(c, '5', f, 0, 0);
  c.fillStyle = C.coral; c.fillText('5', off, y + off);
  c.fillStyle = C.black; c.fillText('5', 0, y);
  c.lineWidth = 5; c.strokeStyle = C.white; c.lineJoin = 'round';
  c.save(); c.beginPath(); c.rect(-200, -200, 400, 120); c.clip(); c.strokeText('5', -3, y - 3); c.restore();
  c.restore();
  text(c, 'DAYS', 22, 44, { size: 26, weight: 800, color: C.black, track: 0.1 });
  sign(c, w, h, false);
};

// 4 — built from a pattern: a dot matrix; the dots inside the glyph pop in from the centre.
let fourMask: boolean[][] | null = null;
const GX = 15, GY = 18;
function mask4() {
  if (fourMask) return fourMask;
  const { cv, c } = makeCanvas(GX * 10, GY * 10);
  c.fillStyle = '#000';
  c.font = '900 176px Poppins'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const m = c.measureText('4');
  // centre the glyph's ink box in the grid
  c.fillText('4', GX * 5 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, GY * 5 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  const d = c.getImageData(0, 0, cv.width, cv.height).data;
  fourMask = [...Array(GY)].map((_, j) => [...Array(GX)].map((_, i) => d[((j * 10 + 5) * cv.width + (i * 10 + 5)) * 4 + 3]! > 100));
  return fourMask;
}
export const FOUR: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.sky; c.fillRect(0, 0, w, h);
  const m = mask4();
  const cw = w / GX, ch = (h - 40) / GY;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const on = m[j]![i]!;
    const x = (i + 0.5) * cw, y = 20 + (j + 0.5) * ch;
    const d = Math.hypot(i - GX / 2, j - GY / 2);
    const a = age - d * 0.028;
    const pop = on ? (a < 0 ? 0 : spring(a, 3.2, 0.35)) : 1;
    const r = on ? cw * 0.47 * pop : cw * 0.12;
    c.fillStyle = on ? (hash(i * 31 + j) > 0.9 ? C.coral : C.blue) : C.white;
    c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fill();
  }
  text(c, 'DAYS', 20, 38, { size: 22, weight: 700, color: C.black, track: 0.12 });
  sign(c, w, h, false);
};

/** 3 — inflated: a glossy balloon 3 floating on lilac. */
export const THREE: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.lilac; c.fillRect(0, 0, w, h);
  c.save();
  c.translate(w / 2, h / 2);
  c.fillStyle = rgba(C.white, 0.35);
  for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-18, -400); c.lineTo(18, -400); c.fill(); }
  c.restore();
  const inflate = age < 0 ? 0.3 : 0.3 + 0.7 * spring(age, 1.8, 0.3);
  const bob = Math.sin(age * 2.4) * 6;
  c.save();
  c.translate(w / 2, h / 2 + 8 + bob);
  c.scale(inflate, inflate);
  const f = '900 310px Poppins';
  const { y } = centered(c, '3', f, 0, 0);
  c.lineJoin = 'round';
  c.lineWidth = 46; c.strokeStyle = C.blue; c.strokeText('3', 0, y + 8);
  c.lineWidth = 36; c.strokeStyle = C.white; c.strokeText('3', 0, y);
  const g = c.createLinearGradient(-100, -150, 100, 150);
  g.addColorStop(0, C.white); g.addColorStop(0.45, C.lilac); g.addColorStop(1, C.blue);
  c.fillStyle = g; c.fillText('3', 0, y);
  c.fillStyle = rgba(C.white, 0.9);
  c.beginPath(); c.ellipse(-50, -95, 22, 10, -0.5, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(-8, 30, 12, 6, -0.4, 0, TAU); c.fill();
  c.restore();
  text(c, 'DAYS', w / 2, 46, { size: 26, weight: 800, color: C.blue, align: 'center', track: 0.12 });
  sign(c, w, h, false);
};

/** 2 — a neon sign: coral tube with a white core on a black wall; it flickers on. */
export const TWO: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.black; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#1c1c1c'; c.lineWidth = 2;
  for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); for (let x = (y / 22) % 2 ? 0 : 22; x < w; x += 44) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 22); c.stroke(); } }
  const flick = age < 0 ? 0 : age < 0.5 ? (hash(Math.floor(age * 30)) > 0.45 ? 1 : 0.15) : 1;
  const buzz = 0.93 + 0.07 * Math.sin(age * 90);
  const on = flick * buzz;
  c.save();
  c.translate(w / 2, h / 2 + 14);
  const f = '700 300px Poppins';
  const { y } = centered(c, '2', f, 0, 0);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = 14; c.strokeStyle = rgba(C.coral, 0.25 + 0.75 * on);
  c.shadowColor = C.coral; c.shadowBlur = 40 * on;
  c.strokeText('2', 0, y);
  c.shadowBlur = 12 * on;
  c.lineWidth = 4; c.strokeStyle = rgba(C.white, 0.3 + 0.7 * on);
  c.strokeText('2', 0, y);
  c.restore();
  c.save();
  c.shadowColor = C.sky; c.shadowBlur = 18 * on;
  text(c, 'days', w / 2, 58, { size: 38, weight: 500, italic: true, color: on > 0.5 ? C.sky : rgba(C.sky, 0.3), align: 'center' });
  c.restore();
  sign(c, w, h, true);
};

/** 1 — elegant: a serif italic 1 in cream on electric blue, with butter stars. */
export const ONE: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.blue; c.fillRect(0, 0, w, h);
  c.strokeStyle = C.white; c.lineWidth = 2.5;
  c.strokeRect(14, 14, w - 28, h - 28);
  c.strokeRect(20, 20, w - 40, h - 40);
  const r = mulberry(1);
  for (let i = 0; i < 14; i++) {
    const x = 30 + r() * (w - 60), y = 40 + r() * (h - 80), s = 4 + r() * 7;
    const tw = age < 0 ? 0 : clamp((age - i * 0.05) * 3) * (0.6 + 0.4 * Math.sin(age * 4 + i));
    if (tw <= 0) continue;
    c.fillStyle = C.butter;
    c.save(); c.translate(x, y); c.scale(tw, tw);
    c.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, rr = k % 2 ? s * 0.35 : s; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.fill(); c.restore();
  }
  const rise = age < 0 ? 0 : ease.outCubic(seg(age, 0, 0.6));
  c.save();
  c.beginPath(); c.rect(0, 40, w, h - 80); c.clip();
  const f = 'italic 600 340px Corm';
  const { y } = centered(c, '1', f, 0, 0);
  c.fillStyle = C.cream;
  c.fillText('1', w / 2, h / 2 + y + 20 + (1 - rise) * 300);
  c.restore();
  text(c, 'LAST DAY', w / 2, h - 40, { size: 20, weight: 600, color: C.cream, align: 'center', track: 0.3 });
  sign(c, w, h, true);
};

/** Tomorrow — graffiti: a bubble tag on coral with butter and sky spray. */
export const TOMORROW: NumberArt = (c, w, h, age) => {
  c.fillStyle = C.coral; c.fillRect(0, 0, w, h);
  const r = mulberry(12);
  for (let i = 0; i < 320; i++) {
    const a = r() * TAU, d = Math.pow(r(), 0.5) * 150;
    c.fillStyle = rgba(i % 2 ? C.butter : C.sky, 0.55);
    c.fillRect(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * 1.2, 2.5, 2.5);
  }
  const lines = ['TOMOR', 'ROW.'];
  lines.forEach((s, i) => {
    const a = age < 0 ? 0 : spring(age - i * 0.14, 2.8, 0.36);
    c.save();
    c.translate(w / 2 + (i ? 10 : -4), 158 + i * 124);
    c.rotate(-0.1 + i * 0.05);
    c.scale(a, a);
    c.font = `900 ${i ? 120 : 96}px ArchivoC`;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.lineWidth = 20; c.strokeStyle = C.black; c.strokeText(s, 0, 0);
    c.fillStyle = C.white; c.fillText(s, 0, 0);
    c.lineWidth = 3; c.strokeStyle = C.butter; c.strokeText(s, -3, -4);
    c.restore();
  });
  c.fillStyle = C.white;
  for (let i = 0; i < 5; i++) {
    const x = 70 + i * 40 + r() * 10, L = age < 0 ? 0 : Math.min(1, age * 1.5) * (20 + r() * 50);
    c.fillRect(x, 262, 5, L);
    c.beginPath(); c.arc(x + 2.5, 262 + L, 4.5, 0, TAU); c.fill();
  }
  sign(c, w, h, false);
};
