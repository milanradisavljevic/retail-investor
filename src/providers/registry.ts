import type { MarketDataProvider, ProviderType } from './types';
import { FinnhubProvider } from './finnhub/provider';
import { YFinanceProvider } from './yfinance_provider';

/**
 * Create market data provider based on ENV configuration.
 *
 * ENV:
 * - MARKET_DATA_PROVIDER: 'finnhub' | 'yfinance' | 'hybrid'
 *
 * Default: 'finnhub'
 */
export function createProvider(
  providerType?: ProviderType
): MarketDataProvider {
  const type =
    providerType ||
    (process.env.MARKET_DATA_PROVIDER as ProviderType) ||
    'finnhub';

  switch (type) {
    case 'yfinance':
      return new YFinanceProvider();
    case 'finnhub':
      return new FinnhubProvider();
    case 'hybrid':
      console.warn('Hybrid provider not yet implemented, using yfinance');
      return new YFinanceProvider();
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
