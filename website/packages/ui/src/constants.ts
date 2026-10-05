/**
 * Plain constants. Kept out of the 'use client' component modules so server components can read
 * them (a value exported from a client module is only a reference on the server).
 */

/** Stimpie artwork aspect (16:25, 800x1250). Never crop it. */
export const STIMPIE_RATIO = 0.64;
/** Hoodie product images and the Builder stage. */
export const HOODIE_RATIO = '4 / 5';

/** ZipWipe: 450 ms for the Builder swap, 600 ms for storefront section transitions. */
export const ZIP_DURATION = { builder: 450, section: 600 } as const;
export const ZIP_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const ZIP_FADE_MS = 120;

/** The API allows 1..10 per cart line. */
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 10;

/** Toasts: at most three stacked, 4 s auto-dismiss. */
export const MAX_TOASTS = 3;
export const TOAST_DURATION_MS = 4000;

/** Logo minimum rendered widths (design-system 11): full 96px, icon 20px. */
export const LOGO_MIN_WIDTH = { full: 96, icon: 20 } as const;

/** Files in `assets/logo/`, for apps that serve them from `public/`. `ratio` is width / height. */
export const LOGO_FILES = {
  full: {
    white: { file: 'logo-on-white.webp', ratio: 480 / 167 },
    black: { file: 'logo-on-black.webp', ratio: 480 / 167 },
    coral: { file: 'logo-main.webp', ratio: 480 / 167 },
  },
  icon: {
    white: { file: 'icon-on-white.png', ratio: 180 / 256 },
    black: { file: 'icon-on-black.png', ratio: 180 / 256 },
    coral: { file: 'icon-main.png', ratio: 180 / 256 },
  },
} as const;
