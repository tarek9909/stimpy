/**
 * @stimpy/ui Tailwind preset (Tailwind 3.4).
 *
 * The palette REPLACES Tailwind's defaults (theme.colors, not theme.extend.colors) so that
 * off-brand colours cannot be produced by accident. Names follow design-system.md section 14.
 * Static brand colours use hex so opacity modifiers work (`bg-ink/40`); `src/tokens.css` defines
 * the same values as CSS variables and a unit test asserts both files agree.
 * Semantic colours (`fg`, `surface-base`, `border-base` ...) point at CSS variables so that a
 * `.surface-dark` band switches them without changing any class.
 */
const palette = {
  coral: '#FF7A59',
  ink: '#111111',
  white: '#FFFFFF',
  action: '#2E63FF',
  butter: '#FFE45C',
  sky: '#5CC8FF',
  lilac: '#C9B6FF',
  cream: '#FFF4E6',
  'ink-70': '#4D4D4D',
  'ink-55': '#6B6B6B',
  line: '#E7E1D8',
  'line-strong': '#8A8A8A',
  success: '#167A3E',
  danger: '#C62828',
  neutral: '#6B6B6B',
  'disabled-bg': '#EFEAE3',
  'disabled-fg': '#767676',
};

const colors = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
  ...palette,
  // `surface` is the quiet dashboard panel; `surface-base` is the semantic page background.
  surface: { DEFAULT: '#FAF7F2', base: 'var(--bg)' },
  // Semantic foreground (switches on dark bands).
  fg: { DEFAULT: 'var(--fg)', muted: 'var(--fg-muted)', inverse: 'var(--fg-inverse)', danger: 'var(--fg-danger)' },
};

/** Fluid type: clamp() between 360px and 1280px viewports. */
const fontSize = {
  display: ['clamp(2.5rem, 1.6rem + 3.5vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
  h1: ['clamp(2rem, 1.609rem + 1.739vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.015em', fontWeight: '700' }],
  h2: ['clamp(1.5rem, 1.206rem + 1.304vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '700' }],
  h3: ['clamp(1.25rem, 1.152rem + 0.435vw, 1.5rem)', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '700' }],
  h4: ['1.125rem', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '500' }],
  lead: ['clamp(1.125rem, 1.076rem + 0.217vw, 1.25rem)', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
  body: ['1rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
  'body-sm': ['0.875rem', { lineHeight: '1.45', letterSpacing: '0', fontWeight: '400' }],
  caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.02em', fontWeight: '500' }],
  price: ['clamp(1.25rem, 1.059rem + 0.87vw, 2rem)', { lineHeight: '1.1', letterSpacing: '0', fontWeight: '700' }],
  'price-sm': ['1rem', { lineHeight: '1.1', letterSpacing: '0', fontWeight: '700' }],
  'price-md': ['1.25rem', { lineHeight: '1.1', letterSpacing: '0', fontWeight: '700' }],
  'price-lg': ['2rem', { lineHeight: '1.1', letterSpacing: '0', fontWeight: '700' }],
  button: ['1rem', { lineHeight: '1', letterSpacing: '0.01em', fontWeight: '500' }],
  'button-lg': ['1.125rem', { lineHeight: '1', letterSpacing: '0.01em', fontWeight: '500' }],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    colors,
    fontFamily: {
      sans: ['var(--font-sans)'],
    },
    fontSize,
    fontWeight: { normal: '400', medium: '500', bold: '700' },
    borderRadius: {
      none: '0px',
      sm: '6px',
      DEFAULT: '12px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      '2xl': '24px',
      sheet: '20px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      float: '0 8px 24px rgba(17, 17, 17, 0.12)',
      overlay: '0 16px 48px rgba(17, 17, 17, 0.20)',
    },
    dropShadow: {},
    // No gradients in UI chrome (design-system 6.2). The zip line and photo scrims are in tokens.css.
    backgroundImage: { none: 'none' },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem', lg: '2rem' },
      // 1200px of content + 2 x 32px padding at xl
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1264px' },
    },
    borderColor: ({ theme }) => ({
      ...theme('colors'),
      DEFAULT: 'var(--border)',
      base: 'var(--border)',
      control: 'var(--border-control)',
    }),
    divideColor: ({ theme }) => ({ ...theme('borderColor') }),
    ringColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'var(--focus-ring)' }),
    ringOffsetColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'var(--bg)' }),
    ringWidth: { DEFAULT: '3px', 0: '0px', 2: '2px', 3: '3px' },
    ringOffsetWidth: { DEFAULT: '2px', 0: '0px', 2: '2px' },
    outlineColor: ({ theme }) => ({ ...theme('colors'), DEFAULT: 'var(--focus-ring)' }),
    transitionDuration: {
      DEFAULT: '200ms',
      0: '0ms',
      fast: '120ms',
      base: '200ms',
      slow: '320ms',
      zip: '450ms',
      'zip-section': '600ms',
    },
    transitionTimingFunction: {
      DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)',
      linear: 'linear',
      standard: 'cubic-bezier(0.2, 0, 0, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      zip: 'cubic-bezier(0.65, 0, 0.35, 1)',
    },
    extend: {
      spacing: { logo: 'var(--logo-clear)', 13: '3.25rem', 15: '3.75rem' },
      zIndex: { overlay: '60', toast: '70', skip: '80' },
      maxWidth: { content: '1200px', prose: '720px', admin: '1440px', drawer: '420px' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      aspectRatio: { stimpie: '16 / 25', hoodie: '4 / 5' },
      keyframes: {
        'stimpy-pulse': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        'stimpy-spin': { to: { transform: 'rotate(360deg)' } },
        'stimpy-fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'stimpy-slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'stimpy-slide-left': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'stimpy-indeterminate': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
      },
      animation: {
        'stimpy-pulse': 'stimpy-pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'stimpy-spin': 'stimpy-spin 0.8s linear infinite',
        'stimpy-fade-in': 'stimpy-fade-in 200ms cubic-bezier(0.2, 0, 0, 1) both',
        'stimpy-slide-up': 'stimpy-slide-up 320ms cubic-bezier(0.2, 0, 0, 1) both',
        'stimpy-slide-left': 'stimpy-slide-left 320ms cubic-bezier(0.2, 0, 0, 1) both',
        'stimpy-indeterminate': 'stimpy-indeterminate 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite',
      },
    },
  },
  plugins: [
    // Utilities that are not expressible as theme keys.
    function ({ addUtilities }) {
      addUtilities({
        '.tabular': { 'font-variant-numeric': 'tabular-nums' },
        '.safe-pb': { 'padding-bottom': 'env(safe-area-inset-bottom)' },
      });
    },
  ],
};
