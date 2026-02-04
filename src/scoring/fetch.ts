import { getFundamentalsIfFresh, type FundamentalsData } from '@/data/repositories/fundamentals_repo';
import {
  getCachedTechnicalMetrics,
  type CachedTechnicalMetrics,
} from '@/data/repositories/technical_metrics_repo';
import {
  getCompanyProfileIfFresh,
  saveCompanyProfile,
} from '@/data/repositories/profile_repo';
import type { MarketDataProvider, CompanyProfile, TechnicalMetrics } from '@/providers/types';
import type { SymbolRawData } from './metric_resolution';
import { RequestThrottler } from '@/utils/throttler';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from '@/utils/logger';

export interface FetchCacheConfig {
  fundamentalsTtlMs: number;
  technicalTtlSeconds: number;
  profileTtlMs: number;
}

export interface RequestStats {
  fundamentalsCacheHits: number;
  technicalCacheHits: number;
  profileCacheHits: number;
  fundamentalsRequests: number;
  technicalRequests: number;
  profileRequests: number;
}

export interface FetchDependencies {
  provider: MarketDataProvider;
  fallbackProvider?: MarketDataProvider | null;
  throttler: RequestThrottler;
  cache: FetchCacheConfig;
  requiredMetrics: string[];
  stats: RequestStats;
  cacheOverrides?: {
    fundamentals?: typeof getFundamentalsIfFresh;
    technical?: typeof getCachedTechnicalMetrics;
    profile?: typeof getCompanyProfileIfFresh;
  };
  persistProfile?: boolean;
}

export interface FetchResult {
  raw: SymbolRawData;
  fallbackFundamentals: FundamentalsData | null;
  fallbackProfile: CompanyProfile | null;
  fromCache: boolean;
}

