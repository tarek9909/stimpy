import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageSchema, publicCache } from '../../lib/http';
import { noContent } from '../auth/schemas';
import { reorderBody } from '../options/schemas';
import type { ModuleDef } from '../module';
import {
  adminHoodieSchema,
  adminPackSchema,
  adminStimpieSchema,
  hoodieCreateBody,
  hoodieDetailSchema,
  hoodieListQuery,
  publicHoodieQuery,
  publicPackQuery,
  hoodieSummarySchema,
  hoodieUpdateBody,
  packCreateBody,
  packListQuery,
  packSchema,
  packUpdateBody,
  publicStimpieQuery,
  publicStimpieSchema,
  slugParams,
  stimpieCreateBody,
  stimpieListQuery,
  stimpieUpdateBody,
} from './schemas';
import * as svc from './service';

// ---------------------------------------------------------------- public (api-reference 3.3)

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['catalog'];

  app.get('/products/hoodies', {
    schema: { tags, summary: 'Active hoodies (paginated)', querystring: publicHoodieQuery, response: { 200: pageSchema(hoodieSummarySchema), ...errorResponses } },
  }, async (req, reply) => {
    publicCache(reply, 5);
    return svc.listPublicHoodies(app.ctx, req.query);
  });

  app.get('/products/hoodies/:slug', {
    schema: { tags, summary: 'One hoodie with colours, sizes and per-variant stock (404 if hidden)', params: slugParams, response: { 200: hoodieDetailSchema, ...errorResponses } },
  }, async (req, reply) => {
    const out = await svc.getPublicHoodie(app.ctx, req.params.slug);
    publicCache(reply, 5);
    return out;
  });

  app.get('/products/stimpies', {
    schema: {
      tags,
      summary: 'Stimpies (default: AVAILABLE, LOW and SOLD_OUT; paginated)',
      querystring: publicStimpieQuery,
      response: { 200: pageSchema(publicStimpieSchema), ...errorResponses },
    },
  }, async (req, reply) => {
    publicCache(reply, 5);
    return svc.listPublicStimpies(app.ctx, req.query);
  });

  app.get('/products/stimpies/:slug', {
    schema: { tags, summary: 'One Stimpie (any status; 404 if hidden)', params: slugParams, response: { 200: publicStimpieSchema, ...errorResponses } },
  }, async (req, reply) => {
    const out = await svc.getPublicStimpie(app.ctx, req.params.slug);
    publicCache(reply, 5);
    return out;
  });

  app.get('/packs', {
    schema: { tags, summary: 'Active packs, ordered (paginated)', querystring: publicPackQuery, response: { 200: pageSchema(packSchema), ...errorResponses } },
  }, async (req, reply) => {
    publicCache(reply, 5);
    return svc.listPublicPacks(app.ctx, req.query);
  });
};

// ---------------------------------------------------------------- admin (api-reference 5.4)

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['catalog'];

  // ---- hoodies
  app.get('/hoodies', {
    schema: { tags, summary: 'List hoodies (inactive included; ?active= filters)', querystring: hoodieListQuery, response: { 200: pageSchema(adminHoodieSchema), ...errorResponses } },
  }, async (req) => svc.listHoodies(app.ctx, req.query));

  app.post('/hoodies', {
    schema: { tags, summary: 'Create a hoodie with its selected colours and sizes', body: hoodieCreateBody, response: { 201: adminHoodieSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createHoodie(app.ctx, req.body)));

  app.put('/hoodies/order', {
    schema: { tags, summary: 'Reorder hoodies (full id list)', body: reorderBody, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.reorderHoodies(app.ctx, req.body.ids);
    return reply.code(204).send(null);
  });

  app.get('/hoodies/:id', {
    schema: { tags, summary: 'Get a hoodie', params: idParams, response: { 200: adminHoodieSchema, ...errorResponses } },
  }, async (req) => svc.getHoodie(app.ctx, req.params.id));

  app.patch('/hoodies/:id', {
    schema: { tags, summary: 'Update a hoodie', params: idParams, body: hoodieUpdateBody, response: { 200: adminHoodieSchema, ...errorResponses } },
  }, async (req) => svc.updateHoodie(app.ctx, req.params.id, req.body));

  app.delete('/hoodies/:id', {
    schema: { tags, summary: 'Delete a hoodie (409 if used by orders)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteHoodie(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- stimpies
  app.get('/stimpies', {
    schema: { tags, summary: 'List Stimpies (inactive included; ?active=, ?type=, ?dropId= filter)', querystring: stimpieListQuery, response: { 200: pageSchema(adminStimpieSchema), ...errorResponses } },
  }, async (req) => svc.listStimpies(app.ctx, req.query));

  app.post('/stimpies', {
    schema: { tags, summary: 'Create a Stimpie (initial quantity writes an INITIAL movement)', body: stimpieCreateBody, response: { 201: adminStimpieSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createStimpie(app.ctx, req.body, req.auth!.user.id)));

  app.get('/stimpies/:id', {
    schema: { tags, summary: 'Get a Stimpie', params: idParams, response: { 200: adminStimpieSchema, ...errorResponses } },
  }, async (req) => svc.getStimpie(app.ctx, req.params.id));

  app.patch('/stimpies/:id', {
    schema: { tags, summary: 'Update a Stimpie (stock changes go through /admin/stock)', params: idParams, body: stimpieUpdateBody, response: { 200: adminStimpieSchema, ...errorResponses } },
  }, async (req) => svc.updateStimpie(app.ctx, req.params.id, req.body));

  app.delete('/stimpies/:id', {
    schema: { tags, summary: 'Delete a Stimpie (409 if used by orders)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteStimpie(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- packs
  app.get('/packs', {
    schema: { tags, summary: 'List packs (inactive included; ?active= filters)', querystring: packListQuery, response: { 200: pageSchema(adminPackSchema), ...errorResponses } },
  }, async (req) => svc.listPacks(app.ctx, req.query));

  app.post('/packs', {
    schema: { tags, summary: 'Create a pack', body: packCreateBody, response: { 201: adminPackSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createPack(app.ctx, req.body)));

  app.put('/packs/order', {
    schema: { tags, summary: 'Reorder packs (full id list)', body: reorderBody, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.reorderPacks(app.ctx, req.body.ids);
    return reply.code(204).send(null);
  });

  app.get('/packs/:id', {
    schema: { tags, summary: 'Get a pack', params: idParams, response: { 200: adminPackSchema, ...errorResponses } },
  }, async (req) => svc.getPack(app.ctx, req.params.id));

  app.patch('/packs/:id', {
    schema: { tags, summary: 'Update a pack', params: idParams, body: packUpdateBody, response: { 200: adminPackSchema, ...errorResponses } },
  }, async (req) => svc.updatePack(app.ctx, req.params.id, req.body));

  app.delete('/packs/:id', {
    schema: { tags, summary: 'Delete a pack', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deletePack(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });
};

export const catalogModule: ModuleDef = { name: 'catalog', publicRoutes, adminRoutes };
