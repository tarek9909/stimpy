import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageSchema, publicCache } from '../../lib/http';
import { noContent } from '../auth/schemas';
import { reorderBody } from '../options/schemas';
import type { ModuleDef } from '../module';
import { adminBuilderSchema, builderPutBody, publicBuilderSchema } from './builder-schemas';
import * as builder from './builder';
import {
  adminContentResponse,
  adminFaqSchema,
  adminReviewSchema,
  contentBody,
  contentKeyParams,
  faqCreateBody,
  faqListQuery,
  faqUpdateBody,
  publicContentSchema,
  reviewCreateBody,
  reviewListQuery,
  reviewUpdateBody,
} from './schemas';
import * as svc from './service';

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/content', {
    schema: { tags: ['content'], summary: 'Everything the pages show that the owner edits (announcement, texts, FAQs, reviews)', response: { 200: publicContentSchema } },
  }, async (_req, reply) => {
    publicCache(reply);
    return svc.getPublicContent(app.ctx);
  });

  app.get('/builder/config', {
    schema: { tags: ['content'], summary: 'What the /builder page needs (with effectiveMode)', response: { 200: publicBuilderSchema } },
  }, async (_req, reply) => {
    publicCache(reply);
    return builder.getPublicBuilderConfig(app.ctx);
  });
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['content'];

  // ---- content blocks
  app.get('/content/:key', {
    schema: { tags, summary: 'Read a content block (announcement, homepage, policies, about, how-it-works)', params: contentKeyParams, response: { 200: adminContentResponse, ...errorResponses } },
  }, async (req) => svc.getContentBlock(app.ctx, req.params.key));

  app.put('/content/:key', {
    schema: {
      tags,
      summary: 'Replace a content block (the body is validated per key)',
      description: 'announcement {enabled,text,linkUrl}; homepage {heroHeadline,heroSubheadline,heroVideoUrl,heroImageUrl,featuredDropSlug}; policies {deliveryReturns,care,terms,privacy}; about {about}; how-it-works {steps,promises,faqs}.',
      params: contentKeyParams,
      body: contentBody,
      response: { 200: adminContentResponse, ...errorResponses },
    },
  }, async (req) => svc.putContentBlock(app.ctx, req.params.key, req.body));

  // ---- FAQs
  app.get('/faqs', {
    schema: { tags, summary: 'List FAQs in display order', querystring: faqListQuery, response: { 200: pageSchema(adminFaqSchema), ...errorResponses } },
  }, async (req) => svc.listFaqs(app.ctx, req.query));

  app.post('/faqs', {
    schema: { tags, summary: 'Create a FAQ (added at the end)', body: faqCreateBody, response: { 201: adminFaqSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createFaq(app.ctx, req.body)));

  app.put('/faqs/order', {
    schema: { tags, summary: 'Reorder FAQs (full id list)', body: reorderBody, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.reorderFaqs(app.ctx, req.body.ids);
    return reply.code(204).send(null);
  });

  app.patch('/faqs/:id', {
    schema: { tags, summary: 'Update a FAQ', params: idParams, body: faqUpdateBody, response: { 200: adminFaqSchema, ...errorResponses } },
  }, async (req) => svc.updateFaq(app.ctx, req.params.id, req.body));

  app.delete('/faqs/:id', {
    schema: { tags, summary: 'Delete a FAQ', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteFaq(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- reviews
  app.get('/reviews', {
    schema: { tags, summary: 'List reviews (hidden ones included), newest first', querystring: reviewListQuery, response: { 200: pageSchema(adminReviewSchema), ...errorResponses } },
  }, async (req) => svc.listReviews(app.ctx, req.query));

  app.post('/reviews', {
    schema: { tags, summary: 'Add a review', body: reviewCreateBody, response: { 201: adminReviewSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createReview(app.ctx, req.body)));

  app.patch('/reviews/:id', {
    schema: { tags, summary: 'Update a review (visible hides it without deleting)', params: idParams, body: reviewUpdateBody, response: { 200: adminReviewSchema, ...errorResponses } },
  }, async (req) => svc.updateReview(app.ctx, req.params.id, req.body));

  app.delete('/reviews/:id', {
    schema: { tags, summary: 'Delete a review', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteReview(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- Builder
  app.get('/builder', {
    schema: { tags, summary: 'Builder settings as saved, with assetsReady and warnings', response: { 200: adminBuilderSchema, ...errorResponses } },
  }, async () => builder.getAdminBuilder(app.ctx));

  app.put('/builder', {
    schema: { tags, summary: 'Replace the Builder settings with the full object (live immediately; incomplete settings return warnings)', body: builderPutBody, response: { 200: adminBuilderSchema, ...errorResponses } },
  }, async (req) => builder.putAdminBuilder(app.ctx, req.body));
};

export const contentModule: ModuleDef = { name: 'content', publicRoutes, adminRoutes };
