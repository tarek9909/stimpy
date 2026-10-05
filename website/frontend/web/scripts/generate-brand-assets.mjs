// Generates the static brand images from the official identity PNGs (run: npm run assets:generate -w @stimpy/web).
//   public/og-default.png  1200x630 coral background with the main logo (Open Graph / Twitter fallback)
//   app/icon.png           192x192 icon (main version: coral tile)
//   app/apple-icon.png     180x180 icon
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const identity = join(here, '..', '..', '..', '..', 'identity');
const CORAL = { r: 255, g: 122, b: 89 };

// Open Graph image: trim the source's margins, centre the logo on a flat coral canvas.
const trimmed = await sharp(join(identity, 'stimpy_logo_main.png')).trim({ threshold: 12 }).toBuffer();
const logo = await sharp(trimmed).resize({ width: 640 }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: CORAL } })
  .composite([{ input: logo, gravity: 'centre' }])
  .png({ palette: true, quality: 92, effort: 10 })
  .toFile(join(web, 'public', 'og-default.png'));

// Icons: the official main icon (square, coral tile).
for (const [file, size] of [
  ['app/icon.png', 192],
  ['app/apple-icon.png', 180],
]) {
  await sharp(join(identity, 'stimpy_icon_main.png')).resize(size, size).png({ palette: true, quality: 95, effort: 10 }).toFile(join(web, file));
}
console.log('brand assets written');
