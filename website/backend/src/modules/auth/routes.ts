import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses } from '../../lib/http';
import { iso } from '../../lib/dates';
import { clearSessionCookie, setSessionCookie } from '../../plugins/auth-session';
import { SESSION_COOKIE, changePassword, endSession, login, toPublicUser } from '../../services/auth';
import type { ModuleDef } from '../module';
import { changePasswordBody, loginBody, loginResponse, meResponse, noContent } from './schemas';

const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  const secure = app.ctx.config.cookieSecure;

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Log in and set the stimpy_session cookie',
        body: loginBody,
        response: { 200: loginResponse, ...errorResponses },
      },
    },
    async (req, reply) => {
      const { token, user } = await login(app.ctx, {
        email: req.body.email,
        password: req.body.password,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookie(reply, token, secure);
      req.log.info({ userId: user.id }, 'admin logged in');
      return { user: toPublicUser(user) };
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'End the session (always 204)', response: { 204: noContent } } },
    async (req, reply) => {
      await endSession(app.ctx, req.cookies[SESSION_COOKIE]);
      clearSessionCookie(reply, secure);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      onRequest: app.requireAdmin,
      schema: {
        tags: ['auth'],
        summary: 'Current user and session expiry',
        security: [{ cookieAuth: [] }],
        response: { 200: meResponse, ...errorResponses },
      },
    },
    async (req) => {
      const { user, session } = req.auth!;
      return { user: toPublicUser(user), session: { expiresAt: iso(session.expiresAt) } };
    },
  );

  app.post(
    '/auth/change-password',
    {
      onRequest: app.requireAdmin,
      schema: {
        tags: ['auth'],
        summary: 'Change password; ends all other sessions',
        security: [{ cookieAuth: [] }],
        body: changePasswordBody,
        response: { 204: noContent, ...errorResponses },
      },
    },
    async (req, reply) => {
      const { user, session } = req.auth!;
      await changePassword(app.ctx, {
        userId: user.id,
        sessionId: session.id,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      req.log.info({ userId: user.id }, 'admin changed password');
      return reply.code(204).send(null);
    },
  );
};

export const authModule: ModuleDef = { name: 'auth', publicRoutes };
