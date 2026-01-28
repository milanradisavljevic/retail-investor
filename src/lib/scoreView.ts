import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export type SortOption = 'total' | 'expected_return' | 'fundamental' | 'technical' | 'confidence';

export interface ScoreFilters {
  deepAnalysis: boolean;
  confidenceLow: boolean;
  missingData: boolean;
  upsideNegative: boolean;
  expectedReturnNegative?: boolean;
  symbol?: string;
}

export interface ScoreQuery {
  sort: SortOption;
  filters: ScoreFilters;
}

export type ScoreSearchParams = Record<string, string | string[] | undefined>;

type ScoreEntry = RunV1SchemaJson['scores'][number];

function parseBool(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as Promise<unknown>).then === 'function';
}

export function parseScoreQuery(searchParams?: ScoreSearchParams): ScoreQuery;
export function parseScoreQuery(searchParams?: Promise<unknown>): never;
export function parseScoreQuery(
  searchParams?: ScoreSearchParams | Promise<unknown>
): ScoreQuery {
  if (isPromise(searchParams)) {
    throw new Error(
      'parseScoreQuery received a Promise. Unwrap searchParams with await or React.use() first.'
    );
  }

  const getParam = (key: string): string | undefined => {
    const value = searchParams?.[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const sortParam = getParam('sort');
  const sort: SortOption = ['expected_return', 'fundamental', 'technical', 'confidence'].includes(
    sortParam ?? ''
  )
    ? (sortParam as SortOption)
    : 'total';

  const filters: ScoreFilters = {
    deepAnalysis: parseBool(getParam('deep_analysis')),
    confidenceLow: parseBool(getParam('confidence_low')),
    missingData: parseBool(getParam('missing_data')),
    upsideNegative: parseBool(getParam('upside_negative')),
    expectedReturnNegative: parseBool(getParam('expected_return_negative')),
    symbol: getParam('symbol')?.trim(),
  };

  return { sort, filters };
}

function passesFilters(score: ScoreEntry, filters: ScoreFilters): boolean {
  const target = score.price_target ?? null;

  if (filters.deepAnalysis && !target?.requires_deep_analysis) {
    return false;
  }

  if (filters.confidenceLow && target?.confidence !== 'low') {
    return false;
  }

  if (filters.missingData) {
    const missingCount = score.data_quality?.missing_fields?.length ?? 0;
    const completeness = score.data_quality?.completeness_ratio ?? 1;
    if (missingCount === 0 && completeness >= 1) return false;
  }

  if (filters.upsideNegative) {
    const upside = target?.upside_pct ?? null;
    if (upside === null || upside >= 0) return false;
  }

  if (filters.expectedReturnNegative) {
    const expectedReturn = target?.expected_return_pct ?? null;
    if (expectedReturn === null || expectedReturn >= 0) return false;
  }

  if (filters.symbol) {
    const needle = filters.symbol.toUpperCase();
    if (!score.symbol.toUpperCase().includes(needle)) {
      return false;
    }
  }

  return true;
}

function confidenceWeight(confidence?: 'high' | 'medium' | 'low' | null): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  if (confidence === 'low') return 1;
  return 0;
}

function scoreMetric(score: ScoreEntry, sort: SortOption): number {
  const target = score.price_target;

  switch (sort) {
    case 'expected_return':
      return target?.expected_return_pct ?? -Infinity;
    case 'fundamental':
      return score.breakdown.fundamental ?? -Infinity;
    case 'technical':
      return score.breakdown.technical ?? -Infinity;
    case 'confidence':
      return confidenceWeight(target?.confidence ?? null);
    case 'total':
    default:
      return score.total_score ?? -Infinity;
  }
}

function sortScores(scores: ScoreEntry[], sort: SortOption): ScoreEntry[] {
  return scores.slice().sort((a, b) => {
    const aVal = scoreMetric(a, sort);
    const bVal = scoreMetric(b, sort);

    if (bVal !== aVal) {
      return bVal - aVal;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

export function buildScoreView(run: RunV1SchemaJson, query: ScoreQuery): ScoreEntry[] {
  const filtered = run.scores.filter((score) => passesFilters(score, query.filters));
  return sortScores(filtered, query.sort);
}
