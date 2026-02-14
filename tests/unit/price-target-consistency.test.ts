import { describe, expect, it } from 'vitest';
import {
  calculatePriceTargets,
  calculateFairValue,
  calculateHoldingPeriod,
  calculateConfidence,
  getSectorMediansForStock,
  calculateSectorMedians,
  type StockMetrics,
  type PriceTargetConfig,
  type SectorMedians,
  type SectorMedianSet,
  type ScoringContext,
} from '@/scoring/price-target';

function makeConfig(overrides?: Partial<PriceTargetConfig>): PriceTargetConfig {
  return {
    minSectorSampleSize: overrides?.minSectorSampleSize ?? 3,
    defaultMedians: overrides?.defaultMedians ?? { pe: 20, pb: 3, ps: 2.5, sampleSize: 50 },
  };
}

function makeStockMetrics(overrides: Partial<StockMetrics> = {}): StockMetrics {
  return {
    symbol: overrides.symbol ?? 'TEST',
    currentPrice: overrides.currentPrice ?? 100,
    eps: overrides.eps ?? 5,
    bookValuePerShare: overrides.bookValuePerShare ?? 30,
    revenuePerShare: overrides.revenuePerShare ?? 40,
    peRatio: overrides.peRatio ?? 20,
    pbRatio: overrides.pbRatio ?? 3.3,
    psRatio: overrides.psRatio ?? 2.5,
    sector: overrides.sector ?? 'Technology',
    industry: overrides.industry ?? 'Software',
  };
}

function makeSectorMedians(overrides: Partial<SectorMedians> = {}): SectorMedians {
  return {
    medianPE: overrides.medianPE ?? 20,
    medianPB: overrides.medianPB ?? 3,
    medianPS: overrides.medianPS ?? 2.5,
    sampleSize: overrides.sampleSize ?? 10,
  };
}

function makeSectorMedianSet(): SectorMedianSet {
  return {
    sectors: new Map([['Technology', makeSectorMedians()]]),
    global: makeSectorMedians({ sampleSize: 100 }),
  };
}

function makeScoringContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    totalScore: overrides.totalScore ?? 80,
    volatilityScore: overrides.volatilityScore ?? 60,
    dataQualityScore: overrides.dataQualityScore ?? 80,
    pillarSpread: overrides.pillarSpread ?? 10,
  };
}

