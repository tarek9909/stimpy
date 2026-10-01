// The Stimpies: six generative back panels (each with an alternate colourway for the collection) plus the
// hand-drawn custom one made in "Yours". Drawn once at boot in panel units (300 × 364).
import { makeCanvas, text, scribble, type Ctx } from '../engine/draw2d';
import { mulberry, TAU } from '../engine/util';

export const PW_ = 300, PH_ = 364;
export const INK = '#0E0E10', BONE = '#EDE8DE', BLUE = '#2B3DFF';

export interface Design {
  id: string;
  no: string;
  name: string;
  word: string;     // the identity it gives you (identities scene)
  pal: { bg: string; fg: string; accent: string; ink: string }; // world palette
  draw: (c: Ctx, v: number) => void;
}

// ---------------------------------------------------------------- helpers
function halftoneOrb(c: Ctx, cx: number, cy: number, R: number, color: string, step = 6.5) {
  c.fillStyle = color;
  for (let y = cy - R - step; y < cy + R + step; y += step) {
    const row = Math.round((y - cy) / step);
    for (let x = cx - R - step; x < cx + R + step; x += step) {
      const px = x + (row % 2 ? step / 2 : 0);
      const dx = (px - cx) / R, dy = (y - cy) / R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const lum = Math.max(0, -0.55 * dx - 0.6 * dy + 0.58 * nz); // lit from top-left
      const r = (1 - lum) * step * 0.56 + 0.35;
      c.beginPath();
      c.arc(px, y, r, 0, TAU);
      c.fill();
    }
  }
}

export function flower(c: Ctx, x: number, y: number, r: number, petals: number, col: string, center: string, rot = 0, grow = 1) {
  if (grow <= 0) return;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(grow, grow);
  c.fillStyle = col;
  for (let i = 0; i < petals; i++) {
    c.save();
    c.rotate((i / petals) * TAU);
    c.beginPath();
    c.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.fillStyle = center;
  c.beginPath();
  c.arc(0, 0, r * 0.26, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, d = r * 0.12 * Math.sqrt(i / 7);
    c.beginPath();
    c.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.025, 0, TAU);
    c.fill();
  }
  c.restore();
}

export function tigerStripes(c: Ctx, w: number, h: number, color: string, seed: number, spacing = 26, t = 0) {
  const rnd = mulberry(seed);
  c.fillStyle = color;
  for (let y = -spacing; y < h + spacing; y += spacing * (0.8 + rnd() * 0.5)) {
    for (const side of [0, 1]) {
      const len = w * (0.22 + rnd() * 0.25);
      const thick = spacing * (0.28 + rnd() * 0.22);
      const slope = (rnd() - 0.3) * 0.5;
      const x0 = side ? w : 0, dir = side ? -1 : 1;
      c.beginPath();
      c.moveTo(x0, y - thick);
      const n = 8;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        c.lineTo(x0 + dir * len * u, y + slope * len * u - thick * (1 - u) + Math.sin(u * 9 + seed + t) * 2);
      }
      for (let i = n; i >= 0; i--) {
        const u = i / n;
        c.lineTo(x0 + dir * len * u, y + slope * len * u + thick * (1 - u) * 0.9 + Math.sin(u * 7 + seed + t) * 2);
      }
      c.closePath();
      c.fill();
    }
  }
}

function crescent(c: Ctx, x: number, y: number, r: number, col: string) {
  const { cv, c: m } = makeCanvas(r * 2 + 4, r * 2 + 4, 4);
  m.fillStyle = col;
  m.beginPath(); m.arc(r + 2, r + 2, r, 0, TAU); m.fill();
  m.globalCompositeOperation = 'destination-out';
  m.beginPath(); m.arc(r + 2 + r * 0.42, r + 2 - r * 0.2, r * 0.86, 0, TAU); m.fill();
  c.drawImage(cv, x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
}

export function stars(c: Ctx, w: number, h: number, seed: number, n: number, col: string, tw = 0) {
  const rnd = mulberry(seed);
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, s = rnd() ** 3 * 1.8 + 0.3;
    const a = 0.5 + 0.5 * Math.sin(tw * (2 + rnd() * 3) + i);
    c.globalAlpha = tw ? 0.35 + 0.65 * a : 1;
    c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    if (s > 1.6) { c.fillRect(x - s * 3, y - 0.3, s * 6, 0.6); c.fillRect(x - 0.3, y - s * 3, 0.6, s * 6); }
  }
  c.globalAlpha = 1;
}

