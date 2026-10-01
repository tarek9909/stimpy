// The Stimpies: procedural, animated back-panel designs built only from the brand palette. Each is signed
// with the small split S in a corner (brand: "each one carries the small split-S icon in a corner").
// Panel units: 300 × 364. `t` animates the design (seconds); static uses draw a cached t = 0 render.
import { C, rgba, mix } from '../engine/brand';
import { drawIcon, LOGO } from '../engine/logo';
import { makeCanvas, text, type Ctx } from '../engine/draw';
import type { Art } from '../engine/hoodie';
import { TAU, mulberry, noise1, fract, clamp } from '../engine/util';

export interface Design {
  id: string;
  name: string;
  /** the identity it gives you */
  word: string;
  /** world colour: the background that matches it (brief: "the background colour changes to match") */
  world: string;
  /** text colour on the world colour */
  ink: string;
  /** the colours it leaks (hints / glows) */
  glow: string[];
  draw: (c: Ctx, w: number, h: number, t: number) => void;
}

type Sig = 'dark' | 'light' | 'coral';
function sign(c: Ctx, w: number, h: number, kind: Sig) {
  const col = kind === 'dark' ? LOGO.onBlack : kind === 'coral' ? LOGO.main : LOGO.onWhite;
  drawIcon(c, w - 26, h - 26, 20, col, { strokeScale: 1.7 });
}

