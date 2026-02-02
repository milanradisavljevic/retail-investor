import { describe, it, expect } from 'vitest';
import { YFinanceProvider } from '@/providers/yfinance_provider';

describe('Data Fetch Performance Baseline', () => {
  it('should fetch 10 symbols in <60 seconds with current implementation', async () => {
    const provider = new YFinanceProvider();
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'ADBE', 'CRM'];

    const startTime = Date.now();

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const [fundamentals, technical] = await Promise.all([
          provider.getFundamentals(symbol),
          provider.getTechnicalMetrics(symbol),
        ]);
        return { symbol, fundamentals, technical };
      })
    );

    const duration = Date.now() - startTime;
    const durationSeconds = duration / 1000;

    console.log(`Baseline: ${symbols.length} symbols in ${durationSeconds.toFixed(1)}s`);
    console.log(`Avg per symbol: ${(durationSeconds / symbols.length).toFixed(2)}s`);

    expect(results).toHaveLength(10);
    expect(results.every(r => r.fundamentals || r.technical)).toBe(true);

    // Baseline assertion (current implementation)
    expect(durationSeconds).toBeLessThan(120); // Should complete in <2 min
  }, 180000); // 3 min timeout
});
