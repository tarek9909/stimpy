import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageSchema, publicCache } from '../../lib/http';
import type { ModuleDef } from '../module';
import {
  adminColorSchema,
  adminSizeChartResponse,
  adminSizeSchema,
  colorCreateBody,
  colorUpdateBody,
  optionListQuery,
  optionsResponse,
  reorderBody,
  sizeChartPutBody,
  sizeChartResponse,
  sizeCreateBody,
  sizeUpdateBody,
} from './schemas';
import { noContent } from '../auth/schemas';
import * as svc from './service';

// ---------------------------------------------------------------- public

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/options',
    { schema: { tags: ['options'], summary: 'Active colours and sizes, ordered', response: { 200: optionsResponse } } },
    async (_req, reply) => {
      publicCache(reply);
      return svc.listPublicOptions(app.ctx);
    },
  );

  app.get(
    '/size-chart',
    { schema: { tags: ['options'], summary: 'Size chart for active sizes', response: { 200: sizeChartResponse } } },
    async (_req, reply) => {
      publicCache(reply);
      const chart = await svc.getSizeChart(app.ctx, 'public');
      return { ...chart, columns: chart.columns.map(({ id, label, unit }) => ({ id, label, unit })) };
    },
  );
};

// ---------------------------------------------------------------- admin (already behind requireAdmin)

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['options'];

  // ---- colours
  app.get('/colors', {
    schema: { tags, summary: 'List colours (inactive included; ?active= filters)', querystring: optionListQuery, response: { 200: pageSchema(adminColorSchema), ...errorResponses } },
  }, async (req) => svc.listColors(app.ctx, req.query));

  app.post('/colors', {
    schema: { tags, summary: 'Create a shared colour option', body: colorCreateBody, response: { 201: adminColorSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createColor(app.ctx, req.body)));

  app.put('/colors/order', {
    schema: { tags, summary: 'Reorder colours (full id list)', body: reorderBody, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.reorderColors(app.ctx, req.body.ids);
    return reply.code(204).send(null);
  });

  app.get('/colors/:id', {
    schema: { tags, summary: 'Get a colour', params: idParams, response: { 200: adminColorSchema, ...errorResponses } },
  }, async (req) => svc.getColor(app.ctx, req.params.id));

  app.patch('/colors/:id', {
    schema: { tags, summary: 'Update a colour', params: idParams, body: colorUpdateBody, response: { 200: adminColorSchema, ...errorResponses } },
  }, async (req) => svc.updateColor(app.ctx, req.params.id, req.body));

  app.delete('/colors/:id', {
    schema: { tags, summary: 'Delete a colour (409 if used by orders)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteColor(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- sizes
  app.get('/sizes', {
    schema: { tags, summary: 'List sizes (inactive included; ?active= filters)', querystring: optionListQuery, response: { 200: pageSchema(adminSizeSchema), ...errorResponses } },
  }, async (req) => svc.listSizes(app.ctx, req.query));

  app.post('/sizes', {
    schema: { tags, summary: 'Create a shared size option', body: sizeCreateBody, response: { 201: adminSizeSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createSize(app.ctx, req.body)));

  app.put('/sizes/order', {
    schema: { tags, summary: 'Reorder sizes (full id list)', body: reorderBody, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.reorderSizes(app.ctx, req.body.ids);
    return reply.code(204).send(null);
  });

  app.get('/sizes/:id', {
    schema: { tags, summary: 'Get a size', params: idParams, response: { 200: adminSizeSchema, ...errorResponses } },
  }, async (req) => svc.getSize(app.ctx, req.params.id));

  app.patch('/sizes/:id', {
    schema: { tags, summary: 'Update a size', params: idParams, body: sizeUpdateBody, response: { 200: adminSizeSchema, ...errorResponses } },
  }, async (req) => svc.updateSize(app.ctx, req.params.id, req.body));

  app.delete('/sizes/:id', {
    schema: { tags, summary: 'Delete a size (409 if used by orders)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteSize(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- size chart
  app.get('/size-chart', {
    schema: { tags, summary: 'Size chart for editing (all sizes)', response: { 200: adminSizeChartResponse, ...errorResponses } },
  }, async () => svc.getSizeChart(app.ctx, 'admin'));

  app.put('/size-chart', {
    schema: { tags, summary: 'Replace the whole size chart atomically', body: sizeChartPutBody, response: { 200: adminSizeChartResponse, ...errorResponses } },
  }, async (req) => svc.putSizeChart(app.ctx, req.body));
};

export const optionsModule: ModuleDef = { name: 'options', publicRoutes, adminRoutes };
