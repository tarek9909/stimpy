import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { adminOrderSummarySchema } from '../../services/order-summary';
import { getOverview, markSetupReviewed } from '../../services/overview';
import { searchOrders } from '../../services/search';
import { noContent, userSchema } from '../auth/schemas';
import { searchCustomers } from '../customers/service';
import type { ModuleDef } from '../module';

const tags = ['overview'];
const int = z.number().int();

const overviewResponse = z
  .object({
    today: z.object({ newOrders: int, toPack: int, outForDelivery: int, cashToCollectCents: int, revenueCents: int }),
    attention: z.array(
      z.object({
        type: z.enum(['NEW_TOO_LONG', 'OUT_TOO_LONG', 'LOW_STOCK', 'HOLD_EXPIRED', 'EMAIL_FAILED']),
        label: z.string(),
        orderId: int.nullable(),
        itemType: z.enum(['HOODIE_VARIANT', 'STIMPIE']).nullable(),
        itemId: int.nullable(),
      }),
    ),
    liveDrop: z.object({ id: int, name: z.string(), unitsTotal: int, unitsSold: int, endsAt: z.string().nullable() }).nullable(),
    sales7d: z.array(z.object({ date: z.string(), orders: int, revenueCents: int })),
    recentOrders: z.array(adminOrderSummarySchema),
    setup: z.object({
      complete: z.boolean(),
      items: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          hint: z.string(),
          kind: z.enum(['AUTO', 'REVIEW']),
          required: z.boolean(),
          status: z.enum(['TODO', 'DONE']),
          link: z.string(),
        }),
      ),
    }),
  })
  .meta({ id: 'Overview' });

const searchResponse = z.object({
  orders: z.array(adminOrderSummarySchema),
  customers: z.array(z.object({ id: int, name: z.string(), phone: z.string(), email: z.string().nullable() })),
});

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/overview', {
    schema: { tags, summary: 'Dashboard overview: today, attention, live drop, 7-day sales, recent orders, setup checklist', response: { 200: overviewResponse, ...errorResponses } },
  }, async () => getOverview(app.ctx));

  app.post('/setup/:key/done', {
    schema: {
      tags,
      summary: 'Mark (or un-mark) a REVIEW item of the "Get ready to sell" checklist',
      params: z.object({ key: z.string().min(1).max(60) }),
      body: z.strictObject({ done: z.boolean() }),
      response: { 204: noContent, ...errorResponses },
    },
  }, async (req, reply) => {
    await markSetupReviewed(app.ctx, req.params.key, req.body.done);
    return reply.code(204).send(null);
  });

  app.get('/search', {
    schema: {
      tags,
      summary: 'Global search: at most 5 orders and 5 customers',
      querystring: z.object({ q: z.string().trim().max(120).default('') }),
      response: { 200: searchResponse, ...errorResponses },
    },
  }, async (req) => {
    const q = req.query.q;
    if (!q) return { orders: [], customers: [] };
    const [orders, customers] = await Promise.all([searchOrders(app.ctx, q, 5), searchCustomers(app.ctx, q, 5)]);
    return { orders, customers };
  });

  app.get('/users', {
    schema: { tags, summary: 'Placeholder: the owner account(s). User management is out of scope for v1', response: { 200: z.array(userSchema), ...errorResponses } },
  }, async () => {
    const users = await app.ctx.prisma.adminUser.findMany({ where: { role: 'OWNER' }, orderBy: { id: 'asc' }, select: { id: true, email: true, name: true, role: true } });
    return users;
  });
};

export const overviewModule: ModuleDef = { name: 'overview', adminRoutes };