export function skyline(c: Ctx, w: number, base: number, seed: number, col: string, win: string, scale = 1, lit = 0.35) {
  const rnd = mulberry(seed);
  let x = -10;
  while (x < w + 10) {
    const bw = (18 + rnd() * 34) * scale, bh = (30 + rnd() * 90) * scale;
    c.fillStyle = col;
    c.fillRect(x, base - bh, bw, bh + 200);
    c.fillStyle = win;
    for (let wy = base - bh + 6 * scale; wy < base - 4 * scale; wy += 7 * scale)
      for (let wx = x + 4 * scale; wx < x + bw - 5 * scale; wx += 6 * scale)
        if (rnd() < lit) c.fillRect(wx, wy, 2.4 * scale, 3 * scale);
    x += bw + rnd() * 3;
  }
}

function barcode(c: Ctx, x: number, y: number, w: number, h: number, col: string, seed: number) {
  const rnd = mulberry(seed);
  c.fillStyle = col;
  let p = x;
  while (p < x + w) { const bw = rnd() < 0.3 ? 2 : 0.8; c.fillRect(p, y, bw, h); p += bw + 0.8 + rnd() * 2; }
}

export function checkerTunnel(c: Ctx, cx: number, cy: number, R: number, a: string, b: string, t = 0, rings = 16, sectors = 24) {
  c.fillStyle = b;
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.fillStyle = a;
  for (let i = 0; i < rings; i++) {
    const f0 = (i + (t % 2)) / rings, f1 = (i + 1 + (t % 2)) / rings;
    const r0 = R * f0 ** 2.2, r1 = R * Math.min(1, f1) ** 2.2;
    if (r0 >= R) continue;
    for (let j = 0; j < sectors; j++) {
      if ((i + j + Math.floor(t % 2 >= 1 ? 1 : 0)) % 2) continue;
      const tw = 1.4 * (1 - f0) + t * 0.3;
      const a0 = (j / sectors) * TAU + tw, a1 = ((j + 1) / sectors) * TAU + tw * 1.02;
      c.beginPath();
      c.arc(cx, cy, r1, a0, a1);
      c.arc(cx, cy, Math.max(0.1, r0), a1, a0, true);
      c.closePath();
      c.fill();
    }
  }
}

function textOnCircle(c: Ctx, s: string, cx: number, cy: number, r: number, size: number, col: string, a0 = -Math.PI / 2) {
  c.save();
  c.font = `500 ${size}px Plex`;
  c.fillStyle = col;
  c.textAlign = 'center';
  const step = TAU / s.length;
  for (let i = 0; i < s.length; i++) {
    const a = a0 + i * step;
    c.save();
    c.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    c.rotate(a + Math.PI / 2);
    c.fillText(s[i]!, 0, 0);
    c.restore();
  }
  c.restore();
}

