// Canvas-2D kit: fonts, typography, shapes, offscreen scratch layers.
export type Ctx = CanvasRenderingContext2D;

// Poppins is the brand face. The other families are only used *inside* Stimpie artwork.
const FONTS: [string, string, string, string][] = [
  ['Poppins', 'Poppins-Regular.ttf', '400', 'normal'],
  ['Poppins', 'Poppins-Medium.ttf', '500', 'normal'],
  ['Poppins', 'Poppins-SemiBold.ttf', '600', 'normal'],
  ['Poppins', 'Poppins-Bold.ttf', '700', 'normal'],
  ['Poppins', 'Poppins-ExtraBold.ttf', '800', 'normal'],
  ['Poppins', 'Poppins-Black.ttf', '900', 'normal'],
  ['Poppins', 'Poppins-Italic.ttf', '400', 'italic'],
  ['Poppins', 'Poppins-BoldItalic.ttf', '700', 'italic'],
  ['ArchivoX', 'Archivo-w1250-900.ttf', '900', 'normal'],
  ['ArchivoC', 'Archivo-w620-900.ttf', '900', 'normal'],
  ['Corm', 'CormorantItalic-600.ttf', '600', 'italic'],
  ['Plex', 'IBMPlexMono-Medium.ttf', '500', 'normal'],
  ['Plex', 'IBMPlexMono-Bold.ttf', '700', 'normal'],
];

export async function loadFonts() {
  await Promise.all(FONTS.map(async ([fam, file, weight, style]) => {
    const f = new FontFace(fam, `url(fonts/${file})`, { weight, style });
    await f.load();
    document.fonts.add(f);
  }));
}

export interface TextOpts {
  size: number;
  family?: 'Poppins' | 'ArchivoX' | 'ArchivoC' | 'Corm' | 'Plex';
  weight?: number;
  italic?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** letter spacing in em */
  track?: number;
  alpha?: number;
}

export function font(o: TextOpts) {
  return `${o.italic ? 'italic ' : ''}${o.weight ?? 700} ${o.size}px ${o.family ?? 'Poppins'}`;
}

function setText(c: Ctx, o: TextOpts) {
  c.font = font(o);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.baseline ?? 'alphabetic';
  c.letterSpacing = `${(o.track ?? 0) * o.size}px`;
}

/** letterSpacing adds trailing space after the last glyph: shift centred / right-aligned text back. */
function trackShift(o: TextOpts) {
  const tr = (o.track ?? 0) * o.size;
  return o.align === 'center' ? tr / 2 : o.align === 'right' || o.align === 'end' ? tr : 0;
}

export function text(c: Ctx, s: string, x: number, y: number, o: TextOpts) {
  c.save();
  setText(c, o);
  c.fillStyle = o.color ?? '#fff';
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.fillText(s, x + trackShift(o), y);
  c.restore();
}

export function strokeText(c: Ctx, s: string, x: number, y: number, o: TextOpts, lw: number) {
  c.save();
  setText(c, o);
  c.strokeStyle = o.color ?? '#fff';
  c.lineWidth = lw;
  c.lineJoin = 'round';
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.strokeText(s, x + trackShift(o), y);
  c.restore();
}

export function measure(c: Ctx, s: string, o: TextOpts) {
  c.save();
  setText(c, o);
  const w = c.measureText(s).width - (o.track ?? 0) * o.size;
  c.restore();
  return w;
}

/**
 * Text that types itself on (p: 0..1 of the characters) with a blinking block cursor.
 * Returns the x of the cursor.
 */
export function typeOn(c: Ctx, s: string, x: number, y: number, o: TextOpts, p: number, cursor: number | null = null) {
  const n = Math.max(0, Math.min(s.length, Math.floor(s.length * p + 1e-6)));
  const shown = s.slice(0, n);
  const full = measure(c, s, o);
  // anchor as if the whole string were there, so the line does not shift while typing
  const x0 = o.align === 'center' ? x - full / 2 : o.align === 'right' ? x - full : x;
  text(c, shown, x0, y, { ...o, align: 'left' });
  const cx = x0 + measure(c, shown, o) + (n > 0 ? (o.track ?? 0) * o.size : 0);
  if (cursor !== null && cursor > 0) {
    c.save();
    c.globalAlpha *= cursor;
    c.fillStyle = o.color ?? '#fff';
    c.fillRect(cx + o.size * 0.06, y - o.size * 0.74, o.size * 0.07, o.size * 0.86);
    c.restore();
  }
  return cx;
}

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

/** Canvas + context at a given pixel size, drawn in logical units (scale = pixels per unit). */
export function makeCanvas(w: number, h: number, scale = 1) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * scale));
  cv.height = Math.max(1, Math.round(h * scale));
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  return { cv, c };
}

// ---------------------------------------------------------------- scratch layers
// Frame-local offscreen canvases (masking, compositing whole scenes for wipes). Acquired per draw and
// released at the end of the frame by the engine, so nested use is safe.
let PIX = 1;
const pool: { cv: HTMLCanvasElement; c: Ctx; busy: boolean }[] = [];
export function setPixelScale(s: number) { PIX = s; }
export function pixelScale() { return PIX; }

/** A cleared full-frame layer in logical 1080×1920 units. */
export function scratch(W = 1080, H = 1920, res = 1) {
  const k = PIX * res;
  let l = pool.find((p) => !p.busy && p.cv.width === Math.round(W * k) && p.cv.height === Math.round(H * k));
  if (!l) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    l = { cv, c: cv.getContext('2d')!, busy: false };
    pool.push(l);
  }
  l.busy = true;
  const c = l.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  c.shadowBlur = 0; c.shadowColor = 'transparent';
  c.clearRect(0, 0, l.cv.width, l.cv.height);
  c.setTransform(k, 0, 0, k, 0, 0);
  const layer = l;
  return { cv: l.cv, c, release: () => { layer.busy = false; } };
}
export function releaseAll() { for (const p of pool) p.busy = false; }

/** Blit a full-frame scratch layer into c (in logical units). */
export function blit(c: Ctx, cv: HTMLCanvasElement, W = 1080, H = 1920) {
  c.drawImage(cv, 0, 0, W, H);
}

/**
 * Draw `fill` only where `mask` paints (any colour): e.g. a texture inside text.
 * Both callbacks draw in logical frame units.
 */
export function masked(c: Ctx, mask: (m: Ctx) => void, fill: (f: Ctx) => void) {
  const L = scratch();
  mask(L.c);
  L.c.globalCompositeOperation = 'source-in';
  fill(L.c);
  L.c.globalCompositeOperation = 'source-over';
  blit(c, L.cv);
  L.release();
}
