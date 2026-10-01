// A world per Stimpie: when the panel changes, the whole environment changes with it. Each draws a full
// 1080×1920 background (behind the hoodie) from the song time `t` and the time since the swap `age`.
// The identity word sits above the hoodie and fits the frame's width.
import type { Ctx } from '../engine/draw2d';
import { text, measure } from '../engine/draw2d';
import { W, H } from '../engine/gl';
import { TAU, mulberry, ease, clamp, pulse } from '../engine/util';
import { flower, stars, skyline, tigerStripes, checkerTunnel, drawDoodle } from './designs';
import { walkFloor, floorShadow } from '../scenes/common';

export type World = (c: Ctx, t: number, age: number, word: string) => void;

const beatOf = (t: number) => t * 2; // 120 BPM
const WY = 540;          // identity word
const FLOOR = H * 0.84;  // floor line under the hoodie

function bigWord(c: Ctx, s: string, age: number, o: { y: number; size: number; color: string; family?: 'ArchivoX' | 'ArchivoC' | 'Corm'; italic?: boolean; weight?: number; track?: number; alpha?: number }) {
  const u = ease.outExpo(age / 0.45);
  const opts = { size: o.size, family: o.family ?? 'ArchivoX', weight: o.weight ?? 900, italic: o.italic, track: o.track ?? -0.04 } as const;
  const fit = Math.min(1, (W - 70) / measure(c, s, opts));
  const k = fit * (1 + (1 - u) * 0.12);
  c.save();
  c.globalAlpha = (o.alpha ?? 1) * clamp(age / 0.08);
  c.translate(W / 2, o.y + (1 - u) * 60);
  c.scale(k, k);
  text(c, s, 0, 0, { ...opts, color: o.color, align: 'center', baseline: 'middle' });
  c.restore();
}

