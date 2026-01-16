import { StockDetailView } from '@/app/components/StockDetailView';
import { getLatestRun } from '@/lib/runLoader';
import { getCompanyName } from '@/core/company';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

import { notFound } from 'next/navigation';

type Params = {
  params?: { symbol?: string | string[] };
};

export default function StockDetailPage({ params }: Params) {
  const symbolParam = Array.isArray(params?.symbol) ? params?.symbol[0] : params?.symbol;
  const symbol = symbolParam?.toUpperCase();

  if (!symbol) {
    notFound();
  }
  const latest = getLatestRun();

  if (!latest) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-primary mb-3">No runs available</h2>
        <p className="text-text-secondary">Generate a daily run to view stock details.</p>
      </div>
    );
  }

  const run = latest.run as RunV1SchemaJson;
  const score = run.scores.find((s) => s.symbol === symbol);

  if (!score) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          {symbol} not in latest run
        </h2>
        <p className="text-text-secondary">
          The latest briefing does not include {getCompanyName(symbol) ?? symbol}.
        </p>
        <a
          href="/"
          className="mt-4 inline-block px-4 py-2 rounded-lg border border-navy-700 text-text-secondary hover:text-text-primary"
        >
          ← Back to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <StockDetailView run={run} score={score} />
    </div>
  );
}
