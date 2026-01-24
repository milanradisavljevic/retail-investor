/**
 * Finnhub API Client
 * Rate-limited with exponential backoff and caching integration
 */

import { createChildLogger } from '@/utils/logger';
import { getConfig } from '@/core/config';
import { hoursToSeconds, daysToSeconds } from '@/core/time';
import {
  saveFundamentals,
  getLatestFundamentals,
  type FundamentalsData,
} from '@/data/repositories/fundamentals_repo';
import {
  getCachedTechnicalMetrics,
  saveTechnicalMetricsCache,
} from '@/data/repositories/technical_metrics_repo';
import type { TechnicalMetrics } from '@/providers/types';
import { getRateLimiter } from './rate_limiter';
import type {
  FinnhubCandle,
  FinnhubMetric,
  FinnhubProfile,
  FinnhubQuote,
} from './types';
import type { CompanyProfile } from '../types';

const logger = createChildLogger('finnhub');

const BASE_URL = 'https://finnhub.io/api/v1';

interface FetchOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
}

export class FinnhubClient {
  private readonly apiKey: string;
  private requestCount = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  private async fetchWithRetry<T>(
    endpoint: string,
    params: Record<string, string | number> = {},
    options: FetchOptions = {}
  ): Promise<T> {
    const { maxRetries = 3, initialBackoffMs = 1000 } = options;

    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set('token', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const rateLimiter = getRateLimiter();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await rateLimiter.acquire();

        const response = await fetch(url.toString());
        this.requestCount++;

        if (response.status === 429) {
          // Rate limited - wait and retry
          rateLimiter.release();
          const backoffMs = initialBackoffMs * Math.pow(2, attempt);
          logger.warn({ attempt, backoffMs }, 'Rate limited by Finnhub, backing off');
          await this.sleep(backoffMs);
          continue;
        }

        if (!response.ok) {
          rateLimiter.release();
          throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        rateLimiter.release();
        return data as T;
      } catch (error) {
        rateLimiter.release();
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const backoffMs = initialBackoffMs * Math.pow(2, attempt);
          logger.warn(
            { attempt, backoffMs, error: lastError.message },
            'Finnhub request failed, retrying'
          );
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error('Finnhub request failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchCandles(
    symbol: string,
    resolution: string = 'D',
    from: number,
    to: number
  ): Promise<FinnhubCandle> {
    return this.fetchWithRetry<FinnhubCandle>('/stock/candle', {
      symbol,
      resolution,
      from,
      to,
    });
  }

  async fetchMetrics(symbol: string): Promise<FinnhubMetric> {
    return this.fetchWithRetry<FinnhubMetric>('/stock/metric', {
      symbol,
      metric: 'all',
    });
  }

  async fetchProfile(symbol: string): Promise<FinnhubProfile> {
    return this.fetchWithRetry<FinnhubProfile>('/stock/profile2', {
      symbol,
    });
  }

  async fetchQuote(symbol: string): Promise<FinnhubQuote> {
    return this.fetchWithRetry<FinnhubQuote>('/quote', {
      symbol,
    });
  }

  // Higher-level methods with caching

  async getTechnicalMetrics(symbol: string): Promise<TechnicalMetrics | null> {
    const config = getConfig();
    const ttlSeconds = hoursToSeconds(config.cacheTtl.prices_ttl_hours);

    // Return cached metrics when valid
    const cached = getCachedTechnicalMetrics(symbol, ttlSeconds);
    if (cached) {
      logger.debug({ symbol }, 'Using cached technical metrics');
      return cached.data;
    }

    // Fetch quote for current price
    logger.info({ symbol }, 'Fetching quote and metrics from Finnhub');

    try {
      // Fetch quote and metrics in parallel (2 API calls)
      const [quote, metricsResponse] = await Promise.all([
        this.fetchQuote(symbol),
        this.fetchMetrics(symbol),
      ]);

      const m = metricsResponse.metric;

      const technicalMetrics: TechnicalMetrics = {
        currentPrice: quote.c,
        previousClose: quote.pc,
        dayChange: quote.d,
        dayChangePercent: quote.dp,
        high52Week: m['52WeekHigh'] ?? null,
        low52Week: m['52WeekLow'] ?? null,
        priceReturn5Day: m['5DayPriceReturnDaily'] ?? null,
        priceReturn13Week: m['13WeekPriceReturnDaily'] ?? null,
        priceReturn26Week: m['26WeekPriceReturnDaily'] ?? null,
        priceReturn52Week: m['52WeekPriceReturnDaily'] ?? null,
        priceReturnMTD: m.monthToDatePriceReturnDaily ?? null,
        priceReturnYTD: m.yearToDatePriceReturnDaily ?? null,
        volatility3Month: m['3MonthADReturnStd'] ?? null,
        beta: m.beta ?? null,
        avgVolume10Day: m['10DayAverageTradingVolume'] ?? null,
        avgVolume3Month: m['3MonthAverageTradingVolume'] ?? null,
      };

      if (!technicalMetrics.high52Week || !technicalMetrics.low52Week) {
        logger.warn({ symbol }, '52-week range missing from Finnhub metrics');
      }

      saveTechnicalMetricsCache(symbol, technicalMetrics, ttlSeconds);
      return technicalMetrics;
    } catch (error) {
      logger.error({ symbol, error }, 'Failed to fetch technical metrics');
      return null;
    }
  }

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    const config = getConfig();
    const ttlSeconds = daysToSeconds(config.cacheTtl.fundamentals_ttl_days);
    const ttlMs = ttlSeconds * 1000;

    // Check cached data
    const cached = getLatestFundamentals(symbol);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      logger.debug({ symbol }, 'Using cached fundamentals');
      return cached.data;
    }

    logger.info({ symbol }, 'Fetching fundamentals from Finnhub');

    try {
      const [metrics, profile] = await Promise.all([
        this.fetchMetrics(symbol),
        this.fetchProfile(symbol),
      ]);

      if (!metrics.metric) {
        logger.warn({ symbol }, 'No metrics data returned');
        return null;
      }

      const m = metrics.metric;
      const shares = profile?.shareOutstanding ?? null;

      const data: FundamentalsData = {
        peRatio: m.peExclExtraTTM ?? m.peBasicExclExtraTTM ?? null,
        pbRatio: m.pbQuarterly ?? m.pbAnnual ?? null,
        psRatio:
          m.priceToSalesTTM ??
          m.priceToSalesAnnual ??
          derivePriceToSalesFromMarketCap(m, shares) ??
          null,
        pegRatio: m.pegRatio ?? null,
        roe: m.roeTTM ?? m.roeRfy ?? null,
        roa: m.roaeTTM ?? m.roaRfy ?? null,
        debtToEquity:
          m.totalDebtEquityQuarterly ??
          m.totalDebtEquityAnnual ??
          m.longTermDebtEquityQuarterly ??
          m.longTermDebtEquityAnnual ??
          deriveDebtToEquityFromNetDebt(m, profile) ??
          null,
        currentRatio: m.currentRatioQuarterly ?? m.currentRatioAnnual ?? null,
        grossMargin: m.grossMarginTTM ?? m.grossMarginAnnual ?? null,
        operatingMargin: m.operatingMarginTTM ?? m.operatingMarginAnnual ?? null,
        netMargin: m.netMarginTTM ?? m.netMarginAnnual ?? null,
        dividendYield: m.dividendYieldIndicatedAnnual ?? null,
        payoutRatio: m.payoutRatioAnnual ?? null,
        freeCashFlow: m.freeCashFlowPerShareTTM ?? null,
        marketCap: m.marketCapitalization ?? null,
        enterpriseValue: null, // Not directly available
        revenueGrowth: m.revenueGrowthTTMYoy ?? m.revenueGrowth3Y ?? null,
        earningsGrowth: m.epsGrowthTTMYoy ?? m.epsGrowth3Y ?? null,
        analystTargetMean: null,
        analystTargetLow: null,
        analystTargetHigh: null,
        analystCount: null,
        nextEarningsDate: null,
        beta: m.beta ?? null,
        raw: m as unknown as Record<string, unknown>,
      };

      // Save to database (timestamp is stored in fundamentals_snapshot)
      saveFundamentals(symbol, data);

      return data;
    } catch (error) {
      logger.error({ symbol, error }, 'Failed to fetch fundamentals');
      return null;
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
    try {
      const profile = await this.fetchProfile(symbol);
      return {
        name: profile.name,
        ticker: profile.ticker,
        shareOutstanding: profile.shareOutstanding,
        marketCapitalization: profile.marketCapitalization,
        country: profile.country,
        currency: profile.currency,
        exchange: profile.exchange,
        industry: profile.finnhubIndustry,
        sector: profile.finnhubIndustry, // Finnhub exposes finnhubIndustry; use as sector surrogate
      };
    } catch (error) {
      logger.error({ symbol, error }, 'Failed to fetch company profile');
      return null;
    }
  }
}

// Factory function
let clientInstance: FinnhubClient | null = null;

function deriveDebtToEquityFromNetDebt(
  metric: FinnhubMetric['metric'],
  profile: FinnhubProfile | null
): number | null {
  const shares = profile?.shareOutstanding ?? null;
  const bookValuePerShare =
    metric.bookValuePerShareQuarterly ?? metric.bookValuePerShareAnnual ?? null;
  const netDebt =
    metric.totalDebt ??
    metric.netDebtQuarterly ??
    metric.netDebtAnnual ??
    null;

  if (
    shares === null ||
    bookValuePerShare === null ||
    netDebt === null ||
    bookValuePerShare <= 0 ||
    shares <= 0
  ) {
    return null;
  }

  const totalEquity = shares * bookValuePerShare;
  if (totalEquity === 0) return null;

  return netDebt / totalEquity;
}

function derivePriceToSalesFromMarketCap(
  metric: FinnhubMetric['metric'],
  sharesOutstanding: number | null
): number | null {
  const marketCap = metric.marketCapitalization;
  const salesPerShare = metric.salesPerShareTTM;
  if (
    marketCap === null ||
    marketCap === undefined ||
    salesPerShare === null ||
    salesPerShare === undefined ||
    salesPerShare <= 0 ||
    !sharesOutstanding ||
    sharesOutstanding <= 0
  ) {
    return null;
  }
  // priceToSales = market cap / total revenue; revenue ≈ salesPerShare * shares
  return marketCap / (salesPerShare * sharesOutstanding);
}

export function createFinnhubClient(apiKey: string): FinnhubClient {
  return new FinnhubClient(apiKey);
}

export function getFinnhubClient(): FinnhubClient {
  if (!clientInstance) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY environment variable is required');
    }
    clientInstance = new FinnhubClient(apiKey);
  }
  return clientInstance;
}

export function resetFinnhubClient(): void {
  clientInstance = null;
}
