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
  type MonteCarloDiagnostics,
} from './price-target';
import { fetchSymbolDataWithCache, type RequestStats } from './fetch';
import { RequestThrottler } from '@/utils/throttler';
import { selectTopSymbols } from '@/selection/selector';
import {
  filterSymbolsBeforeScoring,
  type LiveRunFilterConfig,
  type FilteredSymbolsResult,
} from './filters';
import { PerformanceTracker } from '@/lib/performance/tracker';
import { progressStore } from '@/lib/progress/progressStore';

const logger = createChildLogger('scoring_engine');

export interface SymbolScore {
  symbol: string;
  totalScore: number;
  industry?: string | null;
  sector?: string | null;
  breakdown: {
    fundamental: number;
    technical: number;
  };
  evidence: EvidencePillars;
  dataQuality: DataQuality;
  priceTarget: PriceTarget | null;
  priceTargetDiagnostics: PriceTargetDiagnostics | null;
  monteCarloDiagnostics?: MonteCarloDiagnostics | null;
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
    filtersApplied?: {
      config: LiveRunFilterConfig;
      removedCount: number;
      removedByReason: FilteredSymbolsResult['removedByReason'];
    };
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
  options?: { computePriceTarget?: boolean; isTop30?: boolean }
): Promise<SymbolScore> {
  // Calculate scores
  const fundamentalResult = calculateFundamentalScore(
    resolvedFundamentals,
    undefined,
    scoringConfig.fundamentalThresholds
  );

  const technicalResult = calculateTechnicalScore(technicalMetrics);

  const isShieldStrategy = (process.env.SCORING_PRESET || process.env.PRESET || '').toLowerCase() === 'shield';
  const evidence = calculateEvidencePillars(fundamentalResult, technicalResult, isShieldStrategy);
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
  let monteCarloDiagnostics: MonteCarloDiagnostics | null = null;
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

    const priceTargetResult = await calculatePriceTargets(
      stockMetrics,
      sectorMedians,
      {
        totalScore,
        volatilityScore: technicalResult.components.volatility,
        dataQualityScore: dataQuality.dataQualityScore,
        pillarSpread,
      },
      scoringConfig.priceTarget,
      {
        computeMonteCarlo: true,
        isTop30: options?.isTop30,
      }
    );
    priceTarget = priceTargetResult.target;
    priceTargetDiagnostics = priceTargetResult.diagnostics;
    monteCarloDiagnostics = priceTargetResult.monteCarlo;
  }

  return {
    symbol,
    totalScore,
    industry: context?.profile?.industry ?? null,
    sector: context?.profile?.sector ?? null,
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
    monteCarloDiagnostics,
    isScanOnly: options?.computePriceTarget === false,
    valuationInputCoverage: fundamentalResult.valuationInputCoverage,
    raw: {
      fundamental: fundamentalResult,
      technical: technicalResult,
    },
  };
}

