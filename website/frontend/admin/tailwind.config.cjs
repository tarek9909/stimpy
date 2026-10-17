/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/builder/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // REQUIRED: the component class names live here
  ],
  theme: {
    extend: {
      colors: {
        ink: '#202731',
        action: '#2563eb',
        'ink-70': '#586474',
        'ink-55': '#6b7788',
        line: '#e6e9ee',
        'line-strong': '#8b97a6',
        cream: '#f4f6f9',
        surface: { DEFAULT: '#f5f7fa', base: 'var(--bg)' },
        success: '#16805d',
        danger: '#c43838',
        'disabled-bg': '#eef0f3',
        'disabled-fg': '#84909f',
      },
      fontSize: {
        display: ['2rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '600' }],
        h1: ['1.75rem', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '600' }],
        h2: ['1.5rem', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],
        h3: ['1.5rem', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],
        h4: ['1.0625rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        h5: ['0.9375rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
        lead: ['1rem', { lineHeight: '1.5', letterSpacing: '0' }],
        body: ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0' }],
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0' }],
        button: ['0.8125rem', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '500' }],
        'button-lg': ['0.875rem', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '500' }],
        price: ['1.75rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '600' }],
      },
      fontWeight: { semibold: '600' },
      borderRadius: { DEFAULT: '6px', sm: '4px', md: '6px', lg: '8px', xl: '8px', '2xl': '8px', sheet: '12px' },
    },
  },
};
