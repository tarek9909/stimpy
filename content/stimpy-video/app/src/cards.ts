// The Stimpies: collectible back panels drawn like tarot cards.
// Cards 1-11 carry the real Stimpie artworks (stimpies.json, images in public/stimpies/);
// card 0 is the STIMPY logo card. Each card is rendered once into its own canvas and reused.
import { rng, TAU, clamp } from './util';
import SPEC from './stimpies.json';

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
  ember: { bg: BLACK, ink: RED, acc: BONE },
};

// illustration area (inside the frame). The logo card keeps the original area; the artwork
// cards use a slightly narrower one whose aspect (0.705) matches the artworks, so cover-fit
// crops as little of them as possible.
type Area = { x: number; y: number; w: number; h: number };
const LOGO_AREA: Area = { x: 70, y: 140, w: 660, h: 870 };
const ART_AREA: Area = { x: 90, y: 140, w: 620, h: 880 };
const AW = LOGO_AREA.w;

export type Stimpie = {
  id: string; file: string; transparent: boolean; name: string; word: string; line: string;
  world: string; ink: string; glow: string[]; focus: number[][];
};
export const STIMPIES = (SPEC as { stimpies: Stimpie[] }).stimpies;

export type CardDef = { n: number; name: string; pal: Pal; art: Art; area: Area; spec?: Stimpie; world?: string };

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
export const stimpieImage = (id: string) => {
  const img = IMAGES.get(id);
  if (!img) throw new Error(`stimpie image not loaded: ${id}`);
  return img;
};

/** Source rect that cover-fits an image into a w x h box, centred on (fx, fy) as far as the image allows. */
export function coverRect(iw: number, ih: number, w: number, h: number, fx = 0.5, fy = 0.5, zoom = 1) {
  const k = Math.max(w / iw, h / ih) * zoom;
  const sw = w / k, sh = h / k;
  const sx = clamp(fx * iw - sw / 2, 0, iw - sw);
  const sy = clamp(fy * ih - sh / 2, 0, ih - sh);
  return { sx, sy, sw, sh };
}

/** Draw a stimpie's artwork into (x, y, w, h): world colour behind, image cover-fitted toward a focus point. */
export function drawArtwork(c: Ctx, s: Stimpie, x: number, y: number, w: number, h: number, focus = 0, zoom = 1) {
  const img = stimpieImage(s.id);
  c.fillStyle = s.world;
  c.fillRect(x, y, w, h);
  const [fx, fy] = s.focus[focus] ?? s.focus[0];
  const r = coverRect(img.naturalWidth, img.naturalHeight, w, h, fx, fy, zoom);
  c.drawImage(img, r.sx, r.sy, r.sw, r.sh, x, y, w, h);
}

const imageArt = (s: Stimpie): Art => (c, _p) => drawArtwork(c, s, 0, 0, ART_AREA.w, ART_AREA.h);

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

// the worlds of the film, each tied to the stimpie whose colours it borrows
const WORLD_OF: Record<string, string> = { neon: 'void', vhs: 'afterdark', tiger: 'cedar', sameday: 'dreamer' };

export const CARDS: CardDef[] = [
  { n: 0, name: 'STIMPY', pal: PAL.ember, art: LOGO, area: LOGO_AREA },
  ...STIMPIES.map((s, i) => ({
    n: i + 1,
    name: s.name,
    pal: { bg: s.world, ink: s.ink, acc: s.glow[0] === s.world ? s.glow[1] : s.glow[0] },
    art: imageArt(s),
    area: ART_AREA,
    spec: s,
    world: WORLD_OF[s.id],
  })),
];
/** card number for a world name */
export const cardForWorld = (w: string) => CARDS.find((c) => c.world === w)!.n;

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

  const { x: AX, y: AY, w: AW, h: AH } = def.area;
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
  (c as any).letterSpacing = '6px';
  let fs = def.name.length > 10 ? 50 : 58;
  c.font = `600 ${fs}px Corm`;
  const nw = c.measureText(def.name).width;
  if (nw > 440) fs = Math.floor((fs * 440) / nw);
  c.font = `600 ${fs}px Corm`;
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
  c.fillStyle = def.spec ? def.spec.ink : p.bg === BONE ? BLACK : BONE;
  for (let i = 0; i < 2500; i++) {
    const x = r() * CW, y = r() * CH;
    if (def.spec && x > AX && x < AX + AW && y > AY && y < AY + AH) continue; // never over the artwork
    c.fillRect(x, y, 1.5, 1.5);
  }
  c.globalAlpha = 1;

  if (scale === 1) cache.set(key, cv);
  return cv;
}
