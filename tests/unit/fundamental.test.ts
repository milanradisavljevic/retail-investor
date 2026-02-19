import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { calculateFundamentalScore, DEFAULT_THRESHOLDS } from '@/scoring/fundamental';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

function makeFundamentals(overrides: Partial<FundamentalsData> = {}): FundamentalsData {
  return {
    peRatio: overrides.peRatio ?? null,
    pbRatio: overrides.pbRatio ?? null,
    psRatio: overrides.psRatio ?? null,
    pegRatio: overrides.pegRatio ?? null,
    roe: overrides.roe ?? null,
    roa: overrides.roa ?? null,
    debtToEquity: overrides.debtToEquity ?? null,
    currentRatio: overrides.currentRatio ?? null,
    grossMargin: overrides.grossMargin ?? null,
    operatingMargin: overrides.operatingMargin ?? null,
    netMargin: overrides.netMargin ?? null,
    dividendYield: overrides.dividendYield ?? null,
    payoutRatio: overrides.payoutRatio ?? null,
    freeCashFlow: overrides.freeCashFlow ?? null,
    marketCap: overrides.marketCap ?? null,
    enterpriseValue: overrides.enterpriseValue ?? null,
    revenueGrowth: overrides.revenueGrowth ?? null,
    earningsGrowth: overrides.earningsGrowth ?? null,
    analystTargetMean: overrides.analystTargetMean ?? null,
    analystTargetLow: overrides.analystTargetLow ?? null,
    analystTargetHigh: overrides.analystTargetHigh ?? null,
    analystCount: overrides.analystCount ?? null,
    nextEarningsDate: overrides.nextEarningsDate ?? null,
    beta: overrides.beta ?? null,
    eps: overrides.eps ?? null,
    bookValuePerShare: overrides.bookValuePerShare ?? null,
    revenuePerShare: overrides.revenuePerShare ?? null,
    currentPrice: overrides.currentPrice ?? null,
    raw: overrides.raw ?? {},
  };
}

