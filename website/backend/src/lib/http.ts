import { z } from 'zod';
import type { FastifyReply } from 'fastify';

/**
 * Shared HTTP-level helpers: pagination, sorting, strict request objects, error schema, cache headers.
 * Everything here is used by routes only (services never import fastify types).
 */

/** Request bodies/queries reject unknown fields ("Unknown request fields: rejected with VALIDATION_ERROR"). */
export const strictObject = z.strictObject;

// ---------------------------------------------------------------- pagination

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });

export const toSkipTake = (q: PageQuery): { skip: number; take: number } => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const toPage = <T>(items: T[], total: number, q: PageQuery): Page<T> => ({
  items,
  page: q.page,
  pageSize: q.pageSize,
  total,
});

// ---------------------------------------------------------------- sorting / query values

/** `?sort=field` or `?sort=-field` restricted to an allow-list. Returns { field, dir } or null. */
export function parseSort<F extends string>(
  raw: string | undefined,
  allowed: readonly F[],
  fallback: { field: F; dir: 'asc' | 'desc' },
): { field: F; dir: 'asc' | 'desc' } {
  if (!raw) return fallback;
  const desc = raw.startsWith('-');
  const field = (desc ? raw.slice(1) : raw) as F;
  return allowed.includes(field) ? { field, dir: desc ? 'desc' : 'asc' } : fallback;
}

export const sortQuery = z.string().max(40).optional();
export const searchQuery = z.string().trim().max(120).optional();
/** `?flag=true|false` -> boolean (absent -> undefined). */
export const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
/** Comma-separated list -> array of trimmed non-empty strings. */
export const csvQuery = z
  .string()
  .max(300)
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .optional();

export const idParams = z.object({ id: z.coerce.number().int().min(1) });

// ---------------------------------------------------------------- common field schemas

export const urlField = z.string().url().max(500);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Enter a colour like #FFAA00.');
export const slugField = z
  .string()
  .max(140)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes only.');
export const centsField = z.number().int().min(0).max(100_000_000);

// ---------------------------------------------------------------- error body (every non-2xx response)

export const errorBodySchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
      details: z.record(z.string(), z.unknown()).nullable(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

/** Spread into a route's `response` so OpenAPI documents the standard error body. */
export const errorResponses = { '4xx': errorBodySchema, '5xx': errorBodySchema } as const;

// ---------------------------------------------------------------- caching

/** Public catalog GETs: `Cache-Control: public, max-age=30` (drops use 10, health uses no-store). */
export function publicCache(reply: FastifyReply, seconds = 30): void {
  reply.header('Cache-Control', `public, max-age=${seconds}`);
}
export function noStore(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
}
