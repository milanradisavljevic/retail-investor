import { describe, expect, it } from 'vitest';
import { scoreSymbol } from '@/scoring/engine';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

const dummyFundamentals: FundamentalsData = {
  peRatio: 10,
  pbRatio: 2,
  psRatio: 1,
  marketCap: 1000,
  raw: {},
};

describe('scan-only scoring mode', () => {
  it('marks scan-only scores and skips price targets when computePriceTarget is false', async () => {
    const result = await scoreSymbol(
      'AAA',
      dummyFundamentals,
      {
        currentPrice: 100,
        previousClose: 100,
        dayChange: 0,
        dayChangePercent: 0,
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
      },
      {
        dataQualityScore: 80,
        dataQualityConfidence: 0.8,
        completenessRatio: 1,
        imputedRatio: 0,
        missingCritical: [],
        metrics: {},
        missingFields: [],
        assumptions: [],
        adjustedPriceMode: 'adjusted',
      },
      undefined,
      undefined,
      { computePriceTarget: false }
    );

    expect(result.isScanOnly).toBe(true);
    expect(result.priceTarget).toBeNull();
    expect(result.priceTargetDiagnostics).toBeNull();
  });
});
