import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { ADMIN_SETTING_GROUPS, settingReadSchemas, settingsPatchShape, type SettingsMap } from '../../services/settings';
import type { ModuleDef } from '../module';

// GET/PATCH /admin/settings (api-reference 5.12). Delivery settings live under /admin/settings/delivery (deliveries module).
const settingsResponse = z
  .object({
    business: settingReadSchemas.business,
    orders: settingReadSchemas.orders,
    email: settingReadSchemas.email,
    notifications: settingReadSchemas.notifications,
  })
  .meta({ id: 'Settings' });

const settingsPatchBody = z.strictObject({
  business: settingsPatchShape.business.optional(),
  orders: settingsPatchShape.orders.optional(),
  email: settingsPatchShape.email.optional(),
  notifications: settingsPatchShape.notifications.optional(),
});

const pick = (all: SettingsMap): z.infer<typeof settingsResponse> => {
  const out = {} as Record<string, unknown>;
  for (const g of ADMIN_SETTING_GROUPS) out[g] = all[g];
  return out as z.infer<typeof settingsResponse>;
};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/settings',
    { schema: { tags: ['settings'], summary: 'Typed settings groups', response: { 200: settingsResponse, ...errorResponses } } },
    async () => pick(await app.ctx.settings.getAll()),
  );

  app.patch(
    '/settings',
    {
      schema: {
        tags: ['settings'],
        summary: 'Partial update of settings groups',
        body: settingsPatchBody,
        response: { 200: settingsResponse, ...errorResponses },
      },
    },
    async (req, reply) => {
      const all = await app.ctx.settings.update(req.body);
      req.log.info({ groups: Object.keys(req.body), userId: req.auth?.user.id }, 'settings changed');
      void reply;
      return pick(all);
    },
  );
};

export const settingsModule: ModuleDef = { name: 'settings', adminRoutes };
