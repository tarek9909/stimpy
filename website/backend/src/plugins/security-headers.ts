import fp from 'fastify-plugin';
import { groupOf, pathOf } from './route-group';

/**
 * Helmet-style headers (helmet is not installed; these are the defaults that matter for a JSON API) plus the
 * documented CSP `default-src 'none'; frame-ancestors 'none'`. Also the cache policy:
 * `/admin`, `/auth` and every non-GET are `no-store`; public GET routes opt in with `publicCache(reply)`.
 */
export default fp(async (app) => {
  const secure = app.ctx.config.cookieSecure;
  app.addHook('onSend', async (req, reply, payload) => {
    const path = pathOf(req.url);
    const group = groupOf(req.url);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (secure) reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');

    if (group === 'uploads') {
      // Static files: embeddable cross-origin (images/video/GLB), never executed.
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      if (!reply.hasHeader('Content-Disposition')) reply.header('Content-Disposition', 'inline');
      return payload;
    }

    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    reply.header('X-Frame-Options', 'DENY');
    // Swagger UI needs scripts/styles; it sets its own CSP.
    if (!(path === '/docs' || path.startsWith('/docs/'))) {
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    if (!reply.hasHeader('Cache-Control')) {
      if (group === 'admin' || req.method !== 'GET') reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
}, { name: 'security-headers' });
