import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageQuerySchema, pageSchema } from '../../lib/http';
import { adminOrderSummarySchema } from '../../services/order-summary';
import { noContent } from '../auth/schemas';
import type { ModuleDef } from '../module';
import * as bulk from './bulk';
import * as svc from './service';
import { crmCampaignRoutes } from './campaigns.routes';

// Customers (api-reference 5.7). `/admin/subscribers` belongs to work package A (drops module).
const tags = ['customers'];

export const customerRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  whatsapp: z.string(),
  ordersCount: z.number().int(),
  totalSpentCents: z.number().int(),
  lastOrderAt: z.string().nullable(),
  returnedCount: z.number().int(),
  warning: z.boolean(),
  areaName: z.string().nullable(),
  optedOut: z.boolean(),
  emailConsent: z.boolean(),
  whatsappConsent: z.boolean(),
  unsubscribedAt: z.string().nullable(),
});
const customerDetail = customerRowSchema.extend({ notes: z.string().nullable(), orders: z.array(adminOrderSummarySchema) });
const customerListRowSchema = customerRowSchema.extend({
  tags: z.array(z.object({ id: z.number().int(), name: z.string(), color: z.string().nullable() })),
});
const customerDuplicateSchema = z.object({ match: z.enum(['EMAIL', 'PHONE']), value: z.string(), customers: z.array(customerRowSchema) });
const exportRecord = z.record(z.string(), z.unknown());
const customerExportSchema = z.object({ customer: exportRecord, orders: z.array(exportRecord), emailLogs: z.array(exportRecord), subscribers: z.array(exportRecord), campaignRecipients: z.array(exportRecord) });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const yesNo = z.enum(['yes', 'no']).transform((v) => v === 'yes');
const cents = z.coerce.number().int().min(0).max(1_000_000_000);

const listQuery = pageQuerySchema.extend({
  filter: z.enum(['all', 'repeat']).default('all'),
  q: z.string().trim().max(120).optional(),
  sort: z.string().max(40).optional(),
  areaId: z.coerce.number().int().positive().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  ordersMin: z.coerce.number().int().min(0).max(100_000).optional(),
  ordersMax: z.coerce.number().int().min(0).max(100_000).optional(),
  spentMinCents: cents.optional(),
  spentMaxCents: cents.optional(),
  lastOrderBefore: day.optional(),
  lastOrderAfter: day.optional(),
  hasEmail: yesNo.optional(),
  returned: yesNo.optional(),
  optedOut: yesNo.optional(),
  relationship: z.enum(['SUBSCRIBED_NEVER_BOUGHT', 'BOUGHT_NOT_SUBSCRIBED']).optional(),
});

/** The same filters as the list, as a JSON body (what "message everyone matching" sends). */
const filtersBody = z.strictObject({
  filter: z.enum(['all', 'repeat']).optional(),
  q: z.string().trim().max(120).optional(),
  areaId: z.number().int().positive().optional(),
  tagId: z.number().int().positive().optional(),
  ordersMin: z.number().int().min(0).optional(),
  ordersMax: z.number().int().min(0).optional(),
  spentMinCents: z.number().int().min(0).optional(),
  spentMaxCents: z.number().int().min(0).optional(),
  lastOrderBefore: day.optional(),
  lastOrderAfter: day.optional(),
  hasEmail: z.boolean().optional(),
  returned: z.boolean().optional(),
  optedOut: z.boolean().optional(),
  relationship: z.enum(['SUBSCRIBED_NEVER_BOUGHT', 'BOUGHT_NOT_SUBSCRIBED']).optional(),
});
const targetBody = z
  .strictObject({ ids: z.array(z.number().int().positive()).min(1).max(1000).optional(), filters: filtersBody.optional() })
  .refine((t) => (t.ids !== undefined) !== (t.filters !== undefined), 'Send either ids or filters.');
