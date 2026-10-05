import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Agent, request as httpRequest } from 'node:http';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

type PublicStimpie = {
  id: number;
  status: 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';
  purchasable: boolean;
  remaining: number | null;
};

function percentile(samples: number[], fraction: number): number {
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * fraction) - 1] ?? 0;
}

const p95 = (samples: number[]): number => percentile(samples, 0.95);

function parseServerTimings(header: string): Record<string, number> {
  return Object.fromEntries(header.split(',').flatMap((part) => {
    const match = /^\s*([\w-]+);dur=([\d.]+)/.exec(part);
    return match ? [[match[1]!, Number(match[2])]] : [];
  }));
}

const agent = new Agent({ keepAlive: true, maxSockets: 256 });
test.afterAll(() => agent.destroy());

async function callJson(url: string, options: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown } = {}) {
  const started = performance.now();
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise<{ status: number; json: unknown; elapsedMs: number; serverDurationMs: number | null; serverTimings: Record<string, number> }>((resolve, reject) => {
    const outgoing = httpRequest(url, {
      method: options.method ?? 'GET',
      agent,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } : {}),
        ...(options.headers ?? {}),
      },
    }, (incoming) => {
      let responseBody = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => { responseBody += chunk; });
      incoming.on('end', () => {
        try {
          const serverTimings = parseServerTimings(String(incoming.headers['server-timing'] ?? ''));
          resolve({
            status: incoming.statusCode ?? 0,
            json: JSON.parse(responseBody),
            elapsedMs: performance.now() - started,
            serverDurationMs: serverTimings.app ?? null,
            serverTimings,
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

test('API launch load gate: 200 catalog reads and 20 concurrent orders stay under 300 ms p95', async () => {
  // This is deliberately the first application traffic after Playwright observed API readiness.
  // The server must prewarm its configured DB pool before opening the port.
  const firstBurst = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    callJson(`${API}/api/v1/products/stimpies?type=CORE`, {
      headers: { 'x-forwarded-for': `198.18.30.${i + 2}` },
    }),
  ));
  expect(firstBurst.every((sample) => sample.status === 200 && Array.isArray(sample.json))).toBe(true);
  const firstBurstServerMs = firstBurst.flatMap((sample) => sample.serverDurationMs === null ? [] : [sample.serverDurationMs]);
  const firstBurstP95 = p95(firstBurst.map((sample) => sample.elapsedMs));
  console.info(`API_LOAD_GATE first_catalog_burst=20 p95_ms=${firstBurstP95.toFixed(1)} server_p95_ms=${firstBurstServerMs.length ? p95(firstBurstServerMs).toFixed(1) : 'disabled'}`);
  expect(firstBurstP95, 'first 20 concurrent catalog reads after API readiness p95').toBeLessThan(300);

  const baseline = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    callJson(`${API}/api/v1/products/stimpies?type=CORE`, {
      headers: { 'x-forwarded-for': `198.18.31.${i + 1}` },
    }),
  ));
  expect(baseline.every((sample) => sample.status === 200 && Array.isArray(sample.json))).toBe(true);
  const baselineServerMs = baseline.flatMap((sample) => sample.serverDurationMs === null ? [] : [sample.serverDurationMs]);
  console.info(`API_LOAD_GATE catalog_baseline=10 p95_ms=${p95(baseline.map((sample) => sample.elapsedMs)).toFixed(1)} server_p95_ms=${baselineServerMs.length ? p95(baselineServerMs).toFixed(1) : 'disabled'}`);

  const readSamples = await Promise.all(Array.from({ length: 200 }, async (_, i) => {
    const sample = await callJson(`${API}/api/v1/products/stimpies?type=CORE`, {
      headers: { 'x-forwarded-for': `198.18.32.${i + 1}` },
    });
    expect(sample.status, `catalog read ${i + 1}`).toBe(200);
    expect(Array.isArray(sample.json), `catalog response ${i + 1}`).toBe(true);
    return sample;
  }));
  const readElapsedMs = readSamples.map((sample) => sample.elapsedMs);
  const readServerMs = readSamples.flatMap((sample) => sample.serverDurationMs === null ? [] : [sample.serverDurationMs]);
  const catalogP95 = p95(readElapsedMs);
  console.info(`API_LOAD_GATE catalog_reads=200 p50_ms=${percentile(readElapsedMs, 0.5).toFixed(1)} p90_ms=${percentile(readElapsedMs, 0.9).toFixed(1)} p95_ms=${catalogP95.toFixed(1)} max_ms=${Math.max(...readElapsedMs).toFixed(1)} server_p95_ms=${readServerMs.length ? p95(readServerMs).toFixed(1) : 'disabled'}`);

  const catalogResponse = await callJson(`${API}/api/v1/products/stimpies?type=CORE&includeSoldOut=true`, {
    headers: { 'x-forwarded-for': '198.18.33.1' },
  });
  expect(catalogResponse.status).toBe(200);
  const catalog = catalogResponse.json as PublicStimpie[];
  const stockOptions = catalog.filter((item) =>
    item.purchasable && (item.status === 'AVAILABLE' || item.status === 'LOW'),
  );
  expect(stockOptions.length, 'seeded catalog contains buyable core designs').toBeGreaterThan(0);

  const runId = randomUUID();
  const phoneOffset = Number.parseInt(runId.slice(0, 8), 16) % 900_000;
  const orderSamples = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const stimpie = stockOptions[i % stockOptions.length]!;
      const response = await callJson(`${API}/api/v1/orders`, {
        method: 'POST',
        headers: {
          Origin: WEB,
          'Idempotency-Key': randomUUID(),
          'x-forwarded-for': `198.18.34.${i + 1}`,
        },
        body: {
          customer: {
            name: `Load test ${i + 1}`,
            email: `load-${runId}-${i + 1}@example.com`,
            phone: `71${String(100_000 + ((phoneOffset + i) % 900_000))}`,
            whatsapp: null,
            whatsappSameAsPhone: true,
          },
          delivery: { areaName: 'Beirut', address: 'Load test address' },
          items: [{ kind: 'stimpie', stimpieId: stimpie.id, qty: 1 }],
          hp: '',
        },
      });
      expect(response.status, `order ${i + 1}: ${JSON.stringify(response.json)}`).toBe(201);
      const created = response.json as { order?: { number?: string } };
      expect(created.order?.number, `order number ${i + 1}`).toMatch(/^STP-\d+$/);
      return response;
    }),
  );
  const orderElapsedMs = orderSamples.map((sample) => sample.elapsedMs);
  const orderServerMs = orderSamples.flatMap((sample) => sample.serverDurationMs === null ? [] : [sample.serverDurationMs]);
  const orderServiceMs = orderSamples.flatMap((sample) => sample.serverTimings.order_service === undefined ? [] : [sample.serverTimings.order_service]);
  const orderResponseMs = orderSamples.flatMap((sample) => sample.serverTimings.order_response === undefined ? [] : [sample.serverTimings.order_response]);
  const ordersP95 = p95(orderElapsedMs);
  console.info(`API_LOAD_GATE concurrent_orders=20 p95_ms=${ordersP95.toFixed(1)} max_ms=${Math.max(...orderElapsedMs).toFixed(1)} server_p95_ms=${orderServerMs.length ? p95(orderServerMs).toFixed(1) : 'disabled'} service_p95_ms=${orderServiceMs.length ? p95(orderServiceMs).toFixed(1) : 'disabled'} response_p95_ms=${orderResponseMs.length ? p95(orderResponseMs).toFixed(1) : 'disabled'}`);
  const phases = ['normalize', 'initial_replay', 'price_cart', 'order_settings', 'semaphore_wait', 'customer_upsert', 'customer_replay_check', 'counter_and_replay', 'order_insert', 'stock_reserve', 'line_writes', 'event_writes', 'email_queue', 'transaction_total', 'low_stock_alert'];
  console.info(`API_LOAD_GATE order_phase_p95_ms=${phases.map((name) => {
    const values = orderSamples.flatMap((sample) => sample.serverTimings[name] === undefined ? [] : [sample.serverTimings[name]]);
    return `${name}:${values.length ? p95(values).toFixed(1) : 'disabled'}`;
  }).join(',')}`);
  expect(catalogP95, '200 concurrent catalog reads p95').toBeLessThan(300);
  expect(ordersP95, '20 concurrent order placements p95').toBeLessThan(300);
});
