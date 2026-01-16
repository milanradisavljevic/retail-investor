import { describe, expect, it } from 'vitest';
import { calculateFundamentalScore } from '@/scoring/fundamental';

describe('valuation robustness with missing data', () => {
  it('renormalizes valuation when P/S is missing (uses available components only)', () => {
    const result = calculateFundamentalScore({
      peRatio: 10, // strong
      pbRatio: 2,  // decent
      psRatio: null, // missing
      roe: 10,
      debtToEquity: 1,
      raw: {},
      marketCap: 1000,
    });

    expect(result.components.valuation).toBeGreaterThan(80);
    expect(result.valuationInputCoverage?.strategy_used).toBe('partial');
    expect(result.valuationInputCoverage?.missing).toContain('ps');
  });

  it('falls back to neutral value when all valuation inputs are missing', () => {
    const result = calculateFundamentalScore({
      peRatio: null,
      pbRatio: null,
      psRatio: null,
      roe: null,
      debtToEquity: null,
      raw: {},
      marketCap: null,
    });

    expect(result.components.valuation).toBe(50);
    expect(result.valuationInputCoverage?.strategy_used).toBe('fallback_neutral');
    expect(result.assumptions.some((a) => a.includes('insufficient valuation inputs'))).toBe(true);
  });
});