// ---------------------------------------------------------------- the designs
export const DESIGNS: Design[] = [
  {
    id: 'static', no: '001', name: 'STATIC', word: 'LOUD',
    pal: { bg: '#E9E4DA', fg: INK, accent: '#FF3B1F', ink: INK },
    draw(c, v) {
      const bg = v ? INK : '#E9E4DA', fg = v ? BONE : INK, red = '#FF3B1F';
      c.fillStyle = bg; c.fillRect(0, 0, PW_, PH_);
      halftoneOrb(c, 150, 148, 104, fg, 6.2);
      // misregistered glitch slices
      const rnd = mulberry(11 + v);
      for (let i = 0; i < 5; i++) {
        const y = 60 + rnd() * 180, h = 3 + rnd() * 9, dx = (rnd() - 0.5) * 28;
        const S = c.getTransform().a;
        c.drawImage(c.canvas, 0, y * S, PW_ * S, h * S, dx, y, PW_, h);
      }
      c.fillStyle = red; c.fillRect(0, 250, PW_, 50);
      text(c, 'STATIC', 152, 291, { size: 47, family: 'ArchivoX', weight: 900, color: fg, align: 'center', track: -0.02 });
      text(c, 'STATIC', 150, 289, { size: 47, family: 'ArchivoX', weight: 900, color: bg, align: 'center', track: -0.02 });
      text(c, 'Nº001', 16, 24, { size: 9, family: 'Plex', weight: 500, color: fg, track: 0.1 });
      text(c, 'SIGNAL LOST', 284, 24, { size: 9, family: 'Plex', weight: 500, color: fg, align: 'right', track: 0.1 });
      barcode(c, 16, 318, 110, 22, fg, 5);
      text(c, 'STIMPY / DROP 01', 284, 336, { size: 8, family: 'Plex', weight: 500, color: fg, align: 'right', track: 0.12 });
    },
  },
  {
    id: 'bloom', no: '002', name: 'BLOOM', word: 'soft',
    pal: { bg: '#F2C4CC', fg: '#8E1420', accent: '#F2892B', ink: '#8E1420' },
    draw(c, v) {
      const bg = v ? '#1F3B2C' : '#F2C4CC', ink = v ? '#F2C4CC' : '#8E1420';
      c.fillStyle = bg; c.fillRect(0, 0, PW_, PH_);
      const rnd = mulberry(7 + v * 3);
      const cols = v ? ['#F2C4CC', '#FFF4E4', '#F2892B', '#E0607E'] : ['#FFF4E4', '#C8232C', '#F2892B', '#E0607E'];
      // stems
      c.strokeStyle = v ? '#9DB17C' : '#5E6B2F'; c.lineWidth = 2.2; c.lineCap = 'round';
      const heads: [number, number, number][] = [];
      for (let i = 0; i < 11; i++) heads.push([40 + rnd() * 220, 40 + rnd() * 190, 22 + rnd() * 26]);
      for (const [x, y] of heads) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (150 - x) * 0.2, y + 120, 150, 300); c.stroke(); }
      // leaves
      c.fillStyle = v ? '#9DB17C' : '#5E6B2F';
      for (let i = 0; i < 6; i++) {
        c.save(); c.translate(100 + rnd() * 100, 200 + rnd() * 70); c.rotate(rnd() * TAU);
        c.beginPath(); c.ellipse(0, 0, 5, 16, 0, 0, TAU); c.fill(); c.restore();
      }
      heads.sort((a, b) => a[2] - b[2]);
      heads.forEach(([x, y, r], i) => flower(c, x, y, r, 5 + (i % 4), cols[i % cols.length]!, '#F6C945', rnd() * TAU));
      text(c, 'bloom', 150, 336, { size: 84, family: 'Corm', weight: 600, italic: true, color: ink, align: 'center' });
      text(c, 'Nº002', 16, 24, { size: 9, family: 'Plex', weight: 500, color: ink, track: 0.1 });
      text(c, 'SOFT HOURS', 284, 24, { size: 9, family: 'Plex', weight: 500, color: ink, align: 'right', track: 0.1 });
    },
  },
  {
    id: 'orbit', no: '003', name: 'ORBIT', word: 'SPACED OUT',
    pal: { bg: BLUE, fg: BONE, accent: '#FF6A2B', ink: BONE },
    draw(c, v) {
      const bg = v ? BONE : BLUE, fg = v ? BLUE : BONE, sun = '#FF6A2B';
      c.fillStyle = bg; c.fillRect(0, 0, PW_, PH_);
      c.save();
      c.translate(150, 158);
      c.rotate(-0.32);
      c.strokeStyle = fg; c.lineWidth = 1.1;
      const rs = [52, 76, 100, 124, 146];
      rs.forEach((r, i) => {
        c.setLineDash(i === 2 ? [2, 4] : []);
        c.beginPath(); c.ellipse(0, 0, r, r * 0.42, 0, 0, TAU); c.stroke();
      });
      c.setLineDash([]);
      c.fillStyle = sun;
      c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill();
      c.fillStyle = fg;
      const pl: [number, number, number][] = [[52, 0.6, 5], [76, 2.4, 7], [100, 4.1, 4], [124, 5.3, 10], [146, 1.2, 6]];
      pl.forEach(([r, a, s], i) => {
        const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.42;
        c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
        if (i === 3) { c.strokeStyle = fg; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x, y, s * 2, s * 0.6, 0.4, 0, TAU); c.stroke(); }
      });
      c.restore();
      c.strokeStyle = fg; c.lineWidth = 1;
      c.beginPath(); c.moveTo(262, 30); c.lineTo(282, 30); c.moveTo(272, 20); c.lineTo(272, 40); c.stroke();
      c.beginPath(); c.arc(272, 30, 6, 0, TAU); c.stroke();
      text(c, 'ORBIT', 150, 330, { size: 62, family: 'ArchivoX', weight: 900, color: fg, align: 'center', track: -0.03 });
      text(c, 'Nº003', 16, 24, { size: 9, family: 'Plex', weight: 500, color: fg, track: 0.1 });
      text(c, 'RA 05h 35m  DEC −05° 23′', 16, 268, { size: 7.5, family: 'Plex', weight: 400, color: fg, track: 0.06 });
    },
  },
  {
    id: 'night', no: '004', name: 'NIGHT SHIFT', word: 'OUT LATE',
    pal: { bg: '#0A1030', fg: '#F4E7C5', accent: '#FFD66B', ink: '#F4E7C5' },
    draw(c, v) {
      const g = c.createLinearGradient(0, 0, 0, PH_);
      if (v) { g.addColorStop(0, '#2A1450'); g.addColorStop(0.7, '#B8466A'); g.addColorStop(1, '#F08A4B'); }
      else { g.addColorStop(0, '#070B24'); g.addColorStop(1, '#26357A'); }
      c.fillStyle = g; c.fillRect(0, 0, PW_, PH_);
      stars(c, PW_, 230, 21 + v, 120, '#F4E7C5');
      crescent(c, 200, 104, 50, '#F4E7C5');
      skyline(c, PW_, 300, 4, v ? '#1A0C2B' : '#04060F', '#FFD66B', 1, 0.3);
      c.fillStyle = v ? '#1A0C2B' : '#04060F'; c.fillRect(0, 298, PW_, 70);
      text(c, 'NIGHT SHIFT', 150, 336, { size: 25, family: 'ArchivoX', weight: 700, color: '#F4E7C5', align: 'center', track: 0.08 });
      text(c, 'OPEN 23:00 — 06:00', 150, 352, { size: 7.5, family: 'Plex', weight: 500, color: '#FFD66B', align: 'center', track: 0.2 });
      text(c, 'Nº004', 16, 24, { size: 9, family: 'Plex', weight: 500, color: '#F4E7C5', track: 0.1 });
    },
  },
  {
    id: 'heat', no: '005', name: 'HEAT', word: 'ON FIRE',
    pal: { bg: '#FF3B1F', fg: '#121010', accent: '#FFD23F', ink: '#121010' },
    draw(c, v) {
      if (v) { c.fillStyle = '#121010'; c.fillRect(0, 0, PW_, PH_); }
      else {
        const g = c.createLinearGradient(0, 0, 0, PH_);
        g.addColorStop(0, '#FF2E1A'); g.addColorStop(0.55, '#FF7A1A'); g.addColorStop(1, '#FFD23F');
        c.fillStyle = g; c.fillRect(0, 0, PW_, PH_);
      }
      tigerStripes(c, PW_, PH_, v ? '#FF6A1A' : '#121010', 3 + v, 30);
      c.save();
      c.translate(150, 205);
      c.rotate(-0.06);
      text(c, 'HEAT', 5, 5, { size: 118, family: 'ArchivoC', weight: 900, color: v ? '#FF6A1A' : '#121010', align: 'center', baseline: 'middle', track: -0.02 });
      text(c, 'HEAT', 0, 0, { size: 118, family: 'ArchivoC', weight: 900, color: v ? '#121010' : BONE, align: 'center', baseline: 'middle', track: -0.02 });
      c.restore();
      text(c, 'Nº005', 16, 24, { size: 9, family: 'Plex', weight: 700, color: v ? '#FF6A1A' : '#121010', track: 0.1 });
      text(c, 'HANDLE WITH CARE', 284, 346, { size: 8, family: 'Plex', weight: 700, color: v ? '#FF6A1A' : '#121010', align: 'right', track: 0.14 });
    },
  },
  {
    id: 'acid', no: '006', name: 'ACID', word: 'UNHINGED',
    pal: { bg: '#D4FF3A', fg: '#0B0B0B', accent: '#FF4FA3', ink: '#0B0B0B' },
    draw(c, v) {
      const a = v ? '#FF4FA3' : '#D4FF3A', b = '#0B0B0B';
      c.fillStyle = a; c.fillRect(0, 0, PW_, PH_);
      checkerTunnel(c, 150, 182, 240, a, b, 0.3, 18, 26);
      c.fillStyle = b;
      c.beginPath(); c.arc(150, 182, 74, 0, TAU); c.fill();
      c.strokeStyle = a; c.lineWidth = 1.2;
      c.beginPath(); c.arc(150, 182, 68, 0, TAU); c.stroke();
      textOnCircle(c, 'Nº006 · ACID · DROP 01 · STIMPY · ', 150, 182, 58, 8.5, a);
      text(c, 'ACID', 150, 197, { size: 40, family: 'ArchivoX', weight: 900, color: a, align: 'center', track: -0.03 });
    },
  },
];

