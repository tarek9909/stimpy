// A world per Stimpie: when the panel changes, the whole environment changes with it. Each world is built
// from its Stimpie's colours (stimpies.json: world = background, glow = the light the art leaks, ink = text)
// and draws a full 1080×1920 background (behind the hoodie) from the song time `t` and the time since the
// swap `age`. The identity word sits above the hoodie and fits the frame's width; the Stimpie's line sits under it.
import type { Ctx } from '../engine/draw2d';
import { text, measure } from '../engine/draw2d';
import { W, H } from '../engine/gl';
import { TAU, mulberry, ease, clamp, pulse } from '../engine/util';
import { stars, tigerStripes, barcode, drawDoodle, type Design } from './designs';
import { walkFloor, floorShadow } from '../scenes/common';

export type World = (c: Ctx, t: number, age: number, d: Design) => void;

const beatOf = (t: number) => t * 2; // 120 BPM
const WY = 540;          // identity word
const LY = 690;          // the line under it
const FLOOR = H * 0.84;  // floor line under the hoodie

type Fam = 'ArchivoX' | 'ArchivoC' | 'Corm';
function bigWord(c: Ctx, s: string, age: number, o: { y?: number; size: number; color: string; family?: Fam; italic?: boolean; weight?: number; track?: number; alpha?: number; shadow?: string }) {
  const u = ease.outExpo(age / 0.45);
  const opts = { size: o.size, family: o.family ?? 'ArchivoX', weight: o.weight ?? 900, italic: o.italic, track: o.track ?? -0.04 } as const;
  const fit = Math.min(1, (W - 90) / measure(c, s, opts));
  const k = fit * (1 + (1 - u) * 0.12);
  c.save();
  c.globalAlpha = (o.alpha ?? 1) * clamp(age / 0.08);
  c.translate(W / 2, (o.y ?? WY) + (1 - u) * 60);
  c.scale(k, k);
  if (o.shadow) text(c, s, 8, 8, { ...opts, color: o.shadow, align: 'center', baseline: 'middle' });
  text(c, s, 0, 0, { ...opts, color: o.color, align: 'center', baseline: 'middle' });
  c.restore();
}

/** The Stimpie's line, typed on under the word. */
function line(c: Ctx, d: Design, age: number, color: string, o: { y?: number; size?: number; plate?: string } = {}) {
  const p = clamp((age - 0.06) / 0.22);
  if (p <= 0) return;
  const s = d.line;
  const n = Math.max(1, Math.ceil(s.length * p));
  const opts = { size: o.size ?? 46, family: 'Archivo', weight: 700, track: 0.0 } as const;
  const fit = Math.min(1, (W - 140) / measure(c, s, opts));
  const y = o.y ?? LY;
  c.save();
  c.translate(W / 2, y);
  c.scale(fit, fit);
  if (o.plate) {
    const w = measure(c, s, opts) + 50;
    c.fillStyle = o.plate;
    c.fillRect(-w / 2, -opts.size * 0.95, w, opts.size * 1.45);
  }
  text(c, s.slice(0, n), -measure(c, s, opts) / 2, 0, { ...opts, color, align: 'left' });
  c.restore();
}

