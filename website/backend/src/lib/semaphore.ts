/**
 * A tiny in-process counting semaphore. Order transactions all serialise on the order-counter row lock anyway, so running
 * more than a few at once buys nothing but pool exhaustion: every waiting transaction pins a database connection, and the
 * transaction that holds the lock may itself need one more (settings, templates), which would deadlock the pool.
 * Gating them keeps the pool free and makes a burst of orders queue in memory instead.
 */
export class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiters.push(resolve));
    else this.active += 1;
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next(); // hand the slot over directly (active count unchanged)
      else this.active -= 1;
    }
  }
}

/** Order-writing transactions (placeOrder, changeStatus): at most this many hold a connection at the same time. */
export const orderTxGate = new Semaphore(3);
