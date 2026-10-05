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
