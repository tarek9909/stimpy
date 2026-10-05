import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, pageQuerySchema, pageSchema } from '../../lib/http';
import { retryFailedEmail } from '../../services/email-queue';
import type { ModuleDef } from '../module';
import * as svc from './service';

const tags = ['comms'];
const keyParams = z.object({ key: z.string().min(1).max(60) });
const emailParam = z.string().trim().email('Enter a valid email address.').max(190);

const emailTemplateSchema = z
  .object({ key: z.string(), name: z.string(), subject: z.string(), body: z.string(), enabled: z.boolean(), placeholders: z.array(z.string()) })
  .meta({ id: 'EmailTemplate' });
const emailTemplateBody = z.strictObject({ subject: z.string().trim().min(1).max(200), body: z.string().min(1).max(5000), enabled: z.boolean() });
const previewBody = z.strictObject({ subject: z.string().max(200).optional(), body: z.string().max(5000).optional() });
const previewResponse = z.object({ subject: z.string(), text: z.string(), html: z.string() });
const testBody = z.strictObject({ to: emailParam });
const queuedResponse = z.object({ id: z.number().int() });

const whatsappTemplateSchema = z
  .object({ key: z.string(), name: z.string(), body: z.string(), placeholders: z.array(z.string()) })
  .meta({ id: 'WhatsappTemplate' });
const whatsappPutBody = z
  .array(z.strictObject({ key: z.string().max(60), name: z.string().max(100).optional(), body: z.string().trim().min(1).max(2000), placeholders: z.array(z.string()).optional() }))
  .min(1)
  .max(20);

const emailLogQuery = pageQuerySchema.extend({
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
  orderId: z.coerce.number().int().min(1).optional(),
  template: z.string().max(60).optional(),
});
const emailLogItem = z
  .object({
    id: z.number().int(),
    at: z.string(),
    to: z.string(),
    template: z.string(),
    subject: z.string(),
    status: z.enum(['PENDING', 'SENT', 'FAILED']),
    attempts: z.number().int(),
    error: z.string().nullable(),
    orderNumber: z.string().nullable(),
  })
  .meta({ id: 'EmailLogItem' });

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/email-templates', {
    schema: { tags, summary: 'List the six customer e-mail templates', response: { 200: z.array(emailTemplateSchema), ...errorResponses } },
  }, async () => svc.listEmailTemplates(app.ctx));

  app.put('/email-templates/:key', {
    schema: { tags, summary: 'Save an e-mail template (unknown placeholders are rejected)', params: keyParams, body: emailTemplateBody, response: { 200: emailTemplateSchema, ...errorResponses } },
  }, async (req) => svc.updateEmailTemplate(app.ctx, req.params.key, req.body));

  app.post('/email-templates/:key/preview', {
    schema: { tags, summary: 'Render a template (saved or unsaved edits) through the real layout with sample data', params: keyParams, body: previewBody, response: { 200: previewResponse, ...errorResponses } },
  }, async (req, reply) => reply.code(200).send(await svc.previewEmailTemplate(app.ctx, req.params.key, req.body)));

  app.post('/email-templates/:key/test', {
    schema: { tags, summary: 'Queue a sample e-mail (ignores the master switch)', params: keyParams, body: testBody, response: { 202: queuedResponse, ...errorResponses } },
  }, async (req, reply) => {
    const queued = await svc.sendTestEmail(app.ctx, req.params.key, req.body.to);
    req.log.info({ template: req.params.key, emailLogId: queued.id }, 'test email queued');
    return reply.code(202).send(queued);
  });

  app.get('/whatsapp-templates', {
    schema: { tags, summary: 'List the four WhatsApp templates', response: { 200: z.array(whatsappTemplateSchema), ...errorResponses } },
  }, async () => svc.listWhatsappTemplates(app.ctx));

  app.put('/whatsapp-templates', {
    schema: { tags, summary: 'Save WhatsApp templates (array as returned by GET)', body: whatsappPutBody, response: { 200: z.array(whatsappTemplateSchema), ...errorResponses } },
  }, async (req) => svc.updateWhatsappTemplates(app.ctx, req.body));

  app.get('/email-log', {
    schema: { tags, summary: 'E-mail log (queue state of every message)', querystring: emailLogQuery, response: { 200: pageSchema(emailLogItem), ...errorResponses } },
  }, async (req) => svc.listEmailLog(app.ctx, req.query));

  app.post('/email-log/:id/retry', {
    schema: { tags, summary: 'Retry a FAILED e-mail', params: z.object({ id: z.coerce.number().int().min(1) }), response: { 202: z.object({ id: z.number().int(), status: z.literal('PENDING') }), ...errorResponses } },
  }, async (req, reply) => reply.code(202).send(await retryFailedEmail(app.ctx, req.params.id)));
};

export const commsModule: ModuleDef = { name: 'comms', adminRoutes };
