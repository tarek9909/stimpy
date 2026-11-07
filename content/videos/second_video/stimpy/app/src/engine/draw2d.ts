// Canvas-2D kit for typography and flat graphics (backgrounds, overlays, Stimpie artwork).
export type Ctx = CanvasRenderingContext2D;

const FONTS: [string, string, string, string][] = [
  // family, file, weight, style
  ['ArchivoX', 'Archivo-w1250-900.ttf', '900', 'normal'],
  ['ArchivoX', 'Archivo-w1250-700.ttf', '700', 'normal'],
  ['Archivo', 'Archivo-w1000-900.ttf', '900', 'normal'],
  ['Archivo', 'Archivo-w1000-700.ttf', '700', 'normal'],
  ['Archivo', 'Archivo-w1000-500.ttf', '500', 'normal'],
  ['ArchivoC', 'Archivo-w620-900.ttf', '900', 'normal'],
  ['Archivo', 'ArchivoItalic-w1000-800.ttf', '800', 'italic'],
  ['Corm', 'CormorantItalic-400.ttf', '400', 'italic'],
  ['Corm', 'CormorantItalic-600.ttf', '600', 'italic'],
  ['Corm', 'Cormorant-600.ttf', '600', 'normal'],
  ['Plex', 'IBMPlexMono-Regular.ttf', '400', 'normal'],
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
  family?: 'ArchivoX' | 'Archivo' | 'ArchivoC' | 'Corm' | 'Plex';
  weight?: number;
  italic?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  track?: number; // letter spacing in em
  alpha?: number;
}

export function font(o: TextOpts) {
  return `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${o.size}px ${o.family ?? 'Archivo'}`;
}

export function text(c: Ctx, s: string, x: number, y: number, o: TextOpts) {
  c.save();
  c.font = font(o);
  c.fillStyle = o.color ?? '#fff';
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.baseline ?? 'alphabetic';
  c.letterSpacing = `${(o.track ?? 0) * o.size}px`;
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  // letterSpacing adds trailing space after the last glyph: compensate for centred / right-aligned text
  const tr = (o.track ?? 0) * o.size;
  const dx = o.align === 'center' ? tr / 2 : o.align === 'right' || o.align === 'end' ? tr : 0;
  c.fillText(s, x + dx, y);
  c.restore();
}

export function measure(c: Ctx, s: string, o: TextOpts) {
  c.save();
  c.font = font(o);
  c.letterSpacing = `${(o.track ?? 0) * o.size}px`;
  const w = c.measureText(s).width - (o.track ?? 0) * o.size;
  c.restore();
  return w;
}

/** Text that reveals character by character (0..1), with the newest glyph flickering in like a terminal. */
export function typeOn(c: Ctx, s: string, x: number, y: number, o: TextOpts, p: number) {
  const n = Math.floor(s.length * Math.min(1, Math.max(0, p)));
  if (n <= 0) return;
  text(c, s.slice(0, n), x, y, o);
}

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Canvas + context at a given pixel size, drawn in logical units (scale = pixels per unit). */
export function makeCanvas(w: number, h: number, scale = 1) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const c = cv.getContext('2d', { willReadFrequently: false })!;
  c.scale(scale, scale);
  return { cv, c };
}

/** Wobbly hand-drawn polyline (marker look): jitter is seeded so it is stable across frames. */
export function scribble(c: Ctx, pts: [number, number][], rnd: () => number, jitter = 1.5, passes = 2) {
  for (let p = 0; p < passes; p++) {
    c.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (rnd() - 0.5) * jitter * 2, jy = (rnd() - 0.5) * jitter * 2;
      if (i === 0) c.moveTo(x + jx, y + jy); else c.lineTo(x + jx, y + jy);
    });
    c.stroke();
  }
}
