import fp from 'fastify-plugin';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { Prisma } from '@prisma/client';
import { AppError, ERROR_STATUS } from '../lib/errors';
import { scrubText } from '../lib/mask';
import { API_PREFIX, decodedPathOf } from './route-group';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    details: Record<string, unknown> | null;
    requestId: string;
  };
};

/** The standard error body (api-reference section 1). `fields` only for VALIDATION_ERROR. */
export function errorBody(err: AppError, requestId: string): ErrorBody {
  const body: ErrorBody = {
    error: { code: err.code, message: err.message, details: err.details, requestId },
  };
  if (err.code === 'VALIDATION_ERROR') body.error.fields = err.fields ?? {};
  return body;
}

// ---------------------------------------------------------------- Zod issue -> friendly field message

type ZodIssueLike = {
  keyword?: string;
  instancePath: string;
  message?: string;
  params?: Record<string, unknown>;
};

const isDefaultZodMessage = (m: string): boolean => /^(Invalid|Too small|Too big|Unrecognized|Input not)/.test(m);

function friendlyMessage(v: ZodIssueLike): string {
  const m = v.message ?? '';
  const p = v.params ?? {};
  if (m && !isDefaultZodMessage(m)) return m; // a custom message written in the schema
  switch (v.keyword) {
    case 'invalid_type':
      return /received undefined/.test(m) ? 'This field is required.' : 'This value has the wrong type.';
    case 'too_small': {
      const min = Number(p.minimum);
      if (p.origin === 'string') return min <= 1 ? 'This field is required.' : `Must be at least ${min} characters.`;
      if (p.origin === 'array') return min <= 1 ? 'Add at least one item.' : `Add at least ${min} items.`;
      return `Must be at least ${min}.`;
    }
    case 'too_big': {
      const max = Number(p.maximum);
      if (p.origin === 'string') return `Must be at most ${max} characters.`;
      if (p.origin === 'array') return `Too many items (at most ${max}).`;
      return `Must be at most ${max}.`;
    }
    case 'invalid_format':
      if (p.format === 'email') return 'Enter a valid email address.';
      if (p.format === 'url') return 'Enter a valid URL.';
      return 'This value has an invalid format.';
    case 'invalid_value':
      return 'Choose one of the allowed options.';
    case 'unrecognized_keys':
      return 'Unknown field.';
    default:
      return m || 'This value is not valid.';
  }
}

/** "/customer/email" -> "customer.email"; array indices stay numeric: "/items/0/sizeId" -> "items.0.sizeId". */
const toDotted = (instancePath: string): string => instancePath.replace(/^\//, '').split('/').filter(Boolean).join('.');

export function zodIssuesToFields(issues: ZodIssueLike[], context: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const v of issues) {
    const base = toDotted(v.instancePath);
    if (v.keyword === 'unrecognized_keys' && Array.isArray(v.params?.keys)) {
      for (const k of v.params.keys as string[]) fields[base ? `${base}.${k}` : k] ??= 'Unknown field.';
      continue;
    }
    const key = base || context;
    fields[key] ??= friendlyMessage(v);
  }
  return fields;
}

// ---------------------------------------------------------------- mapping any thrown value to an AppError