// ---------------------------------------------------------------- FLAME
function flameShape(c: Ctx, x: number, base: number, wd: number, ht: number, t: number, seed: number) {
  const sway = noise1(t * 1.7 + seed) * wd * 0.35;
  const tip = noise1(t * 2.3 + seed * 3) * wd * 0.25;
  c.beginPath();
  c.moveTo(x - wd / 2, base);
  c.bezierCurveTo(x - wd * 0.62, base - ht * 0.45, x - wd * 0.1 + sway, base - ht * 0.55, x + sway + tip, base - ht);
  c.bezierCurveTo(x + wd * 0.25 + sway, base - ht * 0.6, x + wd * 0.7, base - ht * 0.35, x + wd / 2, base);
  c.closePath();
}
const FLAME: Design = {
  id: 'flame', name: 'FLAME', word: 'LOUD', world: C.coral, ink: C.black, glow: [C.coral, C.butter],
  draw(c, w, h, t) {
    c.fillStyle = C.black; c.fillRect(0, 0, w, h);
    const layers: [string, number, number][] = [[C.coral, 1, 0], [C.butter, 0.68, 10], [C.white, 0.36, 20]];
    for (const [col, k, sd] of layers) {
      c.fillStyle = col;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (w / n) + noise1(i * 7 + sd) * 8;
        const ht = h * (0.45 + 0.4 * (0.5 + 0.5 * noise1(i * 3.1 + t * 1.3 + sd))) * k;
        flameShape(c, x, h + 6, (w / n) * 1.9 * (0.7 + k * 0.3), ht, t, i * 5.3 + sd);
        c.fill();
      }
    }
    // embers
    const r = mulberry(7);
    c.fillStyle = C.butter;
    for (let i = 0; i < 14; i++) {
      const x0 = r() * w, sp = 40 + r() * 60, ph = r();
      const y = h - fract(ph + t * sp / h) * h * 1.1;
      c.globalAlpha = clamp(y / h);
      c.beginPath(); c.arc(x0 + Math.sin(t * 3 + i) * 6, y, 2 + r() * 2.5, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    text(c, 'LOUD', w / 2, 74, { size: 64, weight: 900, color: C.white, align: 'center', track: -0.02 });
    sign(c, w, h, 'dark');
  },
};

// ---------------------------------------------------------------- BLOOM
function flower(c: Ctx, x: number, y: number, r: number, petals: number, col: string, center: string, rot: number) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.fillStyle = col;
  for (let i = 0; i < petals; i++) {
    c.save(); c.rotate((i / petals) * TAU);
    c.beginPath(); c.ellipse(0, -r * 0.56, r * 0.3, r * 0.52, 0, 0, TAU); c.fill();
    c.restore();
  }
  c.fillStyle = center;
  c.beginPath(); c.arc(0, 0, r * 0.28, 0, TAU); c.fill();
  c.restore();
}
const BLOOM: Design = {
  id: 'bloom', name: 'BLOOM', word: 'SOFT', world: C.lilac, ink: C.black, glow: [C.lilac, C.butter],
  draw(c, w, h, t) {
    c.fillStyle = C.lilac; c.fillRect(0, 0, w, h);
    const r = mulberry(21);
    const cols = [C.butter, C.white, C.coral, C.cream, C.sky];
    for (let i = 0; i < 16; i++) {
      const x = r() * w, y = r() * h, R = 22 + r() * 26;
      const col = cols[i % cols.length]!;
      flower(c, x, y, R, 5 + (i % 3), col, col === C.coral ? C.butter : C.coral, t * (0.25 + r() * 0.3) * (i % 2 ? 1 : -1) + r() * 6);
    }
    flower(c, w * 0.5, h * 0.48, 92, 8, C.butter, C.coral, t * 0.2);
    c.fillStyle = C.white;
    c.beginPath(); c.arc(w * 0.5 - 8, h * 0.48 - 8, 8, 0, TAU); c.fill();
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- STATIC (op-art checker)
const STATIC: Design = {
  id: 'static', name: 'STATIC', word: 'CHAOS', world: C.white, ink: C.black, glow: [C.white, C.coral],
  draw(c, w, h, t) {
    c.fillStyle = C.white; c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.46;
    c.fillStyle = C.black;
    const n = 12, cell = w / n;
    for (let j = -1; j < h / cell + 1; j++) for (let i = -1; i <= n; i++) {
      if ((i + j) % 2) continue;
      const pts: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      c.beginPath();
      pts.forEach(([u, v], k) => {
        let x = u * cell, y = v * cell;
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        const k2 = 1 + 0.55 * Math.exp(-(d * d) / 9000) * (0.8 + 0.2 * Math.sin(t * 2));
        const a = 0.9 * Math.exp(-(d * d) / 16000) * Math.sin(t * 0.9);
        const ca = Math.cos(a), sa = Math.sin(a);
        x = cx + (dx * ca - dy * sa) * k2; y = cy + (dx * sa + dy * ca) * k2;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.fill();
    }
    c.fillStyle = C.coral;
    c.beginPath(); c.arc(cx, cy, 44 + 4 * Math.sin(t * 4), 0, TAU); c.fill();
    c.fillStyle = C.blue;
    c.fillRect(0, h - 40, w, 40);
    text(c, 'CHAOS/01', 16, h - 13, { size: 17, family: 'Plex', weight: 700, color: C.white, track: 0.08 });
    sign(c, w, h, 'dark');
  },
};

// ---------------------------------------------------------------- WAVE
const WAVE: Design = {
  id: 'wave', name: 'WAVE', word: 'CALM', world: C.sky, ink: C.black, glow: [C.sky, C.blue],
  draw(c, w, h, t) {
    c.fillStyle = C.cream; c.fillRect(0, 0, w, h);
    // sun
    c.fillStyle = C.coral;
    c.beginPath(); c.arc(w * 0.68, h * 0.22, 42, 0, TAU); c.fill();
    const bands = [C.sky, C.white, C.blue, C.sky, C.white, C.blue, C.black];
    bands.forEach((col, i) => {
      const y0 = h * 0.3 + i * 38;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, h + 10);
      for (let x = 0; x <= w + 1; x += 6) {
        const y = y0 + Math.sin(x * 0.045 + t * (1.4 + i * 0.2) + i * 1.3) * 12 + Math.sin(x * 0.11 - t * 2 + i) * 4;
        c.lineTo(x, y);
      }
      c.lineTo(w, h + 10);
      c.closePath();
      c.fill();
    });
    sign(c, w, h, 'dark');
  },
};

// ---------------------------------------------------------------- NIGHT
const NIGHT: Design = {
  id: 'night', name: 'NIGHT', word: 'NIGHT', world: C.blue, ink: C.white, glow: [C.blue, C.butter],
  draw(c, w, h, t) {
    c.fillStyle = C.blue; c.fillRect(0, 0, w, h);
    c.fillStyle = C.black;
    c.fillRect(0, h * 0.78, w, h);
    const r = mulberry(5);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h * 0.75, s = 1 + r() * 2.5;
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + r() * 3) + i);
      c.fillStyle = rgba(C.white, 0.35 + 0.65 * tw);
      c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    }
    // crescent moon
    c.fillStyle = C.butter;
    c.beginPath(); c.arc(w * 0.46, h * 0.36, 78, 0, TAU); c.fill();
    c.fillStyle = C.blue;
    c.beginPath(); c.arc(w * 0.46 + 34, h * 0.36 - 22, 70, 0, TAU); c.fill();
    // lilac clouds drifting
    c.fillStyle = C.lilac;
    for (const [bx, by, s] of [[40, 250, 1], [230, 200, 0.8]] as const) {
      const x = ((bx + t * 12 * s) % (w + 120)) - 60;
      c.beginPath();
      c.arc(x, by, 22 * s, 0, TAU); c.arc(x + 26 * s, by - 10 * s, 26 * s, 0, TAU); c.arc(x + 54 * s, by, 20 * s, 0, TAU);
      c.rect(x, by, 54 * s, 20 * s);
      c.fill();
    }
    // skyline
    c.fillStyle = C.black;
    const rr = mulberry(9);
    let x = 0;
    while (x < w) { const bw = 20 + rr() * 30, bh = 30 + rr() * 60; c.fillRect(x, h * 0.78 - bh, bw, bh + 2); x += bw; }
    c.fillStyle = C.butter;
    const rw = mulberry(11);
    for (let i = 0; i < 26; i++) { if (rw() < 0.5 + 0.3 * Math.sin(t + i)) continue; c.fillRect(rw() * w, h * 0.78 - rw() * 70, 4, 5); }
    sign(c, w, h, 'dark');
  },
};

