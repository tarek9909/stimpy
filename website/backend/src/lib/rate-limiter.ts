import { AppError } from './errors';
import { MINUTE, HOUR, now } from './clock';

/**
 * In-memory fixed-window limiter (single process, v1; see security-and-testing.md 2.4).
 * Uses the injectable clock so tests can trigger and reset limits without sleeping.
 */
export type RateRule = { name: string; max: number; windowMs: number };

export const RATE_RULES = {
  /** All other public GETs: 300 per minute per IP. */
  publicRead: { name: 'public-read', max: 300, windowMs: MINUTE },
  /** POST /cart/validate is "rate limited like the catalog". */
  cartValidate: { name: 'cart-validate', max: 300, windowMs: MINUTE },
  orderIp: { name: 'order-ip', max: 5, windowMs: 10 * MINUTE },
  orderPhone: { name: 'order-phone', max: 3, windowMs: HOUR },
  track: { name: 'track', max: 20, windowMs: 10 * MINUTE },
  findIp: { name: 'find-ip', max: 3, windowMs: HOUR },
  findEmail: { name: 'find-email', max: 3, windowMs: HOUR },
  subscribe: { name: 'subscribe', max: 10, windowMs: HOUR },
  loginIp: { name: 'login-ip', max: 5, windowMs: 15 * MINUTE },
  loginEmail: { name: 'login-email', max: 5, windowMs: 15 * MINUTE },
  changePassword: { name: 'change-password', max: 5, windowMs: 15 * MINUTE },
} satisfies Record<string, RateRule>;

type Entry = { count: number; resetAt: number };

export type ConsumeResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export class RateLimiter {
  private hits = new Map<string, Entry>();

  consume(rule: RateRule, key: string): ConsumeResult {
    const t = now().getTime();
    const k = `${rule.name}|${key}`;
    let e = this.hits.get(k);
    if (!e || e.resetAt <= t) {
      e = { count: 0, resetAt: t + rule.windowMs };
      this.hits.set(k, e);
      if (this.hits.size > 20_000) this.prune(t);
    }
    e.count += 1;
    const allowed = e.count <= rule.max;
    return {
      allowed,
      remaining: Math.max(0, rule.max - e.count),
      retryAfterSeconds: Math.max(1, Math.ceil((e.resetAt - t) / 1000)),
    };
  }

  /** Throws RATE_LIMITED (429, details.retryAfterSeconds) when over the limit. */
  enforce(rule: RateRule, key: string): void {
    const r = this.consume(rule, key);
    if (!r.allowed) throw AppError.rateLimited(r.retryAfterSeconds);
  }

  /** Forget one key (e.g. the login-email counter after a successful login). */
  reset(rule: RateRule, key: string): void {
    this.hits.delete(`${rule.name}|${key}`);
  }

  clear(): void {
    this.hits.clear();
  }

  private prune(t: number): void {
    for (const [k, e] of this.hits) if (e.resetAt <= t) this.hits.delete(k);
  }
}

/** Process-wide limiter. Tests call `rateLimiter.clear()` between tests (the harness does it). */
export const rateLimiter = new RateLimiter();
