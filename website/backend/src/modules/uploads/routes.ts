import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors';
import { errorResponses } from '../../lib/http';
import {
  MAX_UPLOAD_BYTES,
  SNIFF_BYTES,
  fileTooLarge,
  maxBytesFor,
  processUpload,
  sniffFileType,
  unsupportedFileType,
} from '../../services/uploads';
import type { ModuleDef } from '../module';

const uploadResponse = z
  .object({
    id: z.number().int(),
    url: z.string(),
    mime: z.string(),
    sizeBytes: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
  })
  .meta({ id: 'Upload' });

const PURPOSE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

type FilePart = { file: NodeJS.ReadableStream & { truncated?: boolean }; filename: string };

/**
 * Reads the file stream into memory with the limits applied as early as possible: once SNIFF_BYTES have arrived the
 * real type decides the limit (10 / 100 / 50 MB), so an oversized or unsupported file is rejected without buffering it
 * all. The rest of the stream is drained so the client gets a clean 413 / 415 instead of a reset connection.
 */
async function readLimited(part: FilePart): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  let max = MAX_UPLOAD_BYTES;
  let judged = false;
  let failure: AppError | null = null;

  for await (const raw of part.file) {
    if (failure) continue; // drain
    const chunk = raw as Buffer;
    total += chunk.length;
    chunks.push(chunk);
    if (!judged && total >= SNIFF_BYTES) {
      judged = true;
      const kind = sniffFileType(Buffer.concat(chunks));
      if (!kind) failure = unsupportedFileType("That file type isn't supported.");
      else max = maxBytesFor(kind.kind);
    }
    if (!failure && total > max) failure = fileTooLarge(max);
    if (failure) chunks.length = 0;
  }
  if (failure) throw failure;
  if (part.file.truncated) throw fileTooLarge(max);
  return Buffer.concat(chunks);
}

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, {
    // One byte over the hard ceiling so a truncated stream is detectable.
    limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1, fields: 4, fieldSize: 200, parts: 6, headerPairs: 50 },
  });

  app.post('/uploads', {
    bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024,
    schema: {
      tags: ['uploads'],
      summary: 'Upload an image, video or .glb model (multipart/form-data: file, optional purpose)',
      description:
        'Field `file` (required) and optional text field `purpose` (e.g. `builder-model`, which requires a .glb). The type is judged by file content. ' +
        'Images up to 10 MB are auto-rotated, stripped of metadata, resized to at most 2000 px on the long side and saved as WebP (transparent PNGs stay PNG); SVGs with scripts or external references are refused. ' +
        'MP4/WebM up to 100 MB, GLB up to 50 MB. `413 FILE_TOO_LARGE` carries `details.maxBytes`, `415 UNSUPPORTED_FILE_TYPE` carries `details.allowed`.',
      consumes: ['multipart/form-data'],
      response: { 201: uploadResponse, ...errorResponses },
    },
  }, async (req, reply) => {
    if (!req.isMultipart()) throw AppError.validation({ file: 'Send the file as multipart/form-data in the field "file".' });

    let buffer: Buffer | null = null;
    let originalName = 'upload';
    let purpose: string | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || buffer) {
          // Unexpected extra file: drain it, then reject.
          part.file.resume();
          throw AppError.validation({ [part.fieldname]: 'Only one file in the field "file" is accepted.' });
        }
        originalName = (part.filename ?? 'upload').split(/[\\/]/).pop() || 'upload';
        buffer = await readLimited(part as unknown as FilePart);
      } else if (part.fieldname === 'purpose') {
        const v = String(part.value ?? '').trim();
        if (v !== '') {
          if (!PURPOSE_RE.test(v)) throw AppError.validation({ purpose: 'Use lowercase letters, digits and dashes (max 40).' });
          purpose = v;
        }
      } else {
        throw AppError.validation({ [part.fieldname]: 'Unknown field.' });
      }
    }
    if (!buffer) throw AppError.validation({ file: 'Choose a file to upload.' });

    const row = await processUpload(app.ctx, { buffer, originalName, purpose, userId: req.auth!.user.id });
    req.log.info({ uploadId: row.id, mime: row.mime, sizeBytes: row.sizeBytes }, 'file uploaded');
    return reply.code(201).send({ id: row.id, url: row.url, mime: row.mime, sizeBytes: row.sizeBytes, width: row.width, height: row.height });
  });
};

export const uploadsModule: ModuleDef = { name: 'uploads', adminRoutes };
