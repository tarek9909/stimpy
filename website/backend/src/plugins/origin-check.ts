import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';
import { groupOf } from './route-group';

/**
 * CSRF defence (security-and-testing 2.2): every non-GET request to /auth or /admin that carries an Origin header must
 * carry one of the ADMIN_URL origins. Requests without Origin (scripts, tests) pass: browsers always send it on
 * cross-site POSTs. Combined with the SameSite=Lax cookie there is no custom CSRF header.
 */
export default fp(async (app) => {
  const adminOrigins = new Set(app.ctx.config.adminUrls);
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (groupOf(req.url) !== 'admin') return;
    const origin = req.headers.origin;
    if (origin !== undefined && !adminOrigins.has(origin)) {
      throw AppError.forbidden('This request came from an address that is not allowed.');
    }
  });
}, { name: 'origin-check' });
