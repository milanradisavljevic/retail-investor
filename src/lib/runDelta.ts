import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type ScoreEntry = RunV1SchemaJson['scores'][number];
type PriceTarget = NonNullable<ScoreEntry['price_target']>;

export interface SymbolDelta {
  deltaTotal: number | null;
  deltaReturn: number | null;
  changedConfidence: { from: PriceTarget['confidence'] | null; to: PriceTarget['confidence'] | null } | null;
  changedDeepAnalysis: { from: boolean | null; to: boolean | null } | null;
}

export type DeltaMap = Map<string, SymbolDelta>;

export function computeDeltas(
  latestRun: RunV1SchemaJson,
  previousRun?: RunV1SchemaJson | null
): DeltaMap {
  const deltaMap: DeltaMap = new Map();

  if (!previousRun) {
    for (const current of latestRun.scores) {
      deltaMap.set(current.symbol, {
        deltaTotal: null,
        deltaReturn: null,
        changedConfidence: null,
        changedDeepAnalysis: null,
      });
    }
    return deltaMap;
  }

  const previousBySymbol = new Map<string, ScoreEntry>();
  for (const score of previousRun.scores) {
    previousBySymbol.set(score.symbol, score);
  }

  for (const current of latestRun.scores) {
    const previous = previousBySymbol.get(current.symbol);
    const currentTarget = current.price_target ?? null;
    const previousTarget = previous?.price_target ?? null;

    const deltaTotal =
      previous && Number.isFinite(previous.total_score)
        ? current.total_score - previous.total_score
        : null;

    const deltaReturn =
      currentTarget && previousTarget
        ? currentTarget.expected_return_pct - previousTarget.expected_return_pct
        : null;

    const changedConfidence =
      currentTarget &&
      previousTarget &&
      currentTarget.confidence !== previousTarget.confidence
        ? { from: previousTarget.confidence, to: currentTarget.confidence }
        : null;

    const changedDeepAnalysis =
      currentTarget &&
      previousTarget &&
      currentTarget.requires_deep_analysis !== previousTarget.requires_deep_analysis
        ? {
            from: previousTarget.requires_deep_analysis,
            to: currentTarget.requires_deep_analysis,
          }
        : null;

    deltaMap.set(current.symbol, {
      deltaTotal,
      deltaReturn,
      changedConfidence,
      changedDeepAnalysis,
    });
  }

  return deltaMap;
}