const skippedSchema = z.object({ noContact: z.number().int(), noConsent: z.number().int(), optedOut: z.number().int() });
const bulkPreviewBody = z.strictObject({ target: targetBody, channel: z.enum(['EMAIL', 'WHATSAPP']) });
const bulkPreviewResponse = z.object({
  matched: z.number().int(),
  eligible: z.number().int(),
  skipped: skippedSchema,
  cap: z.number().int(),
  overCap: z.number().int(),
  sample: z.array(z.object({ id: z.number().int(), name: z.string(), to: z.string() })),
});
const bulkEmailBody = z.strictObject({ target: targetBody, subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) });
const bulkEmailResponse = z.object({ queued: z.number().int(), skipped: skippedSchema, overCap: z.number().int() });
const bulkWhatsappBody = z.strictObject({ target: targetBody, text: z.string().trim().min(1).max(2000) });
const bulkWhatsappResponse = z.object({
  items: z.array(z.object({ customerId: z.number().int(), name: z.string(), to: z.string(), text: z.string(), url: z.string() })),
  skipped: skippedSchema,
  overCap: z.number().int(),
});

const optionalEmail = z
  .string()
  .trim()
  .max(190)
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().email('Enter a valid email address.').nullable())
  .nullable();

const patchBody = z.strictObject({
  name: z.string().trim().min(2).max(80).optional(),
  email: optionalEmail.optional(),
  whatsapp: z.string().trim().min(1).max(40).optional(),
  marketingOptOut: z.boolean().optional(),
  emailConsent: z.boolean().optional(),
  whatsappConsent: z.boolean().optional(),
  notes: z
    .string()
    .max(2000)
    .transform((v) => (v.trim() === '' ? null : v))
    .nullable()
    .optional(),
});
const mergeBody = z.strictObject({ duplicateCustomerId: z.number().int().positive() });

export const customerProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  whatsapp: z.string(),
  areaId: z.number().int().nullable(),
  area: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  optedOut: z.boolean(),
  emailConsent: z.boolean(),
  whatsappConsent: z.boolean(),
  unsubscribedAt: z.string().nullable(),
  consentUpdatedAt: z.string().nullable(),
  firstSource: z.string().nullable(),
  firstUtmSource: z.string().nullable(),
  firstUtmMedium: z.string().nullable(),
  firstUtmCampaign: z.string().nullable(),
  firstUtmContent: z.string().nullable(),
  firstUtmTerm: z.string().nullable(),
  firstReferrer: z.string().nullable(),
  firstTouchAt: z.string().nullable(),
  signups: z.array(z.object({ id: z.number().int(), channel: z.enum(['EMAIL', 'WHATSAPP']), dropName: z.string().nullable(), signedUpAt: z.string() })),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  orderCount: z.number().int(),
  lifetimeValueCents: z.number().int(),
  averageOrderValueCents: z.number().int(),
  firstOrderAt: z.string().nullable(),
  lastOrderAt: z.string().nullable(),
  returnedCount: z.number().int(),
  warning: z.boolean(),
  favouriteStimpie: z.string().nullable(),
  favouriteStimpieType: z.string().nullable(),
  favouriteColor: z.string().nullable(),
  favouriteColorHex: z.string().nullable(),
  recentOrders: z.array(adminOrderSummarySchema),
}).meta({ id: 'CustomerProfile' });

export const timelineItemType = z.enum(['ORDER', 'ORDER_EVENT', 'ORDER_NOTE', 'EMAIL', 'FOLLOW_UP', 'CUSTOMER_NOTE']);

export const timelineItemSchema = z.object({
  id: z.string(),
  type: timelineItemType,
  at: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  refId: z.string().nullable(),
}).meta({ id: 'CustomerTimelineItem' });

export const timelineResponseSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
}).meta({ id: 'CustomerTimelineResponse' });

export const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().max(200).optional(),
});

