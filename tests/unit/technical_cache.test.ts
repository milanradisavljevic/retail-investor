import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { closeDatabase } from '@/data/db';
import {
  getCachedTechnicalMetrics,
  saveTechnicalMetricsCache,
} from '@/data/repositories/technical_metrics_repo';
import type { TechnicalMetrics } from '@/providers/finnhub/client';

let originalCwd: string;
let tempDir: string;

describe('technical metrics cache', () => {
  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), 'tech-cache-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    closeDatabase();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns cached metrics within ttl', () => {
    const metrics: TechnicalMetrics = {
      currentPrice: 100,
      previousClose: 98,
      dayChange: 2,
      dayChangePercent: 2.04,
      high52Week: 120,
      low52Week: 80,
      priceReturn5Day: 1,
      priceReturn13Week: 5,
      priceReturn26Week: 10,
      priceReturn52Week: 20,
      priceReturnMTD: 2,
      priceReturnYTD: 4,
      volatility3Month: 15,
      beta: 1.1,
      avgVolume10Day: 1000,
      avgVolume3Month: 1200,
    };

    const ttlSeconds = 60;
    const now = 1_000_000;

    saveTechnicalMetricsCache('ABC', metrics, ttlSeconds, now);

    const cached = getCachedTechnicalMetrics('ABC', ttlSeconds, now + 30_000);
    expect(cached?.data).toEqual(metrics);
  });

  it('expires cached metrics after ttl', () => {
    const metrics: TechnicalMetrics = {
      currentPrice: 50,
      previousClose: 49,
      dayChange: 1,
      dayChangePercent: 2,
      high52Week: null,
      low52Week: null,
      priceReturn5Day: null,
      priceReturn13Week: null,
      priceReturn26Week: null,
      priceReturn52Week: null,
      priceReturnMTD: null,
      priceReturnYTD: null,
      volatility3Month: null,
      beta: null,
      avgVolume10Day: null,
      avgVolume3Month: null,
    };

    const ttlSeconds = 10;
    const now = 500_000;

    saveTechnicalMetricsCache('XYZ', metrics, ttlSeconds, now);

    const cached = getCachedTechnicalMetrics('XYZ', ttlSeconds, now + (ttlSeconds + 1) * 1000);
    expect(cached).toBeNull();
  });
});
