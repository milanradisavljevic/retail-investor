/**
 * Main Scoring Engine
 * Orchestrates fundamental and technical scoring for all symbols
 */

import { createChildLogger } from '@/utils/logger';
import { getUniverse } from '@/core/universe';
import { getScoringConfig } from './scoring_config';
import { getConfig } from '@/core/config';
import {
  calculateFundamentalScore,
  type FundamentalScoreResult,
} from './fundamental';
import {
  calculateTechnicalScore,
  type TechnicalScoreResult,
} from './technical';
import {
  calculateEvidencePillars,
  calculateTotalScore,
  type EvidencePillars,
} from './evidence';
import { createProvider } from '@/providers/registry';
import type {
  CompanyProfile,
  MarketDataProvider,
  ProviderType,
  TechnicalMetrics,
} from '@/providers/types';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type { DataQuality } from '@/data/quality/types';
import {
  buildGroupMedians,
  resolveSymbolMetrics,
  type SymbolRawData,
} from './metric_resolution';
import { getLastTradingDay, formatDate, daysToSeconds, hoursToSeconds } from '@/core/time';
import { summarizeDataQuality, type DataQualitySummary } from '@/data/quality/data_quality';
import { calculateModeV1 } from '@/mode/mode_v1';
import type { ModeResult } from '@/mode/types';
import { YFinanceProvider } from '@/providers/yfinance_provider';
import { getDataQualityConfig } from '@/data/quality/config';
import {
  calculatePriceTargets,
  calculateSectorMedians,
  calculatePillarSpread,
  extractStockMetrics,
  getSectorMediansForStock,
  type SectorMedianSet,
  type PriceTargetDiagnostics,
  type PriceTarget,
  type StockMetrics,
} from './price-target';
import { fetchSymbolDataWithCache, type RequestStats } from './fetch';
import { RequestThrottler } from '@/utils/throttler';

const logger = createChildLogger('scoring_engine');

export interface SymbolScore {
  symbol: string;
  totalScore: number;
  breakdown: {
    fundamental: number;
    technical: number;
  };
  evidence: EvidencePillars;
  dataQuality: DataQuality;
  priceTarget: PriceTarget | null;
  priceTargetDiagnostics: PriceTargetDiagnostics | null;
  isScanOnly?: boolean;
  valuationInputCoverage?: FundamentalScoreResult['valuationInputCoverage'];
  raw: {
    fundamental: FundamentalScoreResult;
    technical: TechnicalScoreResult;
  };
}

export interface ScoringResult {
  scores: SymbolScore[];
  mode: ModeResult;
  dataQualitySummary: DataQualitySummary;
  metadata: {
    scoredAt: number;
    symbolCount: number;
    requestsMade: number;
    errors: string[];
    provider: ProviderType;
    pipeline?: {
      topK?: number;
      maxSymbolsPerRun?: number;
      truncated?: boolean;
      originalSymbolCount?: number;
      scoredSymbolCount?: number;
      warnings?: string[];
      requestBudget?: {
        estimatedRequests?: number;
        actualRequests?: number;
        fundamentalsCacheHitRate?: number;
        technicalCacheHitRate?: number;
        fundamentalsCacheHits?: number;
        technicalCacheHits?: number;
      };
    };
    symbolsUsed?: string[];
  };
}

export interface ScoreSymbolContext {
  profile: CompanyProfile | null;
  sectorMedians: SectorMedianSet;
}

