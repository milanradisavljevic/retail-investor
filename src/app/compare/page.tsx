import { getCompanyName } from '@/core/company';
import { enrichPositions } from '@/data/portfolioEnrichment';
import { getPositions } from '@/data/portfolio';
import { getAuthUserId } from '@/lib/auth';
import {
  getAvailableRuns,
  getRunHistory,
  getRunPair,
  loadRun,
  type RunMeta,
} from '@/lib/runLoader';
import {
  compareRuns,
  getBiggestMovers,
  getScoreTrends,
  type Mover,
  type RunComparison,
  type ScoreTrend,
} from '@/lib/runCompare';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import CompareRunsClient from './CompareRunsClient';

export const dynamic = 'force-dynamic';

type SearchParamsShape = Promise<{ runId?: string; compareTo?: string }>;

interface RunMetaLite {
  runId: string;
  runDate: string;
  asOfDate: string;
  universe: string;
  preset: string;
}

interface PortfolioImpactRow {
  symbol: string;
  name: string;
  oldScore: number | null;
  newScore: number | null;
  delta: number | null;
  weightPct: number;
  impact: number | null;
}

interface PortfolioImpactData {
  rows: PortfolioImpactRow[];
  oldScore: number | null;
  newScore: number | null;
  delta: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function extractPreset(run: RunV1SchemaJson): string {
  const raw = asRecord(run);
  const preset = typeof raw.preset === 'string' ? raw.preset : null;
  const strategy = typeof raw.strategy === 'string' ? raw.strategy : null;
  const value = preset ?? strategy ?? 'Live Run';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toRunMetaLite(meta: RunMeta): RunMetaLite {
  return {
    runId: meta.runId,
    runDate: meta.runDate,
    asOfDate: meta.asOfDate,
    universe: meta.universe,
    preset: meta.preset,
  };
}

function toScoreMap(run: RunV1SchemaJson): Map<string, number> {
  return new Map(run.scores.map((score) => [score.symbol, score.total_score] as const));
}

function round(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Number(value.toFixed(2));
}

function getPositionValue(position: {
  current_value_usd?: number | null;
  quantity: number;
  buy_price: number;
}): number {
  if (
    position.current_value_usd !== null &&
    position.current_value_usd !== undefined &&
    Number.isFinite(position.current_value_usd) &&
    position.current_value_usd > 0
  ) {
    return position.current_value_usd;
  }
  return position.quantity * position.buy_price;
}

function buildPortfolioImpact(
  userId: string,
  previousRun: RunV1SchemaJson,
  currentRun: RunV1SchemaJson
): PortfolioImpactData | null {
  try {
    const positions = enrichPositions(getPositions(userId));
    if (positions.length === 0) return null;

    const previousScores = toScoreMap(previousRun);
    const currentScores = toScoreMap(currentRun);

    const totalValue = positions.reduce((sum, position) => sum + getPositionValue(position), 0);
    if (totalValue <= 0) return null;

    const rows: PortfolioImpactRow[] = positions.map((position) => {
      const oldScore = previousScores.get(position.symbol) ?? null;
      const newScore = currentScores.get(position.symbol) ?? null;
      const delta =
        oldScore !== null && newScore !== null ? newScore - oldScore : null;
      const weight = getPositionValue(position) / totalValue;

      return {
        symbol: position.symbol,
        name: position.display_name || getCompanyName(position.symbol) || position.symbol,
        oldScore: round(oldScore),
        newScore: round(newScore),
        delta: round(delta),
        weightPct: Number((weight * 100).toFixed(2)),
        impact: delta === null ? null : round(weight * delta),
      };
    });

    let oldWeighted = 0;
    let oldWeightSum = 0;
    let newWeighted = 0;
    let newWeightSum = 0;

    rows.forEach((row) => {
      const weight = row.weightPct / 100;
      if (row.oldScore !== null) {
        oldWeighted += row.oldScore * weight;
        oldWeightSum += weight;
      }
      if (row.newScore !== null) {
        newWeighted += row.newScore * weight;
        newWeightSum += weight;
      }
    });

    const oldScore = oldWeightSum > 0 ? oldWeighted / oldWeightSum : null;
    const newScore = newWeightSum > 0 ? newWeighted / newWeightSum : null;
    const delta =
      oldScore !== null && newScore !== null ? newScore - oldScore : null;

    return {
      rows: rows.sort(
        (a, b) => Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0)
      ),
      oldScore: round(oldScore),
      newScore: round(newScore),
      delta: round(delta),
    };
  } catch {
    return null;
  }
}

export default async function CompareRunsPage({
  searchParams,
}: {
  searchParams?: SearchParamsShape;
}) {
  let userId: string;
  try {
    userId = await getAuthUserId();
  } catch {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
        <h1 className="text-xl font-semibold text-text-primary">Run-Vergleich</h1>
        <p className="mt-2 text-sm text-text-secondary">Unauthorized</p>
      </div>
    );
  }

