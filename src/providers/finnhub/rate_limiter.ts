/**
 * Rate limiter for Finnhub API
 * Free tier: 60 requests per minute
 */

import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('rate_limiter');

export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxConcurrent: number;
}

export class RateLimiter {
  private requestTimes: number[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];
  private readonly config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxRequestsPerMinute: config.maxRequestsPerMinute ?? 60,
      maxConcurrent: config.maxConcurrent ?? 5,
    };
  }

  private cleanOldRequests(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.requestTimes = this.requestTimes.filter((t) => t > oneMinuteAgo);
  }

  private async waitForSlot(): Promise<void> {
    this.cleanOldRequests();

    // Check rate limit
    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + 60_000 - Date.now();
      if (waitTime > 0) {
        logger.debug({ waitTime }, 'Rate limit reached, waiting');
        await this.sleep(waitTime);
        this.cleanOldRequests();
      }
    }

    // Check concurrency
    while (this.activeRequests >= this.config.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }
  }

  async acquire(): Promise<void> {
    await this.waitForSlot();
    this.activeRequests++;
    this.requestTimes.push(Date.now());
  }

  release(): void {
    this.activeRequests--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats(): { requestsInLastMinute: number; activeRequests: number } {
    this.cleanOldRequests();
    return {
      requestsInLastMinute: this.requestTimes.length,
      activeRequests: this.activeRequests,
    };
  }
}

// Singleton instance for the application
let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}

export function resetRateLimiter(): void {
  globalRateLimiter = null;
}
