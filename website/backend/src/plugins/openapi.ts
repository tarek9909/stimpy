import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import { API_PREFIX } from './route-group';

/** Swagger UI at /docs, OpenAPI JSON at /docs/json. Zod schemas are the only source (validation, types, docs). */
export const OPENAPI_TAGS = [
  'health', 'auth', 'options', 'catalog', 'uploads', 'drops', 'orders', 'stock', 'deliveries', 'customers',
  'finance', 'insights', 'content', 'comms', 'settings', 'overview',
].map((name) => ({ name }));

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Stimpy API',
        version: '1.0.0',
        description: 'Contract: docs/website/backend/api-reference.md. Money is integer cents; dates are ISO-8601 UTC.',
      },
      servers: [{ url: app.ctx.config.apiPublicUrl }],
      tags: OPENAPI_TAGS,
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'stimpy_session', description: 'Dashboard session cookie set by POST /auth/login' },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}, { name: 'openapi' });

export { API_PREFIX };
