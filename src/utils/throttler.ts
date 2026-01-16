/**
 * Simple FIFO throttler to space out provider calls.
 * Ensures deterministic ordering and a minimum interval between task starts.
 */
export class RequestThrottler {
  private lastStart = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly minIntervalMs: number = 0) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.minIntervalMs - (now - this.lastStart));
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      this.lastStart = Date.now();
      return fn();
    });
    // Keep chain alive but swallow errors so subsequent tasks still run
    this.chain = run.catch(() => undefined);
    return run;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
