/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  theme: {
    extend: {
      colors: {
        action: '#191919',
        cream: '#F3F4F3',
        surface: { DEFAULT: '#F5F5F4' },
        line: '#E2E3E1',
        'disabled-bg': '#EBECEA',
      },
      fontSize: {
        display: ['4rem', { lineHeight: '1.08', letterSpacing: '0', fontWeight: '700' }],
        h1: ['2.5rem', { lineHeight: '1.15', letterSpacing: '0', fontWeight: '500' }],
        h2: ['2rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
        h3: ['1.25rem', { lineHeight: '1.35', letterSpacing: '0', fontWeight: '500' }],
        h4: ['1rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
        lead: ['1.125rem', { lineHeight: '1.6', letterSpacing: '0' }],
        price: ['1.5rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
        'price-lg': ['1.75rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '500' }],
        button: ['0.875rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
        'button-lg': ['1rem', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '4px', lg: '6px', xl: '8px', '2xl': '8px', sheet: '8px' },
      container: { screens: { xl: '1344px' } },
    },
  },
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // required: the component class names live in the package
    '../../packages/builder/src/**/*.{ts,tsx}', // the Builder package's class names
  ],
};
