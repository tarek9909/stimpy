import type { AppContext } from '../context';
import { deleteExpiredSessions } from '../services/auth';

/** Hourly: deletes dashboard sessions past their sliding or absolute expiry. */
export async function runSessionCleanup(ctx: AppContext): Promise<{ deleted: number }> {
  return { deleted: await deleteExpiredSessions(ctx) };
}
