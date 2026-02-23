/**
 * Run Record Builder
 * Constructs the run.json output structure
 */

import { getConfig } from '@/core/config';
import { formatDate, getLastTradingDay, getRunId } from '@/core/time';
import { contentHash } from '@/core/seed';
import { selectTopSymbols } from '@/selection/selector';
import { selectPickOfDay } from '@/selection/pick_of_day';
import type { ScoringResult, SymbolScore } from '@/scoring/engine';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import { evaluateRunQualityGate } from '@/run/quality_gate';
import fs from 'fs';
import path from 'path';

const SCORE_VERSION = '0.1.0';

export interface BuildRunOptions {
  runDate?: Date;
  asOfDate?: Date;
}

interface NameEntry {
  name?: string;
  industry?: string;
}

function loadNameMap(universeName: string): Map<string, NameEntry> {
  const map = new Map<string, NameEntry>();
  const universeKey = process.env.UNIVERSE_CONFIG || process.env.UNIVERSE || '';
  const namesDir = path.join(process.cwd(), 'data', 'universe_metadata');
  const candidates = [];

  // Try env var first
  if (universeKey) {
    candidates.push(path.join(namesDir, `${universeKey}_names.json`));
  }

  // Generate multiple slug variations to handle different formats
  const slug = universeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_');
  const slugNoSpaces = universeName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_');

  // Try various patterns:
  candidates.push(path.join(namesDir, `${slug}_names.json`));
  candidates.push(path.join(namesDir, `${slug.replace(/_+$/, '')}_names.json`)); // trim trailing underscore
  candidates.push(path.join(namesDir, `${slugNoSpaces}_names.json`));

  // Try common variations (russell2000, russell_2000, etc)
  if (universeName.toLowerCase().includes('russell')) {
    candidates.push(path.join(namesDir, 'russell2000_full_names.json'));
    candidates.push(path.join(namesDir, 'russell_2000_full_names.json'));
    candidates.push(path.join(namesDir, 'russell2000_full_yf_names.json'));
  }

  // Explicit alias fallbacks for popular universes where naming often varies
  const aliases: Record<string, string[]> = {
    's&p 500': ['sp500_names.json', 'sp500-full_names.json'],
    'sp500': ['sp500_names.json', 'sp500-full_names.json'],
    's&p 500 (sample)': ['sp500_names.json', 'sp500-full_names.json'],
  };

  for (const [needle, files] of Object.entries(aliases)) {
    if (universeName.toLowerCase().includes(needle)) {
      for (const file of files) {
        candidates.push(path.join(namesDir, file));
      }
    }
  }

  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    console.warn(`No name map found for "${universeName}". Tried: ${candidates.map(p => path.basename(p)).join(', ')}`);
    return map;
  }

  console.log(`Loading company names from: ${path.basename(filePath)}`);

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const entry of raw) {
      if (entry?.symbol) {
        map.set(String(entry.symbol).toUpperCase(), {
          name: entry.shortName || entry.longName || entry.name,
          industry: entry.industry,
        });
      }
    }
  } catch (err) {
    console.error('Failed to load name map', err);
  }

  return map;
}

