// The Stimpies: the 11 real artworks (public/stimpies/, resized copies of the originals; spec in
// content/_stimpies/stimpies.json). The artwork itself is never altered: it is only cropped, scaled and
// placed. Each painter fills the panel with the design's world colour (behind transparent cut-outs) and
// cover-fits the image, centred toward its hero detail (focus[0]).
// Panel units: 300 × 364. `t` is accepted for compatibility; the art is static (films add camera motion).
import { C } from '../engine/brand';
import { drawIcon } from '../engine/logo';
import { makeCanvas, text, type Ctx } from '../engine/draw';
import type { Art } from '../engine/hoodie';

export interface Design {
  id: string;
  name: string;
  /** the identity it gives you */
  word: string;
  /** the one-liner that goes with it */
  line: string;
  /** world colour: the background that matches it (brief: "the background colour changes to match") */
  world: string;
  /** text colour on the world colour */
  ink: string;
  /** the colours it leaks (hints / glows) */
  glow: string[];
  /** normalized [x, y] points of interesting details in the image; the first is the hero */
  focus: [number, number][];
  /** image file in public/stimpies/ (absent for the brand mark) */
  file?: string;
  transparent?: boolean;
  draw: (c: Ctx, w: number, h: number, t: number) => void;
}

type Spec = Omit<Design, 'draw'> & { file: string };
const SPEC: Spec[] = [
  { id: 'sabotage', file: 'sabotage.png', transparent: true, name: 'SABOTAGE', word: 'LOUD', line: 'I can’t stand it.', world: '#FFD23F', ink: '#111111', glow: ['#E8402A', '#FFD23F'], focus: [[0.50, 0.45], [0.50, 0.21], [0.50, 0.89], [0.50, 0.68]] },
  { id: 'bubblegum', file: 'bubblegum.png', transparent: true, name: 'BUBBLEGUM', word: 'SOFT', line: 'Pop.', world: '#F7A8C4', ink: '#111111', glow: ['#F27BA0', '#FBE3EA'], focus: [[0.52, 0.38], [0.31, 0.50], [0.65, 0.47], [0.55, 0.80]] },
  { id: 'tiger', file: 'tiger.png', transparent: true, name: 'IREZUMI', word: 'FIERCE', line: 'Ink runs deep.', world: '#E8792B', ink: '#111111', glow: ['#D8452B', '#F2B35A'], focus: [[0.40, 0.60], [0.74, 0.22], [0.82, 0.66], [0.64, 0.66]] },
  { id: 'ducks', file: 'ducks.jpg', transparent: false, name: 'ZERO DUCKS', word: 'CHILL', line: 'Zero ducks given.', world: '#E9B27A', ink: '#1E2A5A', glow: ['#E9B27A', '#2E4A3A'], focus: [[0.52, 0.33], [0.50, 0.20], [0.45, 0.40], [0.80, 0.25]] },
  { id: 'bside', file: 'bside.jpg', transparent: false, name: 'B-SIDE', word: 'UNFILTERED', line: 'Play at your own risk.', world: '#111111', ink: '#FFFFFF', glow: ['#C9B6FF', '#5CC8FF'], focus: [[0.60, 0.50], [0.50, 0.13], [0.45, 0.24], [0.25, 0.77]] },
  { id: 'receipt', file: 'receipt.jpg', transparent: false, name: 'RECEIPT', word: 'OFFLINE', line: 'Total due: go touch grass.', world: '#1E55F0', ink: '#FFFFFF', glow: ['#1E55F0', '#F25C3A'], focus: [[0.62, 0.61], [0.45, 0.25], [0.45, 0.43], [0.52, 0.75]] },
  { id: 'vhs', file: 'vhs.jpg', transparent: false, name: 'VHS', word: 'DRAMA', line: 'Running time: depends on the vibe.', world: '#2F5FD0', ink: '#FFFFFF', glow: ['#FFD23F', '#F26A4B'], focus: [[0.50, 0.40], [0.30, 0.22], [0.55, 0.69], [0.50, 0.88]] },
  { id: 'unhinged', file: 'unhinged.jpg', transparent: false, name: 'UNHINGED', word: 'WILD', line: 'Mildly unhinged. Fine by me.', world: '#F6EBD2', ink: '#111111', glow: ['#F2762E', '#FFC94A'], focus: [[0.50, 0.47], [0.50, 0.12], [0.50, 0.75], [0.50, 0.89]] },
  { id: 'sameday', file: 'sameday.jpg', transparent: false, name: 'SAME DAY', word: 'DIFFERENT', line: 'Same day, different me.', world: '#111111', ink: '#F6EEDD', glow: ['#F26A4B', '#4FB6F0'], focus: [[0.60, 0.40], [0.50, 0.10], [0.76, 0.56], [0.50, 0.91]] },
  { id: 'chameleon', file: 'chameleon.jpg', transparent: false, name: 'CHAMELEON', word: 'WHOEVER', line: 'Whoever I decide to be today.', world: '#C9B6FF', ink: '#111111', glow: ['#F26A4B', '#5CC8FF'], focus: [[0.64, 0.39], [0.50, 0.13], [0.33, 0.70], [0.50, 0.82]] },
  { id: 'neon', file: 'neon.jpg', transparent: false, name: 'NEON', word: 'UNLEASHED', line: 'Full power.', world: '#0B0B12', ink: '#FFFFFF', glow: ['#E8F4FF', '#D6264A'], focus: [[0.50, 0.40], [0.50, 0.47], [0.30, 0.75], [0.55, 0.15]] },
];