export async function scoreSymbol(
  symbol: string,
  resolvedFundamentals: FundamentalsData | null,
  technicalMetrics: TechnicalMetrics | null,
  dataQuality: DataQuality,
  scoringConfig = getScoringConfig(),
  context?: ScoreSymbolContext,
  options?: { computePriceTarget?: boolean }
): Promise<SymbolScore> {
  // Calculate scores
  const fundamentalResult = calculateFundamentalScore(
    resolvedFundamentals,
    undefined,
    scoringConfig.fundamentalThresholds
  );

  const technicalResult = calculateTechnicalScore(technicalMetrics);

  const evidence = calculateEvidencePillars(fundamentalResult, technicalResult);
  const totalScore = calculateTotalScore(evidence, scoringConfig.pillarWeights);

  // Combine missing fields and assumptions
  const missingFields = [
    ...fundamentalResult.missingFields,
    ...technicalResult.missingFields,
  ];

  const assumptions = [
    ...fundamentalResult.assumptions,
    ...technicalResult.assumptions,
  ];

  // Calculate price target if we have the context
  let priceTarget: PriceTarget | null = null;
  let priceTargetDiagnostics: PriceTargetDiagnostics | null = null;
  if (options?.computePriceTarget !== false && context && technicalMetrics?.currentPrice) {
    const stockMetrics = extractStockMetrics(
      symbol,
      technicalMetrics.currentPrice,
      resolvedFundamentals,
      context.profile
    );

    const sectorMedians = getSectorMediansForStock(
      stockMetrics,
      context.sectorMedians,
      scoringConfig.priceTarget
    );
    const pillarSpread = calculatePillarSpread(evidence);

    const priceTargetResult = calculatePriceTargets(
      stockMetrics,
      sectorMedians,
      {
        totalScore,
        volatilityScore: technicalResult.components.volatility,
        dataQualityScore: dataQuality.dataQualityScore,
        pillarSpread,
      },
      scoringConfig.priceTarget
    );
    priceTarget = priceTargetResult.target;
    priceTargetDiagnostics = priceTargetResult.diagnostics;
  }

  return {
    symbol,
    totalScore,
    breakdown: {
      fundamental: fundamentalResult.total,
      technical: technicalResult.total,
    },
    evidence,
    dataQuality: {
      ...dataQuality,
      missingFields,
      assumptions: assumptions.slice(0, 10), // Max 10 per schema
      adjustedPriceMode: 'adjusted', // Finnhub provides adjusted prices
    },
    priceTarget,
    priceTargetDiagnostics,
    isScanOnly: options?.computePriceTarget === false,
    valuationInputCoverage: fundamentalResult.valuationInputCoverage,
    raw: {
      fundamental: fundamentalResult,
      technical: technicalResult,
    },
  };
}