export async function fetchSymbolDataWithCache(
  symbol: string,
  deps: FetchDependencies
): Promise<FetchResult> {
  const PERF_ENABLED = process.env.PERFORMANCE_LOG === 'true';
  const perfLogPath = path.join(process.cwd(), 'data', 'performance', 'fetch-phase-log.ndjson');
  const perfLogger = createChildLogger('fetch_perf');
  const ensurePerfDir = () => {
    const dir = path.dirname(perfLogPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };
  const logPhase = (
    phase: 'fundamentals' | 'prices' | 'technical' | 'metadata',
    durationMs: number,
    cacheHit: boolean,
    provider: string,
    error?: string
  ) => {
    if (!PERF_ENABLED) return;
    ensurePerfDir();
    const entry = {
      ts: Date.now(),
      phase,
      symbol,
      durationMs,
      cacheHit,
      provider,
      error,
    };
    try {
      fs.appendFileSync(perfLogPath, JSON.stringify(entry) + '\n');
    } catch (err) {
      perfLogger.warn({ err }, 'Failed to write perf log');
    }
    perfLogger.debug(entry, 'FETCH_PHASE');
  };

  const { provider, fallbackProvider, throttler, cache, requiredMetrics, stats } = deps;
  const fundamentalsFn = deps.cacheOverrides?.fundamentals ?? getFundamentalsIfFresh;
  const technicalFn = deps.cacheOverrides?.technical ?? getCachedTechnicalMetrics;
  const profileFn = deps.cacheOverrides?.profile ?? getCompanyProfileIfFresh;

  let fundamentals: FundamentalsData | null = null;
  let technical: TechnicalMetrics | null = null;
  let profile: CompanyProfile | null = null;

  const cachedFundamentals = fundamentalsFn(symbol, cache.fundamentalsTtlMs);
  if (cachedFundamentals) {
    stats.fundamentalsCacheHits += 1;
    fundamentals = cachedFundamentals.data;
    logPhase('fundamentals', 0, true, provider.constructor.name);
  }

  const cachedTechnical: CachedTechnicalMetrics | null = technicalFn(
    symbol,
    cache.technicalTtlSeconds
  );
  if (cachedTechnical) {
    stats.technicalCacheHits += 1;
    technical = cachedTechnical.data;
    logPhase('prices', 0, true, provider.constructor.name);
  }

  const cachedProfile = profileFn(symbol, cache.profileTtlMs);
  if (cachedProfile) {
    stats.profileCacheHits += 1;
    profile = cachedProfile.profile;
    logPhase('metadata', 0, true, provider.constructor.name);
  }

  if (!fundamentals) {
    const t0 = Date.now();
    try {
      fundamentals = await throttler.schedule(() => provider.getFundamentals(symbol));
      logPhase('fundamentals', Date.now() - t0, false, provider.constructor.name);
    } catch (err) {
      logPhase('fundamentals', Date.now() - t0, false, provider.constructor.name, String(err));
      throw err;
    }
    stats.fundamentalsRequests += 1;
    if (fundamentals && fallbackProvider && needsFallback(fundamentals, requiredMetrics)) {
      // Keep fallback fetches lazy but deterministic
    }
  }

  if (!technical) {
    const t0 = Date.now();
    try {
      technical = await throttler.schedule(() => provider.getTechnicalMetrics(symbol));
      logPhase('prices', Date.now() - t0, false, provider.constructor.name);
    } catch (err) {
      logPhase('prices', Date.now() - t0, false, provider.constructor.name, String(err));
      throw err;
    }
    stats.technicalRequests += 1;
  }

  if (!profile && provider.getCompanyProfile) {
    const t0 = Date.now();
    try {
      profile = await throttler.schedule(() => provider.getCompanyProfile!(symbol));
      logPhase('metadata', Date.now() - t0, false, provider.constructor.name);
    } catch (err) {
      logPhase('metadata', Date.now() - t0, false, provider.constructor.name, String(err));
      throw err;
    }
    stats.profileRequests += 1;
  }

  let fallbackFundamentals: FundamentalsData | null = null;
  let fallbackProfile: CompanyProfile | null = null;

  if (fallbackProvider && (!fundamentals || needsFallback(fundamentals, requiredMetrics))) {
    const t0 = Date.now();
    fallbackFundamentals = await throttler.schedule(() =>
      fallbackProvider.getFundamentals(symbol)
    );
    logPhase('fundamentals', Date.now() - t0, false, fallbackProvider.constructor.name);
    stats.fundamentalsRequests += 1;
    if (fallbackProvider.getCompanyProfile) {
      const t1 = Date.now();
      fallbackProfile = await throttler.schedule(() =>
        fallbackProvider.getCompanyProfile!(symbol)
      );
      logPhase('metadata', Date.now() - t1, false, fallbackProvider.constructor.name);
      stats.profileRequests += 1;
    }
  }

  if (deps.persistProfile !== false) {
    if (profile) {
      saveCompanyProfile(symbol, profile);
    } else if (fallbackProfile) {
      saveCompanyProfile(symbol, fallbackProfile);
    }
  }

  const raw: SymbolRawData = {
    symbol,
    fundamentals,
    technical,
    profile,
  };

  // Determine if this symbol was fully served from cache
  const fromCache =
    cachedFundamentals !== null &&
    cachedTechnical !== null &&
    cachedProfile !== null;

  return { raw, fallbackFundamentals, fallbackProfile, fromCache };
}

function needsFallback(fundamentals: FundamentalsData, required: string[]): boolean {
  return required.some((metric) => {
    const value = (fundamentals as unknown as Record<string, unknown>)[metric];
    return value === null || value === undefined;
  });
}

/**
 * Batch fetch for multiple symbols using YFinanceBatchProvider.
 * Significantly faster than individual fetching due to reduced process spawning.
 */
export async function fetchSymbolsBatch(
  symbols: string[],
  cache: FetchCacheConfig,
  stats: RequestStats
): Promise<Map<string, FetchResult>> {
  const { YFinanceBatchProvider } = await import('@/providers/yfinance_batch_provider');
  const batchProvider = new YFinanceBatchProvider();

  const results = new Map<string, FetchResult>();
  const PERF_ENABLED = process.env.PERFORMANCE_LOG === 'true';
  const perfLogPath = path.join(process.cwd(), 'data', 'performance', 'fetch-phase-log.ndjson');
  const perfLogger = createChildLogger('fetch_batch');

  const fundamentalsFn = getFundamentalsIfFresh;
  const technicalFn = getCachedTechnicalMetrics;
  const profileFn = getCompanyProfileIfFresh;

  // Check cache first for all symbols
  const uncachedSymbols: string[] = [];

  for (const symbol of symbols) {
    const cachedFundamentals = fundamentalsFn(symbol, cache.fundamentalsTtlMs);
    const cachedTechnical = technicalFn(symbol, cache.technicalTtlSeconds);
    const cachedProfile = profileFn(symbol, cache.profileTtlMs);

    if (cachedFundamentals && cachedTechnical && cachedProfile) {
      // Fully cached
      stats.fundamentalsCacheHits += 1;
      stats.technicalCacheHits += 1;
      stats.profileCacheHits += 1;

      results.set(symbol, {
        raw: {
          symbol,
          fundamentals: cachedFundamentals.data,
          technical: cachedTechnical.data,
          profile: cachedProfile.profile,
        },
        fallbackFundamentals: null,
        fallbackProfile: null,
        fromCache: true,
      });
    } else {
      uncachedSymbols.push(symbol);
    }
  }

  // Batch fetch uncached symbols
  if (uncachedSymbols.length > 0) {
    const t0 = Date.now();

    try {
      const batchResults = await batchProvider.fetchBatch(
        uncachedSymbols,
        ['basic_financials', 'quote', 'candles', 'analyst_data', 'profile']
      );

      const batchDuration = Date.now() - t0;
      perfLogger.info({
        symbolCount: uncachedSymbols.length,
        durationMs: batchDuration,
        avgPerSymbol: (batchDuration / uncachedSymbols.length).toFixed(1),
      }, 'BATCH_FETCH_COMPLETE');

      // Process batch results
      for (const symbol of uncachedSymbols) {
        const data = batchResults[symbol];

        if (data?.error) {
          perfLogger.warn({ symbol, error: data.error }, 'BATCH_FETCH_ERROR');
          results.set(symbol, {
            raw: { symbol, fundamentals: null, technical: null, profile: null },
            fallbackFundamentals: null,
            fallbackProfile: null,
            fromCache: false,
          });
          continue;
        }

        // Map to internal format
        const fundamentals = (batchProvider as any).mapFundamentals(
          data?.basic_financials,
          data?.analyst_data
        );
        const technical = (batchProvider as any).buildTechnicalMetrics(
          symbol,
          data?.quote,
          data?.candles,
          data?.basic_financials
        );
        const profile = data?.profile || null;

        results.set(symbol, {
          raw: { symbol, fundamentals, technical, profile },
          fallbackFundamentals: null,
          fallbackProfile: null,
          fromCache: false,
        });

        stats.fundamentalsRequests += 1;
        stats.technicalRequests += 1;
        stats.profileRequests += 1;

        // Log individual symbol performance
        if (PERF_ENABLED) {
          const symbolDuration = batchDuration / uncachedSymbols.length;
          const ensurePerfDir = () => {
            const dir = path.dirname(perfLogPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          };
          ensurePerfDir();

          fs.appendFileSync(
            perfLogPath,
            JSON.stringify({
              ts: Date.now(),
              phase: 'fundamentals',
              symbol,
              durationMs: symbolDuration,
              cacheHit: false,
              provider: 'YFinanceBatchProvider',
            }) + '\n'
          );
        }
      }

    } catch (err) {
      perfLogger.error({ err, symbolCount: uncachedSymbols.length }, 'BATCH_FETCH_FAILED');
      throw err;
    }
  }

  return results;
}
