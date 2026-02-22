import { describe, expect, it } from 'vitest';
import { resolveSymbolMetrics, type SymbolRawData } from '@/scoring/metric_resolution';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type { GroupMedianMap } from '@/data/quality/group_medians';

function makeFundamentals(overrides: Partial<FundamentalsData> = {}): FundamentalsData {
  return {
    peRatio: 20,
    pbRatio: 3,
    psRatio: 2.5,
    pegRatio: null,
    roe: 14,
    debtToEquity: 0.7,
    operatingMargin: null,
    netMargin: null,
    dividendYield: null,
    payoutRatio: null,
    freeCashFlow: null,
    marketCap: null,
    enterpriseValue: null,
    revenueGrowth: null,
    earningsGrowth: null,
    analystTargetMean: null,
    analystTargetLow: null,
    analystTargetHigh: null,
    analystCount: null,
    nextEarningsDate: null,
    beta: 1.2,
    ...overrides,
  };
}

describe('metric resolution', () => {
  it('keeps roa and grossMargin on resolved fundamentals', () => {
    const raw: SymbolRawData = {
      symbol: 'AAA',
      fundamentals: makeFundamentals({
        roa: 7.8,
        grossMargin: 36.2,
      }),
      technical: null,
      profile: null,
    };
    const medians: GroupMedianMap = { industry: {}, sector: {} };

    const resolved = resolveSymbolMetrics('AAA', raw, medians);

    expect(resolved.fundamentals).not.toBeNull();
    expect(resolved.fundamentals?.roa).toBe(7.8);
    expect(resolved.fundamentals?.grossMargin).toBe(36.2);
  });
});
