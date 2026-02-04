import { describe, expect, it } from 'vitest';
import { mergeWithBenchmark } from '@/lib/analysis/timeSeriesAnalysis';

describe('mergeWithBenchmark', () => {
  it('forward-fills the latest SPY close when the US market is closed', () => {
    const series = [
      { date: '2024-05-24', close: 100 },
      // 2024-05-27 was Memorial Day (US closed, EU open)
      { date: '2024-05-27', close: 102 },
      { date: '2024-05-28', close: 101 },
    ];

    const benchmark = [
      { date: '2024-05-24', close: 400 },
      { date: '2024-05-28', close: 405 },
    ];

    expect(mergeWithBenchmark(series, benchmark)).toEqual([
      { date: '2024-05-24', price: 100, sp500: 400 },
      { date: '2024-05-27', price: 102, sp500: 400 }, // forward-filled
      { date: '2024-05-28', price: 101, sp500: 405 },
    ]);
  });

  it('keeps series when benchmark is completely missing', () => {
    const series = [
      { date: '2024-01-02', close: 50 },
      { date: '2024-01-03', close: 55 },
    ];

    expect(mergeWithBenchmark(series, [])).toEqual([
      { date: '2024-01-02', price: 50, sp500: 50 },
      { date: '2024-01-03', price: 55, sp500: 55 },
    ]);
  });
});
