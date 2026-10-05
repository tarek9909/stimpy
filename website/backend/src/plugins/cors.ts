import fp from 'fastify-plugin';
import { groupOf } from './route-group';

/**
 * CORS per the wiring matrix (wiring/README.md 5.3), implemented by hand because the rules differ per route group:
 *  - public `/api/v1/*`: WEB_URL + ADMIN_URL origins, no credentials, GET/POST
 *  - `/api/v1/auth/*`, `/api/v1/admin/*`: ADMIN_URL origins only (explicit origin, never `*`), credentials, all methods
 *  - `/uploads/*`: `*`, GET/HEAD (WebGL textures)
 * Requests without an Origin header (curl, server-side fetch, tests) are untouched. Disallowed origins simply get no
 * CORS headers, so the browser blocks them.
 */
const ALLOWED_HEADERS = 'Content-Type, Idempotency-Key';
const EXPOSED = 'X-Request-Id, Retry-After, Date';

export default fp(async (app) => {
  const { webUrls, adminUrls } = app.ctx.config;
  const publicOrigins = new Set([...webUrls, ...adminUrls]);
  const adminOrigins = new Set(adminUrls);

  app.addHook('onRequest', async (req, reply) => {
    const group = groupOf(req.url);
    if (group === 'other') return;
    const origin = req.headers.origin;
    const isPreflight = req.method === 'OPTIONS' && typeof req.headers['access-control-request-method'] === 'string';

    if (group === 'uploads') {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Expose-Headers', EXPOSED);
      if (isPreflight) {
        reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        reply.header('Access-Control-Max-Age', '600');
        return reply.code(204).send();
      }
      return;
    }

    reply.header('Vary', 'Origin');
    if (!origin) return;
    const allowed = group === 'admin' ? adminOrigins.has(origin) : publicOrigins.has(origin);

    if (allowed) {
      reply.header('Access-Control-Allow-Origin', origin);
      if (group === 'admin') reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Expose-Headers', group === 'admin' ? `${EXPOSED}, Content-Disposition` : EXPOSED);
    }
    if (isPreflight) {
      if (allowed) {
        reply.header('Access-Control-Allow-Methods', group === 'admin' ? 'GET, POST, PUT, PATCH, DELETE, OPTIONS' : 'GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        reply.header('Access-Control-Max-Age', '600');
      }
      return reply.code(204).send();
    }
  });
}, { name: 'cors' });
