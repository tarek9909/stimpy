import localFont from 'next/font/local';

/**
 * Poppins 400 / 500 / 700, latin subset, self-hosted from @stimpy/ui. next/font hashes the files (immutable cache),
 * preloads them and generates size-adjusted fallback metrics so swapping the font does not shift layout.
 */
export const poppins = localFont({
  src: [
    { path: '../../../packages/ui/fonts/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: '../../../packages/ui/fonts/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: '../../../packages/ui/fonts/poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-poppins',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  adjustFontFallback: 'Arial',
});
