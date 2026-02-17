import { ETFDetailClient } from './ETFDetailClient';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import { notFound } from 'next/navigation';

type Params = {
  params?: Promise<{ ticker?: string | string[] }>;
};

function buildHoldingScoreMap(): Record<string, number> {
  const latest = getLatestRun();
  if (!latest) return {};

  const run = latest.run as RunV1SchemaJson;
  const entries = run.scores.map((item) => [
    item.symbol.toUpperCase(),
    Number(item.total_score.toFixed(2)),
  ]);

  return Object.fromEntries(entries);
}

export default async function ETFDetailPage({ params }: Params) {
  const resolvedParams = (await params) ?? {};
  const tickerParam = Array.isArray(resolvedParams.ticker)
    ? resolvedParams.ticker[0]
    : resolvedParams.ticker;
  const ticker = tickerParam?.toUpperCase();

  if (!ticker) {
    notFound();
  }

  const holdingScoreMap = buildHoldingScoreMap();

  return (
    <div className="max-w-6xl mx-auto">
      <ETFDetailClient ticker={ticker} holdingScoreMap={holdingScoreMap} />
    </div>
  );
}