function fill(c: Ctx, col: string) { c.fillStyle = col; c.fillRect(0, 0, W, H); }
function glowBlob(c: Ctx, x: number, y: number, r: number, col: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  const n = parseInt(col.slice(1), 16);
  const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function halftone(c: Ctx, t: number, col: string, cx: number, cy: number, s = 30, reach = 1000) {
  const kick = pulse((beatOf(t) % 1) / 2, 6);
  c.fillStyle = col;
  for (let y = 0; y < H + s; y += s) for (let x = ((y / s) % 2) * s / 2; x < W + s; x += s) {
    const d = Math.hypot(x - cx, y - cy) / reach;
    const r = Math.max(0, (1 - d) * s * 0.42 * (0.8 + 0.25 * kick) + Math.sin(x * 0.01 + y * 0.013 + t * 2) * 1.5);
    if (r < 0.6) continue;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
}
function ticker(c: Ctx, t: number, s: string, y: number, bg: string, fg: string, speed = 260) {
  c.fillStyle = bg; c.fillRect(0, y, W, 56);
  c.save();
  c.beginPath(); c.rect(0, y, W, 56); c.clip();
  const span = measure(c, s, { size: 30, family: 'ArchivoX', weight: 900, track: 0.02 }) + 10;
  const off = -((t * speed) % span);
  for (let x = off; x < W; x += span) text(c, s, x, y + 40, { size: 30, family: 'ArchivoX', weight: 900, color: fg, track: 0.02 });
  c.restore();
}
function rays(c: Ctx, cx: number, cy: number, n: number, rot: number, col: string, R = 2400) {
  c.fillStyle = col;
  for (let i = 0; i < n; i += 2) {
    const a0 = rot + (i / n) * TAU, a1 = rot + ((i + 1) / n) * TAU;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); c.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); c.fill();
  }
}

