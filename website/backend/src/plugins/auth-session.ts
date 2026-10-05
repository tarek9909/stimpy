import cookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/errors';
import { authenticate, SESSION_ABSOLUTE_MS, SESSION_COOKIE } from '../services/auth';

/**
 * Cookie session wiring. Provides:
 *  - `app.requireAdmin`  : onRequest hook -> 401 UNAUTHENTICATED unless a live session exists; sets `request.auth`
 *  - `app.requireRole()` : same plus a role check (default OWNER; PACKER is reserved)
 *  - helpers `setSessionCookie` / `clearSessionCookie` used by the auth routes
 * Use it as a hook (not preHandler) so 401 always wins over body validation errors.
 */
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000), // the server enforces the real (sliding) expiry
  });
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/', secure });
}

export default fp(async (app) => {
  await app.register(cookie);
  app.decorateRequest('auth', null);

  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    const found = await authenticate(app.ctx, token);
    if (!found) {
      if (token) clearSessionCookie(reply, app.ctx.config.cookieSecure);
      throw AppError.unauthenticated('Your session has ended. Please log in again.');
    }
    request.auth = found;
  };
  app.decorate('requireAdmin', requireAdmin);

  app.decorate('requireRole', (...roles: UserRole[]) => {
    const allowed: UserRole[] = roles.length ? roles : ['OWNER'];
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await requireAdmin(request, reply);
      if (!allowed.includes(request.auth!.user.role)) throw AppError.forbidden();
    };
  });
}, { name: 'auth-session' });