// ---------------------------------------------------------------- SUN
const SUN: Design = {
  id: 'sun', name: 'SUN', word: 'DAY', world: C.butter, ink: C.black, glow: [C.butter, C.coral],
  draw(c, w, h, t) {
    c.fillStyle = C.butter; c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.52;
    c.save();
    c.translate(cx, cy); c.rotate(t * 0.3);
    c.fillStyle = C.cream;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a0) * 400, Math.sin(a0) * 400); c.lineTo(Math.cos(a1) * 400, Math.sin(a1) * 400); c.closePath(); c.fill();
    }
    c.restore();
    c.fillStyle = C.coral;
    c.beginPath(); c.arc(cx, cy, 84, 0, TAU); c.fill();
    // a simple face: calm, confident
    c.fillStyle = C.black;
    const bl = Math.abs(Math.sin(t * 1.3)) > 0.97 ? 0.15 : 1;
    c.beginPath(); c.ellipse(cx - 28, cy - 12, 7, 10 * bl, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(cx + 28, cy - 12, 7, 10 * bl, 0, 0, TAU); c.fill();
    c.lineWidth = 7; c.strokeStyle = C.black; c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy + 8, 30, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    text(c, 'GOOD DAY', cx, 58, { size: 38, weight: 800, color: C.black, align: 'center', track: 0.02 });
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- TAG (graffiti)
const TAG: Design = {
  id: 'tag', name: 'TAG', word: 'STREET', world: C.cream, ink: C.black, glow: [C.coral, C.cream],
  draw(c, w, h, t) {
    c.fillStyle = C.cream; c.fillRect(0, 0, w, h);
    const r = mulberry(33);
    // spray dust
    for (let i = 0; i < 260; i++) {
      const a = r() * TAU, d = Math.pow(r(), 0.6) * 120;
      c.fillStyle = rgba(i % 3 ? C.coral : C.blue, 0.5);
      c.fillRect(w / 2 + Math.cos(a) * d * 1.2, h * 0.46 + Math.sin(a) * d, 2, 2);
    }
    // the bubble tag "YOU" in outlined heavy letters
    c.save();
    c.translate(w / 2, h * 0.52);
    c.rotate(-0.12);
    c.font = `900 118px ArchivoX`;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.lineWidth = 22; c.strokeStyle = C.black; c.strokeText('YOU', 0, 0);
    c.fillStyle = C.coral; c.fillText('YOU', 0, 0);
    c.lineWidth = 4; c.strokeStyle = C.white; c.strokeText('YOU', -3, -4);
    c.restore();
    // drips
    c.fillStyle = C.coral;
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 36 + r() * 10, y0 = h * 0.55, L = 20 + r() * 70 + Math.sin(t * 0.8 + i) * 6;
      c.fillRect(x, y0, 6, L);
      c.beginPath(); c.arc(x + 3, y0 + L, 5, 0, TAU); c.fill();
    }
    // scribbles
    c.strokeStyle = C.black; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 40; i++) { const x = 30 + i * 6, y = 70 + Math.sin(i * 1.7) * 12 + r() * 6; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    c.fillStyle = C.black;
    text(c, '★ 4 EVER ★', w / 2, h - 44, { size: 22, family: 'Plex', weight: 700, color: C.black, align: 'center', track: 0.1 });
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- ORBIT
const ORBIT: Design = {
  id: 'orbit', name: 'ORBIT', word: 'DREAM', world: C.black, ink: C.white, glow: [C.sky, C.lilac],
  draw(c, w, h, t) {
    c.fillStyle = C.black; c.fillRect(0, 0, w, h);
    const r = mulberry(3);
    c.fillStyle = C.white;
    for (let i = 0; i < 50; i++) { c.globalAlpha = 0.3 + r() * 0.7; c.fillRect(r() * w, r() * h, 2, 2); }
    c.globalAlpha = 1;
    const cx = w / 2, cy = h * 0.48;
    // orbits
    c.strokeStyle = rgba(C.white, 0.25); c.lineWidth = 2;
    for (const R of [110, 140]) { c.beginPath(); c.ellipse(cx, cy, R, R * 0.38, -0.3, 0, TAU); c.stroke(); }
    const moon = (R: number, sp: number, col: string, s: number, front: boolean) => {
      const a = t * sp;
      const x = cx + Math.cos(a) * R, y0 = Math.sin(a) * R * 0.38;
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) return;
      const cr = Math.cos(-0.3), sr = Math.sin(-0.3);
      const dx = x - cx;
      c.fillStyle = col;
      c.beginPath(); c.arc(cx + dx * cr - y0 * sr, cy + dx * sr + y0 * cr, s, 0, TAU); c.fill();
    };
    moon(110, 1.1, C.sky, 14, false); moon(140, -0.7, C.lilac, 11, false);
    // planet with ring
    c.fillStyle = C.coral;
    c.beginPath(); c.arc(cx, cy, 70, 0, TAU); c.fill();
    c.fillStyle = mix(C.coral, C.butter, 0.5);
    c.beginPath(); c.arc(cx - 16, cy - 18, 40, 0, TAU); c.fill();
    c.strokeStyle = C.butter; c.lineWidth = 9;
    c.beginPath(); c.ellipse(cx, cy, 104, 24, -0.3, 0, Math.PI); c.stroke();
    moon(110, 1.1, C.sky, 14, true); moon(140, -0.7, C.lilac, 11, true);
    text(c, 'DREAM BIG', cx, h - 50, { size: 30, weight: 800, color: C.white, align: 'center', track: 0.12 });
    sign(c, w, h, 'dark');
  },
};

// ---------------------------------------------------------------- HALFTONE
const HALFTONE: Design = {
  id: 'halftone', name: 'HALFTONE', word: 'POP', world: C.coral, ink: C.black, glow: [C.coral, C.butter],
  draw(c, w, h, t) {
    c.fillStyle = C.coral; c.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.45, step = 13;
    c.fillStyle = C.black;
    for (let y = 0; y < h + step; y += step) {
      for (let x = 0; x < w + step; x += step) {
        const px = x + ((y / step) % 2 ? step / 2 : 0);
        const d = Math.hypot(px - cx, y - cy);
        const k = clamp((d - 60 - 20 * Math.sin(t * 2)) / 160);
        const R = k * step * 0.55;
        if (R < 0.4) continue;
        c.beginPath(); c.arc(px, y, R, 0, TAU); c.fill();
      }
    }
    // lightning bolt
    c.save();
    c.translate(cx, cy); c.rotate(Math.sin(t * 5) * 0.03);
    c.fillStyle = C.butter; c.strokeStyle = C.black; c.lineWidth = 7; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(-10, -110); c.lineTo(46, -110); c.lineTo(16, -20); c.lineTo(56, -20); c.lineTo(-30, 118); c.lineTo(-6, 16); c.lineTo(-48, 16); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    text(c, 'POW!', w - 20, 52, { size: 40, weight: 900, color: C.white, align: 'right', italic: true });
    sign(c, w, h, 'coral');
  },
};

// ---------------------------------------------------------------- CHECKER
const CHECKER: Design = {
  id: 'checker', name: 'CHECKER', word: 'FAST', world: C.butter, ink: C.black, glow: [C.butter, C.black],
  draw(c, w, h, t) {
    c.fillStyle = C.butter; c.fillRect(0, 0, w, h);
    const hz = h * 0.32;
    c.fillStyle = C.black;
    const rows = 14;
    for (let j = 0; j < rows; j++) {
      const z0 = j / rows, z1 = (j + 1) / rows;
      const off = fract(t * 1.4);
      const y0 = hz + (h - hz) * Math.pow((z0 + off / rows) % 1, 2), y1 = hz + (h - hz) * Math.pow(Math.min(1, (z0 + off / rows) % 1 + 1 / rows), 2);
      if (y1 <= y0) continue;
      for (let i = -8; i < 8; i++) {
        if ((i + j) % 2) continue;
        const x0a = w / 2 + (i * 40) * ((y0 - hz) / (h - hz)) * 1.6, x1a = w / 2 + ((i + 1) * 40) * ((y0 - hz) / (h - hz)) * 1.6;
        const x0b = w / 2 + (i * 40) * ((y1 - hz) / (h - hz)) * 1.6, x1b = w / 2 + ((i + 1) * 40) * ((y1 - hz) / (h - hz)) * 1.6;
        c.beginPath(); c.moveTo(x0a, y0); c.lineTo(x1a, y0); c.lineTo(x1b, y1); c.lineTo(x0b, y1); c.closePath(); c.fill();
      }
      void z1;
    }
    // speed stripes
    for (let i = 0; i < 3; i++) {
      c.fillStyle = [C.coral, C.white, C.blue][i]!;
      c.fillRect(0, 60 + i * 26, w, 16);
    }
    text(c, 'FAST', w / 2, hz - 6, { size: 58, weight: 900, italic: true, color: C.black, align: 'center', track: -0.02 });
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- EYE
const EYE: Design = {
  id: 'eye', name: 'EYE', word: 'QUIET', world: C.cream, ink: C.black, glow: [C.lilac, C.blue],
  draw(c, w, h, t) {
    c.fillStyle = C.cream; c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.47;
    // rays
    c.strokeStyle = C.lilac; c.lineWidth = 6; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 100); c.lineTo(cx + Math.cos(a) * 146, cy + Math.sin(a) * 124); c.stroke();
    }
    const blink = (() => { const b = fract(t / 3.1); return b > 0.92 ? Math.sin(((b - 0.92) / 0.08) * Math.PI) : 0; })();
    const open = 1 - blink;
    c.save();
    c.beginPath();
    c.moveTo(cx - 110, cy);
    c.quadraticCurveTo(cx, cy - 110 * open, cx + 110, cy);
    c.quadraticCurveTo(cx, cy + 110 * open, cx - 110, cy);
    c.closePath();
    c.fillStyle = C.white; c.fill();
    c.clip();
    const lx = Math.sin(t * 0.9) * 26, ly = Math.cos(t * 0.7) * 8;
    c.fillStyle = C.blue; c.beginPath(); c.arc(cx + lx, cy + ly, 48, 0, TAU); c.fill();
    c.fillStyle = C.sky; c.beginPath(); c.arc(cx + lx, cy + ly, 30, 0, TAU); c.fill();
    c.fillStyle = C.black; c.beginPath(); c.arc(cx + lx, cy + ly, 18, 0, TAU); c.fill();
    c.fillStyle = C.white; c.beginPath(); c.arc(cx + lx - 12, cy + ly - 14, 8, 0, TAU); c.fill();
    c.restore();
    c.lineWidth = 9; c.strokeStyle = C.black;
    c.beginPath(); c.moveTo(cx - 110, cy); c.quadraticCurveTo(cx, cy - 110 * open, cx + 110, cy); c.quadraticCurveTo(cx, cy + 110 * open, cx - 110, cy); c.stroke();
    text(c, 'i see you.', cx, h - 48, { size: 30, family: 'Corm', weight: 600, italic: true, color: C.black, align: 'center' });
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- PIXEL
const HEART = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
];
const PIXEL: Design = {
  id: 'pixel', name: 'PIXEL', word: 'PLAY', world: C.lilac, ink: C.black, glow: [C.lilac, C.coral],
  draw(c, w, h, t) {
    c.fillStyle = C.lilac; c.fillRect(0, 0, w, h);
    const g = 20;
    for (let y = 0; y < h; y += g) for (let x = 0; x < w; x += g) {
      const v = Math.sin(x * 0.05 + t * 2) + Math.cos(y * 0.04 - t * 1.5);
      if (v > 1.3) { c.fillStyle = rgba(C.blue, 0.35); c.fillRect(x + 2, y + 2, g - 4, g - 4); }
    }
    const beat = 1 + 0.08 * Math.max(0, Math.sin(t * 6)) ** 8;
    const px = 26 * beat, ox = w / 2 - (9 * px) / 2, oy = h * 0.46 - (8 * px) / 2;
    HEART.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== 'X') return;
      c.fillStyle = C.coral;
      c.fillRect(ox + i * px, oy + j * px, px + 0.5, px + 0.5);
    }));
    c.fillStyle = C.white;
    c.fillRect(ox + 1 * px, oy + 1 * px, px, px); c.fillRect(ox + 2 * px, oy + 1 * px, px * 0.5, px * 0.5);
    c.fillStyle = C.black;
    for (let i = 0; i < 5; i++) c.fillRect(24 + i * 22, h - 60, 16, 16);
    text(c, 'PLAYER 1', w - 22, h - 46, { size: 18, family: 'Plex', weight: 700, color: C.black, align: 'right', track: 0.1 });
    text(c, '♥ ♥ ♥', 22, 52, { size: 26, color: C.coral, weight: 700 });
    sign(c, w, h, 'light');
  },
};

