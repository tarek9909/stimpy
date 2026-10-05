import fp from 'fastify-plugin';
import { pathOf } from './route-group';

/**
 * One structured log line per request (method, path, route, status, duration, request id, admin user id).
 * Deliberately NOT logged: query strings, request bodies (never for /auth and /orders), cookies, phones, e-mails.
 */
export default fp(async (app) => {
  app.addHook('onSend', async (_req, reply, payload) => {
    if (process.env.E2E_API_SERVER_TIMING === '1') {
      const durationMs = Math.round(reply.elapsedTime * 10) / 10;
      const existing = reply.getHeader('Server-Timing');
      const prior = existing === undefined ? '' : String(existing);
      reply.header('Server-Timing', [prior, `app;dur=${durationMs}`].filter(Boolean).join(', '));
    }
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    const durationMs = Math.round(reply.elapsedTime * 10) / 10;
    req.log.info(
      {
        method: req.method,
        path: pathOf(req.url),
        route: req.routeOptions?.url ?? null,
        status: reply.statusCode,
        durationMs,
        requestId: req.id,
        userId: req.auth?.user.id ?? null,
      },
      'request completed',
    );
  });
}, { name: 'request-log' });
