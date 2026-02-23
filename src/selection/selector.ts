/**
 * Selection logic for Top N lists with deterministic tie-breaks
 * plus optional industry-based diversification caps.
 */

import { sortScoresDeterministic, type SymbolScore } from '@/scoring/engine';
import { getScoringConfig } from '@/scoring/scoring_config';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('selection');

export interface DiversificationConfig {
  maxPerSector: number;
  maxPerIndustry: number;
  enabled: boolean;
}

export interface DiversifiedResult {
  symbols: string[];
  applied: boolean;
  skipped: Array<{ symbol: string; reason: string }>;
}

export interface SelectionResult {
  top10: string[];
  top5: string[];
  top15: string[];
  top20: string[];
  top30: string[];
  sortedScores: SymbolScore[];
  diversificationApplied: boolean;
  skippedForDiversity: string[];
}

const DEFAULT_DIVERSIFICATION: DiversificationConfig = {
  maxPerSector: 2,
  maxPerIndustry: 3,
  enabled: true,
};

function normalizeGroupKey(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'UNKNOWN';
  return trimmed.toUpperCase();
}

function resolveDiversificationConfig(): DiversificationConfig {
  // Allow scoring.json overrides under "diversification" and env-based overrides for safety nets
  const scoringConfig = getScoringConfig();
  const fileCfg = scoringConfig.diversification ?? {};

  const config: DiversificationConfig = {
    ...DEFAULT_DIVERSIFICATION,
    ...fileCfg,
  };

  const envEnabled = process.env.DIVERSIFICATION_ENABLED;
  if (envEnabled !== undefined) {
    config.enabled = envEnabled.toLowerCase() !== 'false' && envEnabled !== '0';
  }

  const envMaxIndustry = process.env.DIVERSIFICATION_MAX_PER_INDUSTRY;
  if (envMaxIndustry) {
    const parsed = Number(envMaxIndustry);
    if (!Number.isNaN(parsed) && parsed > 0) {
      config.maxPerIndustry = parsed;
    }
  }

  const envMaxSector = process.env.DIVERSIFICATION_MAX_PER_SECTOR;
  if (envMaxSector) {
    const parsed = Number(envMaxSector);
    if (!Number.isNaN(parsed) && parsed > 0) {
      config.maxPerSector = parsed;
    }
  }

  return config;
}

export function applyDiversification(
  scores: Array<{ symbol: string; industry: string; sector?: string | null; total_score: number }>,
  targetCount: number,
  config: DiversificationConfig
): DiversifiedResult {
  if (!config.enabled) {
    return {
      symbols: scores.slice(0, targetCount).map((s) => s.symbol),
      applied: false,
      skipped: [],
    };
  }

  const industryCounts = new Map<string, number>();
  const sectorCounts = new Map<string, number>();
  const selected: Array<{ symbol: string; industry: string; sector?: string | null }> = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];
  const capped: Array<{ symbol: string; industry: string; sector?: string | null; reason: string }> = [];

  for (const score of scores) {
    if (selected.length >= targetCount) break;

    const industryKey = normalizeGroupKey(score.industry);
    const sectorKey = normalizeGroupKey(score.sector ?? score.industry);
    const industryCount = industryCounts.get(industryKey) ?? 0;
    const sectorCount = sectorCounts.get(sectorKey) ?? 0;

    if (industryCount >= config.maxPerIndustry) {
      const reason = `industry_cap:${industryKey}`;
      skipped.push({ symbol: score.symbol, reason });
      capped.push({ ...score, reason });
      continue;
    }

    if (sectorCount >= config.maxPerSector) {
      const reason = `sector_cap:${sectorKey}`;
      skipped.push({ symbol: score.symbol, reason });
      capped.push({ ...score, reason });
      continue;
    }

    industryCounts.set(industryKey, industryCount + 1);
    sectorCounts.set(sectorKey, sectorCount + 1);
    selected.push(score);
  }

  // Backfill with best remaining (in sorted order) if caps were too strict
  for (const entry of capped) {
    if (selected.length >= targetCount) break;
    // If we are backfilling, diversification isn't effectively applied for this symbol
    selected.push(entry);
  }

  const finalSymbols = selected.slice(0, targetCount).map((s) => s.symbol);
  const finalSkipped = skipped.filter((entry) => !finalSymbols.includes(entry.symbol));
  const applied = finalSkipped.length > 0;

  return {
    symbols: finalSymbols,
    applied,
    skipped: finalSkipped,
  };
}

