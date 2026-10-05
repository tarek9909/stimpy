import type { AdminSession, AdminUser } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from './context';

export type AuthInfo = { user: AdminUser; session: AdminSession };

export type RouteInfo = {
  method: string;
  /** Full URL pattern including /api/v1, e.g. `/api/v1/admin/colors/:id`. */
  url: string;
  admin: boolean;
  tags: string[];
  /** True when the route declares at least one 2xx response schema. */
  hasResponseSchema: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
    /** onRequest hook: 401 UNAUTHENTICATED without a valid session; sets request.auth. */
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** onRequest hook factory: requireAdmin + role check (default OWNER). */
    requireRole: (...roles: AdminUser['role'][]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Every route registered, for contract and 401/403 sweep tests. */
    routeList: RouteInfo[];
  }
  interface FastifyRequest {
    /** Set by requireAdmin; null on public routes. */
    auth: AuthInfo | null;
  }
}