const followUpDueQuery = z.object({
  due: z.enum(['today', 'overdue', 'upcoming']).default('upcoming'),
  customerId: z.coerce.number().int().positive().optional(),
  ...pageQuerySchema.shape,
});
const followUpSchema = z.object({
  id: z.number().int(),
  customerId: z.number().int(),
  customerName: z.string(),
  userId: z.number().int(),
  userName: z.string(),
  dueAt: z.string(),
  note: z.string(),
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const followUpCreateBody = z.strictObject({
  customerId: z.number().int().positive(),
  dueAt: z.string().datetime({ offset: true }),
  note: z.string().trim().min(1).max(1000),
});
const followUpPatchBody = z.strictObject({
  dueAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
  done: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');
const tagSchema = z.object({ id: z.number().int(), name: z.string(), color: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
const tagCreateBody = z.strictObject({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() });
const tagPatchBody = z.strictObject({ name: z.string().trim().min(1).max(80).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');
const noteSchema = z.object({ id: z.number().int(), customerId: z.number().int(), userId: z.number().int(), userName: z.string(), body: z.string(), createdAt: z.string() });
const noteBody = z.strictObject({ body: z.string().trim().min(1).max(2000) });
const unsubscribeTokenParams = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/unsubscribe/:token', {
    schema: { tags, summary: 'Validate a customer unsubscribe link before showing the confirmation page', params: unsubscribeTokenParams, response: { 200: z.object({ valid: z.literal(true) }), ...errorResponses } },
  }, async (req) => svc.validateUnsubscribeToken(app.ctx, req.params.token));

  app.post('/unsubscribe/:token/confirm', {
    schema: { tags, summary: 'Confirm email unsubscribe (idempotently revokes email consent)', params: unsubscribeTokenParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.confirmEmailUnsubscribe(app.ctx, req.params.token);
    return reply.code(204).send(null);
  });
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(crmCampaignRoutes);
  app.get('/customer-tags', {
    schema: { tags, summary: 'List customer tags', querystring: pageQuerySchema, response: { 200: pageSchema(tagSchema), ...errorResponses } },
  }, async (req) => svc.listCustomerTags(app.ctx, req.query));

  app.post('/customer-tags', {
    schema: { tags, summary: 'Create a customer tag', body: tagCreateBody, response: { 201: tagSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createCustomerTag(app.ctx, req.body)));

  app.patch('/customer-tags/:id', {
    schema: { tags, summary: 'Rename or recolor a customer tag', params: idParams, body: tagPatchBody, response: { 200: tagSchema, ...errorResponses } },
  }, async (req) => svc.updateCustomerTag(app.ctx, req.params.id, req.body));

  app.delete('/customer-tags/:id', {
    schema: { tags, summary: 'Delete a customer tag and detach it from customers', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteCustomerTag(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  app.get('/follow-ups', {
    schema: { tags, summary: 'List incomplete follow-ups due today, overdue or upcoming in the business timezone', querystring: followUpDueQuery, response: { 200: pageSchema(followUpSchema), ...errorResponses } },
  }, async (req) => svc.listFollowUps(app.ctx, req.query));

  app.post('/follow-ups', {
    schema: { tags, summary: 'Create a customer follow-up', body: followUpCreateBody, response: { 201: followUpSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createFollowUp(app.ctx, { ...req.body, userId: req.auth!.user.id })));

  app.patch('/follow-ups/:id', {
    schema: { tags, summary: 'Edit, complete or reopen a customer follow-up', params: idParams, body: followUpPatchBody, response: { 200: followUpSchema, ...errorResponses } },
  }, async (req) => svc.updateFollowUp(app.ctx, req.params.id, req.body));

  app.delete('/follow-ups/:id', {
    schema: { tags, summary: 'Delete a customer follow-up', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.deleteFollowUp(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  app.get('/customers', {
    schema: { tags, summary: 'List customers (filter=all|repeat, q, sort)', querystring: listQuery, response: { 200: pageSchema(customerListRowSchema), ...errorResponses } },
  }, async (req) => svc.listCustomers(app.ctx, req.query));

  app.post('/customers/bulk/preview', {
    schema: { tags, summary: 'Who a bulk email or WhatsApp send would reach: channel consent, skipped reasons, cap and sample', body: bulkPreviewBody, response: { 200: bulkPreviewResponse, ...errorResponses } },
  }, async (req) => bulk.previewBulk(app.ctx, req.body));

  app.post('/customers/bulk/email', {
    schema: { tags, summary: 'Queue one consented email per eligible customer with an unsubscribe link', body: bulkEmailBody, response: { 200: bulkEmailResponse, ...errorResponses } },
  }, async (req) => bulk.sendBulkEmail(app.ctx, req.body));

  app.post('/customers/bulk/whatsapp', {
    schema: { tags, summary: 'Per-customer wa.me links for consented WhatsApp customers (never sent automatically)', body: bulkWhatsappBody, response: { 200: bulkWhatsappResponse, ...errorResponses } },
  }, async (req) => bulk.buildBulkWhatsapp(app.ctx, req.body));

  app.get('/customers/duplicates', {
    schema: { tags, summary: 'Case-insensitive duplicate customer groups by email or normalized phone', querystring: pageQuerySchema, response: { 200: pageSchema(customerDuplicateSchema), ...errorResponses } },
  }, async (req) => svc.listCustomerDuplicates(app.ctx, req.query));

  app.get('/customers/:id/export', {
    schema: { tags, summary: 'Export all customer profile, order, subscriber and email-log data as JSON', params: idParams, response: { 200: customerExportSchema, ...errorResponses } },
  }, async (req) => svc.exportCustomerData(app.ctx, req.params.id));

  app.post('/customers/:id/merge', {
    schema: { tags, summary: 'Merge a duplicate profile into this surviving customer atomically', params: idParams, body: mergeBody, response: { 200: customerDetail, ...errorResponses } },
  }, async (req) => svc.mergeCustomer(app.ctx, req.params.id, req.body.duplicateCustomerId, req.auth!.user.id));

  app.delete('/customers/:id/personal-data', {
    schema: { tags, summary: 'Anonymize customer identifiers and free text while preserving accounting orders', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.eraseCustomerPersonalData(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  app.get('/customers/:id/profile', {
    schema: { tags, summary: 'Customer profile with aggregates, favourites, and recent orders', params: idParams, response: { 200: customerProfileSchema, ...errorResponses } },
  }, async (req) => svc.getCustomerProfile(app.ctx, req.params.id));

  app.get('/customers/:id/timeline', {
    schema: { tags, summary: 'Customer activity timeline (cursor-paginated)', params: idParams, querystring: timelineQuerySchema, response: { 200: timelineResponseSchema, ...errorResponses } },
  }, async (req) => svc.getCustomerTimeline(app.ctx, req.params.id, req.query));

  app.get('/customers/:id/tags', {
    schema: { tags, summary: 'List tags attached to a customer', params: idParams, response: { 200: z.array(tagSchema), ...errorResponses } },
  }, async (req) => svc.listCustomerTagsForCustomer(app.ctx, req.params.id));

  app.post('/customers/:id/tags/:tagId', {
    schema: { tags, summary: 'Attach a tag to a customer (idempotent)', params: z.object({ id: z.coerce.number().int().positive(), tagId: z.coerce.number().int().positive() }), response: { 200: z.array(tagSchema), ...errorResponses } },
  }, async (req) => svc.attachCustomerTag(app.ctx, req.params.id, req.params.tagId));

  app.delete('/customers/:id/tags/:tagId', {
    schema: { tags, summary: 'Detach a tag from a customer', params: z.object({ id: z.coerce.number().int().positive(), tagId: z.coerce.number().int().positive() }), response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await svc.detachCustomerTag(app.ctx, req.params.id, req.params.tagId);
    return reply.code(204).send(null);
  });

  app.get('/customers/:id/notes', {
    schema: { tags, summary: 'List customer notes (newest first)', params: idParams, querystring: pageQuerySchema, response: { 200: pageSchema(noteSchema), ...errorResponses } },
  }, async (req) => svc.listCustomerNotes(app.ctx, req.params.id, req.query));

  app.post('/customers/:id/notes', {
    schema: { tags, summary: 'Add an append-only customer note', params: idParams, body: noteBody, response: { 201: noteSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.addCustomerNote(app.ctx, { customerId: req.params.id, userId: req.auth!.user.id, ...req.body })));

  app.get('/customers/:id', {
    schema: { tags, summary: 'Customer with notes and orders', params: idParams, response: { 200: customerDetail, ...errorResponses } },
  }, async (req) => svc.getCustomer(app.ctx, req.params.id));

  app.patch('/customers/:id', {
    schema: { tags, summary: 'Edit name, email, WhatsApp or notes (phone is the identity key)', params: idParams, body: patchBody, response: { 200: customerDetail, ...errorResponses } },
  }, async (req) => svc.updateCustomer(app.ctx, req.params.id, req.body));
};

export const customersModule: ModuleDef = { name: 'customers', publicRoutes, adminRoutes };
