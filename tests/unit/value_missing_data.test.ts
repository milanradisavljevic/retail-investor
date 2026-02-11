import { describe, expect, it } from 'vitest';
import { calculateFundamentalScore } from '@/scoring/fundamental';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

function makeFundamentals(partial: Partial<FundamentalsData>): FundamentalsData {
  return {
    peRatio: null,
    pbRatio: null,
    psRatio: null,
    pegRatio: null,
    roe: null,
    roa: null,
    debtToEquity: null,
    currentRatio: null,
    grossMargin: null,
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
    raw: {},
    ...partial,
  };
}

describe('valuation robustness with missing data', () => {
  it('renormalizes valuation when P/S is missing (uses available components only)', () => {
    const result = calculateFundamentalScore(
      makeFundamentals({
        peRatio: 10, // strong
        pbRatio: 2,  // decent
        psRatio: null, // missing
        roe: 10,
        debtToEquity: 1,
        marketCap: 1000,
      })
    );

    expect(result.components.valuation).toBeGreaterThan(80);
    expect(result.valuationInputCoverage?.strategy_used).toBe('partial');
    expect(result.valuationInputCoverage?.missing).toContain('ps');
  });

  it('falls back to 0 value when all valuation inputs are missing', () => {
    const result = calculateFundamentalScore(
      makeFundamentals({
        peRatio: null,
        pbRatio: null,
        psRatio: null,
        roe: null,
        debtToEquity: null,
        marketCap: null,
      })
    );

    expect(result.components.valuation).toBe(0);
    expect(result.valuationInputCoverage?.strategy_used).toBe('insufficient_data');
    expect(result.isInsufficient).toBe(true);
    expect(result.assumptions.some((a) => a.includes('insufficient valuation inputs'))).toBe(true);
  });
});
