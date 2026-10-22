import type { Upload } from '@prisma/client';
import sharp from 'sharp';
import type { AppContext } from '../context';
import { AppError, ERROR_STATUS } from '../lib/errors';

/**
 * Low-level "store bytes + record the upload" used by the seed and by the upload route, plus the content sniffing,
 * size limits, SVG refusal and image processing of `POST /admin/uploads` (integrations 6).
 */
export async function storeUpload(
  ctx: AppContext,
  input: {
    buffer: Buffer;
    ext: string;
    mime: string;
    originalName: string;
    width?: number | null;
    height?: number | null;
    userId?: number | null;
    /** Fixed path (seed only, content-addressed so re-running is idempotent). Omit for a random path. */
    path?: string;
  },
): Promise<Upload> {
  const stored = input.path
    ? await ctx.storage.putAt(input.path, input.buffer, input.mime)
    : await ctx.storage.put(input.buffer, input.ext, input.mime);
  const data = {
    path: stored.path,
    url: stored.url,
    mime: input.mime,
    sizeBytes: input.buffer.length,
    width: input.width ?? null,
    height: input.height ?? null,
    originalName: input.originalName.slice(0, 200),
    createdBy: input.userId ?? null,
  };
  return ctx.prisma.upload.upsert({ where: { path: stored.path }, create: data, update: data });
}

// ================================================================ validation + processing (POST /admin/uploads)

export const MB = 1024 * 1024;
export const UPLOAD_LIMITS = { image: 10 * MB, video: 100 * MB, model: 50 * MB } as const;
/** Hard ceiling for any upload body; per-type limits are applied once the type is known. */
export const MAX_UPLOAD_BYTES = UPLOAD_LIMITS.video;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'model/gltf-binary'] as const;
export const MAX_IMAGE_SIDE = 2000;
export const WEBP_QUALITY = 85;
/** Bytes needed before the type is judged while streaming (SVG needs more than the binary signatures). */
export const SNIFF_BYTES = 4096;

export type FileKind = 'image' | 'video' | 'model';
export type SniffResult = { kind: FileKind; mime: (typeof ALLOWED_MIME)[number]; ext: string };

const MP4_REJECT_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);

/** Judges the real type from the file signature (never from the name or the declared content type). */
export function sniffFileType(b: Buffer): SniffResult | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
  if (b.length >= 4 && b.readUInt32BE(0) === 0x676c5446) return { kind: 'model', mime: 'model/gltf-binary', ext: 'glb' }; // "glTF"
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    return MP4_REJECT_BRANDS.has(b.toString('latin1', 8, 12).toLowerCase()) ? null : { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
  }
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3 && b.toString('latin1', 0, Math.min(b.length, 64)).includes('webm')) {
    return { kind: 'video', mime: 'video/webm', ext: 'webm' };
  }
  if (looksLikeSvg(b)) return { kind: 'image', mime: 'image/svg+xml', ext: 'svg' };
  return null;
}

function svgText(b: Buffer): string {
  return b.toString('utf8').replace(/^﻿/, '');
}

function looksLikeSvg(b: Buffer): boolean {
  if (b.length === 0) return false;
  const head = svgText(b.subarray(0, Math.min(b.length, 2048)));
  // optional XML declaration, comments and doctype, then the <svg root
  const stripped = head.replace(/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*/i, '');
  return /^<svg[\s>]/i.test(stripped);
}