function toAppError(err: unknown, req: FastifyRequest): AppError {
  if (err instanceof AppError) return err;

  const e = err as FastifyError & { validationContext?: string };

  if (hasZodFastifySchemaValidationErrors(err)) {
    const issues = (err as unknown as { validation: ZodIssueLike[] }).validation;
    return AppError.validation(zodIssuesToFields(issues, e.validationContext ?? 'body'));
  }
  if (typeof e?.code === 'string') {
    switch (e.code) {
      case 'FST_ERR_CTP_BODY_TOO_LARGE':
        return new AppError('FILE_TOO_LARGE', 413, 'That request is too large.', { maxBytes: req.routeOptions?.bodyLimit ?? 102_400 });
      case 'FST_ERR_CTP_INVALID_JSON_BODY':
      case 'FST_ERR_CTP_EMPTY_JSON_BODY':
        return AppError.validation({ body: 'The request body is not valid JSON.' }, 'The request body is not valid JSON.');
      case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
        return AppError.validation({ body: 'Send the body as application/json.' }, 'Send the body as application/json.');
      case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
        return AppError.validation({ body: 'The request body does not match its Content-Length.' });
      default:
        break;
    }
  }
  // Safety net for forgotten checks: map common Prisma errors instead of leaking a 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta as { target?: string | string[] } | undefined)?.target;
      return AppError.conflict('That value is already in use.', Array.isArray(target) ? target.join(',') : target);
    }
    if (err.code === 'P2025') return AppError.notFound();
    if (err.code === 'P2003' || err.code === 'P2014') return AppError.conflict('This is still in use, so it cannot be changed or deleted. Hide it instead.');
  }
  if (e && typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
    // other Fastify 4xx (e.g. malformed URL): generic bad request, never leak internals
    return AppError.validation({}, 'The request could not be understood.');
  }
  return AppError.internal();
}

// ---------------------------------------------------------------- plugin

export default fp(async (app) => {
  app.setErrorHandler((err, req: FastifyRequest, reply: FastifyReply) => {
    const isResponseError = typeof err === 'object' && err !== null && 'method' in err && isResponseSerializationError(err as never);
    const appErr = toAppError(err, req);
    const isInternal = appErr.httpStatus >= 500 && appErr.httpStatus !== 501;

    if (isInternal || isResponseError) {
      // Stack and cause go to the log only, never to the client.
      const e = err as Error;
      req.log.error({ err: { type: e?.name, message: scrubText(String(e?.message ?? '')), stack: scrubText(String(e?.stack ?? '')) }, requestId: req.id }, isResponseError ? 'response did not match its schema' : 'unhandled error');
    } else if (appErr.httpStatus >= 400) {
      req.log.debug({ code: appErr.code, status: appErr.httpStatus, requestId: req.id }, 'request rejected');
    }

    const finalErr = isResponseError ? AppError.internal() : appErr;
    if (finalErr.code === 'RATE_LIMITED') {
      const secs = Number(finalErr.details?.retryAfterSeconds);
      if (Number.isFinite(secs)) reply.header('Retry-After', String(secs));
    }
    if (finalErr.code === 'METHOD_NOT_ALLOWED' && finalErr.details?.allowed) {
      reply.header('Allow', (finalErr.details.allowed as string[]).join(', '));
    }
    reply.header('Content-Type', 'application/json; charset=utf-8');
    return reply.code(finalErr.httpStatus).send(errorBody(finalErr, req.id));
  });

  // 404 for unknown paths, 405 when the path exists for other methods.
  const patterns: { re: RegExp; methods: Set<string> }[] = [];
  const byUrl = new Map<string, { re: RegExp; methods: Set<string> }>();
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    let entry = byUrl.get(route.url);
    if (!entry) {
      const re = new RegExp(
        '^' + route.url.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z_]+/g, '[^/]+').replace(/\*/g, '.*') + '/?$',
      );
      entry = { re, methods: new Set() };
      byUrl.set(route.url, entry);
      patterns.push(entry);
    }
    for (const m of methods) entry.methods.add(m);
  });

  app.setNotFoundHandler((req, reply) => {
    const path = decodedPathOf(req.url);
    const allowed = new Set<string>();
    for (const p of patterns) if (p.re.test(path)) p.methods.forEach((m) => allowed.add(m));
    allowed.delete('HEAD');
    allowed.delete('OPTIONS');
    const err =
      allowed.size > 0 && path.startsWith(API_PREFIX)
        ? new AppError('METHOD_NOT_ALLOWED', 405, 'That method is not allowed here.', { allowed: [...allowed].sort() })
        : new AppError('NOT_FOUND', ERROR_STATUS.NOT_FOUND, 'Not found.');
    if (err.details?.allowed) reply.header('Allow', (err.details.allowed as string[]).join(', '));
    return reply.code(err.httpStatus).send(errorBody(err, req.id));
  });
}, { name: 'error-handler' });
