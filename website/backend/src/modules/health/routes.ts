import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { now } from '../../lib/clock';
import { iso } from '../../lib/dates';
import { noStore } from '../../lib/http';
import type { ModuleDef } from '../module';

const healthBody = z.object({ ok: z.boolean(), time: z.string() });

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /health: DB check, `time` in milliseconds (clock offset for countdowns), never cached, CORS-enabled.
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check and server time',
        response: { 200: healthBody, 503: healthBody },
      },
    },
    async (req, reply) => {
      noStore(reply);
      try {
        await app.ctx.prisma.$queryRaw`SELECT 1`;
        return { ok: true, time: iso(now()) };
      } catch (err) {
        req.log.error({ err: { message: (err as Error).message } }, 'health check: database unreachable');
        return reply.code(503).send({ ok: false, time: iso(now()) });
      }
    },
  );
};

export const healthModule: ModuleDef = { name: 'health', publicRoutes };