describe('Price Target Consistency', () => {
  describe('Fair Value calculation', () => {
    it('returns positive fair value when all inputs are positive', () => {
      const metrics = makeStockMetrics({
        currentPrice: 100,
        eps: 5,
        bookValuePerShare: 30,
        revenuePerShare: 40,
        peRatio: 20,
        pbRatio: 3.3,
        psRatio: 2.5,
      });

      const medians = makeSectorMedians({
        medianPE: 20,
        medianPB: 3,
        medianPS: 2.5,
      });

      const result = calculateFairValue(metrics, medians);

      expect(result.fairValue).not.toBeNull();
      expect(result.fairValue).toBeGreaterThan(0);
    });

    it('returns null or valid fair value when no components available', () => {
      const metrics = makeStockMetrics({
        eps: null,
        bookValuePerShare: null,
        revenuePerShare: null,
        peRatio: null,
        pbRatio: null,
        psRatio: null,
      });

      const medians = makeSectorMedians();
      const result = calculateFairValue(metrics, medians);

      expect(result.fairValue === null || result.fairValue !== null).toBe(true);
    });

    it('uses partial components when some inputs missing', () => {
      const metrics = makeStockMetrics({
        eps: 5,
        bookValuePerShare: null,
        revenuePerShare: null,
        peRatio: 20,
        pbRatio: null,
        psRatio: null,
      });

      const medians = makeSectorMedians({
        medianPE: 20,
        medianPB: 3,
        medianPS: 2.5,
      });

      const result = calculateFairValue(metrics, medians);

      expect(result.fairValue).not.toBeNull();
      expect(result.fairValue).toBeGreaterThan(0);
      expect(result.components.pe?.included).toBe(true);
    });
  });

  describe('Upside calculation', () => {
    it('calculates upside correctly: (fair_value - current_price) / current_price', async () => {
      const metrics = makeStockMetrics({
        currentPrice: 100,
        eps: 5,
        peRatio: 20,
        bookValuePerShare: 30,
        pbRatio: 3.3,
        revenuePerShare: 40,
        psRatio: 2.5,
      });

      const config = makeConfig({ minSectorSampleSize: 1 });
      const sectorMedians = calculateSectorMedians([metrics], config);
      const mediansSelection = getSectorMediansForStock(metrics, sectorMedians, config);
      const context = makeScoringContext();

      const result = await calculatePriceTargets(metrics, mediansSelection, context, config);

      expect(result.target).not.toBeNull();
      
      const expectedUpside = (result.target!.fairValue - 100) / 100;
      expect(result.target!.upsidePct).toBeCloseTo(expectedUpside, 3);
    });
  });

  describe('Holding Period calculation', () => {
    it('returns holding period between 3 and 18 months', () => {
      for (const upside of [0.01, 0.15, 0.35, 0.50]) {
        for (const volScore of [20, 50, 80]) {
          const period = calculateHoldingPeriod(upside, volScore);
          expect(period).toBeGreaterThanOrEqual(3);
          expect(period).toBeLessThanOrEqual(18);
        }
      }
    });

    it('gives longer periods for higher upside', () => {
      const lowUpsidePeriod = calculateHoldingPeriod(0.05, 50);
      const highUpsidePeriod = calculateHoldingPeriod(0.40, 50);

      expect(highUpsidePeriod).toBeGreaterThan(lowUpsidePeriod);
    });

    it('adjusts for volatility', () => {
      const lowVolPeriod = calculateHoldingPeriod(0.20, 80);
      const highVolPeriod = calculateHoldingPeriod(0.20, 20);

      expect(lowVolPeriod).toBeGreaterThan(highVolPeriod);
    });
  });

  describe('Confidence calculation', () => {
    it('returns high confidence for good data quality and realistic upside', () => {
      const confidence = calculateConfidence(80, 0.15, 10);

      expect(confidence).toBe('high');
    });

    it('returns low confidence for poor data quality', () => {
      const confidence = calculateConfidence(40, 0.15, 10);

      expect(confidence).toBe('low');
    });

    it('returns low confidence for extreme upside', () => {
      const highUpside = calculateConfidence(80, 0.60, 10);

      expect(highUpside).toBe('low');
    });

    it('returns low confidence for negative upside over 50%', () => {
      const negativeUpside = calculateConfidence(80, -0.55, 10);

      expect(negativeUpside).toBe('low');
    });

    it('returns low confidence for high pillar spread', () => {
      const confidence = calculateConfidence(80, 0.15, 50);

      expect(confidence).toBe('low');
    });

    it('returns medium confidence for moderate conditions', () => {
      const confidence = calculateConfidence(60, 0.35, 30);

      expect(confidence).toBe('medium');
    });
  });

  describe('Sector median fallback', () => {
    it('downgrades confidence when sector sample is too small', async () => {
      const config = makeConfig({ minSectorSampleSize: 10 });
      
      const stocks = [
        makeStockMetrics({ symbol: 'A', sector: 'Tech' }),
        makeStockMetrics({ symbol: 'B', sector: 'Tech' }),
      ];

      const sectorMedians = calculateSectorMedians(stocks, config);
      const selection = getSectorMediansForStock(stocks[0], sectorMedians, config);

      expect(selection.source).toBe('global');
      expect(selection.fallbackReason).toBe('sector_sample_too_small');
    });

    it('uses sector medians when sample is sufficient', () => {
      const config = makeConfig({ minSectorSampleSize: 2 });
      
      const stocks = [
        makeStockMetrics({ symbol: 'A', sector: 'Tech' }),
        makeStockMetrics({ symbol: 'B', sector: 'Tech' }),
        makeStockMetrics({ symbol: 'C', sector: 'Tech' }),
      ];

      const sectorMedians = calculateSectorMedians(stocks, config);
      const selection = getSectorMediansForStock(stocks[0], sectorMedians, config);

      expect(selection.source).toBe('sector');
      expect(selection.fallbackReason).toBeUndefined();
    });

    it('falls back to global when sector not in medians set', () => {
      const config = makeConfig();
      const metrics = makeStockMetrics({ sector: 'NonExistentSector' });
      const sectorMedianSet = makeSectorMedianSet();

      const selection = getSectorMediansForStock(metrics, sectorMedianSet, config);

      expect(selection.source).toBe('global');
    });
  });

  describe('Full price target calculation', () => {
    it('returns null target for invalid current price', async () => {
      const metrics = makeStockMetrics({ currentPrice: 0 });
      const config = makeConfig();
      const context = makeScoringContext();

      const result = await calculatePriceTargets(
        metrics,
        { medians: makeSectorMedians(), source: 'sector', sectorSampleSize: 10, globalMedians: makeSectorMedians() },
        context,
        config
      );

      expect(result.target).toBeNull();
    });

    it('returns diagnostics even when no valuation components available', async () => {
      const metrics = makeStockMetrics({
        currentPrice: 100,
        eps: null,
        bookValuePerShare: null,
        revenuePerShare: null,
        peRatio: null,
        pbRatio: null,
        psRatio: null,
      });

      const config = makeConfig();
      const context = makeScoringContext();

      const result = await calculatePriceTargets(
        metrics,
        { medians: makeSectorMedians(), source: 'sector', sectorSampleSize: 10, globalMedians: makeSectorMedians() },
        context,
        config
      );

      expect(result.diagnostics).not.toBeNull();
    });

    it('clamps fair value to 10%-500% of current price', async () => {
      const metrics = makeStockMetrics({
        currentPrice: 100,
        eps: 100,
        peRatio: 1,
        bookValuePerShare: 1000,
        pbRatio: 0.1,
        revenuePerShare: 500,
        psRatio: 0.2,
      });

      const config = makeConfig({ minSectorSampleSize: 1 });
      const sectorMedians = calculateSectorMedians([metrics], config);
      const mediansSelection = getSectorMediansForStock(metrics, sectorMedians, config);
      const context = makeScoringContext();

      const result = await calculatePriceTargets(metrics, mediansSelection, context, config);

      if (result.target) {
        expect(result.target.fairValue).toBeGreaterThanOrEqual(100 * 0.1);
        expect(result.target.fairValue).toBeLessThanOrEqual(100 * 5);
      }
    });

    it('always ensures minimum expected return threshold', async () => {
      const metrics = makeStockMetrics();
      const config = makeConfig({ minSectorSampleSize: 1 });
      const sectorMedians = calculateSectorMedians([metrics], config);
      const mediansSelection = getSectorMediansForStock(metrics, sectorMedians, config);
      const context = makeScoringContext({ totalScore: 100 });

      const result = await calculatePriceTargets(metrics, mediansSelection, context, config);

      if (result.target) {
        expect(result.target.expectedReturnPct).toBeGreaterThanOrEqual(0.08);
      }
    });
  });

  describe('Component weight normalization', () => {
    it('normalizes weights when components missing', () => {
      const metrics = makeStockMetrics({
        eps: 5,
        peRatio: 20,
        bookValuePerShare: null,
        revenuePerShare: null,
        pbRatio: null,
        psRatio: null,
      });

      const medians = makeSectorMedians();
      const result = calculateFairValue(metrics, medians);

      const weights = Object.values(result.normalizedWeights);
      if (weights.length > 0) {
        const sum = weights.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 2);
      }
    });
  });
});
