import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { AppContext } from '../src/context';
import { storeUpload } from '../src/services/uploads';

/**
 * Asset generation for the seed: real Stimpie artwork (resized with sharp) and clean placeholder hoodie images drawn
 * from SVG shapes. Every file is stored at a content-addressed path under `seed/`, so re-running the seed neither
 * duplicates files nor changes URLs.
 */
export type SeedAsset = { url: string; path: string; width: number | null; height: number | null; sizeBytes: number };

const short = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 8);

/** Stores (once) an asset produced by `produce`; reuses the existing upload when the file is already there. */
async function ensureAsset(
  ctx: AppContext,
  o: { path: string; mime: string; ext: string; originalName: string; produce: () => Promise<{ buffer: Buffer; width: number | null; height: number | null }> },
): Promise<SeedAsset> {
  const existing = await ctx.prisma.upload.findUnique({ where: { path: o.path } });
  if (existing && existsSync(join(ctx.config.uploadDir, o.path))) {
    return { url: ctx.storage.url(o.path), path: o.path, width: existing.width, height: existing.height, sizeBytes: existing.sizeBytes };
  }
  const made = await o.produce();
  const row = await storeUpload(ctx, { buffer: made.buffer, ext: o.ext, mime: o.mime, originalName: o.originalName, width: made.width, height: made.height, path: o.path });
  return { url: row.url, path: row.path, width: row.width, height: row.height, sizeBytes: row.sizeBytes };
}

// ---------------------------------------------------------------- Stimpie artwork

