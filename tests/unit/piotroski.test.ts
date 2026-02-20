import { describe, expect, it } from 'vitest';
import { calculatePiotroski, type SecEdgarData } from '@/scoring/formulas/piotroski';

function makeData(overrides: Partial<SecEdgarData> = {}): SecEdgarData {
  return {
    netIncome: null,
    totalAssets: null,
    stockholdersEquity: null,
    totalDebt: null,
    revenue: null,
    grossProfit: null,
    operatingCashFlow: null,
    capex: null,
    currentAssets: null,
    currentLiabilities: null,
    sharesOutstanding: null,
    netIncome_py: null,
    totalAssets_py: null,
    stockholdersEquity_py: null,
    totalDebt_py: null,
    revenue_py: null,
    grossProfit_py: null,
    currentAssets_py: null,
    currentLiabilities_py: null,
    sharesOutstanding_py: null,
    fiscalYearCurrent: '2025-12-31',
    fiscalYearPrior: '2024-12-31',
    ...overrides,
  };
}

describe('calculatePiotroski', () => {
  it('returns 9/9 for a strong improving company', () => {
    const result = calculatePiotroski(
      makeData({
        netIncome: 100,
        totalAssets: 1000,
        operatingCashFlow: 180,
        totalDebt: 200,
        currentAssets: 500,
        currentLiabilities: 200,
        sharesOutstanding: 100,
        grossProfit: 500,
        revenue: 1000,
        netIncome_py: 50,
        totalAssets_py: 1000,
        totalDebt_py: 300,
        currentAssets_py: 400,
        currentLiabilities_py: 250,
        sharesOutstanding_py: 100,
        grossProfit_py: 400,
        revenue_py: 900,
      })
    );

    expect(result.score).toBe(9);
    expect(result.maxScore).toBe(9);
    expect(result.checks.f1_roa.passed).toBe(true);
    expect(result.checks.f9_delta_turn.passed).toBe(true);
  });

  it('returns 0/9 for a weak deteriorating company', () => {
    const result = calculatePiotroski(
      makeData({
        netIncome: -5,
        totalAssets: 1000,
        operatingCashFlow: -10,
        totalDebt: 600,
        currentAssets: 100,
        currentLiabilities: 200,
        sharesOutstanding: 120,
        grossProfit: 100,
        revenue: 1000,
        netIncome_py: 10,
        totalAssets_py: 1000,
        totalDebt_py: 300,
        currentAssets_py: 200,
        currentLiabilities_py: 200,
        sharesOutstanding_py: 100,
        grossProfit_py: 300,
        revenue_py: 1200,
      })
    );

    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(9);
    expect(result.checks.f1_roa.passed).toBe(false);
    expect(result.checks.f7_eq_offer.passed).toBe(false);
  });

  it('handles partial inputs and reports score out of calculable checks', () => {
    const result = calculatePiotroski(
      makeData({
        netIncome: 80,
        totalAssets: 1000,
        operatingCashFlow: 100,
        sharesOutstanding: 105,
        sharesOutstanding_py: 100,
        netIncome_py: 50,
        totalAssets_py: 1000,
      })
    );

    expect(result.maxScore).toBe(5);
    expect(result.score).toBe(4);
    expect(result.checks.f5_delta_lever.passed).toBeNull();
    expect(result.checks.f9_delta_turn.passed).toBeNull();
  });

  it('returns 0/0 when no data is available', () => {
    const result = calculatePiotroski(makeData());

    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(0);
    expect(result.checks.f1_roa.passed).toBeNull();
    expect(result.checks.f2_cfo.passed).toBeNull();
  });

  it('does not crash on division by zero and marks check as non-calculable', () => {
    const result = calculatePiotroski(
      makeData({
        netIncome: 10,
        totalAssets: 0,
      })
    );

    expect(result.checks.f1_roa.passed).toBeNull();
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(0);
  });

  it('keeps ROA check valid even with negative equity', () => {
    const result = calculatePiotroski(
      makeData({
        netIncome: 10,
        totalAssets: 100,
        stockholdersEquity: -50,
      })
    );

    expect(result.checks.f1_roa.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(1);
  });
});
