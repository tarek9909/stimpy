// Prepares new Stimpie artwork for the website: stimpy/stimpy/* -> stimpy/stimpy-web/<name>.webp. Originals are untouched.
// Keeps the whole design and any transparency. Run from `website`: node tools/optimize-stimpies.mjs
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '../../stimpy');
const input = join(root, 'stimpy');
const output = join(root, 'stimpy-web');

// Sharp enough for the largest display of the artwork on a 2x screen, and below the upload limit of 2000 px.
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1600;
const TARGET_BYTES = 450 * 1024;
const QUALITY_START = 85;
const QUALITY_FLOOR = 70;

// Readable names for the files that were exported with generated ones.
const NAMES = {
  'Gemini_Generated_Image_23xgh623xgh623xg.jpg': 'zero-ducks-given',
  'Gemini_Generated_Image_bwdxe4bwdxe4bwdx.jpg': 'public-persona-cassette',
  'Gemini_Generated_Image_exw0exexw0exexw0.jpg': 'go-touch-grass-receipt',
  'Gemini_Generated_Image_gi058bgi058bgi05.jpg': 'emotionally-unavailable-vhs',
  'Gemini_Generated_Image_hozquyhozquyhozq.jpg': 'mildly-unhinged',
  'Gemini_Generated_Image_mpcwp3mpcwp3mpcw.jpg': 'same-day-different-me',
  'Gemini_Generated_Image_uykjubuykjubuykj.jpg': 'chameleon-quartet',
  'NEON SPECTRUM VOL(1).jpg (1).jpeg': 'neon-spectrum',
  '02-Sabotage-Poster-30x40cm-300dpi-1 (1).png': 'sabotage-poster',
  '03-Pink-Haired-Manga-Girl-30x40cm-300dpi-1 (1).png': 'pink-haired-manga-girl',
  '06-Maneki-Neko-Tiger-Peonies-30x40cm-300dpi-1 (1).png': 'maneki-neko-tiger-peonies',
};
const slug = (file) => basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mkdirSync(output, { recursive: true });
let before = 0;
let after = 0;
for (const file of readdirSync(input).sort()) {
  const source = join(input, file);
  const resized = await sharp(source, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  let quality = QUALITY_START;
  let encoded = await sharp(resized).webp({ quality, effort: 6 }).toBuffer({ resolveWithObject: true });
  while (encoded.info.size > TARGET_BYTES && quality > QUALITY_FLOOR) {
    quality -= 5;
    encoded = await sharp(resized).webp({ quality, effort: 6 }).toBuffer({ resolveWithObject: true });
  }
  const name = `${NAMES[file] ?? slug(file)}.webp`;
  writeFileSync(join(output, name), encoded.data);
  // What the dashboard upload will store: it re-encodes every WebP at quality 85.
  const uploaded = await sharp(encoded.data).webp({ quality: 85 }).toBuffer();
  const size = statSync(source).size;
  before += size;
  after += encoded.info.size;
  console.log(`${name.padEnd(34)} ${encoded.info.width}x${encoded.info.height} q${quality} ${(size / 1024 / 1024).toFixed(1)} MB -> ${Math.round(encoded.info.size / 1024)} KB (after upload ${Math.round(uploaded.length / 1024)} KB) alpha:${encoded.info.channels === 4}`);
}
console.log(`Total ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`);
