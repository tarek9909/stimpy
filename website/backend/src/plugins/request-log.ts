import fp from 'fastify-plugin';
import { pathOf } from './route-group';

/**
 * One compact log line per request (method, path, status, duration).
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
    // A single message keeps pino-pretty from printing request fields on separate lines.
    app.log.info(`${req.method} ${pathOf(req.url)} -> ${reply.statusCode} (${durationMs}ms)`);
  });
}, { name: 'request-log' });
