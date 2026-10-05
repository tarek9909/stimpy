'use client';

import { cn } from '../cn';
import { LOGO_FILES, LOGO_MIN_WIDTH } from '../constants';
import { useUI } from '../context';

export type LogoVariant = 'full' | 'icon';
export type LogoSurface = 'white' | 'black' | 'coral';

/* Literal `new URL(..., import.meta.url)` so Vite and webpack/Turbopack both bundle the files. */
const bundled: Record<LogoVariant, Record<LogoSurface, string>> = {
  full: {
    white: new URL('../../assets/logo/logo-on-white.webp', import.meta.url).href,
    black: new URL('../../assets/logo/logo-on-black.webp', import.meta.url).href,
    coral: new URL('../../assets/logo/logo-main.webp', import.meta.url).href,
  },
  icon: {
    white: new URL('../../assets/logo/icon-on-white.png', import.meta.url).href,
    black: new URL('../../assets/logo/icon-on-black.png', import.meta.url).href,
    coral: new URL('../../assets/logo/icon-main.png', import.meta.url).href,
  },
};

const SURFACE_BG: Record<LogoSurface, string> = {
  white: 'bg-white',
  black: 'bg-ink',
  coral: 'bg-coral',
};

export interface LogoProps {
  variant?: LogoVariant;
  /** The official version for the surface behind it: `white`, `black`, or `coral` (the Main version). */
  surface?: LogoSurface;
  /** Rendered width of the mark in px (clamped to the minimum size). Default 140 (full) / 32 (icon). */
  width?: number;
  /**
   * Wrap in the clear space: padding of half the width of the S (icon: half its width, full: 12%
   * of its width) on the surface colour. Default true. Turn off only when the parent already provides it.
   */
  clearSpace?: boolean;
  /** Accessible name. Default "Stimpy". Use "" when a sibling already names it. */
  alt?: string;
  className?: string;
}

/**
 * The official Stimpy logo. Pick the version for the surface behind it; never recolour, stretch,
 * rotate or add effects, and never place it on Butter/Sky/Lilac or on a photo (use a neutral
 * panel). It is not a link-styled element: wrap it in a link yourself
 * (`aria-label="Stimpy home"`) with no underline or hover colour.
 */
export function Logo({ variant = 'full', surface = 'white', width, clearSpace = true, alt = 'Stimpy', className }: LogoProps) {
  const { logoBaseUrl } = useUI();
  const meta = LOGO_FILES[variant][surface];
  const w = Math.max(LOGO_MIN_WIDTH[variant], width ?? (variant === 'full' ? 140 : 32));
  const h = Math.round(w / meta.ratio);
  const src = logoBaseUrl ? `${logoBaseUrl.replace(/\/$/, '')}/${meta.file}` : bundled[variant][surface];
  const clear = Math.round(variant === 'full' ? w * 0.12 : w * 0.5);
  // The transparent icons need no backing; the others carry their own surface colour.
  const needsBacking = variant === 'full' || surface === 'coral';
  const transparentIcon = variant === 'icon' && surface !== 'coral';
  return (
    <span
      className={cn(
        'inline-block align-middle leading-none',
        clearSpace && 'p-logo',
        clearSpace && !transparentIcon && SURFACE_BG[surface],
        !clearSpace && needsBacking && SURFACE_BG[surface],
        className,
      )}
      style={{ ['--logo-clear' as string]: `${clear}px` }}
    >
      <img
        src={src}
        alt={alt}
        width={w}
        height={h}
        decoding="async"
        draggable={false}
        className="block max-w-none"
        style={{ width: w, height: h }}
      />
    </span>
  );
}