export function selectTopSymbols(scores: SymbolScore[]): SelectionResult {
  // Filter out stocks with insufficient data before selection
  const validScores = scores.filter((s) => {
    // Exclude if explicitly marked as insufficient strategy
    if (s.valuationInputCoverage?.strategy_used === 'insufficient_data') {
      return false;
    }
    // Safety net: exclude if total score is 0 (likely failed/insufficient)
    if (s.totalScore === 0) {
      return false;
    }
    return true;
  });

  const excludedCount = scores.length - validScores.length;
  if (excludedCount > 0) {
    logger.info({ excludedCount }, 'Excluded symbols with insufficient data from selection');
  }

  // Sort deterministically (by score desc, then symbol asc for ties)
  const sorted = sortScoresDeterministic(validScores);

  const diversificationConfig = resolveDiversificationConfig();
  const diversifiedScores = sorted.map((s) => ({
    symbol: s.symbol,
    industry: s.industry ?? 'UNKNOWN',
    sector: s.sector ?? s.industry ?? 'UNKNOWN',
    total_score: s.totalScore,
  }));

  // Select top 30/20/15/10/5 with diversification safety net
  const top30Result = applyDiversification(diversifiedScores, 30, diversificationConfig);
  const top20Result = applyDiversification(diversifiedScores, 20, diversificationConfig);
  const top15Result = applyDiversification(diversifiedScores, 15, diversificationConfig);
  const top10Result = applyDiversification(diversifiedScores, 10, diversificationConfig);
  const top5Result = applyDiversification(diversifiedScores, 5, diversificationConfig);

  const diversificationApplied =
    top30Result.applied ||
    top20Result.applied ||
    top15Result.applied ||
    top10Result.applied ||
    top5Result.applied;

  const skippedForDiversity = Array.from(
    new Set(
      [
        ...top30Result.skipped,
        ...top20Result.skipped,
        ...top15Result.skipped,
        ...top10Result.skipped,
        ...top5Result.skipped,
      ].map((entry) => entry.symbol)
    )
  );

  if (diversificationApplied) {
    logger.info(
      {
        config: diversificationConfig,
        skipped: skippedForDiversity,
      },
      'Diversification applied to selections'
    );
  }

  const padToLength = (symbols: string[], target: number, fallback: string[]): string[] => {
    if (symbols.length >= target) return symbols.slice(0, target);
    if (symbols.length === 0) return [];
    const padded = [...symbols];
    const source = fallback.length > 0 ? fallback : symbols;
    let cursor = 0;
    while (padded.length < target) {
      padded.push(source[cursor % source.length]);
      cursor += 1;
    }
    return padded;
  };

  const fallbackOrder = sorted.map((s) => s.symbol);

  return {
    top30: padToLength(top30Result.symbols, 30, fallbackOrder),
    top20: padToLength(top20Result.symbols, 20, fallbackOrder),
    top15: padToLength(top15Result.symbols, 15, fallbackOrder),
    top10: padToLength(top10Result.symbols, 10, fallbackOrder),
    top5: padToLength(top5Result.symbols, 5, fallbackOrder),
    sortedScores: sorted,
    diversificationApplied,
    skippedForDiversity,
  };
}

export function getScoreBySymbol(
  scores: SymbolScore[],
  symbol: string
): SymbolScore | null {
  return scores.find((s) => s.symbol === symbol) ?? null;
}

export function getScoreRank(scores: SymbolScore[], symbol: string): number {
  const sorted = sortScoresDeterministic(scores);
  const index = sorted.findIndex((s) => s.symbol === symbol);
  return index >= 0 ? index + 1 : -1;
}
