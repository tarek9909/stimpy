// The Stimpies: back panels that are just their picture, transparent around it.
// Cards 1-11 carry the real Stimpie artworks (stimpies.json, images in public/stimpies/);
// card 0 is the STIMPY logo. Each card is rendered once into its own canvas and reused.
import SPEC from './stimpies.json';

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
  ember: { bg: BLACK, ink: RED, acc: BONE },
};

export type Stimpie = {
  id: string; file: string; transparent: boolean; name: string; word: string; line: string;
  world: string; ink: string; glow: string[]; focus: number[][];
};
export const STIMPIES = (SPEC as { stimpies: Stimpie[] }).stimpies;

export type CardDef = { n: number; name: string; pal: Pal; art: Art; spec?: Stimpie; world?: string };

// ---------------------------------------------------------------- the artwork images

const IMAGES = new Map<string, HTMLImageElement>();

/** Load + decode every artwork. Must resolve before any card canvas is generated. */
export async function loadStimpies() {
  await Promise.all(
    STIMPIES.map(async (s) => {
      const img = new Image();
      img.src = `stimpies/${s.file}`;
      await img.decode();
      IMAGES.set(s.id, img);
    }),
  );
}

/** The whole artwork, as large as the card allows, centred. */
const imageArt = (s: Stimpie): Art => (c) => {
  const img = IMAGES.get(s.id);
  if (!img) throw new Error(`stimpie image not loaded: ${s.id}`);
  const k = Math.min(CW / img.naturalWidth, CH / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, (CW - w) / 2, (CH - h) / 2, w, h);
};

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

// the worlds of the film, each tied to the stimpie whose colours it borrows
const WORLD_OF: Record<string, string> = { neon: 'void', vhs: 'afterdark', tiger: 'cedar', sameday: 'dreamer' };

export const CARDS: CardDef[] = [
  { n: 0, name: 'STIMPY', pal: PAL.ember, art: LOGO },
  ...STIMPIES.map((s, i) => ({
    n: i + 1,
    name: s.name,
    pal: { bg: s.world, ink: s.ink, acc: s.glow[0] === s.world ? s.glow[1] : s.glow[0] },
    art: imageArt(s),
    spec: s,
    world: WORLD_OF[s.id],
  })),
];
/** card number for a world name */
export const cardForWorld = (w: string) => CARDS.find((c) => c.world === w)!.n;

export const edition = (n: number) => String(7 + ((n * 37) % 93)).padStart(3, '0') + '/100';
export const num = (n: number) => String(n).padStart(3, '0');

const cache = new Map<number, HTMLCanvasElement>();

/** A Stimpie is just its picture: no frame, number or nameplate, transparent around it. */
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