/** 3200x5000 PNG -> 800x1250 WebP (artwork) and 1024x1600 WebP (3D texture). */
export async function seedStimpieArtwork(
  ctx: AppContext,
  o: { slug: string; sourceFile: string },
): Promise<{ artwork: SeedAsset; texture: SeedAsset }> {
  const st = statSync(o.sourceFile);
  const key = short(`${o.slug}|${st.size}|${Math.floor(st.mtimeMs)}|v1`);
  const make = (w: number, h: number) => async () => {
    const out = await sharp(o.sourceFile).resize(w, h, { fit: 'cover' }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  };
  const artwork = await ensureAsset(ctx, {
    path: `seed/stimpies/${o.slug}-800-${key}.webp`, mime: 'image/webp', ext: 'webp', originalName: `${o.slug}.png`, produce: make(800, 1250),
  });
  const texture = await ensureAsset(ctx, {
    path: `seed/stimpies/${o.slug}-1024-${key}.webp`, mime: 'image/webp', ext: 'webp', originalName: `${o.slug}-texture.png`, produce: make(1024, 1600),
  });
  return { artwork, texture };
}

/** A wide photo -> 1600px-wide WebP (hero / teaser). */
export async function seedWidePhoto(ctx: AppContext, o: { name: string; sourceFile: string }): Promise<SeedAsset> {
  const st = statSync(o.sourceFile);
  const key = short(`${o.name}|${st.size}|${Math.floor(st.mtimeMs)}|v1`);
  return ensureAsset(ctx, {
    path: `seed/photos/${o.name}-${key}.webp`, mime: 'image/webp', ext: 'webp', originalName: o.sourceFile.split(/[\\/]/).pop() ?? `${o.name}.jpg`,
    produce: async () => {
      const out = await sharp(o.sourceFile).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      return { buffer: out.data, width: out.info.width, height: out.info.height };
    },
  });
}

// ---------------------------------------------------------------- placeholder hoodie drawings

const W = 1200;
const H = 1500;

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
const darker = (hex: string, a: number): string => mix(hex, 0, a);
const lighter = (hex: string, a: number): string => mix(hex, 255, a);

/** Silhouette parts shared by the views (all coordinates in the 1200x1500 canvas). */
const BODY = 'M330 470 L870 470 L900 1330 Q600 1362 300 1330 Z';
const SLEEVE_L = 'M335 480 Q250 520 215 620 L110 1000 Q100 1040 135 1052 L250 1085 Q285 1092 297 1058 L395 760 Z';
const SLEEVE_R = 'M865 480 Q950 520 985 620 L1090 1000 Q1100 1040 1065 1052 L950 1085 Q915 1092 903 1058 L805 760 Z';
const HEM = 'M300 1290 L900 1290 L903 1345 Q600 1378 297 1345 Z';
const CUFF_L = 'M112 1000 L254 1052 L275 1100 Q260 1100 250 1090 L135 1055 Q105 1045 112 1000 Z';
const CUFF_R = 'M1088 1000 L946 1052 L925 1100 Q940 1100 950 1090 L1065 1055 Q1095 1045 1088 1000 Z';

export function renderSeedHoodieSvg(view: 'front' | 'back', hex: string, o: { background: string | null; overlay?: boolean }): string {
  const body = hex;
  const shade = darker(hex, 0.14);
  const deep = darker(hex, 0.3);
  const light = lighter(hex, 0.12);
  const stroke = darker(hex, 0.38);
  const bg = o.background ? `<rect width="${W}" height="${H}" fill="${o.background}"/>` : '';
  const shadow = o.background ? `<ellipse cx="600" cy="1430" rx="400" ry="26" fill="#000" opacity="0.10"/>` : '';

  if (o.overlay) {
    // Transparent shading only: soft folds and a vertical falloff, clipped to the garment.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="g"><path d="${BODY}"/><path d="${SLEEVE_L}"/><path d="${SLEEVE_R}"/></clipPath>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.20"/></linearGradient>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.25" stop-color="#000" stop-opacity="0"/><stop offset="0.75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/></linearGradient>
    <filter id="b"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <g clip-path="url(#g)">
    <rect width="${W}" height="${H}" fill="url(#v)"/><rect width="${W}" height="${H}" fill="url(#h)"/>
    <g filter="url(#b)" fill="none" stroke="#000" stroke-opacity="0.10" stroke-width="14" stroke-linecap="round">
      <path d="M345 640 Q460 700 430 900"/><path d="M855 640 Q740 700 770 900"/><path d="M420 1150 Q600 1190 780 1150"/>
    </g>
  </g>
</svg>`;
  }

  const hood =
    view === 'back'
      ? `<path d="M420 480 Q380 330 500 270 Q600 235 700 270 Q820 330 780 480 Q600 540 420 480 Z" fill="${shade}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>
         <path d="M600 285 L600 505" stroke="${deep}" stroke-width="5" opacity="0.5"/>`
      : `<path d="M410 490 Q360 330 490 262 Q600 225 710 262 Q840 330 790 490 Q600 560 410 490 Z" fill="${shade}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>
         <ellipse cx="600" cy="400" rx="118" ry="132" fill="${deep}" opacity="0.85"/>`;

  const front =
    view === 'front'
      ? `<path d="M600 500 L600 1290" stroke="${stroke}" stroke-width="7"/>
         <rect x="590" y="500" width="20" height="46" rx="6" fill="${light}" stroke="${stroke}" stroke-width="3"/>
         <path d="M520 520 L520 690" stroke="${light}" stroke-width="9" stroke-linecap="round"/><path d="M680 520 L680 690" stroke="${light}" stroke-width="9" stroke-linecap="round"/>
         <path d="M395 960 L460 1120 L740 1120 L805 960 Z" fill="${shade}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg}${shadow}
  <path d="${SLEEVE_L}" fill="${body}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>
  <path d="${SLEEVE_R}" fill="${body}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>
  <path d="${BODY}" fill="${body}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>
  ${hood}
  <path d="${HEM}" fill="${shade}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${CUFF_L}" fill="${shade}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${CUFF_R}" fill="${shade}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>
  ${front}
</svg>`;
}

async function svgToWebp(svg: string): Promise<{ buffer: Buffer; width: number; height: number }> {
  const out = await sharp(Buffer.from(svg)).webp({ quality: 82, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

/** Product photo placeholder (front or back view on a neutral studio background). */
export function seedHoodiePhoto(ctx: AppContext, o: { colorSlug: string; hex: string; view: 'front' | 'back' }): Promise<SeedAsset> {
  const svg = renderSeedHoodieSvg(o.view, o.hex, { background: '#F1EFEA' });
  return ensureAsset(ctx, {
    path: `seed/hoodies/photo-${o.view}-${o.colorSlug}-${short(svg)}.webp`, mime: 'image/webp', ext: 'webp',
    originalName: `placeholder-${o.view}-${o.colorSlug}.svg`, produce: () => svgToWebp(svg),
  });
}

/** Builder 2D base: flat back view, transparent background. */
export function seedBuilderBack(ctx: AppContext, o: { colorSlug: string; hex: string }): Promise<SeedAsset> {
  const svg = renderSeedHoodieSvg('back', o.hex, { background: null });
  return ensureAsset(ctx, {
    path: `seed/builder/back-${o.colorSlug}-${short(svg)}.webp`, mime: 'image/webp', ext: 'webp',
    originalName: `builder-back-${o.colorSlug}.svg`, produce: () => svgToWebp(svg),
  });
}

/** Builder 2D shading overlay (shared by every colour). */
export function seedBuilderOverlay(ctx: AppContext): Promise<SeedAsset> {
  const svg = renderSeedHoodieSvg('back', '#808080', { background: null, overlay: true });
  return ensureAsset(ctx, {
    path: `seed/builder/overlay-${short(svg)}.webp`, mime: 'image/webp', ext: 'webp', originalName: 'builder-overlay.svg', produce: () => svgToWebp(svg),
  });
}

/** Default Stimpie panel placement on the generated back view (also used when the owner has not set one). */
export const SEED_PLACEMENT_2D = { x: 0.5, y: 0.6, width: 0.3, rotation: 0 } as const;

/** A binary file (e.g. the GLB) stored content-addressed. */
export async function seedBinary(
  ctx: AppContext,
  o: { name: string; ext: string; mime: string; buffer: Buffer },
): Promise<SeedAsset> {
  return ensureAsset(ctx, {
    path: `seed/models/${o.name}-${createHash('sha1').update(o.buffer).digest('hex').slice(0, 8)}.${o.ext}`, mime: o.mime, ext: o.ext,
    originalName: `${o.name}.${o.ext}`, produce: async () => ({ buffer: o.buffer, width: null, height: null }),
  });
}