describe('Fundamental Scoring', () => {
  const originalPreset = process.env.SCORING_PRESET;
  
  beforeEach(() => {
    delete process.env.SCORING_PRESET;
    delete process.env.PRESET;
  });
  
  afterEach(() => {
    if (originalPreset !== undefined) {
      process.env.SCORING_PRESET = originalPreset;
    } else {
      delete process.env.SCORING_PRESET;
    }
  });

  describe('Strong fundamentals', () => {
    it('scores high valuation and quality for undervalued, profitable company', () => {
      const data = makeFundamentals({
        peRatio: 10,
        pbRatio: 1.5,
        psRatio: 0.8,
        roe: 25,
        debtToEquity: 0.3,
        grossMargin: 45,
        freeCashFlow: 500_000_000,
        marketCap: 10_000_000_000,
      });

      const result = calculateFundamentalScore(data);

      expect(result.components.valuation).toBeGreaterThan(60);
      expect(result.components.quality).toBeGreaterThan(40);
      expect(result.total).toBeGreaterThan(50);
      expect(result.missingFields).toHaveLength(0);
      expect(result.isInsufficient).toBe(false);
    });

    it('scores high PE ratio with good PB and PS appropriately', () => {
      const data = makeFundamentals({
        peRatio: 10,
        pbRatio: 1.5,
        psRatio: 0.8,
        roe: 25,
        debtToEquity: 0.3,
      });

      const result = calculateFundamentalScore(data);

      expect(result.breakdown.peScore).toBeGreaterThan(85);
      expect(result.breakdown.pbScore).toBeGreaterThan(80);
    });
  });

  describe('Weak fundamentals', () => {
    it('scores low valuation and quality for overvalued, unprofitable company', () => {
      const data = makeFundamentals({
        peRatio: 50,
        pbRatio: 8,
        psRatio: 10,
        roe: 3,
        debtToEquity: 5,
      });

      const result = calculateFundamentalScore(data);

      expect(result.components.valuation).toBeLessThan(30);
      expect(result.components.quality).toBeLessThan(30);
      expect(result.total).toBeLessThan(30);
    });

    it('scores high D/E ratio very low', () => {
      const data = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: 2,
        roe: 15,
        debtToEquity: 5,
      });

      const result = calculateFundamentalScore(data);

      expect(result.breakdown.debtEquityScore).toBeLessThan(20);
    });
  });

  describe('Missing data handling', () => {
    it('returns neutral/zero for completely null data', () => {
      const data = makeFundamentals({
        peRatio: null,
        pbRatio: null,
        psRatio: null,
        roe: null,
        debtToEquity: null,
      });

      const result = calculateFundamentalScore(data);

      expect(result.total).toBe(0);
      expect(result.isInsufficient).toBe(true);
      expect(result.assumptions.length).toBeGreaterThan(0);
      expect(result.missingFields).toContain('peRatio');
    });

    it('handles null input gracefully', () => {
      const result = calculateFundamentalScore(null);

      expect(result.total).toBe(0);
      expect(result.isInsufficient).toBe(true);
      expect(result.missingFields).toContain('all_fundamentals');
    });

    it('uses partial strategy with only PE available', () => {
      const data = makeFundamentals({
        peRatio: 15,
        pbRatio: null,
        psRatio: null,
        roe: 15,
        debtToEquity: 0.5,
      });

      const result = calculateFundamentalScore(data);

      expect(result.valuationInputCoverage?.strategy_used).toBe('insufficient_data');
      expect(result.missingFields).toContain('pbRatio');
      expect(result.missingFields).toContain('psRatio');
    });

    it('uses full strategy with all valuation metrics', () => {
      const data = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: 2,
        roe: 15,
        debtToEquity: 0.5,
        freeCashFlow: 250_000_000,
        marketCap: 10_000_000_000,
      });

      const result = calculateFundamentalScore(data);

      expect(result.valuationInputCoverage?.strategy_used).toBe('full');
      expect(result.valuationInputCoverage?.present).toContain('pe');
      expect(result.valuationInputCoverage?.present).toContain('pb');
      expect(result.valuationInputCoverage?.present).toContain('ps');
    });

    it('uses partial strategy with 2 of 3 valuation metrics', () => {
      const data = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: null,
        roe: 15,
        debtToEquity: 0.5,
      });

      const result = calculateFundamentalScore(data);

      expect(result.valuationInputCoverage?.strategy_used).toBe('partial');
      expect(result.valuationInputCoverage?.present).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('scores negative D/E (negative equity) as 0', () => {
      const data = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: 2,
        roe: 15,
        debtToEquity: -0.5,
      });

      const result = calculateFundamentalScore(data);

      expect(result.breakdown.debtEquityScore).toBe(0);
      expect(result.assumptions.some(a => a.includes('negative equity'))).toBe(true);
    });

    it('imputes missing values with universe median when provided', () => {
      const data = makeFundamentals({
        peRatio: null,
        pbRatio: 2,
        psRatio: 2,
        roe: 15,
        debtToEquity: 0.5,
      });

      const medians = {
        peRatio: 18,
      };

      const result = calculateFundamentalScore(data, medians);

      expect(result.assumptions.some(a => a.includes('imputed'))).toBe(true);
    });

    it('handles extreme ROE values correctly', () => {
      const highRoeData = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: 2,
        roe: 50,
        debtToEquity: 0.5,
      });

      const highResult = calculateFundamentalScore(highRoeData);
      expect(highResult.breakdown.roeScore).toBeGreaterThan(50);

      const lowRoeData = makeFundamentals({
        peRatio: 15,
        pbRatio: 2,
        psRatio: 2,
        roe: 2,
        debtToEquity: 0.5,
      });

      const lowResult = calculateFundamentalScore(lowRoeData);
      expect(lowResult.breakdown.roeScore).toBeLessThan(50);
    });

    it('handles zero values appropriately', () => {
      const data = makeFundamentals({
        peRatio: 0,
        pbRatio: 2,
        psRatio: 2,
        roe: 0,
        debtToEquity: 0,
      });

      const result = calculateFundamentalScore(data);

      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.debtEquityScore).toBeGreaterThan(70);
    });
  });

  describe('Threshold customization', () => {
    it('respects custom thresholds when provided', () => {
      const data = makeFundamentals({
        peRatio: 20,
        pbRatio: 2,
        psRatio: 2,
        roe: 15,
        debtToEquity: 0.5,
      });

      const strictThresholds = {
        ...DEFAULT_THRESHOLDS,
        pe: { low: 8, high: 12 },
      };

      const defaultResult = calculateFundamentalScore(data);
      const strictResult = calculateFundamentalScore(data, undefined, strictThresholds);

      expect(strictResult.breakdown.peScore).not.toBe(defaultResult.breakdown.peScore);
    });
  });
});
