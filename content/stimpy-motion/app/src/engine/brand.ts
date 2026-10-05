// The Stimpy brand kit (identity/stimpy_brand_identity.md). Primary colours lead; secondaries are
// highlights and drop colours; electric blue is kept for action.
export const C = {
  coral: '#FF7A59',
  black: '#111111',
  white: '#FFFFFF',
  blue: '#2E63FF',
  butter: '#FFE45C',
  sky: '#5CC8FF',
  lilac: '#C9B6FF',
  cream: '#FFF4E6',
} as const;
export type ColorName = keyof typeof C;

export const PRIMARY = [C.coral, C.black, C.white] as const;
export const SECONDARY = [C.blue, C.butter, C.sky, C.lilac, C.cream] as const;
export const ALL = [C.coral, C.black, C.white, C.blue, C.butter, C.sky, C.lilac, C.cream] as const;

/** Text colour that the brand's contrast table prescribes for a background. */
export function ink(bg: string) {
  return bg === C.black || bg === C.blue ? C.white : C.black;
}

export const TAGLINE = 'One hoodie. Multiple identities.';

/** Mix two hex colours (0 → a, 1 → b). */
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
/** Mix two hex colours and return hex (so the result can feed rgba() / glow() again). */
export function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1).toUpperCase();
}
/** Hex colour with alpha. */
export function rgba(hex: string, a: number) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`;
}
/** Darken (k < 0) / lighten (k > 0) toward black / white. */
export function shade(hex: string, k: number) {
  return k < 0 ? mix(hex, '#000000', -k) : mix(hex, '#FFFFFF', k);
}
