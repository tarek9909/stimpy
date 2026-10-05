// Hands: a flat, stylised hand in a black hoodie sleeve that pinches the zip pull (or a panel).
import { C, mix } from '../../engine/brand';
import type { Ctx } from '../../engine/draw';

const SKIN = C.cream, SKIN_SH = mix(C.cream, C.coral, 0.3), SKIN_LINE = mix(C.cream, '#000000', 0.32);

/** A flat, stylised hand pinching at (x, y), its arm (in a black hoodie sleeve) reaching back toward `from`. */
export function hand(c: Ctx, x: number, y: number, from: [number, number], s: number, pinch: number) {
  const ang = Math.atan2(from[1] - y, from[0] - x);
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.scale(s, s);
  // the sleeve and its ribbed cuff
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 50; c.shadowOffsetY = 24;
  c.fillStyle = '#1c1c1c';
  c.beginPath(); c.roundRect(150, -78, 2600, 156, 50); c.fill();
  c.restore();
  c.fillStyle = '#262626';
  c.beginPath(); c.roundRect(122, -70, 92, 140, 26); c.fill();
  c.strokeStyle = '#333333'; c.lineWidth = 4;
  c.beginPath(); for (let i = 0; i < 7; i++) { c.moveTo(134 + i * 12, -60); c.lineTo(134 + i * 12, 60); } c.stroke();
  // fingers and thumb as capsules: an outline pass, then the skin
  const open = 1 - pinch;
  const caps: [number, number, number, number, number][] = [
    [96, -46, 30, -36 - 6 * open, 30],          // middle (curled)
    [96, 46, 36, 38, 28],                        // ring (curled)
    [92, -30, -2, -6 - 22 * open, 32],           // index → the pinch
    [80, 40, 0, 8 + 24 * open, 36],              // thumb → the pinch
  ];
  for (const pass of [0, 1]) {
    c.lineCap = 'round';
    c.strokeStyle = pass ? SKIN : SKIN_LINE;
    for (const [x0, y0, x1, y1, w] of caps) { c.lineWidth = w + (pass ? 0 : 7); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    c.fillStyle = pass ? SKIN : SKIN_LINE;
    c.beginPath(); c.roundRect(52 - (pass ? 0 : 3.5), -62 - (pass ? 0 : 3.5), 110 + (pass ? 0 : 7), 124 + (pass ? 0 : 7), 50); c.fill();
  }
  // a little shading and the knuckle lines
  c.fillStyle = SKIN_SH;
  c.globalAlpha = 0.55;
  c.beginPath(); c.roundRect(120, -58, 40, 116, 20); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = SKIN_LINE; c.lineWidth = 3.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(70, -24); c.quadraticCurveTo(64, 0, 72, 22); c.stroke();
  c.restore();
}

