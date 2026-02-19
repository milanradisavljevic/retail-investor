import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type ScoreEntry = RunV1SchemaJson['scores'][number];

export type DiffStatus = 'both' | 'new' | 'removed';
export type TrendDirection = 'up' | 'down' | 'flat';
export type StabilityLevel = 'high' | 'medium' | 'low';

export interface DiffRow {
  symbol: string;
  name: string;
  status: DiffStatus;
  oldScore: number | null;
  newScore: number | null;
  deltaTotal: number | null;
  deltaValuation: number | null;
  deltaQuality: number | null;
  deltaTechnical: number | null;
  deltaRisk: number | null;
  reason: string;
  oldRank: number | null;
  newRank: number | null;
}

export interface RunComparisonSummary {
  newTop10Entries: number;
  improvementsOver5: number;
  deteriorationsOver5: number;
  unchanged: number;
  newSymbols: number;
  removedSymbols: number;
  comparedSymbols: number;
}

export interface RunComparison {
  oldRunId: string;
  newRunId: string;
  rows: DiffRow[];
  summary: RunComparisonSummary;
}

export type Mover = DiffRow;

export interface ScoreTrend {
  symbol: string;
  name: string;
  current: number | null;
  sevenDay: number | null;
  fourteenDay: number | null;
  thirtyDay: number | null;
  trend: TrendDirection;
  stability: StabilityLevel;
  stdDev: number | null;
  sparkline: number[];
}

interface IndexedScore {
  rank: number;
  score: ScoreEntry;
}

function toName(score: ScoreEntry): string {
  return score.company_name?.trim() || score.symbol;
}

function buildIndex(run: RunV1SchemaJson): Map<string, IndexedScore> {
  const sorted = [...run.scores].sort((a, b) => b.total_score - a.total_score);
  const result = new Map<string, IndexedScore>();
  sorted.forEach((score, index) => {
    result.set(score.symbol, {
      rank: index + 1,
      score,
    });
  });
  return result;
}

function scoreDelta(next: number | undefined, prev: number | undefined): number | null {
  if (!Number.isFinite(next) || !Number.isFinite(prev)) return null;
  return (next as number) - (prev as number);
}

function pillarReason(row: {
  deltaValuation: number | null;
  deltaQuality: number | null;
  deltaTechnical: number | null;
  deltaRisk: number | null;
  status: DiffStatus;
}): string {
  if (row.status === 'new') return 'NEU';
  if (row.status === 'removed') return 'ENTF';

  const candidates = [
    { label: 'Valuation', value: row.deltaValuation },
    { label: 'Quality', value: row.deltaQuality },
    { label: 'Technical', value: row.deltaTechnical },
    { label: 'Risk', value: row.deltaRisk },
  ].filter((item) => item.value !== null) as Array<{ label: string; value: number }>;

  if (candidates.length === 0) return '—';
  const best = candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  return `${best.label} ${best.value >= 0 ? '▲' : '▼'}`;
}

