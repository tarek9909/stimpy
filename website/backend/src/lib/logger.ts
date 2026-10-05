import type { FastifyServerOptions } from 'fastify';
import type { Config } from '../config';
import { pathOf } from '../plugins/route-group';

/**
 * Pino options (Fastify's built-in logger). Pretty-printed in development, JSON elsewhere.
 * Request bodies are never serialised; headers that carry credentials are redacted as a second line of defence.
 */
export function loggerOptions(config: Config, stream?: NodeJS.WritableStream): FastifyServerOptions['logger'] {
  if (config.logLevel === 'silent' && !stream) return false;
  const base = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.token',
      ],
      censor: '[Redacted]',
    },
    serializers: {
      req(req: { method?: string; url?: string; id?: string }) {
        return { method: req.method, path: req.url ? pathOf(req.url) : undefined, id: req.id };
      },
    },
  };
  if (stream) return { ...base, stream } as FastifyServerOptions['logger'];
  if (config.nodeEnv === 'development') {
    return { ...base, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } } };
  }
  return base;
}
