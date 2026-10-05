import type { AppContext } from '../context';
import { autoExpireUnconfirmed } from '../services/orders';

/**
 * Every 5 min: finds NEW orders past `holdExpiresAt`. If `settings.orders.autoExpireUnconfirmed` is on it cancels them
 * ("Expired: not confirmed", stock released, cancellation email queued); otherwise it changes nothing and the order
 * list flags them with `holdExpired` (business-rules 9). The logic lives in services/orders.ts; this is the callable job.
 */
export async function runHoldExpiry(ctx: AppContext): Promise<{ cancelled: number }> {
  return autoExpireUnconfirmed(ctx);
}
