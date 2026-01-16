/**
 * Shared types and interfaces for market data providers.
 *
 * Providers implement these methods to supply the scoring engine with
 * fundamentals and technical metrics while hiding the underlying source
 * (Finnhub HTTP API vs. Python yfinance bridge).
 */
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

export interface TechnicalMetrics {
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  high52Week: number | null;
  low52Week: number | null;
  priceReturn5Day: number | null;
  priceReturn13Week: number | null;
  priceReturn26Week: number | null;
  priceReturn52Week: number | null;
  priceReturnMTD: number | null;
  priceReturnYTD: number | null;
  volatility3Month: number | null;
  beta: number | null;
  avgVolume10Day: number | null;
  avgVolume3Month: number | null;
}

export interface MarketDataProvider {
  getTechnicalMetrics(symbol: string): Promise<TechnicalMetrics | null>;
  getFundamentals(symbol: string): Promise<FundamentalsData | null>;
  getCompanyProfile?(symbol: string): Promise<CompanyProfile | null>;
  getRequestCount(): number;
  close(): void;
}

export type ProviderType = 'finnhub' | 'yfinance' | 'hybrid';

export interface BasicFinancials {
  metric: Record<string, number | null>;
  series: {
    annual?: {
      [key: string]: Array<{ period: string; v: number }>;
    };
  };
}

export interface Quote {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export interface CompanyProfile {
  name: string;
  ticker: string;
  shareOutstanding: number;
  marketCapitalization: number;
  country?: string;
  currency?: string;
  exchange?: string;
  industry?: string;
   sector?: string;
}

export interface Candles {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];
  v: number[];
  s: 'ok' | 'no_data' | 'error';
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public symbol: string,
    public method: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
