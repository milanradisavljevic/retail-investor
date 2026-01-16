import type { SymbolScore } from './engine';

export function selectTopK(scores: SymbolScore[], k: number): SymbolScore[] {
  return scores
    .slice()
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, k);
}
