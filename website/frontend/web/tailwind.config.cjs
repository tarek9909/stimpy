/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // required: the component class names live in the package
    '../../packages/builder/src/**/*.{ts,tsx}', // the Builder package's class names
  ],
};
