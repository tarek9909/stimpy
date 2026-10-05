/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/builder/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // REQUIRED: the component class names live here
  ],
};
