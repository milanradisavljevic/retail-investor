/**
 * Selection logic for Top 10 and Top 5
 * Deterministic sorting with alphabetical tie-break
 */

import { sortScoresDeterministic, type SymbolScore } from '@/scoring/engine';

export interface SelectionResult {
  top10: string[];
  top5: string[];
  sortedScores: SymbolScore[];
}

export function selectTopSymbols(scores: SymbolScore[]): SelectionResult {
  // Sort deterministically (by score desc, then symbol asc for ties)
  const sorted = sortScoresDeterministic(scores);

  // Select top 10 and top 5
  const top10 = sorted.slice(0, 10).map((s) => s.symbol);
  const top5 = sorted.slice(0, 5).map((s) => s.symbol);

  return {
    top10,
    top5,
    sortedScores: sorted,
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
