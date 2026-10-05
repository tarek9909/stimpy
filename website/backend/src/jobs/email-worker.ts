import type { AppContext } from '../context';
import { processDueEmails } from '../services/email-queue';

/** Every 5 s: sends due PENDING rows from email_log with retry backoff (integrations 2). Safe to run in two processes. */
export async function runEmailWorker(ctx: AppContext): Promise<{ sent: number; failed: number; retried: number }> {
  return processDueEmails(ctx);
}