// ---------------------------------------------------------------- SIGNATURE (the Split Screen's final back)
// The brand mark as a Stimpie: one huge split S on black, echoed outward in outline rings of the drop
// colours — one identity, many versions. The rings breathe outward.
const SIGNATURE: Design = {
  id: 'signature', name: 'SIGNATURE', word: 'YOU', world: C.coral, ink: C.black, glow: [C.coral, C.butter],
  draw(c, w, h, t) {
    c.fillStyle = C.black; c.fillRect(0, 0, w, h);
    const cx = w / 2 + 6, cy = h * 0.47, H0 = 190;
    const rings = [C.cream, C.lilac, C.sky, C.butter];
    const drift = (t * 0.35) % 1;
    for (let i = rings.length - 1; i >= 0; i--) {
      const k = 1 + (i + drift) * 0.2;
      c.save();
      c.globalAlpha = 1 - (i + drift) / (rings.length + 0.5);
      drawIcon(c, cx, cy, H0 * k, { solid: 'rgba(0,0,0,0)', outline: rings[i]!, word: C.black }, { solid: 0, strokeScale: 1.2 / k });
      c.restore();
    }
    drawIcon(c, cx, cy, H0, { solid: C.white, outline: C.coral, word: C.white }, { strokeScale: 1.6 });
    text(c, 'ONE OF ONE', w / 2, 40, { size: 20, weight: 700, color: C.white, align: 'center', track: 0.3 });
    text(c, 'ORIGINAL', w / 2, h - 30, { size: 18, weight: 600, color: C.coral, align: 'center', track: 0.4 });
  },
};