/** The custom Stimpie drawn in "Yours": marker on notebook paper. */
export const MINE: Design = {
  id: 'mine', no: '∞', name: 'YOURS', word: 'yours',
  pal: { bg: '#F4EFE4', fg: '#1A1A1A', accent: '#E23B2E', ink: '#1A1A1A' },
  draw(c) {
    c.fillStyle = '#F6F1E6'; c.fillRect(0, 0, PW_, PH_);
    c.strokeStyle = 'rgba(43,61,255,0.18)'; c.lineWidth = 0.7;
    for (let y = 30; y < PH_; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(PW_, y); c.stroke(); }
    c.strokeStyle = 'rgba(226,59,46,0.35)';
    c.beginPath(); c.moveTo(34, 0); c.lineTo(34, PH_); c.stroke();
    drawDoodle(c, 1);
  },
};

/** The doodle itself, drawable progressively (p: 0..1) so it can appear stroke by stroke. */
export function drawDoodle(c: Ctx, p: number) {
  const rnd = mulberry(99);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const steps: (() => void)[] = [];
  const pen = (col: string, w: number) => { c.strokeStyle = col; c.lineWidth = w; };
  const circ = (x: number, y: number, r: number, n = 26, sq = 1): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => [x + Math.cos((i / n) * TAU) * r, y + Math.sin((i / n) * TAU) * r * sq]);
  // sun
  steps.push(() => { pen('#FFC928', 5); scribble(c, circ(238, 70, 24), rnd, 1.2); });
  steps.push(() => {
    pen('#FFC928', 4);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; scribble(c, [[238 + Math.cos(a) * 32, 70 + Math.sin(a) * 32], [238 + Math.cos(a) * 44, 70 + Math.sin(a) * 44]], rnd, 1, 1); }
  });
  // the cat
  steps.push(() => { pen('#1A1A1A', 4.5); scribble(c, circ(130, 170, 52, 30, 0.9), rnd, 1.5); });
  steps.push(() => { pen('#1A1A1A', 4.5); scribble(c, [[92, 138], [86, 92], [118, 122]], rnd, 1.2); scribble(c, [[142, 122], [174, 92], [168, 140]], rnd, 1.2); });
  steps.push(() => {
    c.fillStyle = '#1A1A1A';
    c.beginPath(); c.arc(112, 165, 5.5, 0, TAU); c.fill();
    c.beginPath(); c.arc(148, 165, 5.5, 0, TAU); c.fill();
    pen('#E23B2E', 3.5); scribble(c, [[124, 184], [130, 190], [136, 184]], rnd, 0.6, 1);
    pen('#1A1A1A', 2.2);
    scribble(c, [[70, 178], [104, 182]], rnd, 0.8, 1); scribble(c, [[72, 192], [104, 188]], rnd, 0.8, 1);
    scribble(c, [[156, 182], [190, 178]], rnd, 0.8, 1); scribble(c, [[156, 188], [188, 192]], rnd, 0.8, 1);
  });
  // crown
  steps.push(() => {
    pen('#FFC928', 4.5);
    scribble(c, [[96, 112], [100, 78], [114, 98], [130, 70], [146, 98], [160, 78], [164, 112], [96, 112]], rnd, 1.2);
    c.fillStyle = '#E23B2E'; c.beginPath(); c.arc(130, 70, 4.5, 0, TAU); c.fill();
  });
  // hearts & stars
  const heart = (x: number, y: number, s: number) => {
    pen('#E23B2E', 3.5);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 30; i++) { const t = (i / 30) * TAU; pts.push([x + s * 16 * Math.sin(t) ** 3 / 16, y - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]); }
    scribble(c, pts, rnd, 0.8);
  };
  steps.push(() => heart(56, 92, 14));
  steps.push(() => heart(236, 196, 11));
  steps.push(() => {
    pen('#2B3DFF', 3);
    const star = (x: number, y: number, r: number) => scribble(c, Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i / 10) * TAU; const rr = i % 2 ? r * 0.45 : r; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as [number, number]; }), rnd, 0.7);
    star(62, 250, 13); star(250, 128, 9);
  });
  // MINE! in marker block letters
  steps.push(() => {
    pen('#E23B2E', 6);
    const L = (pts: [number, number][]) => scribble(c, pts, rnd, 1.4, 2);
    const y0 = 270, y1 = 330;
    L([[62, y1], [62, y0], [84, y0 + 34], [106, y0], [106, y1]]);
    L([[128, y0], [128, y1]]);
    L([[150, y1], [150, y0], [180, y1], [180, y0]]);
    L([[228, y0], [202, y0], [202, y1], [228, y1]]); L([[202, 300], [222, 300]]);
    L([[250, y0], [250, 314]]);
    c.fillStyle = '#E23B2E'; c.beginPath(); c.arc(250, 327, 4, 0, TAU); c.fill();
  });
  const n = Math.floor(steps.length * Math.min(1, p) + 1e-6);
  for (let i = 0; i < n; i++) steps[i]!();
}

