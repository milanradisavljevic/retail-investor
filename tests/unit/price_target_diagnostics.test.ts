import { describe, expect, it } from 'vitest';
import {
  calculatePriceTargets,
  calculateSectorMedians,
  extractStockMetrics,
  getSectorMediansForStock,
  type PriceTargetConfig,
  type StockMetrics,
  type SectorMedianSet,
} from '@/scoring/price-target';

function makeConfig(overrides?: Partial<PriceTargetConfig>): PriceTargetConfig {
  return {
    minSectorSampleSize: overrides?.minSectorSampleSize ?? 3,
    defaultMedians: overrides?.defaultMedians ?? { pe: 20, pb: 3, ps: 2.5, sampleSize: 50 },
  };
}

function makeStockMetrics(partial: Partial<StockMetrics>): StockMetrics {
  return {
    symbol: partial.symbol ?? 'AAA',
    currentPrice: partial.currentPrice ?? 100,
    eps: partial.eps ?? 5,
    bookValuePerShare: partial.bookValuePerShare ?? 20,
    revenuePerShare:
      partial.revenuePerShare === undefined ? 30 : partial.revenuePerShare,
    peRatio: partial.peRatio ?? 20,
    pbRatio: partial.pbRatio ?? 4,
    psRatio: partial.psRatio === undefined ? 3 : partial.psRatio,
    sector: partial.sector ?? 'Tech',
    industry: partial.industry ?? 'Software',
  };
}

describe('price target diagnostics and fallback', () => {
  it('falls back to global medians when sector sample is too small and downgrades confidence', () => {
    const config = makeConfig({ minSectorSampleSize: 4 });
    const stockMetrics: StockMetrics[] = [
      makeStockMetrics({ symbol: 'AAA' }),
      makeStockMetrics({ symbol: 'BBB', peRatio: 18, pbRatio: 3.5, psRatio: 2.8 }),
    ];

    const sectorMedians = calculateSectorMedians(stockMetrics, config);
    const selection = getSectorMediansForStock(stockMetrics[0], sectorMedians, config);
    expect(selection.source).toBe('global');
    expect(selection.fallbackReason).toBe('sector_sample_too_small');

    const result = calculatePriceTargets(
      stockMetrics[0],
      selection,
      {
        totalScore: 85,
        volatilityScore: 60,
        dataQualityScore: 85,
        pillarSpread: 10,
      },
      config
    );

    expect(result.target?.confidence).toBe('low'); // downgraded from medium -> low
    expect(result.target?.deepAnalysisReasons.some((r) => r.includes('Sector medians fallback'))).toBe(true);
    expect(result.diagnostics?.medians.source).toBe('global');
    expect(result.diagnostics?.medians.fallback_reason).toBe('sector_sample_too_small');
  });

  it('captures missing component diagnostics without crashing when revenue_per_share is null', () => {
    const config = makeConfig({ minSectorSampleSize: 1 });
    const medians: SectorMedianSet = {
      sectors: new Map([
        [
          'Tech',
          {
            medianPE: 18,
            medianPB: 3,
            medianPS: 2.5,
            sampleSize: 10,
          },
        ],
      ]),
      global: {
        medianPE: 18,
        medianPB: 3,
        medianPS: 2.5,
        sampleSize: 30,
      },
    };

    const metrics = makeStockMetrics({
      revenuePerShare: null,
      psRatio: null,
    });

    const selection = getSectorMediansForStock(metrics, medians, config);
    const result = calculatePriceTargets(
      metrics,
      selection,
      {
        totalScore: 70,
        volatilityScore: 50,
        dataQualityScore: 70,
        pillarSpread: 15,
      },
      config
    );

    expect(result.diagnostics?.components.ps?.included).toBe(false);
    expect(result.diagnostics?.inputs.revenue_per_share).toBeNull();
    expect(result.target).not.toBeNull();
  });
});
