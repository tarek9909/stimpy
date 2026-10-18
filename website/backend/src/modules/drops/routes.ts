import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageQuerySchema, pageSchema } from '../../lib/http';
import { RATE_RULES } from '../../lib/rate-limiter';
import { noContent } from '../auth/schemas';
import type { ModuleDef } from '../module';
import {
  adminDropSchema,
  dropCreateBody,
  dropListQuery,
  dropSlugParams,
  dropUpdateBody,
  dropsResponseSchema,
  publicDropSchema,
  subscribeBody,
  subscriberListQuery,
  subscriberSchema,
} from './schemas';
import * as svc from './service';

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['drops'];

  app.get('/drops', {
    schema: { tags, summary: 'Live drop plus paginated upcoming drops and archive (max-age 10, no-store within 60 s of a start)', querystring: pageQuerySchema, response: { 200: dropsResponseSchema } },
  }, async (req, reply) => {
    const body = await svc.listPublicDrops(app.ctx, req.query);
    reply.header('Cache-Control', await svc.dropCacheControl(app.ctx));
    return body;
  });

  app.get('/drops/:slug', {
    schema: { tags, summary: 'One drop with its Stimpies and live stock', params: dropSlugParams, response: { 200: publicDropSchema, ...errorResponses } },
  }, async (req, reply) => {
    const body = await svc.getPublicDrop(app.ctx, req.params.slug);
    reply.header('Cache-Control', await svc.dropCacheControl(app.ctx));
    return body;
  });

  app.post('/drops/:id/subscribe', {
    onRequest: app.limit(RATE_RULES.subscribe),
    schema: {
      tags,
      summary: 'Notify me about a drop (idempotent; 10 per hour per IP)',
      params: idParams,
      body: subscribeBody,
      response: { 204: noContent, ...errorResponses },
    },
  }, async (req, reply) => {
    await svc.subscribe(app.ctx, req.params.id, req.body);
    return reply.code(204).send(null);
  });
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['drops'];

  app.get('/drops', {
    schema: { tags, summary: 'List drops (?state=UPCOMING|LIVE|ARCHIVE)', querystring: dropListQuery, response: { 200: pageSchema(adminDropSchema), ...errorResponses } },
  }, async (req) => svc.listDrops(app.ctx, req.query));

  app.post('/drops', {
    schema: { tags, summary: 'Create a drop (optionally assigning Stimpies)', body: dropCreateBody, response: { 201: adminDropSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createDrop(app.ctx, req.body)));

  app.get('/drops/:id', {
    schema: { tags, summary: 'Get a drop with per-Stimpie results', params: idParams, response: { 200: adminDropSchema, ...errorResponses } },
  }, async (req) => svc.getDrop(app.ctx, req.params.id));

  app.patch('/drops/:id', {
    schema: { tags, summary: 'Update a drop (stimpieIds assigns / unassigns)', params: idParams, body: dropUpdateBody, response: { 200: adminDropSchema, ...errorResponses } },
  }, async (req) => svc.updateDrop(app.ctx, req.params.id, req.body));

  app.delete('/drops/:id', {
    schema: { tags, summary: 'Delete a drop (409 if orders reference its Stimpies)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteDrop(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  app.post('/drops/:id/end', {
    schema: { tags, summary: 'End a drop now (open orders are untouched)', params: idParams, response: { 200: adminDropSchema, ...errorResponses } },
  }, async (req) => svc.endDrop(app.ctx, req.params.id));

  app.get('/subscribers', {
    schema: {
      tags,
      summary: 'Drop subscribers (?format=csv downloads every match as CSV)',
      querystring: subscriberListQuery,
      response: { 200: z.union([pageSchema(subscriberSchema), z.string()]), ...errorResponses },
    },
  }, async (req, reply) => {
    if (req.query.format === 'csv') {
      const { filename, csv } = await svc.exportSubscribersCsv(app.ctx, req.query);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csv);
    }
    return svc.listSubscribers(app.ctx, req.query);
  });
};

export const dropsModule: ModuleDef = { name: 'drops', publicRoutes, adminRoutes };
