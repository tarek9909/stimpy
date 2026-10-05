import fp from 'fastify-plugin';
import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

/** Exposes `app.prisma` (same client as `app.ctx.prisma`) and disconnects on close if the app created the client. */
export default fp<{ ownsClient: boolean }>(async (app, opts) => {
  app.decorate('prisma', app.ctx.prisma);
  if (opts.ownsClient) app.addHook('onClose', async () => app.ctx.prisma.$disconnect());
}, { name: 'prisma' });
