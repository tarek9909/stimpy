// The Stimpies: six drop 001 prints (each with an alternate for the collection) plus the hand-drawn custom
// one made in "Yours". Drawn once at boot in panel units (300 × 364).
import { makeCanvas, text, scribble, type Ctx } from '../engine/draw2d';
import { mulberry, TAU } from '../engine/util';

export const PW_ = 300, PH_ = 364;
export const INK = '#0E0E10', BONE = '#EDE8DE', BLUE = '#2B3DFF';

export interface Design {
  id: string;
  no: string;
  name: string;
  word: string;     // the identity it gives you (identities scene)
  altName?: string; // the alternate's name when it is a different print
  pal: { bg: string; fg: string; accent: string; ink: string }; // world palette
  draw: (c: Ctx, v: number) => void;
}

// ---------------------------------------------------------------- helpers
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

// ---------------------------------------------------------------- the designs: the drop 001 prints
// Each panel is a finished print (public/stimpies, exported from content/drop-001); loadStimpies() must
// resolve before renderDesign(). v = 1 is the collection's alternate: a second print, or the same one on
// another backing.
const ART = {
  scruffy: '01-scruffy-black-cat.webp',
  sabotage: '02-sabotage.webp',
  manga: '03-pink-haired-manga-girl.webp',
  split: '04-split-tone-abstract.webp',
  halfEvil: '05-half-evil-333.webp',
  maneki: '06-maneki-neko-tiger.webp',
  irritated: '07-irritated-cat-comic.webp',
  neon: '08-neon-spectrum.webp',
};
const IMAGES = new Map<string, HTMLImageElement>();
export function loadStimpies(): Promise<void> {
  return Promise.all(Object.values(ART).map(async (f) => {
    const img = new Image();
    img.src = `stimpies/${f}`;
    await img.decode();
    IMAGES.set(f, img);
  })).then(() => undefined);
}

type Side = { file: string; back: string; name?: string; cover?: boolean };
/** Just the picture: the whole print, as large as the panel allows, on a transparent panel. */
function print(c: Ctx, s: Side) {
  const img = IMAGES.get(s.file);
  if (!img) return;
  const k = Math.min(PW_ / img.width, PH_ / img.height);
  const w = img.width * k, h = img.height * k;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, (PW_ - w) / 2, (PH_ - h) / 2, w, h);
}
const sides = (core: Side, alt: Side) => ({ altName: alt.name, draw: (c: Ctx, v: number) => print(c, v ? alt : core) });

export const DESIGNS: Design[] = [
  {
    id: 'static', no: '001', name: 'SABOTAGE', word: 'LOUD',
    pal: { bg: '#E9E4DA', fg: INK, accent: '#FF3B1F', ink: INK },
    ...sides({ file: ART.sabotage, back: INK }, { file: ART.halfEvil, back: INK, name: 'HALF EVIL' }),
  },
  {
    id: 'bloom', no: '002', name: 'MANGA GIRL', word: 'soft',
    pal: { bg: '#F2C4CC', fg: '#8E1420', accent: '#F2892B', ink: '#8E1420' },
    ...sides({ file: ART.manga, back: '#F2C4CC' }, { file: ART.manga, back: '#1F3B2C' }),
  },
  {
    id: 'orbit', no: '003', name: 'SPLIT TONE', word: 'SPACED OUT',
    pal: { bg: BLUE, fg: BONE, accent: '#FF6A2B', ink: BONE },
    ...sides({ file: ART.split, back: BLUE }, { file: ART.split, back: BONE }),
  },
  {
    id: 'night', no: '004', name: 'NEON SPECTRUM', word: 'OUT LATE',
    pal: { bg: '#0A1030', fg: '#F4E7C5', accent: '#FFD66B', ink: '#F4E7C5' },
    ...sides({ file: ART.neon, back: '#0A1030', cover: true }, { file: ART.neon, back: '#0A1030' }),
  },
  {
    id: 'heat', no: '005', name: 'MANEKI TIGER', word: 'ON FIRE',
    pal: { bg: '#FF3B1F', fg: '#121010', accent: '#FFD23F', ink: '#121010' },
    ...sides({ file: ART.maneki, back: '#121010' }, { file: ART.maneki, back: BONE }),
  },
  {
    id: 'acid', no: '006', name: 'IRRITATED CAT', word: 'UNHINGED',
    pal: { bg: '#D4FF3A', fg: '#0B0B0B', accent: '#FF4FA3', ink: '#0B0B0B' },
    ...sides({ file: ART.irritated, back: '#D4FF3A' }, { file: ART.scruffy, back: '#0B0B0B', name: 'SCRUFFY CAT' }),
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

/** A collectible card face: just the panel's picture, no frame or number. 240 × 336 units. */
export function renderCard(art: HTMLCanvasElement, scale = 3) {
  const { cv, c } = makeCanvas(240, 336, scale);
  const k = Math.min(240 / PW_, 336 / PH_), w = PW_ * k, h = PH_ * k;
  c.drawImage(art, (240 - w) / 2, (336 - h) / 2, w, h);
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
  text(c, 'YOURS', 14, 320, { size: 15, family: 'ArchivoX', weight: 900, color: INK });
  text(c, 'CUSTOM', 226, 320, { size: 8, family: 'Plex', weight: 500, color: BLUE, align: 'right', track: 0.14 });
  return cv;
}
