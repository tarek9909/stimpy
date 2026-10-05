import { createHash } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors';
import { errorResponses, idParams, noStore } from '../../lib/http';
import { pageSchema } from '../../lib/http';
import { normalizePhone } from '../../lib/phone';
import { RATE_RULES, rateLimiter } from '../../lib/rate-limiter';
import { z } from 'zod';
import { addNote, buildWhatsapp, extendHold, sendOrderEmail, setCash, updateContact, updateDelivery } from '../../services/order-admin';
import { changeStatus, placeOrder, setDeliveryNumber, type PlaceOrderInput } from '../../services/orders';
import type { ModuleDef } from '../module';
import {
  adminOrderSchema,
  adminOrderSummarySchema,
  bulkStatusBody,
  bulkStatusResponse,
  cartValidateBody,
  cartValidateResponse,
  cashBody,
  contactPatchBody,
  deliveryNumberBody,
  deliveryPatchBody,
  emailBody,
  exportBody,
  extendHoldBody,
  findBody,
  findResponse,
  idempotencyHeaders,
  manualOrderBody,
  noteBody,
  orderCountsResponse,
  orderListQuery,
  placeOrderBody,
  placeOrderResponse,
  statusBody,
  trackBody,
  trackResponse,
  whatsappQuery,
  whatsappResponse,
} from './schemas';
import {
  bulkStatus,
  exportOrdersCsv,
  FIND_MESSAGE,
  findOrdersByEmail,
  getAdminOrder,
  listOrders,
  orderCounts,
  placedOrderResponse,
  trackOrder,
  validateCart,
} from './service';

const fingerprint = (ip: string, ua: string | undefined): string => createHash('sha256').update(`${ip}|${ua ?? ''}`).digest('hex');