export async function scoreUniverse(): Promise<ScoringResult> {
  const symbols = getUniverse();
  const appConfig = getConfig();
  const errors: string[] = [];
  const scores: SymbolScore[] = [];
  const scanOnlyScores: SymbolScore[] = [];
  const scoredAt = Date.now();
  const scoringConfig = getScoringConfig();
  const pipelineCfg = scoringConfig.pipeline ?? {};
  const maxSymbolsPerRun = pipelineCfg.maxSymbolsPerRun;
  const throttler = new RequestThrottler(pipelineCfg.throttleMs ?? 0);
  const MAX_CONCURRENCY = pipelineCfg.maxConcurrency ?? 4;
  const { symbolsToScore, truncated } = applySymbolLimit(symbols, maxSymbolsPerRun);
  if (pipelineCfg.scanOnlyPriceTarget) {
    logger.warn('pipeline.scan_only_price_target is enabled in config but scan phase will skip price targets by design');
  }
  const providerType =
    (process.env.MARKET_DATA_PROVIDER as ProviderType) ||
    (appConfig.universe.provider as ProviderType) ||
    'finnhub';
  const provider = createProvider(providerType);
  const fallbackProvider =
    providerType === 'yfinance' ? null : new YFinanceProvider();

  logger.info(
    {
      symbolCount: symbols.length,
      provider: providerType,
    },
    'Starting universe scoring'
  );

  const asOfDate = getLastTradingDay(new Date());
  const asOfDateStr = formatDate(asOfDate);
  const requestStats: RequestStats = {
    fundamentalsCacheHits: 0,
    technicalCacheHits: 0,
    profileCacheHits: 0,
    fundamentalsRequests: 0,
    technicalRequests: 0,
    profileRequests: 0,
  };
  const fundamentalsTtlMs = daysToSeconds(appConfig.cacheTtl.fundamentals_ttl_days) * 1000;
  const technicalTtlSeconds = hoursToSeconds(appConfig.cacheTtl.prices_ttl_hours);
  const profileTtlMs = daysToSeconds(appConfig.cacheTtl.profile_ttl_days) * 1000;
  const requiredMetrics = getDataQualityConfig().required_metrics;

  try {
    const rawDataMap: Record<string, SymbolRawData> = {};
    const fallbackFundamentalsMap: Record<string, FundamentalsData | null> = {};
    const fallbackProfileMap: Record<string, CompanyProfile | null> = {};

    // Pass 1: fetch raw data with cache + throttling
    await runWithConcurrency(
      symbolsToScore,
      async (symbol) => {
        try {
          const { raw, fallbackFundamentals, fallbackProfile } =
            await fetchSymbolDataWithCache(symbol, {
              provider,
              fallbackProvider,
              throttler,
              cache: {
                fundamentalsTtlMs,
                technicalTtlSeconds,
                profileTtlMs,
              },
              requiredMetrics,
              stats: requestStats,
            });
          rawDataMap[symbol] = raw;
          fallbackFundamentalsMap[symbol] = fallbackFundamentals ?? null;
          fallbackProfileMap[symbol] = fallbackProfile ?? null;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${symbol}: ${message}`);
          logger.error({ symbol, error: message }, 'Failed to fetch raw data');
          rawDataMap[symbol] = {
            symbol,
            fundamentals: null,
            technical: null,
            profile: null,
          };
          if (fallbackProvider) {
            fallbackFundamentalsMap[symbol] = null;
            fallbackProfileMap[symbol] = null;
          }
        }
      },
      Math.min(MAX_CONCURRENCY, symbolsToScore.length)
    );

    const medians = buildGroupMedians(asOfDateStr, Object.values(rawDataMap));

    // Build sector medians for price targets
    const stockMetricsForSectors: StockMetrics[] = [];
    for (const symbol of symbolsToScore) {
      const raw = rawDataMap[symbol];
      if (raw?.fundamentals && raw?.technical?.currentPrice) {
        stockMetricsForSectors.push(
          extractStockMetrics(
            symbol,
            raw.technical.currentPrice,
            raw.fundamentals,
            raw.profile
          )
        );
      }
    }
    const sectorMedians = calculateSectorMedians(
      stockMetricsForSectors,
      scoringConfig.priceTarget
    );
    logger.info(
      { sectorCount: sectorMedians.sectors.size },
      'Calculated sector medians for price targets'
    );

    // Phase 1: scan-only scoring without price targets
    await runWithConcurrency(
      symbolsToScore,
      async (symbol) => {
        try {
          const raw = rawDataMap[symbol];
          const resolved = resolveSymbolMetrics(
            symbol,
            raw,
            medians,
            fallbackFundamentalsMap[symbol] ?? null,
            fallbackProfileMap[symbol] ?? null
          );

          const scoreContext: ScoreSymbolContext = {
            profile: raw.profile,
            sectorMedians,
          };

          const score = await scoreSymbol(
            symbol,
            resolved.fundamentals,
            resolved.technical,
            resolved.dataQuality,
            scoringConfig,
            scoreContext,
            { computePriceTarget: false }
          );
          scanOnlyScores.push(score);
          logger.debug({ symbol, score: score.totalScore }, 'Symbol scored');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${symbol}: ${message}`);
          logger.error({ symbol, error: message }, 'Failed to score symbol');

          // Add neutral score for failed symbols
          scanOnlyScores.push({
            symbol,
            totalScore: 50,
            breakdown: { fundamental: 50, technical: 50 },
            evidence: { valuation: 50, quality: 50, technical: 50, risk: 50 },
            dataQuality: {
              dataQualityScore: 50,
              dataQualityConfidence: 0,
              completenessRatio: 0,
              imputedRatio: 1,
              missingCritical: ['all'],
              metrics: {},
              missingFields: ['all'],
              assumptions: [`Scoring failed: ${message}`],
              adjustedPriceMode: 'adjusted',
            },
            priceTarget: null,
            priceTargetDiagnostics: null,
            isScanOnly: true,
            raw: {
              fundamental: {
                total: 50,
                components: { valuation: 50, quality: 50 },
                breakdown: {
                  peScore: 50,
                  pbScore: 50,
                  psScore: 50,
                  roeScore: 50,
                  debtEquityScore: 50,
                },
                missingFields: ['all'],
                assumptions: [`Scoring failed: ${message}`],
              },
              technical: {
                total: 50,
                components: { trend: 50, momentum: 50, volatility: 50 },
                indicators: {
                  currentPrice: null,
                  high52Week: null,
                  low52Week: null,
                  priceReturn13Week: null,
                  priceReturn52Week: null,
                  beta: null,
                  volatility3Month: null,
                  position52Week: null,
                },
                missingFields: ['all'],
                assumptions: [`Scoring failed: ${message}`],
              },
            },
          });
        }
      },
      Math.min(MAX_CONCURRENCY, symbolsToScore.length)
    );

    // Phase 2: select top K and run deep scoring (with price targets/diagnostics)
    const topK = scoringConfig.pipeline?.topK ?? 50;
    const sortedScan = scanOnlyScores
      .slice()
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.symbol.localeCompare(b.symbol);
      });
    const deepSymbols = new Set(sortedScan.slice(0, Math.min(topK, sortedScan.length)).map((s) => s.symbol));

    // Reuse existing resolved data, but compute price targets for top K
    for (const score of scanOnlyScores) {
      const isDeep = deepSymbols.has(score.symbol);
      if (!isDeep) {
        scores.push({ ...score, isScanOnly: true, priceTarget: null, priceTargetDiagnostics: null });
        continue;
      }

      const raw = rawDataMap[score.symbol];
      const resolved = resolveSymbolMetrics(
        score.symbol,
        raw,
        medians,
        fallbackFundamentalsMap[score.symbol] ?? null,
        fallbackProfileMap[score.symbol] ?? null
      );

      const scoreContext: ScoreSymbolContext = {
        profile: raw.profile,
        sectorMedians,
      };

      const deepScore = await scoreSymbol(
        score.symbol,
        resolved.fundamentals,
        resolved.technical,
        resolved.dataQuality,
        scoringConfig,
        scoreContext,
        { computePriceTarget: true }
      );
      scores.push({ ...deepScore, isScanOnly: false });
    }

    const actualRequests =
      provider.getRequestCount() + (fallbackProvider ? fallbackProvider.getRequestCount() : 0);
    const estimatedRequests = symbolsToScore.length * 3;
    const fundamentalsTotal =
      requestStats.fundamentalsRequests + requestStats.fundamentalsCacheHits;
    const technicalTotal =
      requestStats.technicalRequests + requestStats.technicalCacheHits;
    const requestBudget = {
      estimatedRequests,
      actualRequests,
      fundamentalsCacheHitRate:
        fundamentalsTotal > 0 ? requestStats.fundamentalsCacheHits / fundamentalsTotal : 0,
      technicalCacheHitRate:
        technicalTotal > 0 ? requestStats.technicalCacheHits / technicalTotal : 0,
      fundamentalsCacheHits: requestStats.fundamentalsCacheHits,
      technicalCacheHits: requestStats.technicalCacheHits,
    };

    logger.info(
      {
        scoredCount: scores.length,
        errorCount: errors.length,
        deepCount: deepSymbols.size,
        requestBudget,
      },
      'Universe scoring complete'
    );

    // Ensure deterministic ordering for downstream hashing
    scores.sort((a, b) => a.symbol.localeCompare(b.symbol));

    const dataQualitySummary = summarizeDataQuality(
      scores.map((s) => ({ symbol: s.symbol, dataQuality: s.dataQuality })),
      appConfig.universe.name
    );

    const mode = await computeMode(
      appConfig.universe.name,
      Object.values(rawDataMap),
      appConfig.universe.benchmark
    );

    return {
      scores,
      mode,
      dataQualitySummary,
      metadata: {
        scoredAt,
        symbolCount: scores.length,
        requestsMade: actualRequests,
        errors,
        provider: providerType,
        pipeline: {
          topK,
          maxSymbolsPerRun,
          truncated,
          originalSymbolCount: symbols.length,
          scoredSymbolCount: symbolsToScore.length,
          warnings: truncated
            ? [`Truncated universe from ${symbols.length} to ${symbolsToScore.length}`]
            : [],
          requestBudget,
        },
        symbolsUsed: symbolsToScore,
      },
    };
  } finally {
    provider.close();
    if (fallbackProvider) {
      fallbackProvider.close();
    }
  }
}