export const WORLDS: Record<string, World> = {
  // comic-cover yellow, red halftone, a ticker of the cover's shout
  sabotage(c, t, age, d) {
    fill(c, d.pal.bg);
    const cx = W / 2 + Math.sin(t * 0.7) * 200, cy = H * 0.55 + Math.cos(t * 0.5) * 250;
    halftone(c, t, '#E8402A', cx, cy);
    c.fillStyle = d.pal.bg; c.fillRect(0, WY - 190, W, 400); c.fillRect(0, 0, W, 340);
    bigWord(c, d.word, age, { size: 440, color: '#E8402A', shadow: '#111111', track: -0.05 });
    line(c, d, age, '#111111');
    ticker(c, t, `SABOTAGE — ${d.line.toUpperCase()} — Nº${d.no} — `, H * 0.87, '#111111', d.pal.bg);
    floorShadow(c, W / 2, FLOOR, 440, 0.35);
  },

  // bubblegum pink, soft bubbles rising, one pops on every beat
  bubblegum(c, t, age, d) {
    fill(c, d.pal.bg);
    glowBlob(c, W * 0.5, H * 0.35, 900, '#FBE3EA', 0.7);
    const rnd = mulberry(314);
    for (let i = 0; i < 34; i++) {
      const x = rnd() * W, sp = 50 + rnd() * 90, r0 = 20 + rnd() * 70;
      const y = H + 100 - ((rnd() * H + t * sp) % (H + 200));
      const a = age - i * 0.02;
      if (a <= 0) continue;
      const g = ease.outBack(a / 0.4, 2);
      const pop = (Math.floor(beatOf(t)) % 34) === i ? 1 + 0.25 * pulse((beatOf(t) % 1) / 2, 8) : 1;
      const r = r0 * g * pop;
      c.fillStyle = i % 3 ? 'rgba(242,123,160,0.55)' : 'rgba(251,227,234,0.8)';
      c.beginPath(); c.arc(x + Math.sin(t + i) * 20, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath(); c.ellipse(x + Math.sin(t + i) * 20 - r * 0.35, y - r * 0.4, r * 0.18, r * 0.1, -0.6, 0, TAU); c.fill();
    }
    bigWord(c, d.word, age, { y: WY - 20, size: 560, color: '#111111', family: 'Corm', italic: true, weight: 600, track: -0.02 });
    line(c, d, age, '#111111', { size: 64, y: LY + 90 });
    floorShadow(c, W / 2, FLOOR, 440, 0.3);
  },

  // irezumi orange, brush stripes in the tiger's reds, word on a clean band
  tiger(c, t, age, d) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#D8452B'); g.addColorStop(0.5, d.pal.bg); g.addColorStop(1, '#F2B35A');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(0, -((t * 120) % 180));
    tigerStripes(c, W, H + 200, '#111111', 8, 90, t * 2);
    c.restore();
    c.fillStyle = d.pal.bg; c.fillRect(0, WY - 170, W, 370);
    bigWord(c, d.word, age, { size: 360, color: '#111111', family: 'ArchivoC', track: -0.02 });
    line(c, d, age, '#111111', { y: LY - 6 });
    floorShadow(c, W / 2, FLOOR, 440, 0.4);
  },

  // a sunny café street: awning stripes, cobbles sliding past
  ducks(c, t, age, d) {
    fill(c, d.pal.bg);
    glowBlob(c, W * 0.75, H * 0.2, 900, '#FFF1D6', 0.6);
    // awning
    const aw = 90, ah = 200;
    for (let i = -1; i * aw < W + aw; i++) {
      const x = i * aw - ((t * 30) % (aw * 2));
      c.fillStyle = i % 2 ? '#F6EBD2' : '#2E4A3A';
      c.fillRect(x, 0, aw, ah);
      c.beginPath(); c.arc(x + aw / 2, ah, aw / 2, 0, Math.PI); c.fill();
    }
    walkFloor(c, t, '#1E2A5A', 0.25, H * 0.68);
    bigWord(c, d.word, age, { y: WY + 10, size: 400, color: '#1E2A5A', track: -0.04 });
    line(c, d, age, '#1E2A5A', { y: LY + 10 });
    floorShadow(c, W / 2, FLOOR, 440, 0.35);
  },

  // a black room, tape ribbon unspooling in lilac and blue
  bside(c, t, age, d) {
    fill(c, d.pal.bg);
    stars(c, W, H, 5, 220, 'rgba(201,182,255,0.7)', t);
    c.lineWidth = 7; c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.strokeStyle = k ? '#5CC8FF' : '#C9B6FF';
      c.globalAlpha = 0.9;
      const grow = ease.outCubic((age - k * 0.08) / 0.7);
      c.beginPath();
      const n = 140;
      for (let i = 0; i <= n * grow; i++) {
        const u = i / n;
        const x = W * (k ? 1 - u : u);
        const y = H * (0.42 + 0.48 * u) + Math.sin(u * 14 + t * 2 + k * 2) * 110 + Math.cos(u * 31 + t) * 30;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    bigWord(c, d.word, age, { size: 300, color: '#FFFFFF', track: -0.03 });
    line(c, d, age, '#C9B6FF');
    text(c, 'SIDE B', W - 90, LY + 90, { size: 26, family: 'Plex', weight: 700, color: '#5CC8FF', align: 'right', track: 0.2, alpha: clamp(age / 0.3) });
    floorShadow(c, W / 2, FLOOR, 440, 0.6);
  },

  // electric blue, scrolling till rolls and barcodes, the word circled in red
  receipt(c, t, age, d) {
    fill(c, d.pal.bg);
    c.save();
    c.translate(0, -((t * 90) % 120));
    c.globalAlpha = 0.18;
    for (let y = 0; y < H + 140; y += 60) text(c, '. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .', 40, y, { size: 26, family: 'Plex', weight: 500, color: '#FFFFFF' });
    c.restore();
    c.globalAlpha = 1;
    barcode(c, 60, H * 0.885, 420, 70, '#FFFFFF', 7);
    text(c, 'TOTAL DUE', W - 60, H * 0.905, { size: 30, family: 'Plex', weight: 700, color: '#FFFFFF', align: 'right', track: 0.12 });
    text(c, 'GO TOUCH GRASS', W - 60, H * 0.935, { size: 30, family: 'Plex', weight: 700, color: '#F25C3A', align: 'right', track: 0.08 });
    bigWord(c, d.word, age, { size: 290, color: '#FFFFFF', track: -0.03 });
    // hand-drawn circle round the word
    const p = ease.outCubic((age - 0.2) / 0.4);
    if (p > 0) {
      c.strokeStyle = '#F25C3A'; c.lineWidth = 10; c.lineCap = 'round';
      c.beginPath(); c.ellipse(W / 2, WY, 490, 150, -0.04, -2.2, -2.2 + TAU * 1.05 * p); c.stroke();
    }
    line(c, d, age, '#FFFFFF', { y: LY + 40 });
    floorShadow(c, W / 2, FLOOR, 440, 0.45);
  },

  // a VHS sleeve: blue, retro sunset bars behind the hoodie, tracking lines
  vhs(c, t, age, d) {
    fill(c, d.pal.bg);
    const cx = W / 2, cy = H * 0.74, R = 560 * ease.outCubic(age / 0.5);
    c.save();
    c.beginPath(); c.arc(cx, cy, R, Math.PI, 0); c.closePath(); c.clip();
    const g = c.createLinearGradient(0, cy - R, 0, cy);
    g.addColorStop(0, '#FFD23F'); g.addColorStop(1, '#F26A4B');
    c.fillStyle = g; c.fillRect(0, cy - R, W, R);
    c.fillStyle = d.pal.bg;
    for (let i = 0; i < 8; i++) { const y = cy - R * 0.5 + i * 36 + ((t * 30) % 36); c.fillRect(0, y, W, 6 + i * 2.5); }
    c.restore();
    c.fillStyle = '#F6EBD2'; c.fillRect(0, cy, W, H - cy);
    c.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < H; y += 5) c.fillRect(0, y, W, 2);
    const ty = (t * 400) % (H + 200) - 100;
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, ty, W, 26);
    bigWord(c, d.word, age, { size: 380, color: '#FFFFFF', shadow: '#F26A4B', track: -0.03 });
    line(c, d, age, '#FFD23F');
    const blink = Math.floor(t * 2) % 2 ? 1 : 0.3;
    c.save(); c.globalAlpha = blink; c.fillStyle = '#FFFFFF';
    c.beginPath(); c.moveTo(80, 276); c.lineTo(102, 289); c.lineTo(80, 302); c.fill(); c.restore();
    text(c, 'PLAY', 116, 300, { size: 30, family: 'Plex', weight: 700, color: '#FFFFFF', track: 0.1, alpha: blink });
    floorShadow(c, W / 2, FLOOR, 440, 0.35);
  },

  // cream, a sunburst of flame orange and marigold turning on the beat
  unhinged(c, t, age, d) {
    fill(c, d.pal.bg);
    c.globalAlpha = 0.55 * clamp(age / 0.2);
    rays(c, W / 2, H * 0.62, 28, t * 0.15 + 0.06 * pulse((beatOf(t) % 1) / 2, 6), '#FFC94A');
    c.globalAlpha = 1;
    glowBlob(c, W / 2, H * 0.62, 700, '#F6EBD2', 0.9);
    c.fillStyle = d.pal.bg; c.fillRect(0, WY - 170, W, 380);
    bigWord(c, d.word, age, { size: 440, color: '#111111', shadow: '#F2762E', track: -0.04 });
    line(c, d, age, '#111111');
    floorShadow(c, W / 2, FLOOR, 440, 0.3);
  },

  // black, a spiral in orange and blue, wireframe grids drifting
  sameday(c, t, age, d) {
    fill(c, d.pal.bg);
    const cx = W / 2, cy = H * 0.62;
    c.lineWidth = 22;
    for (let k = 0; k < 2; k++) {
      c.strokeStyle = k ? '#4FB6F0' : '#F26A4B';
      c.beginPath();
      const grow = ease.outCubic(age / 0.6);
      for (let i = 0; i < 400 * grow; i++) {
        const a = i * 0.06 + t * 0.8 + k * Math.PI;
        const r = 8 + i * 2.3;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.9;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(17,17,17,0.55)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(246,238,221,0.35)'; c.lineWidth = 1.5;
    for (const [gx, gy] of [[80, 1050], [W - 320, 900]] as const) {
      for (let i = 0; i <= 8; i++) {
        c.beginPath(); c.moveTo(gx + i * 30, gy + Math.sin(t + i) * 10); c.lineTo(gx + i * 30 + 40, gy + 240); c.stroke();
        c.beginPath(); c.moveTo(gx + 5 * i, gy + i * 30); c.lineTo(gx + 240 + 5 * i, gy + i * 30); c.stroke();
      }
    }
    c.fillStyle = d.pal.bg; c.fillRect(0, WY - 170, W, 370);
    bigWord(c, d.word, age, { size: 300, color: '#F6EEDD', track: -0.03 });
    line(c, d, age, '#F26A4B');
    floorShadow(c, W / 2, FLOOR, 440, 0.6);
  },

  // lilac, Bauhaus blocks of orange and blue that reshuffle on every beat
  chameleon(c, t, age, d) {
    fill(c, d.pal.bg);
    const b = Math.floor(beatOf(t));
    const rnd = mulberry(40 + (b % 4));
    const cols = ['#F26A4B', '#5CC8FF', '#F6EBD2', '#111111'];
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W - 100, y = rnd() * H, w = 160 + rnd() * 320, h = 160 + rnd() * 400;
      if (y > WY - 300 && y < LY + 60) continue;
      const k = ease.outExpo((age - i * 0.03) / 0.3);
      c.fillStyle = cols[i % cols.length]!;
      c.globalAlpha = 0.9 * k;
      if (i % 3 === 2) { c.beginPath(); c.arc(x + w / 2, y, w / 2 * k, 0, TAU); c.fill(); }
      else c.fillRect(x, y, w * k, h * k);
    }
    c.globalAlpha = 1;
    c.fillStyle = d.pal.bg; c.fillRect(0, WY - 170, W, 370);
    bigWord(c, d.word, age, { size: 300, color: '#111111', track: -0.03 });
    line(c, d, age, '#111111', { plate: '#FFD23F' });
    floorShadow(c, W / 2, FLOOR, 440, 0.4);
  },

  // the dark before the storm: white energy rings and red sparks bursting outward
  neon(c, t, age, d) {
    fill(c, d.pal.bg);
    stars(c, W, H, 11, 260, 'rgba(232,244,255,0.8)', t);
    const cx = W / 2, cy = H * 0.64;
    glowBlob(c, cx, cy, 800, '#D6264A', 0.35);
    glowBlob(c, cx, cy, 500, '#E8F4FF', 0.25 + 0.2 * pulse((beatOf(t) % 1) / 2, 5));
    c.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const r = ((t * 260 + i * 180) % 1260) + 60;
      c.strokeStyle = i % 2 ? `rgba(214,38,74,${0.8 * (1 - r / 1320)})` : `rgba(232,244,255,${0.9 * (1 - r / 1320)})`;
      c.beginPath(); c.ellipse(cx, cy, r, r * 0.9, 0, 0, TAU); c.stroke();
    }
    // lightning forks on the beat
    const rnd = mulberry(Math.floor(beatOf(t)) + 3);
    const k = pulse((beatOf(t) % 1) / 2, 10);
    c.strokeStyle = `rgba(232,244,255,${k})`; c.lineWidth = 4;
    for (let j = 0; j < 3; j++) {
      let x = rnd() * W, y = 0;
      c.beginPath(); c.moveTo(x, y);
      while (y < H * 0.5) { x += (rnd() - 0.5) * 120; y += 40 + rnd() * 60; c.lineTo(x, y); }
      c.stroke();
    }
    bigWord(c, d.word, age, { size: 300, color: '#FFFFFF', shadow: '#D6264A', track: -0.03 });
    line(c, d, age, '#E8F4FF');
    floorShadow(c, W / 2, FLOOR, 440, 0.6);
  },

  mine(c, t, age, d) {
    c.fillStyle = '#F6F1E6'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(43,61,255,0.16)'; c.lineWidth = 1.5;
    for (let y = 60; y < H; y += 44) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(226,59,46,0.35)';
    c.beginPath(); c.moveTo(90, 0); c.lineTo(90, H); c.stroke();
    bigWord(c, d.word, age, { y: WY - 20, size: 480, color: '#E23B2E', family: 'Corm', italic: true, weight: 600, track: -0.02 });
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
