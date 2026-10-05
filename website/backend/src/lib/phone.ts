/**
 * Lebanese phone normalisation (business-rules section 2).
 * Strip spaces, dashes, dots and brackets; remove a leading +961 / 00961 / 961; remove one leading 0;
 * the remainder must be 7 or 8 digits and not start with 0. Result: "+961" + remainder.
 */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s === '' || !/^\+?\d+$/.test(s)) return null;
  if (s.startsWith('+')) {
    if (!s.startsWith('+961')) return null;
    s = s.slice(4);
  } else if (s.startsWith('00961')) {
    s = s.slice(5);
  } else if (s.startsWith('961')) {
    s = s.slice(3);
  }
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^[1-9]\d{6,7}$/.test(s)) return null;
  return `+961${s}`;
}

/** wa.me wants digits only: "+96171123456" -> "96171123456". */
export const waDigits = (e164: string): string => e164.replace(/\D/g, '');
