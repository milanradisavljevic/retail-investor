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
  }

  const cachedTechnical: CachedTechnicalMetrics | null = technicalFn(
    symbol,
    cache.technicalTtlSeconds
  );
  if (cachedTechnical) {
    stats.technicalCacheHits += 1;
    technical = cachedTechnical.data;
  }

  const cachedProfile = profileFn(symbol, cache.profileTtlMs);
  if (cachedProfile) {
    stats.profileCacheHits += 1;
    profile = cachedProfile.profile;
  }

  if (!fundamentals) {
    fundamentals = await throttler.schedule(() => provider.getFundamentals(symbol));
    stats.fundamentalsRequests += 1;
    if (fundamentals && fallbackProvider && needsFallback(fundamentals, requiredMetrics)) {
      // Keep fallback fetches lazy but deterministic
    }
  }

  if (!technical) {
    technical = await throttler.schedule(() => provider.getTechnicalMetrics(symbol));
    stats.technicalRequests += 1;
  }

  if (!profile && provider.getCompanyProfile) {
    profile = await throttler.schedule(() => provider.getCompanyProfile!(symbol));
    stats.profileRequests += 1;
  }

  let fallbackFundamentals: FundamentalsData | null = null;
  let fallbackProfile: CompanyProfile | null = null;

  if (fallbackProvider && (!fundamentals || needsFallback(fundamentals, requiredMetrics))) {
    fallbackFundamentals = await throttler.schedule(() =>
      fallbackProvider.getFundamentals(symbol)
    );
    stats.fundamentalsRequests += 1;
    if (fallbackProvider.getCompanyProfile) {
      fallbackProfile = await throttler.schedule(() =>
        fallbackProvider.getCompanyProfile!(symbol)
      );
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