export function renderDesign(d: Design, v = 0, scale = 3) {
  const { cv, c } = makeCanvas(PW_, PH_, scale);
  d.draw(c, v);
  return cv;
}

/** A collectible card face: the panel art framed with its number and name. 240 × 336 units. */
export function renderCard(d: Design, v: number, art: HTMLCanvasElement, scale = 3) {
  const { cv, c } = makeCanvas(240, 336, scale);
  const frame = v ? INK : BONE, ink = v ? BONE : INK;
  c.fillStyle = frame; c.fillRect(0, 0, 240, 336);
  c.drawImage(art, 12, 12 + 12 - 12, 216, 262);
  text(c, `Nº ${d.no}${v ? '·B' : ''}`, 14, 300, { size: 10, family: 'Plex', weight: 700, color: ink, track: 0.08 });
  text(c, d.name, 14, 320, { size: 15, family: 'ArchivoX', weight: 900, color: ink, track: -0.01 });
  text(c, 'DROP 01', 226, 300, { size: 8, family: 'Plex', weight: 500, color: ink, align: 'right', track: 0.14 });
  text(c, v ? 'ALT' : 'CORE', 226, 320, { size: 8, family: 'Plex', weight: 500, color: '#2B3DFF', align: 'right', track: 0.14 });
  return cv;
}

