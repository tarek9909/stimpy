import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app';
import { parseConfig, type Config } from '../../src/config';
import type { AppContext } from '../../src/context';
import type { ModuleDef } from '../../src/modules/module';
import { resetClock } from '../../src/lib/clock';
import { RecordingTransport } from '../../src/lib/email-transport';
import { rateLimiter } from '../../src/lib/rate-limiter';
import { disconnectPrisma, getPrisma, resetDb } from './db';
import { createAdmin, DEFAULT_ADMIN } from './fixtures';

export const API = '/api/v1';

export type TestResponse = {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
  json<T = any>(): T; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience: shape asserted by each test
  header(name: string): string | undefined;
};

export type RequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Sends an Origin header (browsers always do on non-GET). Pass `null` to suppress the client's default. */
  origin?: string | null;
  ip?: string;
  /** Raw payload (multipart etc.); overrides `body`. */
  payload?: string | Buffer;
};

/**
 * Tiny HTTP client over `app.inject` with a cookie jar. Paths without a leading /api, /uploads or /docs get the
 * `/api/v1` prefix. `client.origin` is sent on every request (set it to the dashboard origin to mimic the browser).
 */
export class TestClient {
  readonly cookies = new Map<string, string>();
  origin: string | undefined;
  ip = '127.0.0.1';

  constructor(private readonly app: FastifyInstance, origin?: string) {
    this.origin = origin;
  }

  /** A second client (own cookie jar), e.g. another device. */
  fork(): TestClient {
    return new TestClient(this.app, this.origin);
  }

  async request(method: InjectOptions['method'], path: string, o: RequestOptions = {}): Promise<TestResponse> {
    const url = /^\/(api|uploads|docs)(\/|$)/.test(path) ? path : `${API}${path}`;
    const headers: Record<string, string> = { ...o.headers };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const origin = o.origin === undefined ? this.origin : (o.origin ?? undefined);
    if (origin) headers.origin = origin;
    let payload: string | Buffer | undefined = o.payload;
    if (payload === undefined && o.body !== undefined) {
      payload = JSON.stringify(o.body);
      headers['content-type'] ??= 'application/json';
    }
    const res = await this.app.inject({
      method,
      url,
      query: o.query as Record<string, string> | undefined,
      headers,
      payload,
      remoteAddress: o.ip ?? this.ip,
    });
    for (const c of res.cookies) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return {
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
      json: <T>() => JSON.parse(res.body) as T,
      header: (n) => {
        const v = res.headers[n.toLowerCase()];
        return Array.isArray(v) ? v.join(', ') : v === undefined ? undefined : String(v);
      },
    };
  }

  get = (path: string, o?: RequestOptions) => this.request('GET', path, o);
  post = (path: string, body?: unknown, o?: RequestOptions) => this.request('POST', path, { ...o, body });
  put = (path: string, body?: unknown, o?: RequestOptions) => this.request('PUT', path, { ...o, body });
  patch = (path: string, body?: unknown, o?: RequestOptions) => this.request('PATCH', path, { ...o, body });
  delete = (path: string, o?: RequestOptions) => this.request('DELETE', path, o);

  /** Logs in through the real endpoint; the jar then carries the session cookie. */
  async login(email = DEFAULT_ADMIN.email, password = DEFAULT_ADMIN.password): Promise<TestResponse> {
    return this.post('/auth/login', { email, password });
  }
}

export type TestApp = {
  app: FastifyInstance;
  ctx: AppContext;
  prisma: PrismaClient;
  config: Config;
  transport: RecordingTransport;
  /** Anonymous client (public site). Sends `Origin: WEB_URL` only if you set `.origin`. */
  client: TestClient;
  /** Creates the default admin, a fresh client with the dashboard Origin, and logs it in. */
  adminClient(o?: { email?: string; password?: string }): Promise<{ client: TestClient; admin: Awaited<ReturnType<typeof createAdmin>> }>;
  /** Builds another app instance with different config (e.g. production-like cookies); closed after the test file. */
  extraApp(overrides: Record<string, string>): Promise<FastifyInstance>;
};

/**
 * One call at the top of a test file. Registers hooks that
 *  - build the app once (beforeAll) against the TEST database,
 *  - reset the database, rate limiter, settings cache, clock and e-mail recorder before EVERY test (beforeEach),
 *  - close the app and Prisma at the end.
 * Returns an object whose fields are valid inside tests/hooks (not at file top level).
 */
export function useTestApp(opts: { env?: Record<string, string>; logStream?: NodeJS.WritableStream; reset?: boolean; extraModules?: ModuleDef[] } = {}): TestApp {
  const t = {} as TestApp;
  const extra: FastifyInstance[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const config = parseConfig({ ...process.env, ...opts.env });
    const transport = new RecordingTransport();
    const app = await buildApp({ config, context: { prisma, emailTransport: transport }, logStream: opts.logStream, extraModules: opts.extraModules });
    await app.ready();
    Object.assign(t, {
      app,
      ctx: app.ctx,
      prisma,
      config,
      transport,
      client: new TestClient(app),
      async adminClient(o: { email?: string; password?: string } = {}) {
        const admin = await createAdmin(prisma, o);
        const client = new TestClient(app, config.adminUrl);
        const res = await client.login(admin.email, admin.password);
        if (res.status !== 200) throw new Error(`test admin login failed: ${res.status} ${res.body}`);
        return { client, admin };
      },
      async extraApp(overrides: Record<string, string>) {
        const a = await buildApp({ config: parseConfig({ ...process.env, ...opts.env, ...overrides }), context: { prisma, emailTransport: transport }, extraModules: opts.extraModules });
        await a.ready();
        extra.push(a);
        return a;
      },
    } satisfies Partial<TestApp>);
  });

  beforeEach(async () => {
    if (opts.reset !== false) await resetDb(t.prisma);
    rateLimiter.clear();
    t.ctx.settings.clearCache();
    resetClock();
    t.transport.clear();
  });

  afterAll(async () => {
    for (const a of extra) await a.close();
    await t.app?.close();
    await disconnectPrisma();
  });

  return t;
}
