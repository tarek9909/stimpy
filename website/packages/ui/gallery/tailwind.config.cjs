/** Gallery Tailwind config: the UI preset plus the gallery and library sources. */
module.exports = {
  presets: [require('../tailwind-preset.cjs')],
  content: [__dirname + '/index.html', __dirname + '/*.tsx', __dirname + '/../src/**/*.{ts,tsx}'],
};