export function renderCardBack(scale = 3) {
  const { cv, c } = makeCanvas(240, 336, scale);
  c.fillStyle = BLUE; c.fillRect(0, 0, 240, 336);
  c.strokeStyle = 'rgba(237,232,222,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 16; i++) { c.beginPath(); c.roundRect(20 + i * 3, 20 + i * 3, 200 - i * 6, 296 - i * 6, 10); c.stroke(); }
  text(c, 'STIMPY', 120, 176, { size: 30, family: 'ArchivoX', weight: 900, color: BONE, align: 'center', track: -0.02 });
  text(c, 'ONE HOODIE · MULTIPLE IDENTITIES', 120, 196, { size: 6.5, family: 'Plex', weight: 500, color: BONE, align: 'center', track: 0.16 });
  return cv;
}

/** The empty slot on the collection wall: "your design here". */
export function renderCardBlank(scale = 3) {
  const { cv, c } = makeCanvas(240, 336, scale);
  c.fillStyle = BONE; c.fillRect(0, 0, 240, 336);
  c.strokeStyle = BLUE; c.lineWidth = 2; c.setLineDash([8, 6]);
  c.beginPath(); c.roundRect(14, 14, 212, 264, 10); c.stroke();
  c.setLineDash([]);
  c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(120, 118); c.lineTo(120, 174); c.moveTo(92, 146); c.lineTo(148, 146); c.stroke();
  text(c, 'YOUR DESIGN', 120, 214, { size: 14, family: 'ArchivoX', weight: 900, color: BLUE, align: 'center' });
  text(c, 'HERE', 120, 234, { size: 14, family: 'ArchivoX', weight: 900, color: BLUE, align: 'center' });
  text(c, 'Nº ∞', 14, 300, { size: 10, family: 'Plex', weight: 700, color: INK, track: 0.08 });
  text(c, 'YOURS', 14, 320, { size: 15, family: 'ArchivoX', weight: 900, color: INK });
  text(c, 'CUSTOM', 226, 320, { size: 8, family: 'Plex', weight: 500, color: BLUE, align: 'right', track: 0.14 });
  return cv;
}