export function buildRunRecord(
  scoringResult: ScoringResult,
  options: BuildRunOptions = {}
): RunV1SchemaJson {
  const config = getConfig();
  const now = new Date();

  const runDate = options.runDate ?? now;
  const asOfDate = options.asOfDate ?? getLastTradingDay(runDate);

  const runDateStr = formatDate(runDate);
  const asOfDateStr = formatDate(asOfDate);
  const symbolsUsed = scoringResult.metadata.symbolsUsed ?? config.universe.symbols;

  const namesMap = loadNameMap(config.universe.name);

  // Select top symbols
  const selection = selectTopSymbols(scoringResult.scores);
  const pickOfDay = selectPickOfDay(selection.top5, runDateStr);

  // Build scores array for output
  const scoresOutput = scoringResult.scores.map((s) => ({
    symbol: s.symbol,
    company_name: namesMap.get(s.symbol)?.name,
    industry: s.industry ?? namesMap.get(s.symbol)?.industry,
    total_score: s.totalScore,
    breakdown: {
      fundamental: s.breakdown.fundamental,
      technical: s.breakdown.technical,
    },
    evidence: {
      valuation: s.evidence.valuation,
      quality: s.evidence.quality,
      technical: s.evidence.technical,
      risk: s.evidence.risk,
    },
    is_scan_only: s.isScanOnly ?? false,
    valuation_input_coverage: s.valuationInputCoverage
      ? {
          present: s.valuationInputCoverage.present,
          missing: s.valuationInputCoverage.missing,
          strategy_used: s.valuationInputCoverage.strategy_used,
        }
      : undefined,
    data_quality: {
      data_quality_score: s.dataQuality.dataQualityScore,
      data_quality_confidence: s.dataQuality.dataQualityConfidence,
      completeness_ratio: s.dataQuality.completenessRatio,
      imputed_ratio: s.dataQuality.imputedRatio,
      missing_critical: s.dataQuality.missingCritical,
      metrics: s.dataQuality.metrics,
      outlier_flags: s.dataQuality.outlierFlags ?? [],
      outlierFlags: s.dataQuality.outlierFlags ?? [],
      fundamentals_age_days: s.dataQuality.fundamentalsAgeDays ?? null,
      fundamentalsAgeDays: s.dataQuality.fundamentalsAgeDays ?? null,
      stale_fundamentals: s.dataQuality.staleFundamentals ?? false,
      staleFundamentals: s.dataQuality.staleFundamentals ?? false,
      missing_fields: s.dataQuality.missingFields ?? [],
      assumptions: (s.dataQuality.assumptions ??
        []) as RunV1SchemaJson['scores'][0]['data_quality']['assumptions'],
      adjusted_price_mode:
        s.dataQuality.adjustedPriceMode ??
        ('adjusted' as RunV1SchemaJson['scores'][0]['data_quality']['adjusted_price_mode']),
    },
    price_target: s.priceTarget
      ? {
          current_price: s.priceTarget.currentPrice,
          fair_value: s.priceTarget.fairValue,
          upside_pct: s.priceTarget.upsidePct,
          target_buy_price: s.priceTarget.targetBuyPrice,
          target_sell_price: s.priceTarget.targetSellPrice,
          expected_return_pct: s.priceTarget.expectedReturnPct,
          holding_period_months: s.priceTarget.holdingPeriodMonths,
          target_date: s.priceTarget.targetDate,
          confidence: s.priceTarget.confidence,
          requires_deep_analysis: s.priceTarget.requiresDeepAnalysis,
          deep_analysis_reasons: s.priceTarget.deepAnalysisReasons,
        }
      : null,
    price_target_diagnostics: s.priceTargetDiagnostics
      ? {
          inputs: s.priceTargetDiagnostics.inputs,
          medians: s.priceTargetDiagnostics.medians,
          components: s.priceTargetDiagnostics.components,
          fair_value: s.priceTargetDiagnostics.fair_value,
        }
      : undefined,
    // Keep Piotroski available for Stock Detail without changing pillar logic.
    raw: {
      fundamental: {
        piotroski: s.raw?.fundamental?.piotroski ?? null,
      },
    },
  }));

  // Find symbols with missing documents
  const userDocumentsMissing = findMissingDocumentSymbols(selection.sortedScores);

  // Generate content hash for reproducibility verification
  const inputsHash = contentHash({
    symbols: symbolsUsed,
    runDate: runDateStr,
    scores: scoresOutput.map((s) => ({
      symbol: s.symbol,
      total_score: s.total_score,
    })),
  });

  const configHash = contentHash({
    universe: config.universe.version,
    cacheTtl: config.cacheTtl,
  });

  const runId = getRunId(runDate, inputsHash);

  // Transform mode features: convert null to undefined for schema compatibility
  const modeFeatures = scoringResult.mode.features;
  const transformedMode = {
    model_version: scoringResult.mode.model_version,
    label: scoringResult.mode.label,
    score: scoringResult.mode.score,
    confidence: scoringResult.mode.confidence,
    benchmark: scoringResult.mode.benchmark,
    features: {
      ma50: modeFeatures.ma50 ?? undefined,
      ma200: modeFeatures.ma200 ?? undefined,
      vol20: modeFeatures.vol20 ?? undefined,
      vol60: modeFeatures.vol60 ?? undefined,
      breadth: modeFeatures.breadth ?? undefined,
    },
  };

  const runRecord: RunV1SchemaJson = {
    run_id: runId,
    run_date: runDateStr,
    as_of_date: asOfDateStr,
    mode: transformedMode,
    data_quality_summary: scoringResult.dataQualitySummary,
    quality_gate: evaluateRunQualityGate(
      scoringResult.dataQualitySummary,
      scoringResult.scores.length
    ),

    provider: {
      name: scoringResult.metadata.provider,
      cache_policy: {
        prices_ttl_hours: config.cacheTtl.prices_ttl_hours,
        fundamentals_ttl_days: config.cacheTtl.fundamentals_ttl_days,
        news_ttl_minutes: config.cacheTtl.news_ttl_minutes,
      },
      rate_limit_observed: {
        max_concurrency: 5,
        requests_made: scoringResult.metadata.requestsMade,
      },
    },

    universe: {
      definition: {
        name: config.universe.name,
        selection_rule: config.universe.selection_rule ?? '',
        version: config.universe.version ?? '',
      },
      symbols: symbolsUsed as [string, ...string[]],
    },

    benchmark: {
      type: 'proxy_instrument',
      name: config.universe.benchmark ?? 'S&P 500 ETF',
      provider_symbol: config.universe.benchmark ?? 'SPY',
      notes: config.universe.benchmark ? 'Benchmark from universe pack' : 'Using SPY as proxy for S&P 500 index',
    },

    scores: scoresOutput,

    selections: {
      top30: selection.top30 as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ],
      top5: selection.top5 as [string, string, string, string, string],
      top10: selection.top10 as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ],
      top15: selection.top15 as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ],
      top20: selection.top20 as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ],
      pick_of_the_day: pickOfDay,
      diversification_applied: selection.diversificationApplied ?? false,
      skipped_for_diversity: selection.skippedForDiversity ?? [],
    },

    flags: {
      user_documents_missing: userDocumentsMissing,
      prompt_injection_suspected: [], // News not implemented in MVP
    },
    pipeline: scoringResult.metadata.pipeline
      ? {
          top_k: scoringResult.metadata.pipeline.topK,
          max_symbols_per_run: scoringResult.metadata.pipeline.maxSymbolsPerRun,
          truncated: scoringResult.metadata.pipeline.truncated,
          original_symbol_count: scoringResult.metadata.pipeline.originalSymbolCount,
          scored_symbol_count: scoringResult.metadata.pipeline.scoredSymbolCount,
          warnings: scoringResult.metadata.pipeline.warnings,
          request_budget: scoringResult.metadata.pipeline.requestBudget
            ? {
                estimated_requests: scoringResult.metadata.pipeline.requestBudget.estimatedRequests,
                actual_requests: scoringResult.metadata.pipeline.requestBudget.actualRequests,
                fundamentals_cache_hit_rate:
                  scoringResult.metadata.pipeline.requestBudget.fundamentalsCacheHitRate,
                technical_cache_hit_rate:
                  scoringResult.metadata.pipeline.requestBudget.technicalCacheHitRate,
                fundamentals_cache_hits:
                  scoringResult.metadata.pipeline.requestBudget.fundamentalsCacheHits,
                technical_cache_hits:
                  scoringResult.metadata.pipeline.requestBudget.technicalCacheHits,
              }
            : undefined,
        }
      : undefined,

    integrity: {
      score_version: SCORE_VERSION,
      config_hash: configHash,
      inputs_hash: inputsHash,
    },
  };

  return runRecord;
}

function findMissingDocumentSymbols(
  sortedScores: SymbolScore[],
  threshold: number = 40
): string[] {
  const top10 = sortedScores.slice(0, 10);
  const missing: string[] = [];

  for (const score of top10) {
    // Check if any pillar is below threshold
    const { valuation, quality, technical, risk } = score.evidence;
    const hasLowEvidence =
      valuation < threshold ||
      quality < threshold ||
      technical < threshold ||
      risk < threshold;

    // Check if has significant missing data
    const hasMissingData = (score.dataQuality.missingFields?.length ?? 0) > 2;

    if (hasLowEvidence || hasMissingData) {
      missing.push(score.symbol);
    }
  }

  // Limit to max 2 per spec
  return missing.slice(0, 2);
}