// ---------------------------------------------------------------- public

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/cart/validate',
    {
      onRequest: app.limit(RATE_RULES.cartValidate),
      schema: {
        tags: ['orders'],
        summary: 'Check a cart without ordering (reserves nothing)',
        body: cartValidateBody,
        response: { 200: cartValidateResponse, ...errorResponses },
      },
    },
    async (req, reply) => {
      noStore(reply);
      return validateCart(app.ctx, req.body);
    },
  );

  app.post(
    '/orders',
    {
      // After validation (so a malformed request does not burn the budget), before any work: 5 per 10 minutes per IP.
      preHandler: app.limit(RATE_RULES.orderIp),
      schema: {
        tags: ['orders'],
        summary: 'Place an order (Idempotency-Key recommended)',
        headers: idempotencyHeaders,
        body: placeOrderBody,
        response: { 201: placeOrderResponse, 200: placeOrderResponse, ...errorResponses },
      },
    },
    async (req, reply) => {
      const b = req.body;
      // Honeypot: real users never fill it. A generic validation error with no field, and nothing is stored.
      if (b.hp) throw AppError.validation({}, 'Something went wrong. Please try again.');
      const phone = normalizePhone(b.customer.phone);
      if (phone) rateLimiter.enforce(RATE_RULES.orderPhone, phone); // 3 per hour per phone
      const input: PlaceOrderInput = {
        customer: { name: b.customer.name, email: b.customer.email, phone: b.customer.phone, whatsapp: b.customer.whatsapp ?? null, whatsappSameAsPhone: b.customer.whatsappSameAsPhone },
        delivery: { areaId: b.delivery.areaId ?? null, areaName: b.delivery.areaName, address: b.delivery.address, notes: b.delivery.notes ?? null },
        items: b.items,
        expectedTotalCents: b.expectedTotalCents,
        attribution: b.attribution ?? undefined,
        firstTouch: b.firstTouch ?? undefined,
        source: 'WEBSITE',
        idempotencyKey: req.headers['idempotency-key'],
        requestFingerprint: fingerprint(req.ip, req.headers['user-agent']),
      };
      const serviceStarted = performance.now();
      const result = await placeOrder(app.ctx, input);
      const serviceMs = performance.now() - serviceStarted;
      const responseStarted = performance.now();
      const body = await placedOrderResponse(app.ctx, result.orderId);
      if (process.env.E2E_API_SERVER_TIMING === '1') {
        const phases = Object.entries(result.timings ?? {}).map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`);
        reply.header('Server-Timing', [`order_service;dur=${serviceMs.toFixed(1)}`, ...phases, `order_response;dur=${(performance.now() - responseStarted).toFixed(1)}`].join(', '));
      }
      return reply.code(result.created ? 201 : 200).send(body);
    },
  );

  app.post(
    '/orders/track',
    {
      onRequest: app.limit(RATE_RULES.track),
      schema: { tags: ['orders'], summary: 'Track an order by number and phone', body: trackBody, response: { 200: trackResponse, ...errorResponses } },
    },
    async (req, reply) => {
      noStore(reply);
      return trackOrder(app.ctx, req.body);
    },
  );

  app.post(
    '/orders/find',
    {
      onRequest: app.limit(RATE_RULES.findIp),
      schema: { tags: ['orders'], summary: 'Lost your order number? (always 202)', body: findBody, response: { 202: findResponse, ...errorResponses } },
    },
    async (req, reply) => {
      rateLimiter.enforce(RATE_RULES.findEmail, req.body.email.toLowerCase());
      await findOrdersByEmail(app.ctx, req.body.email);
      return reply.code(202).send({ message: FIND_MESSAGE });
    },
  );
};

// ---------------------------------------------------------------- admin (already behind requireAdmin)

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['orders'];
  const userId = (req: { auth: { user: { id: number } } | null }): number => req.auth!.user.id;

  app.get('/orders', {
    schema: { tags, summary: 'List orders (filters, multi-status, sort, afterId)', querystring: orderListQuery, response: { 200: pageSchema(adminOrderSummarySchema), ...errorResponses } },
  }, async (req) => listOrders(app.ctx, req.query));

  app.get('/orders/counts', {
    schema: { tags, summary: 'Order counts per status (tab badges)', response: { 200: orderCountsResponse, ...errorResponses } },
  }, async () => orderCounts(app.ctx));

  app.post('/orders/bulk-status', {
    schema: { tags, summary: 'Move several orders to CONFIRMED, PACKED or DELIVERED (each validated on its own)', body: bulkStatusBody, response: { 200: bulkStatusResponse, ...errorResponses } },
  }, async (req) => bulkStatus(app.ctx, { ...req.body, userId: userId(req) }));

  app.post('/orders/export', {
    schema: { tags, summary: 'Export orders as CSV (filters or { ids })', body: exportBody, response: { 200: z.string().describe('text/csv'), ...errorResponses } },
  }, async (req, reply) => {
    const { holdExpired, ...rest } = req.body;
    const { csv, filename } = await exportOrdersCsv(app.ctx, { ...rest, holdExpired });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  app.post('/orders', {
    schema: { tags, summary: 'Create a manual order (same availability rules as customers)', body: manualOrderBody, response: { 201: adminOrderSchema, ...errorResponses } },
  }, async (req, reply) => {
    const b = req.body;
    const result = await placeOrder(app.ctx, {
      customer: { name: b.customer.name, email: b.customer.email ?? null, phone: b.customer.phone, whatsapp: b.customer.whatsapp ?? null, whatsappSameAsPhone: b.customer.whatsappSameAsPhone },
      delivery: { areaId: b.delivery.areaId ?? null, areaName: b.delivery.areaName, address: b.delivery.address, notes: b.delivery.notes ?? null },
      items: b.items,
      expectedTotalCents: b.expectedTotalCents,
      attribution: b.attribution ?? undefined,
      source: b.source,
      initialStatus: b.initialStatus,
      sendEmail: b.sendEmail,
      userId: userId(req),
    });
    return reply.code(201).send(await getAdminOrder(app.ctx, result.orderId));
  });

  app.get('/orders/:id', {
    schema: { tags, summary: 'Order detail', params: idParams, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => getAdminOrder(app.ctx, req.params.id));

  app.patch('/orders/:id', {
    schema: { tags, summary: 'Edit delivery details', params: idParams, body: deliveryPatchBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await updateDelivery(app.ctx, { orderId: req.params.id, delivery: req.body.delivery ?? {}, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.patch('/orders/:id/contact', {
    schema: { tags, summary: "Correct the order's contact snapshot (logged)", params: idParams, body: contactPatchBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await updateContact(app.ctx, { orderId: req.params.id, ...req.body, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.post('/orders/:id/status', {
    schema: { tags, summary: 'Change status (state machine)', params: idParams, body: statusBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    const r = await changeStatus(app.ctx, { orderId: req.params.id, ...req.body, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id, r.warnings);
  });

  app.post('/orders/:id/delivery', {
    schema: { tags, summary: 'Send out for delivery from PACKED, or correct the delivery number', params: idParams, body: deliveryNumberBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    const r = await setDeliveryNumber(app.ctx, { orderId: req.params.id, deliveryNumber: req.body.deliveryNumber, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id, r.warnings);
  });

  app.post('/orders/:id/cash', {
    schema: { tags, summary: 'Mark cash collected / settled', params: idParams, body: cashBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await setCash(app.ctx, { orderId: req.params.id, ...req.body, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.post('/orders/:id/notes', {
    schema: { tags, summary: 'Add an internal note', params: idParams, body: noteBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await addNote(app.ctx, { orderId: req.params.id, body: req.body.body, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.post('/orders/:id/extend-hold', {
    schema: { tags, summary: 'Extend the stock hold of a NEW order', params: idParams, body: extendHoldBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await extendHold(app.ctx, { orderId: req.params.id, hours: req.body.hours, userId: userId(req) });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.post('/orders/:id/email', {
    schema: { tags, summary: 'Resend a template or send a free-form e-mail', params: idParams, body: emailBody, response: { 200: adminOrderSchema, ...errorResponses } },
  }, async (req) => {
    await sendOrderEmail(app.ctx, { orderId: req.params.id, ...req.body });
    return getAdminOrder(app.ctx, req.params.id);
  });

  app.get('/orders/:id/whatsapp', {
    schema: { tags, summary: 'WhatsApp message and wa.me link for the customer', params: idParams, querystring: whatsappQuery, response: { 200: whatsappResponse, ...errorResponses } },
  }, async (req) => buildWhatsapp(app.ctx, req.params.id, req.query.template));
};

export const ordersModule: ModuleDef = { name: 'orders', publicRoutes, adminRoutes };
