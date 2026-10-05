import { JOBS, runEmailWorker, runHoldExpiry, runSessionCleanup } from '../../src/jobs';
import type { AppContext } from '../../src/context';

/**
 * Background jobs are plain functions: call them directly, never wait for a timer.
 *   await jobs.sessionCleanup(t.ctx);   await jobs.emailWorker(t.ctx);   await jobs.holdExpiry(t.ctx);
 * Combine with `freezeTime()` / `advanceTime()` (helpers/clock.ts) to move past expiries.
 */
export const jobs = {
  emailWorker: runEmailWorker,
  holdExpiry: runHoldExpiry,
  sessionCleanup: runSessionCleanup,
};

/** Run a job by its registered name (same list the server schedules). */
export async function runJob(ctx: AppContext, name: (typeof JOBS)[number]['name']): Promise<unknown> {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`Unknown job ${name}`);
  return job.run(ctx);
}
