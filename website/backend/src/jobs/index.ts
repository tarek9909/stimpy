import type { FastifyBaseLogger } from 'fastify';
import type { AppContext } from '../context';
import { MINUTE } from '../lib/clock';
import { scrubText } from '../lib/mask';
import { runEmailWorker } from './email-worker';
import { runHoldExpiry } from './hold-expiry';
import { runSessionCleanup } from './session-cleanup';

/**
 * Background jobs run inside the API process on timers (backend README section 7). Each job is a PLAIN FUNCTION
 * `(ctx) => Promise<result>` that tests call directly (see `test/helpers/jobs.ts`); no test waits on a timer.
 */
export type JobDef = {
  name: string;
  intervalMs: number;
  run: (ctx: AppContext) => Promise<unknown>;
};

export const JOBS: JobDef[] = [
  { name: 'email-worker', intervalMs: 5_000, run: runEmailWorker },
  { name: 'hold-expiry', intervalMs: 5 * MINUTE, run: runHoldExpiry },
  { name: 'session-cleanup', intervalMs: 60 * MINUTE, run: runSessionCleanup },
];

/**
 * Starts every job on its interval (no overlapping runs of the same job). Returns a function that stops the timers and
 * resolves once in-flight runs have finished, so shutdown never closes the database under a job half-way through (an
 * e-mail sent but not yet marked SENT would be sent again after its claim lease expires).
 */
export function startJobs(ctx: AppContext, log: FastifyBaseLogger): () => Promise<void> {
  const timers: NodeJS.Timeout[] = [];
  const inFlight = new Set<Promise<void>>();
  let stopped = false;
  for (const job of JOBS) {
    let running = false;
    const tick = async (): Promise<void> => {
      if (running || stopped) return;
      running = true;
      try {
        const result = await job.run(ctx);
        log.debug({ job: job.name, result }, 'job finished');
      } catch (err) {
        // Job errors can quote SMTP replies or rows: log the scrubbed message only, never raw fields.
        const e = err as Error;
        log.error({ job: job.name, err: { type: e?.name, message: scrubText(String(e?.message ?? err)), stack: scrubText(String(e?.stack ?? '')) } }, 'job failed');
      } finally {
        running = false;
      }
    };
    const t = setInterval(() => {
      const p = tick();
      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    }, job.intervalMs);
    t.unref();
    timers.push(t);
    log.info({ job: job.name, everyMs: job.intervalMs }, 'job scheduled');
  }
  return async () => {
    stopped = true;
    timers.forEach(clearInterval);
    await Promise.allSettled([...inFlight]);
  };
}

export { runEmailWorker, runHoldExpiry, runSessionCleanup };