function standardDeviation(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function parseDate(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? 0 : ts;
}

function pickValueAtOrBefore(
  points: Array<{ dateTs: number; score: number }>,
  targetTs: number
): number | null {
  const filtered = points.filter((point) => point.dateTs <= targetTs);
  if (filtered.length === 0) return null;
  return filtered[filtered.length - 1]?.score ?? null;
}

export function compareRuns(a: RunV1SchemaJson, b: RunV1SchemaJson): RunComparison {
  // Convention: a = previous run, b = current run
  const oldIndex = buildIndex(a);
  const newIndex = buildIndex(b);
  const symbols = new Set<string>([
    ...Array.from(oldIndex.keys()),
    ...Array.from(newIndex.keys()),
  ]);

  const oldTop10 = new Set(
    Array.from(oldIndex.entries())
      .filter(([, value]) => value.rank <= 10)
      .map(([symbol]) => symbol)
  );
  const newTop10 = new Set(
    Array.from(newIndex.entries())
      .filter(([, value]) => value.rank <= 10)
      .map(([symbol]) => symbol)
  );

  const rows: DiffRow[] = Array.from(symbols).map((symbol) => {
    const oldItem = oldIndex.get(symbol);
    const newItem = newIndex.get(symbol);
    const status: DiffStatus =
      oldItem && newItem ? 'both' : newItem ? 'new' : 'removed';

    const oldScore = oldItem?.score;
    const newScore = newItem?.score;
    const row: DiffRow = {
      symbol,
      name: toName(newScore ?? oldScore!),
      status,
      oldScore: oldScore?.total_score ?? null,
      newScore: newScore?.total_score ?? null,
      deltaTotal: scoreDelta(newScore?.total_score, oldScore?.total_score),
      deltaValuation: scoreDelta(newScore?.evidence?.valuation, oldScore?.evidence?.valuation),
      deltaQuality: scoreDelta(newScore?.evidence?.quality, oldScore?.evidence?.quality),
      deltaTechnical: scoreDelta(newScore?.evidence?.technical, oldScore?.evidence?.technical),
      deltaRisk: scoreDelta(newScore?.evidence?.risk, oldScore?.evidence?.risk),
      reason: '—',
      oldRank: oldItem?.rank ?? null,
      newRank: newItem?.rank ?? null,
    };
    row.reason = pillarReason(row);
    return row;
  });

  const comparedRows = rows.filter((row) => row.status === 'both');
  const improvementsOver5 = comparedRows.filter((row) => (row.deltaTotal ?? 0) > 5).length;
  const deteriorationsOver5 = comparedRows.filter((row) => (row.deltaTotal ?? 0) < -5).length;
  const unchanged = comparedRows.length - improvementsOver5 - deteriorationsOver5;

  const newTop10Entries = Array.from(newTop10).filter((symbol) => !oldTop10.has(symbol)).length;
  const newSymbols = rows.filter((row) => row.status === 'new').length;
  const removedSymbols = rows.filter((row) => row.status === 'removed').length;

  return {
    oldRunId: a.run_id,
    newRunId: b.run_id,
    rows,
    summary: {
      newTop10Entries,
      improvementsOver5,
      deteriorationsOver5,
      unchanged,
      newSymbols,
      removedSymbols,
      comparedSymbols: comparedRows.length,
    },
  };
}

export function getBiggestMovers(
  comparison: RunComparison,
  n: number
): { up: Mover[]; down: Mover[] } {
  const comparable = comparison.rows.filter(
    (row) => row.status === 'both' && row.deltaTotal !== null
  );

  const up = [...comparable]
    .filter((row) => (row.deltaTotal ?? 0) > 0)
    .sort((a, b) => (b.deltaTotal ?? 0) - (a.deltaTotal ?? 0))
    .slice(0, n);

  const down = [...comparable]
    .filter((row) => (row.deltaTotal ?? 0) < 0)
    .sort((a, b) => (a.deltaTotal ?? 0) - (b.deltaTotal ?? 0))
    .slice(0, n);

  return { up, down };
}

export function getScoreTrends(
  history: RunV1SchemaJson[],
  symbols: string[]
): ScoreTrend[] {
  if (history.length === 0) {
    return symbols.map((symbol) => ({
      symbol,
      name: symbol,
      current: null,
      sevenDay: null,
      fourteenDay: null,
      thirtyDay: null,
      trend: 'flat',
      stability: 'medium',
      stdDev: null,
      sparkline: [],
    }));
  }

  const sortedHistory = [...history].sort(
    (a, b) => parseDate(a.run_date || a.as_of_date) - parseDate(b.run_date || b.as_of_date)
  );

  const latestRun = sortedHistory[sortedHistory.length - 1];
  const latestTs = parseDate(latestRun.run_date || latestRun.as_of_date);
  const latestNameMap = new Map(
    latestRun.scores.map((score) => [score.symbol, toName(score)] as const)
  );

  return symbols.map((symbol) => {
    const points: Array<{ dateTs: number; score: number }> = [];

    for (const run of sortedHistory) {
      const match = run.scores.find((score) => score.symbol === symbol);
      if (!match) continue;
      points.push({
        dateTs: parseDate(run.run_date || run.as_of_date),
        score: match.total_score,
      });
    }

    const sparkline = points.map((point) => point.score);
    const current = points.length > 0 ? points[points.length - 1].score : null;
    const sevenDay = pickValueAtOrBefore(points, latestTs - 7 * 24 * 60 * 60 * 1000);
    const fourteenDay = pickValueAtOrBefore(points, latestTs - 14 * 24 * 60 * 60 * 1000);
    const thirtyDay = pickValueAtOrBefore(points, latestTs - 30 * 24 * 60 * 60 * 1000);
    const baseline = thirtyDay ?? (points.length > 0 ? points[0].score : null);

    const trendDelta =
      current !== null && baseline !== null ? current - baseline : 0;
    const trend: TrendDirection =
      Math.abs(trendDelta) < 3 ? 'flat' : trendDelta > 0 ? 'up' : 'down';

    const stdDev = standardDeviation(sparkline);
    const stability: StabilityLevel =
      stdDev === null ? 'medium' : stdDev < 5 ? 'high' : stdDev <= 10 ? 'medium' : 'low';

    return {
      symbol,
      name: latestNameMap.get(symbol) ?? symbol,
      current,
      sevenDay,
      fourteenDay,
      thirtyDay,
      trend,
      stability,
      stdDev,
      sparkline,
    };
  });
}
