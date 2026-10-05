import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * A module = one folder with routes.ts (+ schemas.ts, service.ts where needed). It exposes up to two Fastify plugins:
 *  - `publicRoutes`: registered under `/api/v1` (paths written as `/options`, `/auth/login`, ...)
 *  - `adminRoutes` : registered under `/api/v1/admin` inside a scope that already enforces the session (requireAdmin),
 *                    so paths are written as `/colors`, `/orders/:id` and handlers can rely on `request.auth`.
 * Register a module by adding it to modules/index.ts.
 */
export type ModuleDef = {
  name: string;
  publicRoutes?: FastifyPluginAsyncZod;
  adminRoutes?: FastifyPluginAsyncZod;
};
