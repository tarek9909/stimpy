import type { FastifyBaseLogger } from 'fastify';
import type { AppContext } from '../context';
import { MINUTE } from '../lib/clock';
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

/** Starts every job on its interval (no overlapping runs of the same job). Returns a function that stops them. */
export function startJobs(ctx: AppContext, log: FastifyBaseLogger): () => void {
  const timers: NodeJS.Timeout[] = [];
  for (const job of JOBS) {
    let running = false;
    const tick = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        const result = await job.run(ctx);
        log.debug({ job: job.name, result }, 'job finished');
      } catch (err) {
        log.error({ job: job.name, err }, 'job failed');
      } finally {
        running = false;
      }
    };
    const t = setInterval(() => void tick(), job.intervalMs);
    t.unref();
    timers.push(t);
    log.info({ job: job.name, everyMs: job.intervalMs }, 'job scheduled');
  }
  return () => timers.forEach(clearInterval);
}

export { runEmailWorker, runHoldExpiry, runSessionCleanup };
