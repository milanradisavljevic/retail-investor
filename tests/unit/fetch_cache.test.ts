import { describe, expect, it, vi } from 'vitest';
import { fetchSymbolDataWithCache, type RequestStats } from '@/scoring/fetch';
import { RequestThrottler } from '@/utils/throttler';
import type { MarketDataProvider, TechnicalMetrics } from '@/providers/types';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

const baseStats: RequestStats = {
  fundamentalsCacheHits: 0,
  technicalCacheHits: 0,
  profileCacheHits: 0,
  fundamentalsRequests: 0,
  technicalRequests: 0,
  profileRequests: 0,
};

function makeTechnical(): TechnicalMetrics {
  return {
    currentPrice: 100,
    previousClose: 99,
    dayChange: 1,
    dayChangePercent: 1,
    high52Week: 150,
    low52Week: 80,
    priceReturn5Day: 0.01,
    priceReturn13Week: 0.05,
    priceReturn26Week: 0.08,
    priceReturn52Week: 0.12,
    priceReturnMTD: 0.02,
    priceReturnYTD: 0.03,
    volatility3Month: 0.2,
    beta: 1.1,
    avgVolume10Day: 100000,
    avgVolume3Month: 120000,
  };
}

function makeFundamentals(): FundamentalsData {
  return {
    peRatio: 20,
    pbRatio: 3,
    psRatio: 4,
    pegRatio: null,
    roe: 10,
    roa: null,
    debtToEquity: 0.5,
    currentRatio: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    dividendYield: null,
    payoutRatio: null,
    freeCashFlow: null,
    marketCap: 1000,
    enterpriseValue: null,
    revenueGrowth: null,
    earningsGrowth: null,
    beta: null,
    raw: {},
  };
}

describe('fetchSymbolDataWithCache', () => {
  it('uses cached fundamentals/technical/profile before hitting provider', async () => {
    const provider: MarketDataProvider = {
      getFundamentals: vi.fn(),
      getTechnicalMetrics: vi.fn(),
      getCompanyProfile: vi.fn(),
      getRequestCount: () => 0,
      close: () => {},
    };

    const stats: RequestStats = { ...baseStats };
    const now = Date.now();

    const result = await fetchSymbolDataWithCache(
      'AAA',
      {
        provider,
        fallbackProvider: null,
        throttler: new RequestThrottler(0),
        cache: { fundamentalsTtlMs: 10_000, technicalTtlSeconds: 10_000, profileTtlMs: 10_000 },
        requiredMetrics: [],
        stats,
        persistProfile: false,
        cacheOverrides: {
          fundamentals: vi.fn().mockReturnValue({ symbol: 'AAA', fetchedAt: now, data: makeFundamentals() }),
          technical: vi.fn().mockReturnValue({ symbol: 'AAA', fetchedAt: now, data: makeTechnical() }),
          profile: vi.fn().mockReturnValue({
            symbol: 'AAA',
            fetchedAt: now,
            profile: { name: 'AAA', ticker: 'AAA', shareOutstanding: 1, marketCapitalization: 1 },
          }),
        },
      }
    );

    expect(provider.getFundamentals).not.toHaveBeenCalled();
    expect(provider.getTechnicalMetrics).not.toHaveBeenCalled();
    expect(provider.getCompanyProfile).not.toHaveBeenCalled();
    expect(stats.fundamentalsCacheHits).toBe(1);
    expect(stats.technicalCacheHits).toBe(1);
    expect(result.raw.fundamentals?.peRatio).toBe(20);
  });
});
