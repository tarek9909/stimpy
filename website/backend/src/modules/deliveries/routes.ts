import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { boolQuery, errorResponses, idParams, pageQuerySchema, pageSchema, publicCache, searchQuery } from '../../lib/http';
import { noContent } from '../auth/schemas';
import type { ModuleDef } from '../module';
import {
  createArea,
  deleteArea,
  dispatchOrders,
  getDeliverySettings,
  listAreas,
  listDeliveries,
  publicDeliveryFees,
  settleDelivery,
  updateArea,
  updateDeliverySettings,
} from './service';

const cents = z.number().int().min(0).max(1_000_000);

const feesResponse = z.object({
  defaultFeeCents: z.number().int(),
  areas: z.array(z.object({ id: z.number().int(), name: z.string(), feeCents: z.number().int().nullable(), estDays: z.number().int().nullable() })),
  estimateText: z.string(),
});

const deliveryRow = z.object({
  orderId: z.number().int(),
  orderNumber: z.string(),
  deliveryNumber: z.string().nullable(),
  customerName: z.string(),
  phone: z.string(),
  areaName: z.string(),
  address: z.string(),
  cashDueCents: z.number().int(),
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
  cashSettled: z.boolean(),
});

const deliveriesQuery = pageQuerySchema.extend({ tab: z.enum(['OUT', 'DELIVERED']).default('OUT'), q: searchQuery });

const dispatchBody = z.strictObject({
  orders: z.array(z.strictObject({ orderId: z.number().int().min(1), deliveryNumber: z.string().max(200) })).min(1).max(100),
});
const dispatchResponse = z.object({
  dispatched: z.array(z.number().int()),
  failed: z.array(z.object({ orderId: z.number().int(), code: z.string() })),
  warnings: z.array(z.object({ deliveryNumber: z.string(), orderIds: z.array(z.number().int()) })),
});

const settleParams = z.object({ deliveryNumber: z.string().trim().min(1).max(60) });
const settleBody = z.strictObject({ settled: z.boolean() });
const settleResponse = z.object({ orderIds: z.array(z.number().int()) });

const areaSchema = z.object({ id: z.number().int(), name: z.string(), feeCents: z.number().int().nullable(), estDays: z.number().int().nullable(), active: z.boolean() }).meta({ id: 'Area' });
const areaCreateBody = z.strictObject({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  feeCents: cents.nullable().optional(),
  estDays: z.number().int().min(0).max(30).nullable().optional(),
  active: z.boolean().optional(),
});
const areaUpdateBody = areaCreateBody.partial();
const areaListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  active: boolQuery,
});

const deliverySettingsSchema = z.object({ defaultFeeCents: z.number().int(), estimateText: z.string() }).meta({ id: 'DeliverySettings' });
const deliverySettingsPatch = z.strictObject({
  defaultFeeCents: cents.optional(),
  estimateText: z.string().trim().min(1, 'Enter the delivery estimate text.').max(200).optional(),
});

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/delivery/fees',
    { schema: { tags: ['deliveries'], summary: 'Default fee, active areas and the estimate text', response: { 200: feesResponse } } },
    async (_req, reply) => {
      publicCache(reply);
      return publicDeliveryFees(app.ctx);
    },
  );
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['deliveries'];

  app.get('/deliveries', {
    schema: { tags, summary: 'Orders out for delivery (tab=OUT) or delivered (tab=DELIVERED)', querystring: deliveriesQuery, response: { 200: pageSchema(deliveryRow), ...errorResponses } },
  }, async (req) => listDeliveries(app.ctx, req.query));

  app.post('/deliveries/dispatch', {
    schema: { tags, summary: 'Send several PACKED orders out at once', body: dispatchBody, response: { 200: dispatchResponse, ...errorResponses } },
  }, async (req) => dispatchOrders(app.ctx, { orders: req.body.orders, userId: req.auth!.user.id }));

  app.post('/deliveries/:deliveryNumber/settle', {
    schema: { tags, summary: 'Mark cash settled for every order on a delivery number', params: settleParams, body: settleBody, response: { 200: settleResponse, ...errorResponses } },
  }, async (req) => settleDelivery(app.ctx, { deliveryNumber: req.params.deliveryNumber, settled: req.body.settled, userId: req.auth!.user.id }));

  // ---- areas
  app.get('/areas', {
    schema: { tags, summary: 'List areas (inactive included; ?active= filters)', querystring: areaListQuery, response: { 200: pageSchema(areaSchema), ...errorResponses } },
  }, async (req) => listAreas(app.ctx, req.query));

  app.post('/areas', {
    schema: { tags, summary: 'Create an area', body: areaCreateBody, response: { 201: areaSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await createArea(app.ctx, req.body)));

  app.patch('/areas/:id', {
    schema: { tags, summary: 'Update an area', params: idParams, body: areaUpdateBody, response: { 200: areaSchema, ...errorResponses } },
  }, async (req) => updateArea(app.ctx, req.params.id, req.body));

  app.delete('/areas/:id', {
    schema: { tags, summary: 'Delete an area (409 when used by orders)', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await deleteArea(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  // ---- delivery settings
  app.get('/settings/delivery', {
    schema: { tags, summary: 'Default delivery fee and estimate text', response: { 200: deliverySettingsSchema, ...errorResponses } },
  }, async () => getDeliverySettings(app.ctx));

  app.patch('/settings/delivery', {
    schema: { tags, summary: 'Update the default delivery fee / estimate text', body: deliverySettingsPatch, response: { 200: deliverySettingsSchema, ...errorResponses } },
  }, async (req) => updateDeliverySettings(app.ctx, req.body));
};

export const deliveriesModule: ModuleDef = { name: 'deliveries', publicRoutes, adminRoutes };
