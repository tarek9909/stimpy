import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { RATE_RULES, rateLimiter, type RateRule } from '../lib/rate-limiter';
import { requestGroup } from './route-group';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * onRequest hook factory: `{ onRequest: app.limit(RATE_RULES.track) }` limits by client IP, or by `keyFn(request)`.
     * For limits keyed by something in the body (phone, e-mail) call `rateLimiter.enforce(rule, key)` in the service/route.
     */
    limit: (rule: RateRule, keyFn?: (req: FastifyRequest) => string) => (req: FastifyRequest) => Promise<void>;
  }
}

/**
 * In-memory rate limiting (lib/rate-limiter.ts). Global rule here: all public GETs, 300 per minute per IP.
 * 429 handling (Retry-After header + details.retryAfterSeconds) lives in the error handler.
 */
export default fp(async (app) => {
  app.decorate('limit', (rule: RateRule, keyFn?: (req: FastifyRequest) => string) => async (req: FastifyRequest) => {
    rateLimiter.enforce(rule, keyFn ? keyFn(req) : req.ip);
  });

  app.addHook('onRequest', async (req) => {
    if (req.method !== 'GET' || requestGroup(req) !== 'public') return;
    rateLimiter.enforce(RATE_RULES.publicRead, req.ip);
  });
}, { name: 'rate-limit' });
