// The Stimpies: collectible back panels drawn like tarot cards, carrying the drop 001 prints.
// Each card is rendered once into its own canvas and reused.
import { rng, TAU } from './util';

export const BLACK = '#0a0a0a';
export const BONE = '#ece6da';
export const RED = '#ff2a1a';

export const CW = 800;
export const CH = 1250;
export const CARD_ASPECT = CW / CH;

type Pal = { bg: string; ink: string; acc: string };
type Ctx = CanvasRenderingContext2D;
type Art = (c: Ctx, p: Pal, r: () => number) => void;

const PAL = {
  night: { bg: BLACK, ink: BONE, acc: RED },
  paper: { bg: BONE, ink: BLACK, acc: RED },
  blood: { bg: RED, ink: BLACK, acc: BONE },
  ember: { bg: BLACK, ink: RED, acc: BONE },
};

// illustration area (inside the frame)
const AX = 70, AY = 140, AW = 660, AH = 870;

export type CardDef = { n: number; name: string; pal: Pal; art: Art; file?: string; world?: string };

// ---------------------------------------------------------------- drawing helpers

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

/** A tiny ghost hoodie (back view), h = total height, standing on (x, y). */
export function miniHoodie(c: Ctx, x: number, y: number, h: number) {
  const s = h / 100;
  c.save();
  c.translate(x, y - h);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-14, 22);
  c.bezierCurveTo(-16, 4, -10, 0, 0, 0);
  c.bezierCurveTo(10, 0, 16, 4, 14, 22);
  c.lineTo(30, 27);
  c.lineTo(38, 78);
  c.lineTo(29, 80);
  c.lineTo(26, 50);
  c.lineTo(27, 97);
  c.lineTo(-27, 97);
  c.lineTo(-26, 50);
  c.lineTo(-29, 80);
  c.lineTo(-38, 78);
  c.lineTo(-30, 27);
  c.closePath();
  c.fill();
  c.restore();
}

function leaf(c: Ctx, x: number, y: number, len: number, ang: number, ink: string, bg: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = ink;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  c.fill();
  c.strokeStyle = bg;
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(len * 0.1, 0);
  c.lineTo(len * 0.85, 0);
  c.stroke();
  c.restore();
}

function flower(c: Ctx, x: number, y: number, rad: number, col: string, bg: string) {
  c.fillStyle = col;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    c.beginPath();
    c.ellipse(x + Math.cos(a) * rad * 0.9, y + Math.sin(a) * rad * 0.9, rad * 0.75, rad * 0.45, a, 0, TAU);
    c.fill();
  }
  c.fillStyle = bg;
  circle(c, x, y, rad * 0.35);
  c.fill();
}

// ---------------------------------------------------------------- the drop 001 artwork

// Each Stimpie is a finished print (public/stimpies, exported from content/drop-001). Load them before the
// first cardCanvas() call; the art is fitted inside the illustration area.
const ART_DIR = 'stimpies/';
const IMAGES = new Map<string, HTMLImageElement>();

export function loadStimpies(): Promise<void> {
  const files = new Set(CARDS.map((d) => d.file).filter((f): f is string => !!f));
  return Promise.all(
    [...files].map(async (f) => {
      const img = new Image();
      img.src = ART_DIR + f;
      await img.decode();
      IMAGES.set(f, img);
    }),
  ).then(() => undefined);
}

/** contain: the whole print with a margin (transparent prints); cover: fills the area (full-bleed prints). */
function print(file: string, fit: 'contain' | 'cover' = 'contain', pad = 34): Art {
  return (c) => {
    const img = IMAGES.get(file);
    if (!img) return;
    const bw = AW - pad * 2, bh = AH - pad * 2;
    const k = fit === 'cover' ? Math.max(AW / img.width, AH / img.height) : Math.min(bw / img.width, bh / img.height);
    const w = img.width * k, h = img.height * k;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, (AW - w) / 2, (AH - h) / 2, w, h);
  };
}

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

const LOGO: Art = (c, p) => {
  c.fillStyle = p.ink;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = '900 230px ArchivoX';
  c.fillText('STIM', AW / 2, 420);
  c.fillText('PY', AW / 2, 640);
  c.fillStyle = p.acc;
  miniHoodie(c, AW / 2, 820, 120);
  c.font = '600 26px PlexB';
  c.fillText('ONE HOODIE — YOUR WORLD', AW / 2, 860);
};

// ---------------------------------------------------------------- the deck

