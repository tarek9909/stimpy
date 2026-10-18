import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { serializerCompiler, validatorCompiler, type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from './config';
import { createContext, type AppContext } from './context';
import { loggerOptions } from './lib/logger';
import { rebaseUploadUrlsInJson } from './lib/upload-url';
import { modules as registeredModules } from './modules';
import type { ModuleDef } from './modules/module';
import authSession from './plugins/auth-session';
import cors from './plugins/cors';
import errorHandler from './plugins/error-handler';
import openapi from './plugins/openapi';
import originCheck from './plugins/origin-check';
import prismaPlugin from './plugins/prisma';
import rateLimit from './plugins/rate-limit';
import requestId from './plugins/request-id';
import requestLog from './plugins/request-log';
import { API_PREFIX } from './plugins/route-group';
import securityHeaders from './plugins/security-headers';
import type { RouteInfo } from './types';
import './types';

export type BuildAppOptions = {
  config: Config;
  /** Replace parts of the context (tests inject a recording e-mail transport, a shared Prisma client, ...). */
  context?: Partial<AppContext>;
  /** Extra modules appended to the registry (test seam: error-handler tests register probe routes). */
  extraModules?: ModuleDef[];
  /** Capture log output (tests). */
  logStream?: NodeJS.WritableStream;
};

/** JSON bodies are limited to 100 KB on every route except uploads (integrations 6). */
export const JSON_BODY_LIMIT = 100 * 1024;

/** Builds the Fastify instance. Used by server.ts, by scripts (OpenAPI generation) and by every test. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const ctx = createContext(config, opts.context);
  const ownsPrisma = !opts.context?.prisma;
  const modules = [...registeredModules, ...(opts.extraModules ?? [])];

  const app = Fastify({
    logger: loggerOptions(config, opts.logStream),
    // Fastify's own request lines are off; plugins/request-log.ts writes one compact line per request.
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    requestIdHeader: false, // never trust a client-supplied id
    trustProxy: config.trustProxy,
    bodyLimit: JSON_BODY_LIMIT,
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 200 },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('ctx', ctx);
  app.decorate('routeList', [] as RouteInfo[]);
  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.url.startsWith(`${API_PREFIX}/`) || !String(reply.getHeader('content-type') ?? '').includes('application/json')) return payload;
    const text = typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : null;
    if (text === null) return payload;
    const rebased = rebaseUploadUrlsInJson(text, config.apiPublicUrl);
    return rebased === text ? payload : rebased;
  });
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const schema = (route.schema ?? {}) as { tags?: string[]; response?: Record<string, unknown> };
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      app.routeList.push({
        method,
        url: route.url,
        admin: route.url.startsWith(`${API_PREFIX}/admin/`),
        tags: schema.tags ?? [],
        hasResponseSchema: Object.keys(schema.response ?? {}).some((k) => /^2/.test(k)),
      });
    }
  });

  // JSON parser: tolerate an empty body (clients often send Content-Type: application/json on body-less POSTs),
  // reject malformed JSON with VALIDATION_ERROR (see error handler) and drop `__proto__` keys.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: JSON_BODY_LIMIT }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text, (k, v: unknown) => (k === '__proto__' ? undefined : v)));
    } catch {
      const err = new Error('Invalid JSON') as Error & { code: string; statusCode: number };
      err.code = 'FST_ERR_CTP_INVALID_JSON_BODY';
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Order matters: hooks run in registration order.
  await app.register(errorHandler);
  await app.register(requestId);
  await app.register(prismaPlugin, { ownsClient: ownsPrisma });
  await app.register(openapi);
  await app.register(cors);
  await app.register(originCheck);
  await app.register(rateLimit);
  await app.register(securityHeaders);
  await app.register(authSession);
  await app.register(requestLog);

  // Uploaded files: read-only, one-year immutable cache (names are random), CORS * (added by the cors plugin).
  mkdirSync(config.uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    list: false,
    maxAge: '1y',
    immutable: true,
    cacheControl: true,
  });

  // ---- API routes under /api/v1
  const adminScope: FastifyPluginAsyncZod = async (admin) => {
    admin.addHook('onRequest', admin.requireAdmin);
    // Document the session requirement in OpenAPI for every admin route.
    admin.addHook('onRoute', (route) => {
      const schema = (route.schema ?? {}) as Record<string, unknown>;
      route.schema = { ...schema, security: [{ cookieAuth: [] }] } as typeof route.schema;
    });
    for (const m of modules) if (m.adminRoutes) await admin.register(m.adminRoutes);
  };

  await app.register(
    async (api) => {
      for (const m of modules) if (m.publicRoutes) await api.register(m.publicRoutes);
      await api.register(adminScope, { prefix: '/admin' });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
