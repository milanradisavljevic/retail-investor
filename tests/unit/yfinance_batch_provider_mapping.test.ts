import { describe, expect, it } from 'vitest';
import { YFinanceBatchProvider } from '@/providers/yfinance_batch_provider';
import type { BasicFinancials, Quote } from '@/providers/types';

function buildCandles(days = 260): Array<{
  t: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}> {
  const start = Date.UTC(2025, 0, 1) / 1000;
  const candles: Array<{ t: number; close: number; high: number; low: number; volume: number }> =
    [];

  for (let i = 0; i < days; i++) {
    const close = 100 + i * 0.4;
    candles.push({
      t: start + i * 86400,
      close,
      high: close + 1.5,
      low: close - 1.5,
      volume: 1_000_000 + i * 500,
    });
  }

  return candles;
}

describe('YFinanceBatchProvider mapping parity', () => {
  it('normalizes decimals to percent and debtToEquity to ratio', () => {
    const provider = new YFinanceBatchProvider();
    const basicFinancials: BasicFinancials = {
      marketCap: 1_000_000_000,
      enterpriseValue: 1_200_000_000,
      trailingPE: 22,
      forwardPE: 19,
      priceToBook: 3.1,
      priceToSales: 4.2,
      profitMargin: 0.12,
      grossMargins: 0.47,
      operatingMargins: 0.19,
      netMargins: 0.12,
      returnOnEquity: 0.21,
      returnOnAssets: 0.08,
      debtToEquity: 150,
      currentRatio: 1.8,
      quickRatio: 1.2,
      revenueGrowth: 0.15,
      earningsGrowth: -0.04,
      dividendYield: 0.011,
      payoutRatio: 0.35,
      freeCashFlow: 250_000_000,
      evToEbitda: 12.5,
      roic: 0.1,
      beta: 1.18,
    };
    const analyst = {
      target_mean: 155,
      target_low: 120,
      target_high: 180,
      num_analysts: 22,
      next_earnings_date: '2026-03-20',
    };

    const fundamentals = provider.mapBatchFundamentals(basicFinancials, analyst);

    expect(fundamentals).toBeTruthy();
    if (!fundamentals) {
      throw new Error('Expected fundamentals to be mapped');
    }
    expect(fundamentals.roe).toBeCloseTo(21, 6);
    expect(fundamentals.roa).toBeCloseTo(8, 6);
    expect(fundamentals.grossMargin).toBeCloseTo(47, 6);
    expect(fundamentals.operatingMargin).toBeCloseTo(19, 6);
    expect(fundamentals.netMargin).toBeCloseTo(12, 6);
    expect(fundamentals.dividendYield).toBeCloseTo(1.1, 6);
    expect(fundamentals.payoutRatio).toBeCloseTo(35, 6);
    expect(fundamentals.debtToEquity).toBeCloseTo(1.5, 6);
    expect(fundamentals.analystTargetLow).toBe(120);
    expect(fundamentals.analystTargetHigh).toBe(180);
    expect(fundamentals.analystCount).toBe(22);
  });

  it('keeps debtToEquity when already ratio-scaled', () => {
    const provider = new YFinanceBatchProvider();
    const basicFinancials: BasicFinancials = {
      returnOnEquity: 0.1,
      debtToEquity: 1.8,
    };

    const fundamentals = provider.mapBatchFundamentals(basicFinancials, undefined);
    expect(fundamentals).toBeTruthy();
    if (!fundamentals) {
      throw new Error('Expected fundamentals to be mapped');
    }
    expect(fundamentals.debtToEquity).toBeCloseTo(1.8, 6);
  });

  it('builds technical metrics from quote + candles with non-neutral indicators', () => {
    const provider = new YFinanceBatchProvider();
    const quote: Quote = {
      c: 110,
      h: 112,
      l: 108,
      o: 109,
      pc: 100,
      t: Math.floor(Date.now() / 1000),
    };

    const technical = provider.mapBatchTechnicalMetrics(
      'TEST',
      quote,
      buildCandles(),
      { marketCap: 1_000_000_000, beta: 1.05 } satisfies BasicFinancials
    );

    expect(technical).toBeTruthy();
    if (!technical) {
      throw new Error('Expected technical metrics to be mapped');
    }
    expect(technical.currentPrice).toBe(110);
    expect(technical.dayChangePercent).toBeCloseTo(10, 6);
    expect(technical.high52Week).not.toBeNull();
    expect(technical.low52Week).not.toBeNull();
    expect(technical.priceReturn5Day).not.toBeNull();
    expect(technical.priceReturn13Week).not.toBeNull();
    expect(technical.priceReturn26Week).not.toBeNull();
    expect(technical.priceReturn52Week).not.toBeNull();
    expect(technical.volatility3Month).not.toBeNull();
    expect(technical.avgVolume10Day).not.toBeNull();
    expect(technical.candles).toHaveLength(260);
  });
});