export const CARDS: CardDef[] = [
  { n: 0, name: 'STIMPY', pal: PAL.ember, art: LOGO },
  { n: 1, name: 'SCRUFFY CAT', pal: PAL.night, file: ART.scruffy, art: print(ART.scruffy), world: 'void' },
  { n: 2, name: 'SABOTAGE', pal: PAL.night, file: ART.sabotage, art: print(ART.sabotage), world: 'afterdark' },
  { n: 3, name: 'MANGA GIRL', pal: PAL.paper, file: ART.manga, art: print(ART.manga), world: 'cedar' },
  { n: 4, name: 'SPLIT TONE', pal: PAL.blood, file: ART.split, art: print(ART.split), world: 'dreamer' },
  { n: 5, name: 'HALF EVIL', pal: PAL.night, file: ART.halfEvil, art: print(ART.halfEvil) },
  { n: 6, name: 'MANEKI TIGER', pal: PAL.paper, file: ART.maneki, art: print(ART.maneki) },
  { n: 7, name: 'IRRITATED CAT', pal: PAL.night, file: ART.irritated, art: print(ART.irritated) },
  { n: 8, name: 'NEON SPECTRUM', pal: PAL.night, file: ART.neon, art: print(ART.neon, 'cover') },
  { n: 9, name: 'SCRUFFY CAT', pal: PAL.blood, file: ART.scruffy, art: print(ART.scruffy) },
  { n: 10, name: 'SABOTAGE', pal: PAL.paper, file: ART.sabotage, art: print(ART.sabotage) },
  { n: 11, name: 'MANGA GIRL', pal: PAL.ember, file: ART.manga, art: print(ART.manga) },
  { n: 12, name: 'SPLIT TONE', pal: PAL.night, file: ART.split, art: print(ART.split) },
  { n: 13, name: 'HALF EVIL', pal: PAL.night, file: ART.halfEvil, art: print(ART.halfEvil) },
  { n: 14, name: 'MANEKI TIGER', pal: PAL.night, file: ART.maneki, art: print(ART.maneki) },
  { n: 15, name: 'IRRITATED CAT', pal: PAL.blood, file: ART.irritated, art: print(ART.irritated) },
  { n: 16, name: 'NEON SPECTRUM', pal: PAL.ember, file: ART.neon, art: print(ART.neon, 'cover') },
];

export const edition = (n: number) => String(7 + ((n * 37) % 93)).padStart(3, '0') + '/100';
export const num = (n: number) => String(n).padStart(3, '0');

const cache = new Map<number, HTMLCanvasElement>();

export function cardCanvas(n: number, scale = 1): HTMLCanvasElement {
  const key = n + scale * 1000;
  let cv = cache.get(key);
  if (cv) return cv;
  const def = CARDS[n];
  cv = document.createElement('canvas');
  cv.width = CW * scale;
  cv.height = CH * scale;
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  const p = def.pal;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, CW, CH);

  c.save();
  c.beginPath();
  c.rect(AX, AY, AW, AH);
  c.clip();
  c.translate(AX, AY);
  def.art(c, p, rng(1000 + n * 17));
  c.restore();

  // frame
  c.strokeStyle = p.ink;
  c.lineWidth = 5;
  c.strokeRect(30, 30, CW - 60, CH - 60);
  c.lineWidth = 1.5;
  c.strokeRect(46, 46, CW - 92, CH - 92);
  c.strokeRect(AX, AY, AW, AH);
  for (const [x, y] of [[46, 46], [CW - 46, 46], [46, CH - 46], [CW - 46, CH - 46]]) {
    c.fillStyle = p.ink;
    c.beginPath();
    c.moveTo(x, y - 12);
    c.lineTo(x + 12, y);
    c.lineTo(x, y + 12);
    c.lineTo(x - 12, y);
    c.closePath();
    c.fill();
  }
  // top: the Stimpy triangle + number
  c.fillStyle = p.acc;
  c.beginPath();
  c.moveTo(CW / 2 - 16, 82);
  c.lineTo(CW / 2 + 16, 82);
  c.lineTo(CW / 2, 108);
  c.closePath();
  c.fill();
  c.strokeStyle = p.ink;
  c.lineWidth = 1.5;
  line(c, 90, 95, CW / 2 - 40, 95);
  line(c, CW / 2 + 40, 95, CW - 90, 95);
  c.fillStyle = p.ink;
  c.font = '600 24px PlexB';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('N° ' + num(n), 90, 76);
  c.textAlign = 'right';
  c.fillText(n === 0 ? 'DROP 001' : edition(n), CW - 90, 76);

  // nameplate
  c.fillStyle = p.bg;
  c.fillRect(140, 1045, CW - 280, 110);
  c.strokeStyle = p.ink;
  c.lineWidth = 3;
  c.strokeRect(140, 1045, CW - 280, 110);
  c.lineWidth = 1;
  c.strokeRect(150, 1055, CW - 300, 90);
  c.fillStyle = p.ink;
  c.textAlign = 'center';
  c.font = `600 ${def.name.length > 12 ? 42 : def.name.length > 10 ? 50 : 58}px Corm`;
  (c as any).letterSpacing = '6px';
  c.fillText(def.name, CW / 2 + 3, 1103);
  (c as any).letterSpacing = '0px';
  for (const sd of [-1, 1]) {
    const x = CW / 2 + sd * 290;
    for (let k = 0; k < 4; k++) leaf(c, x, 1100, 22 - k * 3, (sd > 0 ? 0 : Math.PI) + (k - 1.5) * 0.5, p.ink, p.bg);
    flower(c, x, 1100, 6, p.acc, p.bg);
  }
  c.font = '400 18px Plex';
  c.fillText('STIMPIE · STIMPY', CW / 2, 1190);

  // subtle print texture
  const r = rng(n + 99);
  c.globalAlpha = 0.06;
  c.fillStyle = p.bg === BONE ? BLACK : BONE;
  for (let i = 0; i < 2500; i++) c.fillRect(r() * CW, r() * CH, 1.5, 1.5);
  c.globalAlpha = 1;

  if (scale === 1) cache.set(key, cv);
  return cv;
}