export function applySymbolLimit(
  symbols: string[],
  maxSymbols?: number | null
): { symbolsToScore: string[]; truncated: boolean } {
  if (!maxSymbols || maxSymbols <= 0) {
    return { symbolsToScore: symbols, truncated: false };
  }
  if (symbols.length <= maxSymbols) {
    return { symbolsToScore: symbols, truncated: false };
  }
  return { symbolsToScore: symbols.slice(0, maxSymbols), truncated: true };
}

async function computeMode(
  universeName: string,
  rawData: SymbolRawData[],
  benchmarkOverride?: string
): Promise<ModeResult> {
  const benchmark = benchmarkOverride ?? inferBenchmark(universeName);
  try {
    const yf = new YFinanceProvider();
    const candles = await yf.getCandles(benchmark, 252);
    const closes = candles?.c?.filter((c) => typeof c === 'number') as number[];

    const breadthRatio = (() => {
      const items = rawData
        .map((r) => r.technical?.priceReturn13Week)
        .filter((v): v is number => typeof v === 'number');
      if (items.length === 0) return null;
      const positive = items.filter((v) => v > 0).length;
      return items.length === 0 ? null : positive / items.length;
    })();

    return calculateModeV1(benchmark, closes || [], breadthRatio);
  } catch (error) {
    logger.error({ benchmark, error }, 'Failed to compute mode, returning neutral');
    return calculateModeV1(benchmark, [], null);
  }
}

function inferBenchmark(universeName: string): string {
  const nameLower = universeName.toLowerCase();
  if (nameLower.includes('dax')) {
    return '^GDAXI';
  }
  return 'SPY';
}

export function sortScoresDeterministic(scores: SymbolScore[]): SymbolScore[] {
  return [...scores].sort((a, b) => {
    // Primary: higher score first
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // Tie-break: alphabetical by symbol
    return a.symbol.localeCompare(b.symbol);
  });
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });

  await Promise.all(workers);
}
