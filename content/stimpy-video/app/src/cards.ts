// The Stimpies: the drop 001 prints as back panels. Each is just its picture, rendered once into its own
// canvas and reused.

export const BLACK = '#0a0a0a';
export const BONE = '#ece6da';
export const RED = '#ff2a1a';

export const CW = 800;
export const CH = 1250;
export const CARD_ASPECT = CW / CH;

type Pal = { bg: string; ink: string; acc: string };
type Ctx = CanvasRenderingContext2D;
type Art = (c: Ctx, p: Pal) => void;

const PAL = {
  night: { bg: BLACK, ink: BONE, acc: RED },
  paper: { bg: BONE, ink: BLACK, acc: RED },
  blood: { bg: RED, ink: BLACK, acc: BONE },
  ember: { bg: BLACK, ink: RED, acc: BONE },
};

export type CardDef = { n: number; name: string; pal: Pal; art: Art; file?: string; world?: string };

// ---------------------------------------------------------------- drawing helpers

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

// ---------------------------------------------------------------- the drop 001 artwork

// Each Stimpie is a finished print (public/stimpies, exported from content/drop-001). Load them before the
// first cardCanvas() call; the print fills the card.
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

/** The whole print, as large as the card allows, centred. */
function print(file: string): Art {
  return (c) => {
    const img = IMAGES.get(file);
    if (!img) return;
    const k = Math.min(CW / img.width, CH / img.height);
    const w = img.width * k, h = img.height * k;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, (CW - w) / 2, (CH - h) / 2, w, h);
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
  const cx = CW / 2;
  c.fillStyle = p.ink;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = '900 230px ArchivoX';
  c.fillText('STIM', cx, 520);
  c.fillText('PY', cx, 740);
  c.fillStyle = p.acc;
  miniHoodie(c, cx, 920, 120);
  c.font = '600 26px PlexB';
  c.fillText('ONE HOODIE — YOUR WORLD', cx, 960);
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
  { n: 8, name: 'NEON SPECTRUM', pal: PAL.night, file: ART.neon, art: print(ART.neon) },
  { n: 9, name: 'SCRUFFY CAT', pal: PAL.blood, file: ART.scruffy, art: print(ART.scruffy) },
  { n: 10, name: 'SABOTAGE', pal: PAL.paper, file: ART.sabotage, art: print(ART.sabotage) },
  { n: 11, name: 'MANGA GIRL', pal: PAL.ember, file: ART.manga, art: print(ART.manga) },
  { n: 12, name: 'SPLIT TONE', pal: PAL.night, file: ART.split, art: print(ART.split) },
  { n: 13, name: 'HALF EVIL', pal: PAL.night, file: ART.halfEvil, art: print(ART.halfEvil) },
  { n: 14, name: 'MANEKI TIGER', pal: PAL.night, file: ART.maneki, art: print(ART.maneki) },
  { n: 15, name: 'IRRITATED CAT', pal: PAL.blood, file: ART.irritated, art: print(ART.irritated) },
  { n: 16, name: 'NEON SPECTRUM', pal: PAL.ember, file: ART.neon, art: print(ART.neon) },
];

const cache = new Map<number, HTMLCanvasElement>();

/** A Stimpie is just its picture: no frame, number or nameplate, transparent around the print. */
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
  def.art(c, def.pal);

  if (scale === 1) cache.set(key, cv);
  return cv;
}
