import { StockDetailView } from '@/app/components/StockDetailView';
import { getCompanyName } from '@/core/company';
import { getLatestRun } from '@/lib/runLoader';
import { loadRunFiles } from '@/run/files';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

import { notFound } from 'next/navigation';

type Params = {
  params?: Promise<{ symbol?: string | string[] }>;
};

type ScoreHistoryPoint = {
  date: string;
  score: number;
};

function buildScoreHistory(symbol: string): ScoreHistoryPoint[] {
  const recentRuns = loadRunFiles(200);
  const points: ScoreHistoryPoint[] = [];

  for (const entry of recentRuns) {
    const score = entry.run.scores.find((item) => item.symbol === symbol);
    if (!score) continue;

    points.push({
      date: entry.run.as_of_date,
      score: Number(score.total_score.toFixed(2)),
    });

    if (points.length >= 10) break;
  }

  return points.reverse();
}

function buildTop20Symbols(run: RunV1SchemaJson): string[] {
  const selectedTop20 = run.selections?.top20?.map((symbol) => symbol.toUpperCase()) ?? [];
  if (selectedTop20.length > 0) return selectedTop20;

  return [...run.scores]
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 20)
    .map((item) => item.symbol.toUpperCase());
}

export default async function StockDetailPage({ params }: Params) {
  const resolvedParams = (await params) ?? {};
  const symbolParam = Array.isArray(resolvedParams.symbol) ? resolvedParams.symbol[0] : resolvedParams.symbol;
  const symbol = symbolParam?.toUpperCase();

  if (!symbol) {
    notFound();
  }
  const latest = getLatestRun();

  if (!latest) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-primary mb-3">Keine Runs verfuegbar</h2>
        <p className="text-text-secondary">Fuehre einen Daily Run aus, um Aktiendetails zu sehen.</p>
      </div>
    );
  }

  const run = latest.run as RunV1SchemaJson;
  const score = run.scores.find((s) => s.symbol === symbol);
  const companyName = score?.company_name ?? (symbol ? getCompanyName(symbol) : undefined);

  if (!score) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          {symbol} nicht im neuesten Run
        </h2>
        <p className="text-text-secondary">
          Das aktuelle Briefing enthaelt {getCompanyName(symbol) ?? symbol} nicht.
        </p>
        <a
          href="/"
          className="mt-4 inline-block px-4 py-2 rounded-lg border border-navy-700 text-text-secondary hover:text-text-primary"
        >
          ← Zurueck zum Dashboard
        </a>
      </div>
    );
  }

  const scoreHistory = buildScoreHistory(symbol);
  const top20Symbols = buildTop20Symbols(run);
  const currentTop20Index = top20Symbols.findIndex((item) => item === symbol);
  const prevSymbol = currentTop20Index > 0 ? top20Symbols[currentTop20Index - 1] : null;
  const nextSymbol =
    currentTop20Index >= 0 && currentTop20Index < top20Symbols.length - 1
      ? top20Symbols[currentTop20Index + 1]
      : null;

  return (
    <div className="max-w-6xl mx-auto">
      <StockDetailView
        run={run}
        score={score}
        companyName={companyName}
        scoreHistory={scoreHistory}
        prevSymbol={prevSymbol}
        nextSymbol={nextSymbol}
      />
    </div>
  );
}
