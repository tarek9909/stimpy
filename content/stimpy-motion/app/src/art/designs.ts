// The Stimpies: the drop 001 prints as back panels, each just its picture.
// Panel units: 300 × 364. `t` animates the design (seconds); static uses draw a cached t = 0 render.
import { C } from '../engine/brand';
import { drawIcon } from '../engine/logo';
import { makeCanvas, text, type Ctx } from '../engine/draw';
import type { Art } from '../engine/hoodie';

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


// ---------------------------------------------------------------- the drop 001 prints
// Every Stimpie in the rotation is a finished print (public/stimpies, exported from content/drop-001).
// `loadStimpies()` must resolve before anything draws. The ids, words and world colours are unchanged, so
// every film keeps its colour script; only the artwork on the back changes.
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

interface Print { file: string }
/** Just the picture: the whole print, as large as the panel allows, on a transparent panel.
 *  It breathes very slightly with t so live uses still feel alive. */
function print(p: Print): Design['draw'] {
  return (c, w, h, t) => {
    const img = IMAGES.get(p.file);
    if (!img) return;
    const k = Math.min(w / img.width, h / img.height) * (1 - 0.012 + 0.012 * Math.sin(t * 1.6));
    const iw = img.width * k, ih = img.height * k;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  };
}
const design = (id: string, name: string, word: string, world: string, ink: string, glow: string[], p: Print): Design =>
  ({ id, name, word, world, ink, glow, draw: print(p) });

const FLAME = design('flame', 'SCRUFFY CAT', 'LOUD', C.coral, C.black, [C.coral, C.butter], { file: ART.scruffy });
const BLOOM = design('bloom', 'MANGA GIRL', 'SOFT', C.lilac, C.black, [C.lilac, C.butter], { file: ART.manga });
const STATIC = design('static', 'SABOTAGE', 'CHAOS', C.white, C.black, [C.white, C.coral], { file: ART.sabotage });
const WAVE = design('wave', 'SPLIT TONE', 'CALM', C.sky, C.black, [C.sky, C.blue], { file: ART.split });
const NIGHT = design('night', 'NEON SPECTRUM', 'NIGHT', C.blue, C.white, [C.blue, C.butter], { file: ART.neon });
const SUN = design('sun', 'MANEKI TIGER', 'DAY', C.butter, C.black, [C.butter, C.coral], { file: ART.maneki });
const TAG = design('tag', 'HALF EVIL', 'STREET', C.cream, C.black, [C.coral, C.cream], { file: ART.halfEvil });
const ORBIT = design('orbit', 'NEON SPECTRUM', 'DREAM', C.black, C.white, [C.sky, C.lilac], { file: ART.neon });
const HALFTONE = design('halftone', 'IRRITATED CAT', 'POP', C.coral, C.black, [C.coral, C.butter], { file: ART.irritated });
const CHECKER = design('checker', 'SCRUFFY CAT', 'FAST', C.butter, C.black, [C.butter, C.black], { file: ART.scruffy });
const EYE = design('eye', 'SPLIT TONE', 'QUIET', C.cream, C.black, [C.lilac, C.blue], { file: ART.split });
const PIXEL = design('pixel', 'MANGA GIRL', 'PLAY', C.lilac, C.black, [C.lilac, C.coral], { file: ART.manga });

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