export async function scoreUniverse(
  filterConfig?: Partial<LiveRunFilterConfig>,
  runIdOverride?: string
): Promise<ScoringResult> {
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

  // Initialize run ID and trackers
  const runId = runIdOverride || `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const perfTracker = new PerformanceTracker(
    runId,
    appConfig.universe.name,
    symbols.length
  );

  // Initialize progress tracking
  progressStore.initRun(runId, appConfig.universe.name, symbols.length);

  // Apply filters BEFORE scoring to save API calls
  let filteredResult: FilteredSymbolsResult | null = null;
  let symbolsAfterFiltering = symbols;

  if (filterConfig) {
    filteredResult = filterSymbolsBeforeScoring(symbols, filterConfig);
    symbolsAfterFiltering = filteredResult.passedSymbols;

    if (filteredResult.removedCount > 0) {
      logger.info(
        {
          originalCount: symbols.length,
          filteredCount: filteredResult.removedCount,
          remainingCount: symbolsAfterFiltering.length,
          crypto: filteredResult.removedByReason.crypto_mining.length,
          defense: filteredResult.removedByReason.defense.length,
          fossilFuel: filteredResult.removedByReason.fossil_fuel.length,
        },
        'Filtered symbols before scoring'
      );
    }
  }

  const { symbolsToScore, truncated } = applySymbolLimit(symbolsAfterFiltering, maxSymbolsPerRun);
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
    marketDataBridgeHits: 0,
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
    perfTracker.startPhase('data_fetch');
    progressStore.updateProgress(runId, { currentPhase: 'data_fetch' });

    const BATCH_SIZE = 50; // Fetch 50 symbols per batch
    const USE_BATCH_MODE = process.env.BATCH_FETCH_ENABLED !== 'false'; // Default: enabled
    const isYFinanceProvider = provider.constructor.name === 'YFinanceProvider';

    if (USE_BATCH_MODE && isYFinanceProvider) {
      logger.info({ batchSize: BATCH_SIZE, totalSymbols: symbolsToScore.length }, 'Using batch fetch mode');

      const { fetchSymbolsBatch } = await import('./fetch');

      // Process symbols in batches
      for (let i = 0; i < symbolsToScore.length; i += BATCH_SIZE) {
        const batch = symbolsToScore.slice(i, i + BATCH_SIZE);

        try {
          const batchResults = await fetchSymbolsBatch(
            batch,
            {
              fundamentalsTtlMs,
              technicalTtlSeconds,
              profileTtlMs,
            },
            requestStats
          );

          // Merge batch results into rawDataMap
          for (const [symbol, result] of batchResults.entries()) {
            rawDataMap[symbol] = result.raw;
            fallbackFundamentalsMap[symbol] = result.fallbackFundamentals;
            fallbackProfileMap[symbol] = result.fallbackProfile;

            if (result.fromCache) {
              progressStore.incrementCacheHit(runId);
            } else {
              progressStore.incrementCacheMiss(runId);
            }
          }

          progressStore.updateProgress(runId, {
            processedSymbols: Math.min(i + BATCH_SIZE, symbolsToScore.length),
          });

        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ batch, error: message }, 'Batch fetch failed');

          // Add empty results for failed batch
          for (const symbol of batch) {
            errors.push(`${symbol}: ${message}`);
            progressStore.addFailedSymbol(runId, symbol);
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
        }
      }

    } else {
      // Original per-symbol fetching (fallback for non-YFinance providers or when disabled)
      logger.info('Using per-symbol fetch mode');

      let processedCount = 0;
      await runWithConcurrency(
        symbolsToScore,
        async (symbol) => {
          try {
            progressStore.updateProgress(runId, {
              currentSymbol: symbol,
              processedSymbols: processedCount,
            });

            const { raw, fallbackFundamentals, fallbackProfile, fromCache } =
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

            // Update cache stats
            if (fromCache) {
              progressStore.incrementCacheHit(runId);
            } else {
              progressStore.incrementCacheMiss(runId);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${symbol}: ${message}`);
            logger.error({ symbol, error: message }, 'Failed to fetch raw data');
            progressStore.addFailedSymbol(runId, symbol);
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
          processedCount++;
        },
        Math.min(MAX_CONCURRENCY, symbolsToScore.length)
      );
    }

    // End data fetch phase
    const totalCacheRequests = requestStats.fundamentalsCacheHits + requestStats.technicalCacheHits + requestStats.profileCacheHits;
    const totalProviderRequests = requestStats.fundamentalsRequests + requestStats.technicalRequests + requestStats.profileRequests;
    const totalRequests = totalCacheRequests + totalProviderRequests;
    const failedFetches = symbolsToScore.length - Object.keys(rawDataMap).filter(s => rawDataMap[s].fundamentals || rawDataMap[s].technical).length;
    const cacheHitRate = totalRequests > 0 ? (totalCacheRequests / totalRequests) * 100 : 0;
    const fundamentalsTotal = requestStats.fundamentalsRequests + requestStats.fundamentalsCacheHits;
    const technicalTotal = requestStats.technicalRequests + requestStats.technicalCacheHits;

    perfTracker.endPhase('data_fetch', {
      symbols_processed: symbolsToScore.length,
      symbols_failed: failedFetches,

      // Cache metrics
      cache_hits: totalCacheRequests,
      cache_misses: totalProviderRequests,
      cache_hit_rate_pct: Math.round(cacheHitRate * 10) / 10,

      // Detailed cache breakdown
      fundamentals_cache_hits: requestStats.fundamentalsCacheHits,
      fundamentals_cache_misses: requestStats.fundamentalsRequests,
      fundamentals_cache_hit_rate_pct: fundamentalsTotal > 0 ? Math.round((requestStats.fundamentalsCacheHits / fundamentalsTotal) * 1000) / 10 : 0,

      technical_cache_hits: requestStats.technicalCacheHits,
      technical_cache_misses: requestStats.technicalRequests,
      technical_cache_hit_rate_pct: technicalTotal > 0 ? Math.round((requestStats.technicalCacheHits / technicalTotal) * 1000) / 10 : 0,
      market_data_bridge_hits: requestStats.marketDataBridgeHits,

      // Performance metrics
      provider_api_calls: totalProviderRequests,
      avg_ms_per_symbol: Math.round(perfTracker.getPhaseTime('data_fetch') / symbolsToScore.length),

      // Concurrency info
      concurrency_limit: MAX_CONCURRENCY,
      parallel_batches: Math.ceil(symbolsToScore.length / MAX_CONCURRENCY),
      throttle_ms: pipelineCfg.throttleMs ?? 0,
    });

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
    perfTracker.startPhase('scoring');
    progressStore.updateProgress(runId, { currentPhase: 'scoring' });

    let scoredCount = 0;
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
          progressStore.addFailedSymbol(runId, symbol);

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
        scoredCount++;
        progressStore.updateProgress(runId, {
          currentSymbol: symbol,
          processedSymbols: symbolsToScore.length + scoredCount,
        });
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

    // Pass 3: Monte Carlo for Top 30 stocks with deep analysis
    const selections = selectTopSymbols(scores);
    const top30Symbols = selections.top30;

    logger.info(
      { top30Count: top30Symbols.length },
      'Re-scoring Top 30 stocks with Monte Carlo analysis'
    );

    await runWithConcurrency(
      top30Symbols,
      async (symbol) => {
        try {
          const scoreIndex = scores.findIndex((s) => s.symbol === symbol);
          if (scoreIndex === -1) {
            logger.warn({ symbol }, 'Top 30 symbol not found in scores');
            return;
          }

          const existingScore = scores[scoreIndex];

          // Only re-score if the stock requires deep analysis
          if (!existingScore.priceTarget?.requiresDeepAnalysis) {
            logger.debug(
              { symbol },
              'Skipping Monte Carlo: does not require deep analysis'
            );
            return;
          }

          const raw = rawDataMap[symbol];
          if (!raw) {
            logger.warn({ symbol }, 'No raw data for Top 30 symbol');
            return;
          }

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

          const monteCarloScore = await scoreSymbol(
            symbol,
            resolved.fundamentals,
            resolved.technical,
            resolved.dataQuality,
            scoringConfig,
            scoreContext,
            { computePriceTarget: true, isTop30: true }
          );

          // Update the score with Monte Carlo diagnostics
          scores[scoreIndex] = {
            ...monteCarloScore,
            isScanOnly: false,
          };

          logger.debug(
            {
              symbol,
              hasMonteCarlo: !!monteCarloScore.monteCarloDiagnostics,
            },
            'Monte Carlo analysis complete'
          );
        } catch (err) {
          logger.error(
            { symbol, error: err },
            'Error re-scoring Top 30 stock with Monte Carlo'
          );
        }
      },
      2 // Lower concurrency for expensive Monte Carlo calculations
    );

    // End scoring phase
    perfTracker.endPhase('scoring', {
      symbols_scored: scores.length,
      avg_ms_per_symbol: perfTracker.getPhaseTime('scoring') / scores.length
    });

    // Selection phase
    perfTracker.startPhase('selection');
    progressStore.updateProgress(runId, { currentPhase: 'selection' });
    const actualRequests =
      provider.getRequestCount() + (fallbackProvider ? fallbackProvider.getRequestCount() : 0);
    const estimatedRequests = symbolsToScore.length * 3;
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

    // End selection phase
    perfTracker.endPhase('selection', {
      picks_generated: selections.top30.length
    });

    // Start persistence phase (computed by run builder/writer)
    perfTracker.startPhase('persistence');
    progressStore.updateProgress(runId, { currentPhase: 'persistence' });

    const dataQualitySummary = summarizeDataQuality(
      scores.map((s) => ({ symbol: s.symbol, dataQuality: s.dataQuality })),
      appConfig.universe.name
    );

    const mode = await computeMode(
      appConfig.universe.name,
      Object.values(rawDataMap),
      appConfig.universe.benchmark
    );

    // End persistence phase (note: actual file writes happen in run_daily.ts)
    perfTracker.endPhase('persistence', {
      json_write_ms: 0, // Will be updated by run_daily.ts
      file_size_bytes: 0 // Will be updated by run_daily.ts
    });

    // Save performance metrics and log summary
    try {
      await perfTracker.save();
      perfTracker.printSummary();
    } catch (error) {
      logger.warn({ error }, 'Failed to save performance metrics');
    }

    // Mark run as complete
    progressStore.completeRun(runId);

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
        filtersApplied: filteredResult ? {
          config: {
            excludeCryptoMining: filterConfig?.excludeCryptoMining ?? false,
            excludeDefense: filterConfig?.excludeDefense ?? false,
            excludeFossilFuels: filterConfig?.excludeFossilFuels ?? false,
            minMarketCap: filterConfig?.minMarketCap ?? null,
            minLiquidity: filterConfig?.minLiquidity ?? null,
            maxVolatility: filterConfig?.maxVolatility ?? null,
          },
          removedCount: filteredResult.removedCount,
          removedByReason: filteredResult.removedByReason,
        } : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Run failed with error');
    progressStore.errorRun(runId, message);
    throw error;
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
