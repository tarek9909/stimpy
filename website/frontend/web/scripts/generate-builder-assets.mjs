// Run from website/: node --import tsx frontend/web/scripts/generate-builder-assets.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderSeedHoodieSvg } from '../../../backend/prisma/seed-assets.ts';

const outputs = [
  { directory: 'builder', background: null },
  { directory: 'hoodies', background: '#F1EFEA' },
];

for (const { directory, background } of outputs) {
  const output = new URL(`../public/images/${directory}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  for (const [color, hex] of [['cream', '#FFF4E6'], ['black', '#111111'], ['stone', '#B8B2A7'], ['coral', '#FF7A59']]) {
    const svg = renderSeedHoodieSvg('back', hex, { background });
    await sharp(Buffer.from(svg)).webp({ quality: 82, alphaQuality: 90 }).toFile(fileURLToPath(new URL(`back-${color}-v2.webp`, output)));
    console.log(`Generated clean ${color} ${directory} image`);
  }
}