export const DESIGNS: Design[] = [FLAME, BLOOM, STATIC, WAVE, NIGHT, SUN, TAG, ORBIT, HALFTONE, CHECKER, EYE, PIXEL];
/** Designs used only in specific moments (kept out of the rotation so other films are unchanged). */
export const EXTRA: Design[] = [SIGNATURE];
export const byId = (id: string) => DESIGNS.find((d) => d.id === id) ?? EXTRA.find((d) => d.id === id) ?? DESIGNS[0]!;

// ---------------------------------------------------------------- art painters
const cache = new Map<string, HTMLCanvasElement>();
const RES = 2.4;
/** Pre-render every design at t = 0 (for the many small copies in crowded shots). */
export function cacheDesigns() {
  for (const d of [...DESIGNS, ...EXTRA]) {
    const { cv, c } = makeCanvas(300, 364, RES);
    d.draw(c, 300, 364, 0);
    cache.set(d.id, cv);
  }
}
/** Live, animated artwork at time t. */
export function art(d: Design | string, t: number): Art {
  const D = typeof d === 'string' ? byId(d) : d;
  return (c, w, h) => { c.save(); c.scale(w / 300, h / 364); D.draw(c, 300, 364, t); c.restore(); };
}
/** Cached still artwork (fast). */
export function artStill(d: Design | string): Art {
  const D = typeof d === 'string' ? byId(d) : d;
  return (c, w, h) => { const cv = cache.get(D.id); if (cv) c.drawImage(cv, 0, 0, w, h); else D.draw(c, w, h, 0); };
}
