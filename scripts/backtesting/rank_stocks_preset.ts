import type { PillarWeights, FundamentalThresholds } from '../../src/scoring/scoring_config';
import type { FundamentalsData } from '../../src/data/repositories/fundamentals_repo';
import { scoreSymbolPure } from '../../src/scoring/pure/score_symbol';
import type { MarketDataSnapshot, TechnicalSnapshot } from '../../src/scoring/pure/types';
import { applyPresetFilters } from '../../src/scoring/pure/filters';

export type RankedStock = { symbol: string; score: number; breakdown: PillarWeights };

export interface FilterDiagnostics {
  candidates_before: number;
  candidates_after: number;
  removed_by_key: Record<string, number>;
  unsupported_keys: string[];
}

export interface RankStocksArgs {
  dataMap: Map<string, any>; // SymbolData from run-backtest
  date: string;
  allDates: string[];
  benchmarkSymbol: string;
  fundamentalsFetcher: ((symbol: string) => Promise<FundamentalsData | null>) | null;
  pillarWeights: PillarWeights;
  thresholds: FundamentalThresholds;
  filters?: Record<string, unknown> | null;
  allowUnsupportedFilters?: boolean;
}

function buildTechnicalSnapshot(symbolData: any, asOfDate: string, allDates: string[]): TechnicalSnapshot {
  const idx = allDates.indexOf(asOfDate);
  const currentPrice = symbolData.prices.get(asOfDate)?.close ?? null;
  const getPrice = (offset: number) => {
    const i = Math.max(0, idx - offset);
    return symbolData.prices.get(allDates[i])?.close ?? null;
  };
  const price5d = getPrice(5);
  const price13w = getPrice(65);
  const price26w = getPrice(130);
  const price52w = getPrice(252);
  const return5d = price5d && currentPrice ? (currentPrice - price5d) / price5d : null;
  const return13w = price13w && currentPrice ? (currentPrice - price13w) / price13w : null;
  const return26w = price26w && currentPrice ? (currentPrice - price26w) / price26w : null;
  const return52w = price52w && currentPrice ? (currentPrice - price52w) / price52w : null;

  let high52w = currentPrice ?? 0;
  let low52w = currentPrice ?? 0;
  for (let i = Math.max(0, idx - 252); i <= idx; i++) {
    const p = symbolData.prices.get(allDates[i])?.close;
    if (p) {
      high52w = Math.max(high52w, p);
      low52w = low52w === 0 ? p : Math.min(low52w, p);
    }
  }

  const volWindow: number[] = [];
  for (let i = Math.max(0, idx - 63) + 1; i <= idx; i++) {
    const p1 = symbolData.prices.get(allDates[i])?.close;
    const p0 = symbolData.prices.get(allDates[i - 1])?.close;
    if (p1 && p0) volWindow.push((p1 - p0) / p0);
  }
  const vol = (() => {
    if (volWindow.length < 10) return null;
    const mean = volWindow.reduce((a, b) => a + b, 0) / volWindow.length;
    const variance = volWindow.reduce((a, b) => a + (b - mean) ** 2, 0) / volWindow.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
  })();

  return {
    currentPrice,
    return5d,
    return13w,
    return26w,
    return52w,
    high52w: high52w || null,
    low52w: low52w || null,
    volatility3m: vol,
  };
}

export async function rankStocksWithPreset(args: RankStocksArgs): Promise<{ ranked: RankedStock[]; diagnostics: FilterDiagnostics }> {
  const {
    dataMap,
    date,
    allDates,
    benchmarkSymbol,
    fundamentalsFetcher,
    pillarWeights,
    thresholds,
    filters,
    allowUnsupportedFilters,
  } = args;

  const removedByKey: Record<string, number> = {};
  const unsupportedKeys: Set<string> = new Set();
  const scores: RankedStock[] = [];

  for (const [symbol, data] of dataMap) {
    if (symbol === benchmarkSymbol) continue;

    let fundamentals: FundamentalsData | null = null;
    if (fundamentalsFetcher) {
      try {
        fundamentals = await fundamentalsFetcher(symbol);
      } catch {
        fundamentals = null;
      }
    }

    const technical = buildTechnicalSnapshot(data, date, allDates);
    const snapshot: MarketDataSnapshot = {
      symbol,
      date,
      fundamentals,
      technical,
    };

    const filterResult = applyPresetFilters(snapshot, filters);
    Object.entries(filterResult.removedBy).forEach(([k, v]) => {
      removedByKey[k] = (removedByKey[k] || 0) + v;
    });
    const allowedIgnored = new Set([
      'min_valuation_score',
      'min_quality_score',
      'min_technical_score',
      'min_risk_score',
    ]);
    filterResult.ignoredKeys.forEach((k) => {
      if (!allowedIgnored.has(k)) unsupportedKeys.add(k);
    });
    filterResult.unsupportedKeys.forEach((k) => unsupportedKeys.add(k));
    if (!filterResult.ok) continue;

    const scored = scoreSymbolPure(snapshot, pillarWeights, thresholds);

    // apply min pillar filters after scoring
    const f = (filters ?? {}) as Record<string, unknown>;
    const minPillarKeys: Array<[keyof typeof scored.pillars, string]> = [
      ['valuation', 'min_valuation_score'],
      ['quality', 'min_quality_score'],
      ['technical', 'min_technical_score'],
      ['risk', 'min_risk_score'],
    ];
    let blocked = false;
    for (const [pillar, key] of minPillarKeys) {
      if (f[key] !== undefined) {
        const minVal = Number(f[key]);
        if (Number.isFinite(minVal) && scored.pillars[pillar] < minVal) {
          removedByKey[key] = (removedByKey[key] || 0) + 1;
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;

    scores.push({
      symbol,
      score: scored.total,
      breakdown: scored.pillars,
    });
  }

  const candidatesBefore = Array.from(dataMap.keys()).filter((s) => s !== benchmarkSymbol).length;
  const candidatesAfter = scores.length;

  const unsupportedList = Array.from(unsupportedKeys);
  if (unsupportedList.length > 0 && !allowUnsupportedFilters) {
    throw new Error(`preset_unsupported_filters: ${unsupportedList.join(',')}`);
  }

  // sort
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    ranked: scores,
    diagnostics: {
      candidates_before: candidatesBefore,
      candidates_after: candidatesAfter,
      removed_by_key: removedByKey,
      unsupported_keys: unsupportedList,
    },
  };
}
