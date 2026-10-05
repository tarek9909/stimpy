import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildWorld } from '../test/helpers/fixtures';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString().slice(0, 19).replace(/[T:-]/g, '');
const databaseName = `stimpy_test_restart_safety_${now}_${randomUUID().slice(0, 8)}`;

function requireTestDatabaseName(value: string): void {
  if (!/^stimpy_test_restart_safety_[0-9]{14}_[a-f0-9]{8}$/.test(value)) {
    throw new Error(`Refusing unexpected restart-safety database name: ${value}`);
  }
}

function databaseUrl(base: string, database: string): string {
  const url = new URL(base);
  if (url.protocol !== 'mysql:') throw new Error('Restart-safety probe requires a MySQL DATABASE_URL.');
  url.pathname = `/${database}`;
  url.searchParams.set('connection_limit', '20');
  return url.toString();
}

async function freePort(): Promise<number> {
  const net = await import('node:net');
  const server = net.createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an API port.');
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function childEnvironment(url: string, port: number, publicUrl: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SMTP_USER;
  delete env.SMTP_PASSWORD;
  return {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    PORT: String(port),
    HOST: '0.0.0.0',
    WEB_URL: 'http://localhost:3000',
    ADMIN_URL: 'http://localhost:5173',
    API_PUBLIC_URL: publicUrl,
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MAILPIT_URL: 'http://localhost:8025',
    COOKIE_SECURE: 'false',
    TRUST_PROXY: 'true',
    DISABLE_JOBS: 'true',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: join(apiRoot, 'uploads-test'),
  };
}

async function startApi(url: string, port: number): Promise<ChildProcess> {
  const apiUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: apiRoot,
    env: childEnvironment(url, port, apiUrl),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let output = '';
  const keepOutput = (chunk: Buffer | string) => {
    output = `${output}${chunk.toString()}`.slice(-5000);
  };
  child.stdout?.on('data', keepOutput);
  child.stderr?.on('data', keepOutput);
  const deadline = Date.now() + 30_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`API exited before becoming ready. ${output}`);
      try {
        const response = await fetch(`${apiUrl}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return child;
      } catch {
        // The API process is still starting; keep polling its owned port.
      }
      await delay(100);
    }
    throw new Error(`API did not become ready within 30 s. ${output}`);
  } catch (error) {
    await stopApi(child);
    throw error;
  }
}

async function stopApi(child: ChildProcess | undefined): Promise<void> {
  if (!child) return;
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, 'exit');
  if (child.pid && process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
    console.log(`RESTART_SAFETY killed owned API process tree pid=${child.pid} taskkill_exit=${result.status}`);
    if (result.status !== 0 && child.exitCode === null && child.signalCode === null) {
      throw new Error(`Could not kill the API child process tree: ${result.stderr || result.stdout || 'taskkill failed'}`);
    }
  } else if (child.pid && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  await Promise.race([
    exited,
    delay(10_000).then(() => { throw new Error(`Owned API child ${child.pid ?? 'unknown'} did not exit after kill.`); }),
  ]);
}

async function waitForLockWait(prisma: PrismaClient, database: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT COUNT(*) AS waiting
      FROM performance_schema.data_lock_waits AS waits
      JOIN performance_schema.threads AS requesting
        ON requesting.THREAD_ID = waits.REQUESTING_THREAD_ID
      WHERE requesting.PROCESSLIST_DB = ${database}`;
    if (Number(rows[0]?.waiting ?? 0) > 0) return;
    await delay(50);
  }
  throw new Error('The order burst never reached the deliberately locked stock row.');
}

async function waitForNoLockWait(prisma: PrismaClient, database: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT COUNT(*) AS waiting
      FROM performance_schema.data_lock_waits AS waits
      JOIN performance_schema.threads AS requesting
        ON requesting.THREAD_ID = waits.REQUESTING_THREAD_ID
      WHERE requesting.PROCESSLIST_DB = ${database}`;
    if (Number(rows[0]?.waiting ?? 0) === 0) return;
    await delay(50);
  }
  const waiting = await prisma.$queryRaw<{ connectionId: number; host: string | null; databaseName: string | null; state: string | null }[]>`
    SELECT requesting.PROCESSLIST_ID AS connectionId,
      requesting.PROCESSLIST_HOST AS host,
      requesting.PROCESSLIST_DB AS databaseName,
      requesting.PROCESSLIST_STATE AS state
    FROM performance_schema.data_lock_waits AS waits
    JOIN performance_schema.threads AS requesting
      ON requesting.THREAD_ID = waits.REQUESTING_THREAD_ID
    WHERE requesting.PROCESSLIST_DB = ${database}`;
  throw new Error(`MySQL still reports API lock waits after child exit: ${JSON.stringify(waiting)}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const envFile = join(apiRoot, '.env');
  if (process.env.DATABASE_URL === undefined && process.env.TEST_DATABASE_URL === undefined) {
    process.loadEnvFile(envFile);
  }
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL so the probe can reuse local MySQL credentials.');

  requireTestDatabaseName(databaseName);
  const targetUrl = databaseUrl(baseUrl, databaseName);
  const adminUrl = databaseUrl(baseUrl, 'mysql');
  console.log(`RESTART_SAFETY setup database=${databaseName}`);
  const admin = new PrismaClient({ datasourceUrl: adminUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.$disconnect();

  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  const migration = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: targetUrl },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (migration.status !== 0) throw new Error(`Fresh restart-safety database migration failed:\n${migration.stdout}\n${migration.stderr}`);

  const prisma = new PrismaClient({ datasourceUrl: targetUrl });
  let api: ChildProcess | undefined;
  let releaseStockLock: (() => void) | undefined;
  let lockTask: Promise<unknown> | undefined;
  try {
    const world = await buildWorld(prisma, { withAdmin: false });
    const stock = world.core[0]!;
    const before = await prisma.stimpie.findUniqueOrThrow({ where: { id: stock.id } });
    const numberCounterBefore = (await prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value;
    const apiPort = await freePort();
    const apiUrl = `http://localhost:${apiPort}`;

    let stockLockAcquired!: () => void;
    const acquired = new Promise<void>((resolveAcquired) => { stockLockAcquired = resolveAcquired; });
    const release = new Promise<void>((resolveRelease) => { releaseStockLock = resolveRelease; });
    lockTask = prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM stimpies WHERE id = ${stock.id} FOR UPDATE`;
      assert(rows.length === 1, 'Could not acquire the stock-row lock for the probe.');
      stockLockAcquired();
      await release;
    }, { maxWait: 10_000, timeout: 60_000 });
    await acquired;

    api = await startApi(targetUrl, apiPort);
    const runId = randomUUID();
    const orders = Array.from({ length: 20 }, (_, i) => ({
      key: `restart-${runId}-${i + 1}`,
      body: {
        customer: {
          name: `Restart probe ${i + 1}`,
          email: `restart-${runId}-${i + 1}@example.com`,
          phone: `71${String(100_000 + i).slice(-6)}`,
          whatsapp: null,
          whatsappSameAsPhone: true,
        },
        delivery: { areaName: 'Beirut', address: 'Restart safety probe' },
        items: [{ kind: 'stimpie', stimpieId: stock.id, qty: 1 }],
        hp: '',
      },
    }));
    const send = (item: (typeof orders)[number], i: number) => fetch(`${apiUrl}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'idempotency-key': item.key,
        'x-forwarded-for': `198.18.45.${i + 1}`,
      },
      body: JSON.stringify(item.body),
      signal: AbortSignal.timeout(30_000),
    }).then(async (response) => ({ status: response.status, body: await response.text() })).catch(() => null);

    const firstBurst = Promise.all(orders.map(send));
    await waitForLockWait(prisma, databaseName);
    console.log('RESTART_SAFETY order burst is blocked inside stock reservation; killing the API now.');
    await delay(150);
    await stopApi(api);
    api = undefined;
    console.log('RESTART_SAFETY waiting for MySQL to discard every killed API transaction.');
    await waitForNoLockWait(prisma, databaseName);
    assert(releaseStockLock, 'The stock lock release handle was not initialized.');
    releaseStockLock();
    releaseStockLock = undefined;
    await lockTask;
    lockTask = undefined;
    await firstBurst;

    const abandonedOrders = await prisma.order.count({ where: { idempotencyKey: { in: orders.map((item) => item.key) } } });
    const stockAfterCrash = await prisma.stimpie.findUniqueOrThrow({ where: { id: stock.id } });
    const numberCounterAfterCrash = (await prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value;
    assert(abandonedOrders === 0, `API crash left ${abandonedOrders} orders from the uncommitted burst.`);
    assert(stockAfterCrash.reserved === before.reserved, 'API crash changed reserved stock without committed orders.');
    assert(numberCounterAfterCrash === numberCounterBefore, 'API crash consumed an order number for an uncommitted order.');

    api = await startApi(targetUrl, apiPort);
    console.log('RESTART_SAFETY API restarted; retrying all 20 requests with their original keys.');
    const retried = await Promise.all(orders.map(send));
    assert(retried.every((result) => result?.status === 201), `After restart, ${retried.filter((result) => result?.status !== 201).length} retried orders did not succeed.`);

    const created = await prisma.order.findMany({
      where: { idempotencyKey: { in: orders.map((item) => item.key) } },
      include: { items: true, stockLines: true, events: true, stockMovements: true },
      orderBy: { number: 'asc' },
    });
    const numbers = created.map((order) => Number(order.number.split('-')[1]));
    assert(created.length === orders.length, `Expected ${orders.length} durable orders after retry, found ${created.length}.`);
    assert(new Set(created.map((order) => order.idempotencyKey)).size === orders.length, 'The retry burst created duplicate idempotency keys.');
    assert(created.every((order) => order.items.length === 1 && order.items[0]?.qty === 1), 'A durable order is missing its item row.');
    assert(created.every((order) => order.stockLines.length === 1 && order.stockLines[0]?.state === 'RESERVED' && order.stockLines[0]?.stimpieId === stock.id), 'A durable order is missing its matching reserved stock line.');
    assert(created.every((order) => order.events.length === 1 && order.events[0]?.toStatus === 'NEW'), 'A durable order is missing its creation event.');
    assert(created.every((order) => order.stockMovements.length === 1 && order.stockMovements[0]?.reason === 'ORDER_RESERVED' && order.stockMovements[0]?.delta === 1), 'A durable order is missing its stock movement.');
    assert(numbers.every((number, i) => number === numberCounterBefore + i + 1), 'Restarted order numbers are not consecutive or contain a gap.');
    const stockAfterRetry = await prisma.stimpie.findUniqueOrThrow({ where: { id: stock.id } });
    const numberCounterAfterRetry = (await prisma.counter.findUniqueOrThrow({ where: { name: 'order_number' } })).value;
    assert(stockAfterRetry.reserved === before.reserved + orders.length, 'Reserved stock does not match the durable retry orders.');
    assert(numberCounterAfterRetry === numberCounterBefore + orders.length, 'The durable retry orders consumed an unexpected number of order numbers.');

    console.log(`RESTART_SAFETY passed: killed the API with 20 order transactions waiting on a held stock lock; all uncommitted writes rolled back; restart + same-key retry created 20 complete orders, reservations, movements and consecutive numbers. database=${databaseName}`);
  } finally {
    if (api) await stopApi(api);
    releaseStockLock?.();
    await lockTask?.catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`RESTART_SAFETY failed database=${databaseName}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