/** SVGs are refused (not repaired) when they can run script or load anything from outside. Returns the reason or null. */
export function svgProblem(b: Buffer): string | null {
  const s = svgText(b);
  // The checks below read the bytes as UTF-8. A file that declares another encoding (e.g. ISO-2022-JP, whose escape
  // sequences can hide "<script" from a byte scan but not from the browser) is refused instead of decoded.
  const declared = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']\s*([^"']*)["']/i.exec(s)?.[1]?.trim().toLowerCase();
  if (declared && declared !== 'utf-8' && declared !== 'utf8' && declared !== 'us-ascii') return 'uses an unsupported text encoding';
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) return 'contains control characters';
  if (/<\?xml-stylesheet/i.test(s) || /<\s*xsl:/i.test(s)) return 'contains a stylesheet transform';
  if (/<\s*script/i.test(s)) return 'contains a script';
  if (/<\s*foreignObject/i.test(s)) return 'contains foreignObject';
  if (/[\s/]on[a-z]+\s*=/i.test(s)) return 'contains an event handler'; // "/" too: `<g/onload=...>` when inlined as HTML
  if (/javascript\s*:/i.test(s) || /vbscript\s*:/i.test(s)) return 'contains a script URL';
  if (/<!ENTITY/i.test(s) || /<!DOCTYPE[^>]*\[/i.test(s)) return 'declares entities';
  if (/<\s*(iframe|embed|object|audio|video|animate|set)\b/i.test(s)) return 'contains active content';
  if (/data\s*:\s*text\/html/i.test(s)) return 'contains embedded HTML';
  // external references: href / xlink:href pointing anywhere but an in-document id (#id) or an embedded raster image
  for (const m of s.matchAll(/(?:xlink:)?href\s*=\s*["']\s*([^"']*)["']/gi)) {
    const v = (m[1] ?? '').trim();
    if (v !== '' && !v.startsWith('#') && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)) return 'references an external file';
  }
  if (/url\(\s*["']?\s*(?!#)(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(s)) return 'references an external file';
  if (/@import/i.test(s)) return 'imports a stylesheet';
  return null;
}

/** Declared pixel size of an SVG (width/height attributes, else viewBox), or null. Cosmetic only. */
export function svgSize(b: Buffer): { width: number; height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svgText(b))?.[0];
  if (!tag) return null;
  const num = (attr: string): number | null => {
    const m = new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([0-9.]+)\\s*(px)?\\s*["']`, 'i').exec(tag);
    return m ? Math.round(Number(m[1])) : null;
  };
  const w = num('width');
  const h = num('height');
  if (w && h) return { width: w, height: h };
  const vb = /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
  return vb ? { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) } : null;
}

/** GLB header check: "glTF", version 2, declared length equals the file length, first chunk is JSON. */
export function glbProblem(b: Buffer): string | null {
  if (b.length < 20) return 'is too short to be a GLB';
  if (b.readUInt32LE(4) !== 2) return 'is not glTF version 2';
  if (b.readUInt32LE(8) !== b.length) return 'has a wrong length in its header';
  if (b.readUInt32LE(16) !== 0x4e4f534a) return 'does not start with a JSON chunk';
  return null;
}

const unsupported = (message: string, allowed: string[] = [...ALLOWED_MIME]): AppError =>
  new AppError('UNSUPPORTED_FILE_TYPE', ERROR_STATUS.UNSUPPORTED_FILE_TYPE, message, { allowed });
export const fileTooLarge = (maxBytes: number): AppError =>
  new AppError('FILE_TOO_LARGE', ERROR_STATUS.FILE_TOO_LARGE, `That file is too large (max ${Math.round(maxBytes / MB)} MB).`, { maxBytes });
export const unsupportedFileType = unsupported;

export const maxBytesFor = (kind: FileKind): number => UPLOAD_LIMITS[kind];

/**
 * Raster images: auto-rotate by EXIF, strip all metadata, resize so the long side is at most 2000 px (never enlarged),
 * WebP quality 85. A PNG that really uses transparency stays PNG (integrations 6).
 */
export async function processImage(input: Buffer, sniffed: SniffResult): Promise<{ buffer: Buffer; mime: string; ext: string; width: number; height: number }> {
  try {
    const pipeline = (): sharp.Sharp =>
      sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
        .rotate()
        .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
    const keepPng = sniffed.mime === 'image/png' && !(await sharp(input, { limitInputPixels: 100_000_000 }).stats()).isOpaque;
    const { data, info } = keepPng
      ? await pipeline().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline().webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: keepPng ? 'image/png' : 'image/webp', ext: keepPng ? 'png' : 'webp', width: info.width, height: info.height };
  } catch {
    throw unsupported("We couldn't read that image. Try another file.");
  }
}

export type ProcessUploadInput = { buffer: Buffer; originalName: string; purpose?: string | null; userId: number };

/**
 * Validates (by content), processes and stores one uploaded file. Throws FILE_TOO_LARGE (413) / UNSUPPORTED_FILE_TYPE (415).
 * `purpose: "builder-model"` requires a GLB.
 */
export async function processUpload(ctx: AppContext, input: ProcessUploadInput): Promise<Upload> {
  const { buffer } = input;
  if (buffer.length === 0) throw AppError.validation({ file: 'The file is empty.' });
  const sniffed = sniffFileType(buffer);
  if (!sniffed) throw unsupported("That file type isn't supported.");
  if (input.purpose === 'builder-model' && sniffed.kind !== 'model') throw unsupported('The Builder model must be a .glb file.', ['model/gltf-binary']);
  const max = maxBytesFor(sniffed.kind);
  if (buffer.length > max) throw fileTooLarge(max);

  const base = { originalName: input.originalName, userId: input.userId };
  if (sniffed.mime === 'image/svg+xml') {
    const problem = svgProblem(buffer);
    if (problem) throw unsupported(`That SVG ${problem}. Export a plain SVG without scripts or external links.`);
    const size = svgSize(buffer);
    return storeUpload(ctx, { ...base, buffer, ext: 'svg', mime: 'image/svg+xml', width: size?.width ?? null, height: size?.height ?? null });
  }
  if (sniffed.kind === 'image') {
    const out = await processImage(buffer, sniffed);
    return storeUpload(ctx, { ...base, buffer: out.buffer, ext: out.ext, mime: out.mime, width: out.width, height: out.height });
  }
  if (sniffed.kind === 'model') {
    const problem = glbProblem(buffer);
    if (problem) throw unsupported(`That file ${problem}.`);
  }
  return storeUpload(ctx, { ...base, buffer, ext: sniffed.ext, mime: sniffed.mime, width: null, height: null });
}
