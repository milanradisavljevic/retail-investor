import { describe, it, expect } from 'vitest';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import { detectFundamentalOutliers } from '@/data/quality/outlier_detection';

function fundamentals(overrides: Partial<FundamentalsData>): FundamentalsData {
  return {
    peRatio: null,
    pbRatio: null,
    psRatio: null,
    pegRatio: null,
    roe: null,
    debtToEquity: null,
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
    beta: null,
    ...overrides,
  };
}

describe('detectFundamentalOutliers', () => {
  it('flags sector-based 3-sigma outliers without filtering symbols', () => {
    const rows = Array.from({ length: 10 }, (_, idx) => ({
      symbol: `SYM${idx}`,
      sector: 'Technology',
      fundamentals: fundamentals({ peRatio: 10 }),
    }));

    rows.push({
      symbol: 'OUT',
      sector: 'Technology',
      fundamentals: fundamentals({ peRatio: 100 }),
    });

    const result = detectFundamentalOutliers(rows);
    expect(result.flagsBySymbol.OUT).toContain('sector_3sigma:peRatio');
    expect(result.flagsBySymbol.SYM0).toEqual([]);
    expect(result.summary.symbolsEvaluated).toBe(11);
    expect(result.summary.symbolsWithOutliers).toBe(1);
  });

  it('flags rule-based anomalies from roadmap examples', () => {
    const result = detectFundamentalOutliers([
      {
        symbol: 'NEG',
        sector: 'Financial Services',
        fundamentals: fundamentals({
          revenue: -500,
          peRatio: 1300,
          debtToEquity: -0.8,
        }),
      },
    ]);

    expect(result.flagsBySymbol.NEG).toContain('rule:negative_revenue');
    expect(result.flagsBySymbol.NEG).toContain('rule:pe_over_1000');
    expect(result.flagsBySymbol.NEG).toContain('rule:negative_debt_to_equity');
    expect(result.summary.ruleFlags).toBe(3);
  });
});
