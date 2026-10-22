import { buildApp } from './app';
import { loadConfigOrExit } from './config';
import { startJobs } from './jobs';

const MAX_STARTUP_POOL_WARMUP = 20;

/** Open the database connections exercised by the launch load gate before the API becomes ready. */
async function warmDatabasePool(databaseUrl: string, query: () => Promise<unknown>): Promise<{ connections: number; durationMs: number }> {
  const limit = Number(new URL(databaseUrl).searchParams.get('connection_limit'));
  const connections = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_STARTUP_POOL_WARMUP) : MAX_STARTUP_POOL_WARMUP;
  const started = performance.now();
  await Promise.all(Array.from({ length: connections }, () => query()));
  return { connections, durationMs: performance.now() - started };
}

/** Starts the API: validated config, Fastify, background timers. */
async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const app = await buildApp({ config });
  const pool = await warmDatabasePool(config.databaseUrl, () => app.ctx.prisma.$queryRaw`SELECT 1`);
  app.log.info(pool, 'database pool warmed before readiness');

  let stopJobs: (() => Promise<void>) | null = null;
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await stopJobs?.();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info({ url: config.apiPublicUrl, docs: `${config.apiPublicUrl}/docs` }, 'Stimpy API ready');

  if (config.disableJobs) app.log.warn('background jobs are disabled (DISABLE_JOBS=true)');
  else stopJobs = startJobs(app.ctx, app.log);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
