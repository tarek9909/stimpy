import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { rangeQuerySchema, resolveRange } from '../../lib/range';
import { acquisitionInsights, customerInsights, productInsights, salesInsights } from '../../services/insights';
import type { ModuleDef } from '../module';

const tags = ['insights'];
const int = z.number().int();

const salesResponse = z
  .object({
    series: z.array(z.object({ date: z.string(), orders: int, revenueCents: int })),
    byDrop: z.array(z.object({ dropName: z.string(), orders: int, revenueCents: int })),
    bySource: z.array(z.object({ source: z.enum(['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MANUAL']), orders: int, revenueCents: int })),
    byCampaign: z.array(z.object({ utmSource: z.string().nullable(), utmCampaign: z.string().nullable(), orders: int, revenueCents: int })),
    byWeekday: z.array(z.object({ weekday: int.min(0).max(6), orders: int })),
  })
  .meta({ id: 'InsightsSales' });

const productsResponse = z
  .object({
    stimpies: z.array(z.object({ name: z.string(), unitsSold: int, revenueCents: int })),
    packMix: z.array(z.object({ packName: z.string(), orders: int })),
    extraStimpieAttachRate: z.number(),
    sizes: z.array(z.object({ label: z.string(), units: int })),
    colors: z.array(z.object({ name: z.string(), units: int })),
  })
  .meta({ id: 'InsightsProducts' });

const customersResponse = z
  .object({
    repeatRate: z.number(),
    byArea: z.array(z.object({ areaName: z.string(), orders: int })),
    deliverySuccessRate: z.number(),
    returnRate: z.number(),
  })
  .meta({ id: 'InsightsCustomers' });

const acquisitionResponse = z.object({
  bySource: z.array(z.object({ source: z.string(), customers: int, revenueCents: int, adSpendCents: int, costPerCustomerCents: int.nullable(), roas: z.number().nullable() })),
  byCampaign: z.array(z.object({ source: z.string(), campaign: z.string(), customers: int, revenueCents: int })),
  unmatchedAdSpendCents: int,
}).meta({ id: 'InsightsAcquisition' });

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/insights/sales', {
    schema: { tags, summary: 'Sales over time and by drop, source, campaign and weekday (delivered orders)', querystring: rangeQuerySchema, response: { 200: salesResponse, ...errorResponses } },
  }, async (req) => salesInsights(app.ctx, await resolveRange(app.ctx, req.query)));

  app.get('/insights/products', {
    schema: { tags, summary: 'Best sellers, pack mix, attach rate, sizes and colours', querystring: rangeQuerySchema, response: { 200: productsResponse, ...errorResponses } },
  }, async (req) => productInsights(app.ctx, await resolveRange(app.ctx, req.query)));

  app.get('/insights/customers', {
    schema: { tags, summary: 'Repeat, delivery success and return rates (fractions 0..1) and orders by area', querystring: rangeQuerySchema, response: { 200: customersResponse, ...errorResponses } },
  }, async (req) => customerInsights(app.ctx, await resolveRange(app.ctx, req.query)));

  app.get('/insights/acquisition', {
    schema: { tags, summary: 'First-touch new customers, delivered revenue, matched source spend, cost per customer and ROAS', querystring: rangeQuerySchema, response: { 200: acquisitionResponse, ...errorResponses } },
  }, async (req) => acquisitionInsights(app.ctx, await resolveRange(app.ctx, req.query)));
};

export const insightsModule: ModuleDef = { name: 'insights', adminRoutes };