export const WORLDS: Record<string, World> = {
  static(c, t, age, word) {
    c.fillStyle = '#E9E4DA'; c.fillRect(0, 0, W, H);
    // halftone field swelling from a drifting centre
    const cx = W / 2 + Math.sin(t * 0.7) * 200, cy = H * 0.55 + Math.cos(t * 0.5) * 250;
    const kick = pulse((beatOf(t) % 1) / 2, 6);
    c.fillStyle = '#0E0E10';
    const s = 30;
    for (let y = 0; y < H + s; y += s) for (let x = ((y / s) % 2) * s / 2; x < W + s; x += s) {
      const d = Math.hypot(x - cx, y - cy) / 1000;
      const r = Math.max(0, (1 - d) * s * 0.42 * (0.8 + 0.25 * kick) + Math.sin(x * 0.01 + y * 0.013 + t * 2) * 1.5);
      if (r < 0.6) continue;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    bigWord(c, word, age, { y: WY, size: 440, color: '#FF3B1F', track: -0.05 });
    // ticker
    const ty = H * 0.87;
    c.fillStyle = '#FF3B1F'; c.fillRect(0, ty, W, 56);
    const tick = 'STATIC — SIGNAL LOST — Nº001 — ';
    c.save();
    c.beginPath(); c.rect(0, ty, W, 56); c.clip();
    const off = -((t * 260) % 1100);
    for (let x = off; x < W; x += 1100) text(c, tick, x, ty + 40, { size: 30, family: 'ArchivoX', weight: 900, color: '#E9E4DA', track: 0.02 });
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1.5);
    floorShadow(c, W / 2, FLOOR, 440, 0.35);
  },

  bloom(c, t, age, word) {
    c.fillStyle = '#F2C4CC'; c.fillRect(0, 0, W, H);
    bigWord(c, word, age, { y: WY - 20, size: 600, color: '#8E1420', family: 'Corm', italic: true, weight: 600, track: -0.02 });
    const rnd = mulberry(314);
    const cols = ['#FFF4E4', '#C8232C', '#F2892B', '#E0607E', '#FFFFFF'];
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = rnd() * H, r = 26 + rnd() * 60, pet = 5 + Math.floor(rnd() * 4), col = cols[i % cols.length]!, rot = rnd() * TAU;
      const a = age - i * 0.03;
      if (a <= 0) continue;
      if ((Math.abs(x - W / 2) < 300 && y > 760) || (y > 360 && y < 700)) continue; // keep the hoodie and the word clear
      flower(c, x, y + Math.sin(t * 1.3 + i) * 6, r, pet, col, '#F6C945', rot + t * 0.25 * (i % 2 ? 1 : -1), ease.outBack(a / 0.45, 2.2));
    }
    // falling petals
    c.fillStyle = '#FFF4E4';
    for (let i = 0; i < 50; i++) {
      const px = (rnd() * W + Math.sin(t + i) * 40) % W, py = ((rnd() * H + t * (60 + rnd() * 60)) % (H + 40)) - 20;
      c.save(); c.translate(px, py); c.rotate(t * 2 + i); c.beginPath(); c.ellipse(0, 0, 5, 10, 0, 0, TAU); c.fill(); c.restore();
    }
    floorShadow(c, W / 2, FLOOR, 440, 0.3);
  },

  orbit(c, t, age, word) {
    c.fillStyle = '#2B3DFF'; c.fillRect(0, 0, W, H);
    stars(c, W, H, 5, 300, 'rgba(237,232,222,0.8)', t);
    bigWord(c, word, age, { y: WY, size: 170, color: '#EDE8DE', track: -0.03 });
    c.save();
    c.translate(W / 2, H * 0.6);
    c.rotate(-0.35);
    c.strokeStyle = 'rgba(237,232,222,0.7)'; c.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const r = 360 + i * 120, k = ease.outExpo((age - i * 0.05) / 0.6);
      if (k <= 0) continue;
      c.beginPath(); c.ellipse(0, 0, r * k, r * 0.36 * k, 0, 0, TAU); c.stroke();
      const a = t * (0.5 - i * 0.06) + i * 1.7;
      const px = Math.cos(a) * r * k, py = Math.sin(a) * r * 0.36 * k;
      c.fillStyle = i === 2 ? '#FF6A2B' : '#EDE8DE';
      c.beginPath(); c.arc(px, py, 10 + (i % 3) * 8, 0, TAU); c.fill();
    }
    c.restore();
    walkFloor(c, t, '#EDE8DE', 0.2, H * 0.7);
    floorShadow(c, W / 2, FLOOR, 440, 0.4);
  },

  night(c, t, age, word) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060A22'); g.addColorStop(1, '#2A3A82');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    stars(c, W, H * 0.75, 9, 380, '#F4E7C5', t);
    // moon
    c.fillStyle = '#F4E7C5';
    c.beginPath(); c.arc(W * 0.8, H * 0.36, 80, 0, TAU); c.fill();
    c.fillStyle = 'rgba(6,10,34,0.96)';
    c.beginPath(); c.arc(W * 0.8 + 36, H * 0.36 - 20, 70, 0, TAU); c.fill();
    bigWord(c, word, age, { y: WY, size: 190, color: '#F4E7C5', track: 0.0 });
    // two skyline layers drifting past: the walk
    c.save(); c.translate(-((t * 40) % 600), 0);
    skyline(c, W + 700, H * 0.8, 12, '#141C45', '#8F8AB8', 3, 0.15);
    c.restore();
    c.save(); c.translate(-((t * 110) % 700), 0);
    skyline(c, W + 800, H * 0.88, 13, '#04060F', '#FFD66B', 4, 0.3);
    c.restore();
    c.fillStyle = '#04060F'; c.fillRect(0, H * 0.88, W, H * 0.12);
    // streetlight glow sweeping by
    const lx = W + 200 - ((t * 300) % (W + 400));
    const lg = c.createRadialGradient(lx, H * 0.45, 0, lx, H * 0.45, 420);
    lg.addColorStop(0, 'rgba(255,214,107,0.35)'); lg.addColorStop(1, 'rgba(255,214,107,0)');
    c.fillStyle = lg; c.fillRect(0, 0, W, H);
  },

  heat(c, t, age, word) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#FF2E1A'); g.addColorStop(0.55, '#FF7A1A'); g.addColorStop(1, '#FFD23F');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(0, -((t * 120) % 180));
    tigerStripes(c, W, H + 200, '#121010', 8, 90, t * 2);
    c.restore();
    bigWord(c, word, age, { y: WY, size: 360, color: '#EDE8DE', family: 'ArchivoC', track: -0.02 });
    // heat shimmer lines
    c.strokeStyle = 'rgba(255,240,200,0.35)'; c.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = H - ((t * 220 + i * 140) % (H + 100));
      c.beginPath();
      for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x * 0.012 + t * 6 + i) * 10);
      c.stroke();
    }
    floorShadow(c, W / 2, FLOOR, 440, 0.4);
  },

  acid(c, t, age, word) {
    const flip = Math.floor(beatOf(t)) % 2 === 1;
    const a = flip ? '#0B0B0B' : '#D4FF3A', b = flip ? '#D4FF3A' : '#0B0B0B';
    c.fillStyle = a; c.fillRect(0, 0, W, H);
    checkerTunnel(c, W / 2, H * 0.55, 1400, a, b, t * 1.6, 20, 28);
    c.fillStyle = b; c.fillRect(0, WY - 100, W, 200);
    bigWord(c, word, age, { y: WY, size: 200, color: a, track: -0.02 });
  },

  mine(c, t, age, word) {
    c.fillStyle = '#F6F1E6'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(43,61,255,0.16)'; c.lineWidth = 1.5;
    for (let y = 60; y < H; y += 44) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(226,59,46,0.35)';
    c.beginPath(); c.moveTo(90, 0); c.lineTo(90, H); c.stroke();
    bigWord(c, word, age, { y: WY - 20, size: 480, color: '#E23B2E', family: 'Corm', italic: true, weight: 600, track: -0.02 });
    // scattered doodles (scaled copies of the panel drawing, drawn in stroke by stroke)
    const spots: [number, number, number, number][] = [[170, 850, 0.5, -0.2], [920, 900, 0.45, 0.25], [150, 1450, 0.5, 0.15], [930, 1420, 0.55, -0.12]];
    spots.forEach(([x, y, s, r], i) => {
      c.save(); c.translate(x, y); c.rotate(r); c.scale(s, s); c.translate(-150, -182);
      drawDoodle(c, clamp((age - i * 0.1) / 0.8));
      c.restore();
    });
    floorShadow(c, W / 2, FLOOR, 440, 0.25);
  },
};
