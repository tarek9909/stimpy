// Rebuild the static campaign sources without modifying the original PNGs.
// From website/: node frontend/web/scripts/optimize-campaign-images.mjs
// Static responsive files avoid a first-request image-encoding penalty.
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../public/images');
const groups = [
  {
    name: 'desktop', source: 'stimpy-campaign-v1.png',
    sourceWidth: 1942, sourceHeight: 809, widths: [960, 1440, 1942],
    avifQuality: 65, webpQuality: 82,
  },
  {
    name: 'mobile', source: 'stimpy-campaign-mobile-v1.png',
    sourceWidth: 1024, sourceHeight: 1536, widths: [480, 768, 1024],
    avifQuality: 65, webpQuality: 82,
  },
  {
    name: 'builder', source: 'stimpy-campaign-v1.png',
    sourceWidth: 1942, sourceHeight: 809, widths: [400, 640, 809],
    // Matches the campaign preview's SVG viewBox and artwork calibration.
    crop: { left: 1000, top: 0, width: 809, height: 809 },
    avifQuality: 70, webpQuality: 82,
  },
];

await mkdir(directory, { recursive: true });
const originals = new Map();
const rows = [];

for (const group of groups) {
  let source = originals.get(group.source);
  if (!source) {
    source = await readFile(resolve(directory, group.source));
    originals.set(group.source, source);
  }
  const metadata = await sharp(source).metadata();
  if (metadata.width !== group.sourceWidth || metadata.height !== group.sourceHeight) {
    throw new Error(`${group.source}: source dimensions changed; review the campaign crop before rebuilding.`);
  }
  for (const width of group.widths) {
    let image = sharp(source);
    if (group.crop) image = image.extract(group.crop);
    image = image.resize({ width, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 }).toColourspace('srgb');
    const formats = [
      { extension: 'avif', quality: group.avifQuality },
      { extension: 'webp', quality: group.webpQuality },
    ];
    const results = await Promise.all(formats.map(async ({ extension, quality }) => {
      const filename = `stimpy-campaign-${group.name}-v2-${width}.${extension}`;
      const encoded = image.clone();
      if (extension === 'avif') {
        encoded.avif({ quality, effort: 5, chromaSubsampling: '4:4:4' });
      } else {
        encoded.webp({ quality, effort: 6, smartSubsample: true });
      }
      const info = await encoded.toFile(resolve(directory, filename));
      return {
        file: `/images/${filename}`, group: group.name, format: extension,
        width: info.width, height: info.height, quality, bytes: info.size,
        sourceBytes: source.length,
        reductionPercent: Math.round((1 - info.size / source.length) * 10000) / 100,
      };
    }));
    rows.push(...results);
  }
}

// Guard against accidentally altering the archival inputs while adjusting
// filenames or output locations in future revisions of this script.
for (const [filename, original] of originals) {
  const current = await readFile(resolve(directory, filename));
  if (!current.equals(original)) throw new Error(`Original PNG changed unexpectedly: ${filename}`);
}

console.log(JSON.stringify({
  generator: 'Sharp', sharpVersion: sharp.versions.sharp,
  builderCrop: groups.find((group) => group.name === 'builder').crop,
  originalsPreserved: true,
  assets: rows,
}, null, 2));
