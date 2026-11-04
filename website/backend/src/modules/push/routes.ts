import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { pushExternalId, sendPush } from '../../services/push';
import type { ModuleDef } from '../module';

const pushTestResponse = z
  .object({
    configured: z.boolean(),
    sent: z.boolean(),
    recipients: z.number().int().nullable(),
  })
  .meta({ id: 'PushTestResult' });

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // Sends a test notification to the signed-in user's devices. Use it to check the OneSignal setup end to end.
  app.post(
    '/push/test',
    {
      schema: {
        tags: ['push'],
        summary: 'Send a test push to the signed-in user (needs OneSignal configured and the app signed in)',
        response: { 200: pushTestResponse, ...errorResponses },
      },
    },
    async (req) => {
      const config = app.ctx.config.onesignal;
      if (!config) return { configured: false, sent: false, recipients: null };
      const result = await sendPush(config, {
        externalIds: [pushExternalId(req.auth!.user.id)],
        title: 'Stimpy Admin',
        body: 'Test notification: push is working.',
        data: { kind: 'test' },
      });
      req.log.info({ userId: req.auth!.user.id, sent: result.sent, recipients: result.recipients }, 'test push sent');
      return { configured: true, sent: result.sent, recipients: result.recipients };
    },
  );
};

export const pushModule: ModuleDef = { name: 'push', adminRoutes };
