// The Stimpies: the 11 real back-panel artworks (stimpies.json, images in public/stimpies/), plus the
// hand-drawn custom one made in "Yours". Each panel is the artwork cover-fitted toward its hero detail
// (focus[0]) over its world colour, drawn once at boot in panel units (300 × 364). The artwork pixels are
// never altered: only cropped, scaled and placed.
import { makeCanvas, text, scribble, type Ctx } from '../engine/draw2d';
import { mulberry, TAU } from '../engine/util';
import SPEC from './stimpies.json';

export const PW_ = 300, PH_ = 364;
export const INK = '#0E0E10', BONE = '#EDE8DE', BLUE = '#2B3DFF';

export interface Design {
  id: string;
  no: string;
  name: string;
  word: string;     // the identity it gives you (identities scene)
  line: string;     // its one-liner
  pal: { bg: string; fg: string; accent: string; ink: string }; // world palette (bg = world, accent = a glow that reads on it)
  glow: string[];
  focus: [number, number][];
  transparent: boolean;
  file: string;
  img?: HTMLImageElement;
  draw: (c: Ctx) => void;
}

/** Draws `d`'s artwork cover-fitted into the rect (x, y, w, h), centred as far as possible on focus[k], magnified by `zoom`. */
export function drawArt(c: Ctx, d: Design, x: number, y: number, w: number, h: number, k = 0, zoom = 1, under = true) {
  const img = d.img!;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  const [fx, fy] = d.focus[k] ?? d.focus[0]!;
  const dx = Math.min(0, Math.max(w - dw, w / 2 - fx * dw));
  const dy = Math.min(0, Math.max(h - dh, h / 2 - fy * dh));
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (under) { c.fillStyle = d.pal.bg; c.fillRect(x, y, w, h); }
  c.drawImage(img, x + dx, y + dy, dw, dh);
  c.restore();
}

/** Where focus[k] lands on the panel, in panel units relative to the panel centre (x right, y up). */
export function focusOnPanel(d: Design, k = 0): [number, number] {
  const img = d.img!;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(PW_ / iw, PH_ / ih);
  const dw = iw * s, dh = ih * s;
  const [fx, fy] = d.focus[k] ?? d.focus[0]!;
  const dx = Math.min(0, Math.max(PW_ - dw, PW_ / 2 - fx * dw));
  const dy = Math.min(0, Math.max(PH_ - dh, PH_ / 2 - fy * dh));
  return [dx + fx * dw - PW_ / 2, -(dy + fy * dh - PH_ / 2)];
}

// a glow colour that stands out from the world colour
function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function pickAccent(world: string, glow: string[]) {
  const sorted = [...glow].sort((a, b) => Math.abs(lum(b) - lum(world)) - Math.abs(lum(a) - lum(world)));
  return sorted.find((g) => g.toLowerCase() !== world.toLowerCase()) ?? glow[0]!;
}

export const DESIGNS: Design[] = SPEC.stimpies.map((s, i) => {
  const d: Design = {
    id: s.id, no: String(i + 1).padStart(3, '0'), name: s.name, word: s.word, line: s.line,
    pal: { bg: s.world, fg: s.ink, accent: pickAccent(s.world, s.glow), ink: s.ink },
    glow: s.glow, focus: s.focus as [number, number][], transparent: s.transparent, file: s.file,
    draw(c) { drawArt(c, d, 0, 0, PW_, PH_, 0); },
  };
  return d;
});

/** Index of a Stimpie by id. */
export const IDX = (id: string) => { const i = DESIGNS.findIndex((d) => d.id === id); if (i < 0) throw new Error(`no stimpie ${id}`); return i; };

/** Loads and decodes every artwork. Must finish before any design canvas or texture is built. */
export async function loadStimpies() {
  await Promise.all(DESIGNS.map(async (d) => {
    const img = new Image();
    img.src = `stimpies/${d.file}`;
    await img.decode();
    d.img = img;
  }));
}

// ---------------------------------------------------------------- pattern helpers (used by the worlds)
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

export function barcode(c: Ctx, x: number, y: number, w: number, h: number, col: string, seed: number) {
  const rnd = mulberry(seed);
  c.fillStyle = col;
  let p = x;
  while (p < x + w) { const bw = rnd() < 0.3 ? 2 : 0.8; c.fillRect(p, y, bw, h); p += bw + 0.8 + rnd() * 2; }
}

// ---------------------------------------------------------------- the blank, personal slot
/** The custom Stimpie drawn in "Yours": marker on notebook paper. */
export const MINE: Design = {
  id: 'mine', no: '∞', name: 'YOURS', word: 'yours', line: 'Made by you.',
  pal: { bg: '#F4EFE4', fg: '#1A1A1A', accent: '#E23B2E', ink: '#1A1A1A' },
  glow: ['#E23B2E', '#FFC928'], focus: [[0.5, 0.5]], transparent: false, file: '',
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

export function renderDesign(d: Design, scale = 3) {
  const { cv, c } = makeCanvas(PW_, PH_, scale);
  d.draw(c);
  return cv;
}

/** A collectible card face: the panel art framed in its world colour with its number, name and word. 240 × 336 units. */
export function renderCard(d: Design, art: HTMLCanvasElement, scale = 3) {
  const { cv, c } = makeCanvas(240, 336, scale);
  const frame = d.pal.bg, ink = d.pal.ink;
  c.fillStyle = frame; c.fillRect(0, 0, 240, 336);
  c.drawImage(art, 12, 12, 216, 262);
  text(c, `Nº ${d.no}`, 14, 300, { size: 10, family: 'Plex', weight: 700, color: ink, track: 0.08 });
  const size = Math.min(15, 15 * 9 / Math.max(9, d.name.length));
  text(c, d.name, 14, 320, { size, family: 'ArchivoX', weight: 900, color: ink, track: -0.01 });
  text(c, 'DROP 01', 226, 300, { size: 8, family: 'Plex', weight: 500, color: ink, align: 'right', track: 0.14 });
  text(c, d.word, 226, 320, { size: 8, family: 'Plex', weight: 700, color: d.pal.accent, align: 'right', track: 0.14 });
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
