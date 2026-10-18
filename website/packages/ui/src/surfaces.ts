import type { CSSProperties } from 'react';
import type { AccentColor } from './types';

/**
 * Filled bands and their brand text pairs (design-system 3.1). `surface-*` helper classes (tokens.css)
 * also switch the semantic variables, so components inside (muted text, borders, button inversions)
 * keep their contrast on the fill.
 */
export type SurfaceTone = 'white' | 'cream' | 'black' | 'coral' | 'butter' | 'sky' | 'lilac';

export const SURFACE_CLASSES: Record<SurfaceTone, string> = {
  white: 'bg-white text-ink',
  cream: 'bg-cream text-ink surface-colored surface-cream',
  black: 'bg-ink text-white surface-dark',
  coral: 'bg-coral text-ink surface-colored surface-coral',
  butter: 'bg-butter text-ink surface-colored surface-butter',
  sky: 'bg-sky text-ink surface-colored surface-sky',
  lilac: 'bg-lilac text-ink surface-colored surface-lilac',
};

export function accentSurface(accent: AccentColor | null | undefined): SurfaceTone {
  switch (accent) {
    case 'SKY':
      return 'sky';
    case 'LILAC':
      return 'lilac';
    default:
      return 'butter';
  }
}

/** Inline surface values for a user-picked drop colour, with readable foreground and controls. */
export function accentColorStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return undefined;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const weights = [0.2126, 0.7152, 0.0722] as const;
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * weights[index]!, 0);
  const darkText = luminance >= 0.179;
  const foreground = darkText ? 'var(--color-black)' : 'white';
  return {
    backgroundColor: hex,
    color: foreground,
    '--bg': hex,
    '--fg': foreground,
    '--fg-muted': foreground,
    '--border': darkText ? 'color-mix(in srgb, black 35%, transparent)' : 'color-mix(in srgb, white 35%, transparent)',
    '--border-control': foreground,
    '--fg-inverse': darkText ? 'white' : 'var(--color-black)',
    '--fg-danger': foreground,
    '--focus-ring': foreground,
    '--zip-line': foreground,
  } as CSSProperties;
}
