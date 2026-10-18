import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageSchema, publicCache } from '../../lib/http';
import { noContent } from '../auth/schemas';
import type { ModuleDef } from '../module';
import { adminPromotionSchema, promotionCreateBody, promotionListQuery, promotionUpdateBody, publicPromotionSchema } from './schemas';
import * as svc from './service';

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/promotions', {
    schema: { tags: ['promotions'], summary: 'List currently active promotions', response: { 200: publicPromotionSchema.array(), ...errorResponses } },
  }, async (_req, reply) => {
    publicCache(reply, 5);
    return svc.listPublicPromotions(app.ctx);
  });
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['promotions'];

  app.get('/promotions', {
    schema: { tags, summary: 'List promotions', querystring: promotionListQuery, response: { 200: pageSchema(adminPromotionSchema), ...errorResponses } },
  }, async (req) => svc.listPromotions(app.ctx, req.query));

  app.post('/promotions', {
    schema: { tags, summary: 'Create a product promotion', body: promotionCreateBody, response: { 201: adminPromotionSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createPromotion(app.ctx, req.body)));

  app.get('/promotions/:id', {
    schema: { tags, summary: 'Get a promotion', params: idParams, response: { 200: adminPromotionSchema, ...errorResponses } },
  }, async (req) => svc.getPromotion(app.ctx, req.params.id));

  app.patch('/promotions/:id', {
    schema: { tags, summary: 'Update or pause a promotion', params: idParams, body: promotionUpdateBody, response: { 200: adminPromotionSchema, ...errorResponses } },
  }, async (req) => svc.updatePromotion(app.ctx, req.params.id, req.body));

  app.delete('/promotions/:id', {
    schema: { tags, summary: 'Delete a promotion', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deletePromotion(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });
};

export const promotionsModule: ModuleDef = { name: 'promotions', publicRoutes, adminRoutes };
