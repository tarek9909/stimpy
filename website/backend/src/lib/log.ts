/**
 * Minimal structured logger for code that has no Fastify request (services, jobs). Writes one JSON line to stderr for
 * `warn` and `error`; silent in tests and when LOG_LEVEL=silent. Pass ids and codes only: never phones, e-mails, bodies.
 */
type Fields = Record<string, unknown>;

const enabled = (): boolean => process.env.NODE_ENV !== 'test' && process.env.LOG_LEVEL !== 'silent';

function write(level: 'warn' | 'error', scope: string, fields: Fields, msg: string): void {
  if (!enabled()) return;
  process.stderr.write(`${JSON.stringify({ level, time: new Date().toISOString(), scope, msg, ...fields })}\n`);
}

export function logger(scope: string): { warn: (f: Fields, m: string) => void; error: (f: Fields, m: string) => void } {
  return {
    warn: (f, m) => write('warn', scope, f, m),
    error: (f, m) => write('error', scope, f, m),
  };
}