// ---------------------------------------------------------------- images
const IMAGES = new Map<string, HTMLImageElement>();
/** Load and fully decode every artwork. Awaited at boot, before any frame is drawn or captured. */
export async function loadStimpies() {
  await Promise.all(SPEC.map(async (s) => {
    const img = new Image();
    img.src = `stimpies/${s.file}`;
    await img.decode();
    if (!img.naturalWidth) throw new Error(`stimpie ${s.file} did not load`);
    IMAGES.set(s.id, img);
  }));
}
export function image(id: string) {
  const img = IMAGES.get(id);
  if (!img) throw new Error(`stimpie ${id} is not loaded`);
  return img;
}

export interface PlaceOpts {
  /** the image point (normalized) to centre on; default focus[0] */
  focus?: [number, number];
  /** where in the rect (0..1) that point should land; default the centre */
  anchor?: [number, number];
  /** extra scale over cover-fit (>= 1) */
  zoom?: number;
  /** zoom in further (up to this factor over cover) if needed so the focus lands exactly on the anchor */
  reach?: number;
}

/**
 * Paint a design into the rect (x, y, w, h): its world colour, then the image cover-fitted (never stretched)
 * with `focus` placed at `anchor` as closely as the crop allows (the image always covers the rect).
 */
export function paint(c: Ctx, d: Design | string, x: number, y: number, w: number, h: number, o: PlaceOpts = {}) {
  const D = typeof d === 'string' ? byId(d) : d;
  if (!D.file) { c.save(); c.translate(x, y); c.scale(w / 300, h / 364); D.draw(c, 300, 364, 0); c.restore(); return; }
  c.fillStyle = D.world;
  c.fillRect(x, y, w, h);
  const img = image(D.id);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const [fx, fy] = o.focus ?? D.focus[0]!;
  const [ax, ay] = o.anchor ?? [0.5, 0.5];
  const cover = Math.max(w / iw, h / ih);
  let s = cover * Math.max(1, o.zoom ?? 1);
  if (o.reach) {
    const need = Math.max(ax * w / (fx * iw), (1 - ax) * w / ((1 - fx) * iw), ay * h / (fy * ih), (1 - ay) * h / ((1 - fy) * ih));
    s = Math.max(s, Math.min(need, cover * o.reach));
  }
  const ox = Math.min(x, Math.max(x + w - iw * s, x + ax * w - fx * iw * s));
  const oy = Math.min(y, Math.max(y + h - ih * s, y + ay * h - fy * ih * s));
  // draw exactly the visible source rect (no bleed outside the rect, no clip needed)
  c.drawImage(img, (x - ox) / s, (y - oy) / s, w / s, h / s, x, y, w, h);
}

function fromSpec(s: Spec): Design {
  const d: Design = { ...s, draw: (c, w, h) => paint(c, d, 0, 0, w, h) };
  return d;
}

// ---------------------------------------------------------------- SIGNATURE (the Split Screen's final back)
// The brand mark as a Stimpie: one huge split S on black, echoed outward in outline rings of the drop
// colours — one identity, many versions. The rings breathe outward.
const SIGNATURE: Design = {
  id: 'signature', name: 'SIGNATURE', word: 'YOU', line: 'One of one.', world: C.coral, ink: C.black, glow: [C.coral, C.butter], focus: [[0.5, 0.47]],
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

export const DESIGNS: Design[] = SPEC.map(fromSpec);
/** Designs used only in specific moments (the brand mark; kept out of the rotation). */
export const EXTRA: Design[] = [SIGNATURE];
export const byId = (id: string) => DESIGNS.find((d) => d.id === id) ?? EXTRA.find((d) => d.id === id) ?? DESIGNS[0]!;

// ---------------------------------------------------------------- art painters
const cache = new Map<string, HTMLCanvasElement>();
const RES = 2.4;
/** Load the artworks, then pre-render every design (for the many small copies in crowded shots). */
export async function cacheDesigns() {
  await loadStimpies();
  for (const d of [...DESIGNS, ...EXTRA]) {
    const { cv, c } = makeCanvas(300, 364, RES);
    d.draw(c, 300, 364, 0);
    cache.set(d.id, cv);
  }
}
/**
 * Live artwork at film time t. The art is static, so the camera breathes slowly in toward the hero detail
 * (a 1.5–4.5 % push, periodic so loops stay seamless). The brand mark keeps its own animation.
 */
export function art(d: Design | string, t: number): Art {
  const D = typeof d === 'string' ? byId(d) : d;
  if (!D.file) return (c, w, h) => { c.save(); c.scale(w / 300, h / 364); D.draw(c, 300, 364, t); c.restore(); };
  const zoom = 1.03 + 0.015 * Math.sin(t * 0.5);
  return (c, w, h) => paint(c, D, 0, 0, w, h, { zoom });
}
/** Cached still artwork (fast). */
export function artStill(d: Design | string): Art {
  const D = typeof d === 'string' ? byId(d) : d;
  return (c, w, h) => { const cv = cache.get(D.id); if (cv) c.drawImage(cv, 0, 0, w, h); else D.draw(c, w, h, 0); };
}
