import { describe, it, expect } from 'vitest';
import { YFinanceBatchProvider } from '@/providers/yfinance_batch_provider';

describe('YFinanceBatchProvider', () => {
  it('should fetch batch of symbols', async () => {
    const provider = new YFinanceBatchProvider();
    const symbols = ['AAPL', 'MSFT', 'GOOGL'];

    const results = await provider.fetchBatch(symbols, ['basic_financials', 'quote']);

    expect(Object.keys(results)).toHaveLength(3);
    expect(results['AAPL']).toBeDefined();
    expect(results['MSFT']).toBeDefined();
    expect(results['GOOGL']).toBeDefined();

    // Check data structure
    expect(results['AAPL'].basic_financials).toBeDefined();
    expect(results['AAPL'].quote).toBeDefined();
    expect(results['AAPL'].basic_financials?.marketCap).toBeTypeOf('number');
  }, 30000);

  it('should handle errors gracefully', async () => {
    const provider = new YFinanceBatchProvider();
    const symbols = ['INVALID_SYMBOL_123456'];

    const results = await provider.fetchBatch(symbols, ['basic_financials']);

    // Should not throw, but may have error field
    expect(results['INVALID_SYMBOL_123456']).toBeDefined();
  }, 30000);

  it('should work with getFundamentals fallback', async () => {
    const provider = new YFinanceBatchProvider();

    const fundamentals = await provider.getFundamentals('AAPL');

    expect(fundamentals).toBeDefined();
    expect(fundamentals?.marketCap).toBeTypeOf('number');
  }, 30000);

  it('should work with getTechnicalMetrics fallback', async () => {
    const provider = new YFinanceBatchProvider();

    const technical = await provider.getTechnicalMetrics('AAPL');

    expect(technical).toBeDefined();
    expect(technical?.currentPrice).toBeTypeOf('number');
    expect(technical?.candles).toBeInstanceOf(Array);
  }, 30000);
});