  const resolved = (await searchParams) ?? {};
  const selectedRunId = resolved.runId?.trim();
  const selectedCompareTo = resolved.compareTo?.trim();

  const availableRuns = getAvailableRuns(10);
  const allRuns = getAvailableRuns(100);

  if (availableRuns.length === 0) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
        <h1 className="text-xl font-semibold text-text-primary">Run-Vergleich</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Keine Run-Daten gefunden. Fuehre zuerst einen Daily Run aus.
        </p>
      </div>
    );
  }

  const pair = getRunPair(selectedRunId);
  const current = pair.current;

  if (!current) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-6">
        <h1 className="text-xl font-semibold text-text-primary">Run-Vergleich</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Aktueller Run konnte nicht geladen werden.
        </p>
      </div>
    );
  }

  const compareCandidate =
    selectedCompareTo && selectedCompareTo !== current.run.run_id
      ? loadRun(selectedCompareTo)
      : pair.previous;

  const currentMeta =
    allRuns.find((run) => run.runId === current.run.run_id) ?? {
      runId: current.run.run_id,
      runDate: current.run.run_date,
      asOfDate: current.run.as_of_date,
      universe: current.run.universe.definition.name,
      preset: extractPreset(current.run),
      provider: current.run.provider.name,
      symbolCount: current.run.scores.length,
      filePath: '',
      fileName: '',
      mtimeMs: 0,
      configKey: `${current.run.universe.definition.name}__${extractPreset(current.run)}`,
    };

  const historyRuns = getRunHistory(30, currentMeta.universe, currentMeta.preset).map(
    (item) => item.run
  );

  const top10Symbols = [...current.run.scores]
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10)
    .map((score) => score.symbol);

  const trends: ScoreTrend[] = getScoreTrends(historyRuns, top10Symbols);

  let comparison: RunComparison | null = null;
  let movers: { up: Mover[]; down: Mover[] } = { up: [], down: [] };
  let portfolioImpact: PortfolioImpactData | null = null;

  if (compareCandidate) {
    comparison = compareRuns(compareCandidate.run, current.run);
    movers = getBiggestMovers(comparison, 10);
    portfolioImpact = buildPortfolioImpact(userId, compareCandidate.run, current.run);
  }

  return (
    <CompareRunsClient
      availableRuns={availableRuns.map(toRunMetaLite)}
      currentRunMeta={toRunMetaLite(currentMeta)}
      previousRunMeta={
        compareCandidate
          ? toRunMetaLite(
              allRuns.find((run) => run.runId === compareCandidate.run.run_id) ?? {
                runId: compareCandidate.run.run_id,
                runDate: compareCandidate.run.run_date,
                asOfDate: compareCandidate.run.as_of_date,
                universe: compareCandidate.run.universe.definition.name,
                preset: extractPreset(compareCandidate.run),
                provider: compareCandidate.run.provider.name,
                symbolCount: compareCandidate.run.scores.length,
                filePath: '',
                fileName: '',
                mtimeMs: 0,
                configKey: `${compareCandidate.run.universe.definition.name}__${extractPreset(compareCandidate.run)}`,
              }
            )
          : null
      }
      selectedCompareTo={selectedCompareTo ?? null}
      comparison={comparison}
      movers={movers}
      trends={trends}
      trendRunCount={historyRuns.length}
      portfolioImpact={portfolioImpact}
    />
  );
}
