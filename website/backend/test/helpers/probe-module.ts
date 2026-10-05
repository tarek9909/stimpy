import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError, ALL_ERROR_CODES, ERROR_STATUS, type ErrorCode } from '../../src/lib/errors';
import { errorResponses, strictObject } from '../../src/lib/http';
import type { ModuleDef } from '../../src/modules/module';

/**
 * Probe routes for infrastructure tests (error handler, serializer, body limits, admin guard).
 * Registered only in tests through `useTestApp({ extraModules: [probeModule] })`.
 */
const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['health'];

  app.get('/_probe/error/:code', {
    schema: { tags, params: z.object({ code: z.string() }), response: { 200: z.object({}), ...errorResponses } },
  }, async (req) => {
    const code = req.params.code as ErrorCode;
    if (!ALL_ERROR_CODES.includes(code)) throw new Error('unknown code');
    if (code === 'VALIDATION_ERROR') throw AppError.validation({ field: 'Bad.' });
    if (code === 'RATE_LIMITED') throw AppError.rateLimited(42);
    if (code === 'SOLD_OUT') throw new AppError(code, ERROR_STATUS[code], 'Sold out.', { items: [{ kind: 'STIMPIE', stimpieId: 1, itemIndex: 0, name: 'X', requested: 2, available: 1 }] });
    if (code === 'INVALID_TRANSITION') throw new AppError(code, ERROR_STATUS[code], 'No.', { from: 'NEW', to: 'DELIVERED', allowed: ['CONFIRMED'] });
    throw new AppError(code, ERROR_STATUS[code], `Probe ${code}`);
  });

  app.get('/_probe/boom', { schema: { tags, response: { 200: z.object({}), ...errorResponses } } }, async () => {
    throw new Error('kaboom for rami@example.com +96171123456');
  });

  app.post('/_probe/validate', {
    schema: {
      tags,
      body: strictObject({
        customer: strictObject({ email: z.string().email(), name: z.string().min(2).max(80) }),
        items: z.array(strictObject({ sizeId: z.number().int(), stimpieIds: z.array(z.number().int()).optional() })).max(2),
        kind: z.enum(['a', 'b']),
        qty: z.number().int().min(1).max(10),
      }),
      response: { 200: z.object({ ok: z.boolean() }), ...errorResponses },
    },
  }, async () => ({ ok: true }));

  app.get('/_probe/query', {
    schema: { tags, querystring: z.object({ n: z.coerce.number().int().min(1) }), response: { 200: z.object({ n: z.number() }), ...errorResponses } },
  }, async (req) => ({ n: req.query.n }));

  // Response schema enforcement: `secret` is not in the schema and must be stripped.
  app.get('/_probe/strip', { schema: { tags, response: { 200: z.object({ name: z.string() }) } } }, async () => {
    return { name: 'visible', secret: 'hash$argon2', costCents: 600 } as unknown as { name: string };
  });
  app.get('/_probe/bad-shape', { schema: { tags, response: { 200: z.object({ name: z.string() }) } } }, async () => {
    return { name: 42 } as unknown as { name: string };
  });

  app.post('/_probe/echo', {
    schema: { tags, body: z.object({}).passthrough(), response: { 200: z.object({ ok: z.boolean() }) } },
  }, async () => ({ ok: true }));
  app.post('/_probe/noschema-body', { schema: { tags, response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({ ok: true }));
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/_probe/admin', { schema: { tags: ['health'], response: { 200: z.object({ userId: z.number() }) } } }, async (req) => ({ userId: req.auth!.user.id }));
  app.post('/_probe/admin', { schema: { tags: ['health'], body: strictObject({ x: z.number() }), response: { 200: z.object({ ok: z.boolean() }) } } }, async () => ({ ok: true }));
};

export const probeModule: ModuleDef = { name: '_probe', publicRoutes, adminRoutes };
