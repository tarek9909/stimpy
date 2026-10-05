import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { rangeQuerySchema, resolveRange } from '../../lib/range';
import { cashReport, profitReport } from '../../services/finance';
import type { ModuleDef } from '../module';
import { costRoutes } from './costs';

const tags = ['finance'];

const profitResponse = z
  .object({
    range: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
    note: z.string(),
    revenueCents: z.number().int(),
    deliveryFeesCents: z.number().int(),
    costOfGoodsCents: z.number().int(),
    expensesCents: z.number().int(),
    adSpendCents: z.number().int(),
    profitCents: z.number().int(),
    ordersCount: z.number().int(),
    byOrder: z.array(z.object({ orderNumber: z.string(), date: z.string(), revenueCents: z.number().int(), costCents: z.number().int(), profitCents: z.number().int() })),
    planMargins: z.object({ pack35: z.number().int(), pack45: z.number().int() }),
  })
  .meta({ id: 'FinanceProfit' });

const cashResponse = z
  .object({
    outstandingCents: z.number().int(),
    groups: z.array(
      z.object({
        deliveryNumber: z.string().nullable(),
        orders: z.array(z.object({ orderId: z.number().int(), orderNumber: z.string(), cashDueCents: z.number().int(), settled: z.boolean() })),
        totalDueCents: z.number().int(),
      }),
    ),
  })
  .meta({ id: 'FinanceCash' });

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/finance/profit', {
    schema: { tags, summary: 'Profit for a date range (delivered orders, business timezone)', querystring: rangeQuerySchema, response: { 200: profitResponse, ...errorResponses } },
  }, async (req) => profitReport(app.ctx, await resolveRange(app.ctx, req.query)));

  app.get('/finance/cash', {
    schema: { tags, summary: 'Cash outstanding, grouped by delivery number', response: { 200: cashResponse, ...errorResponses } },
  }, async () => cashReport(app.ctx));

  await app.register(costRoutes({ prefix: '/expenses', label: 'category', model: 'expense', noun: 'expense', schemaId: 'Expense' }));
  await app.register(costRoutes({ prefix: '/ad-spend', label: 'channel', model: 'adSpend', noun: 'ad spend entry', schemaId: 'AdSpend' }));
};

export const financeModule: ModuleDef = { name: 'finance', adminRoutes };
