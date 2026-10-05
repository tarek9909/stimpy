import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageQuerySchema, pageSchema } from '../../lib/http';
import { noContent } from '../auth/schemas';
import { campaignChannelSchema, crmCampaignFiltersSchema } from './campaigns.schemas';
import * as campaigns from './campaigns.service';

const tags = ['customers'];
const segmentSchema = z.object({ id: z.number().int(), name: z.string(), filters: crmCampaignFiltersSchema, createdAt: z.string(), updatedAt: z.string() });
const segmentCreate = z.strictObject({ name: z.string().trim().min(1).max(100), filters: crmCampaignFiltersSchema });
const segmentPatch = z.strictObject({ name: z.string().trim().min(1).max(100).optional(), filters: crmCampaignFiltersSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, 'Provide a name or filters to update.');
const target = z.strictObject({ segmentId: z.number().int().positive().optional(), filters: crmCampaignFiltersSchema.optional() })
  .refine((value) => (value.segmentId !== undefined) !== (value.filters !== undefined), 'Choose one saved segment or filter set.');
const previewBody = z.strictObject({ target, channel: campaignChannelSchema });
const campaignCreate = z.strictObject({ target, channel: campaignChannelSchema, templateKey: z.string().trim().min(1).max(60) });
const audienceSchema = z.object({
  matched: z.number().int(), eligible: z.number().int(),
  skipped: z.object({ noContact: z.number().int(), noConsent: z.number().int(), optedOut: z.number().int() }),
  cap: z.number().int(), overCap: z.number().int(),
  sample: z.array(z.object({ id: z.number().int(), name: z.string(), to: z.string() })),
});
const status = z.enum(['DRAFT', 'QUEUED', 'READY', 'COMPLETED', 'PARTIAL', 'FAILED']);
const campaignSummary = z.object({
  id: z.number().int(), segmentId: z.number().int().nullable(), segmentName: z.string().nullable(), channel: campaignChannelSchema,
  templateKey: z.string(), status, createdBy: z.string(), sentCount: z.number().int(), skippedCount: z.number().int(), failedCount: z.number().int(),
  createdAt: z.string(), confirmedAt: z.string().nullable(), completedAt: z.string().nullable(),
});
const recipient = z.object({
  id: z.number().int(), customerId: z.number().int(), customerName: z.string(),
  status: z.enum(['QUEUED', 'READY', 'SENT', 'SKIPPED', 'FAILED']), to: z.string().nullable(), error: z.string().nullable(),
  sentAt: z.string().nullable(), whatsappUrl: z.string().nullable(),
});
const campaignDetail = campaignSummary.extend({
  filters: crmCampaignFiltersSchema,
  recipients: pageSchema(recipient),
});
const campaignList = campaignSummary;
const markSentParams = z.object({ id: z.coerce.number().int().positive(), customerId: z.coerce.number().int().positive() });
const markSentResponse = z.object({ id: z.number().int(), customerId: z.number().int(), status: z.enum(['QUEUED', 'READY', 'SENT', 'SKIPPED', 'FAILED']), sentAt: z.string().nullable() });

export const crmCampaignRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/segments', {
    schema: { tags, summary: 'List saved CRM segments', querystring: pageQuerySchema, response: { 200: pageSchema(segmentSchema), ...errorResponses } },
  }, async (req) => campaigns.listSegments(app.ctx, req.query));

  app.post('/segments/preview', {
    schema: { tags, summary: 'Preview a CRM segment and channel-specific consent eligibility', body: previewBody, response: { 200: audienceSchema.extend({ segmentId: z.number().int().nullable() }), ...errorResponses } },
  }, async (req) => campaigns.previewTarget(app.ctx, req.body.target, req.body.channel));

  app.post('/segments', {
    schema: { tags, summary: 'Save a named CRM segment', body: segmentCreate, response: { 201: segmentSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await campaigns.createSegment(app.ctx, { ...req.body, userId: req.auth!.user.id })));

  app.patch('/segments/:id', {
    schema: { tags, summary: 'Edit a saved CRM segment', params: idParams, body: segmentPatch, response: { 200: segmentSchema, ...errorResponses } },
  }, async (req) => campaigns.updateSegment(app.ctx, req.params.id, req.body));

  app.delete('/segments/:id', {
    schema: { tags, summary: 'Delete a saved CRM segment', params: idParams, response: { 204: noContent, ...errorResponses } },
  }, async (req, reply) => {
    await campaigns.deleteSegment(app.ctx, req.params.id);
    return reply.code(204).send(null);
  });

  app.post('/campaigns/preview', {
    schema: { tags, summary: 'Preview a campaign audience with consent and cap counts', body: previewBody, response: { 200: audienceSchema.extend({ segmentId: z.number().int().nullable() }), ...errorResponses } },
  }, async (req) => campaigns.previewTarget(app.ctx, req.body.target, req.body.channel));

  app.get('/campaigns', {
    schema: { tags, summary: 'List CRM campaigns', querystring: pageQuerySchema, response: { 200: pageSchema(campaignList), ...errorResponses } },
  }, async (req) => campaigns.listCampaigns(app.ctx, req.query));

  app.post('/campaigns', {
    schema: { tags, summary: 'Create a campaign draft from a segment or filter set', body: campaignCreate, response: { 201: campaignSummary, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await campaigns.createCampaignDraft(app.ctx, { ...req.body, userId: req.auth!.user.id })));

  app.get('/campaigns/:id', {
    schema: { tags, summary: 'Read a campaign and paginated recipients', params: idParams, querystring: pageQuerySchema, response: { 200: campaignDetail, ...errorResponses } },
  }, async (req) => campaigns.getCampaign(app.ctx, req.params.id, req.query));

  app.post('/campaigns/:id/confirm', {
    schema: { tags, summary: 'Confirm a campaign, recheck audience consent and queue/generate recipients', params: idParams, response: { 200: campaignDetail, ...errorResponses } },
  }, async (req) => campaigns.confirmCampaign(app.ctx, req.params.id));

  app.post('/campaigns/:id/recipients/:customerId/sent', {
    schema: { tags, summary: 'Mark a WhatsApp campaign recipient as sent and add a customer timeline note', params: markSentParams, response: { 200: markSentResponse, ...errorResponses } },
  }, async (req) => campaigns.markWhatsappCampaignSent(app.ctx, { campaignId: req.params.id, customerId: req.params.customerId, userId: req.auth!.user.id }));
};
