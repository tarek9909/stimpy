// Overhead (top-down) table shots: a hoodie lying back-up on a cream table in window daylight, a hand
// working the zip around the Stimpie's edge, and the open (unzipped) track drawn ahead of the pull.
import { C } from '../../engine/brand';
import type { Ctx } from '../../engine/draw';
import { drawHoodie, hoodiePoint, DOCK, type Art, type HoodieOpts } from '../../engine/hoodie';
import { roundRectTrack, openTeeth } from '../../engine/zipper';
import { W, H, fill, fabricFill } from '../common';
import { hand } from './hands';

export const TRACK = roundRectTrack(0, 0, DOCK.w, DOCK.h, DOCK.r);
export const HOODIE = '#161616';

/** The cream table with soft window light falling across it (the light drifts with `phase`, 0..1). */
export function table(c: Ctx, phase: number) {
  fill(c, C.cream);
  const g = c.createRadialGradient(W * 0.2, H * 0.15, 100, W * 0.5, H * 0.5, 1500);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(120,90,60,0.12)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
/** Window light: soft bright bars across everything (draw last). */
export function windowLight(c: Ctx, phase: number) {
  c.save();
  c.globalCompositeOperation = 'soft-light';
  c.filter = 'blur(40px)';
  c.fillStyle = 'rgba(255,255,255,0.75)';
  const dx = Math.sin(phase * Math.PI * 2) * 30;
  for (let i = 0; i < 3; i++) {
    const x0 = -400 + i * 380 + dx;
    c.beginPath();
    c.moveTo(x0, -100); c.lineTo(x0 + 220, -100); c.lineTo(x0 + 220 + 900, H + 100); c.lineTo(x0 + 900, H + 100);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** The hoodie lying flat, a soft contact shadow under it, the panel zipped to `zip`, and the open track ahead. */
export function flatHoodie(c: Ctx, h: HoodieOpts, o: { art: Art | null; zip: number; lift?: number }) {
  // contact shadow
  c.save();
  c.translate(18, 26);
  c.filter = 'blur(18px)';
  drawHoodie(c, { ...h, flat: 'rgba(60,40,20,0.35)', panel: null });
  c.restore();
  const empty: Art = (k) => fabricFill(k, HOODIE);
  drawHoodie(c, { ...h, panel: { art: o.art ?? empty, zip: o.zip, parked: o.zip >= 1, lift: o.lift ?? 0, teeth: '#3d3d3d' } });
  // the open half of the zip, ahead of the pull
  if (o.zip < 1) {
    c.save();
    c.translate(h.x, h.y); c.scale(h.s, h.s); c.translate(-500, -500);
    c.translate(DOCK.x, DOCK.y - (o.lift ?? 0) * 40);
    const s0 = o.zip * TRACK.len + 10;
    const A: { x: number; y: number }[] = [], B: { x: number; y: number }[] = [];
    for (let s = s0; s <= TRACK.len; s += 5) {
      const p = TRACK.at(s);
      const gap = 3.5 + Math.min(1, (s - s0) / 60) * 2.5;
      A.push({ x: p.x - p.ty * gap, y: p.y + p.tx * gap });
      B.push({ x: p.x + p.ty * gap, y: p.y - p.tx * gap });
    }
    const st = { pitch: 7, size: 5, color: '#4a4a4a', tape: '#232323', tapeW: 5 };
    openTeeth(c, A, st, 1, 0);
    openTeeth(c, B, st, -1, 3.5);
    c.restore();
  }
}

/** Where a hand pinches the coral pull at zip position z (0..1 round the edge), on screen. */
export function pullOnScreen(h: HoodieOpts, z: number, lift = 0): [number, number] {
  const p = TRACK.at(Math.min(z, 0.9999) * TRACK.len);
  return hoodiePoint(h, DOCK.x + p.x - p.tx * 21, DOCK.y + p.y - p.ty * 21 - lift * 40);
}

export function pinchHand(c: Ctx, at: [number, number], from: [number, number], s: number, pinch: number) {
  // a soft shadow of the hand on the table
  c.save();
  c.globalAlpha = 0.25;
  c.translate(16, 24);
  c.filter = 'brightness(0) blur(10px)';
  hand(c, at[0], at[1], from, s, pinch);
  c.restore();
  hand(c, at[0], at[1], from, s, pinch);
}
