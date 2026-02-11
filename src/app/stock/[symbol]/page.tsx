import { EnhancedPriceTarget } from '@/app/components/EnhancedPriceTarget';
import { PerformanceTimeline } from '@/app/components/PerformanceTimeline';
import { PeerComparison } from '@/app/components/PeerComparison';
import { StockDetailView } from '@/app/components/StockDetailView';
import { getCompanyName } from '@/core/company';
import { buildEnhancedPriceTarget } from '@/lib/analysis/priceTargetAnalysis';
import { findPeers } from '@/lib/analysis/peerAnalysis';
import { loadTimeSeriesData } from '@/lib/analysis/timeSeriesAnalysis';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

import { notFound } from 'next/navigation';

type Params = {
  params?: Promise<{ symbol?: string | string[] }>;
};

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
        <h2 className="text-xl font-semibold text-text-primary mb-3">No runs available</h2>
        <p className="text-text-secondary">Generate a daily run to view stock details.</p>
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

  // Load time series data for performance timeline
  let timeSeriesData = null;
  let timeSeriesError = null;

  try {
    timeSeriesData = await loadTimeSeriesData(symbol, '1Y');
  } catch (error) {
    timeSeriesError = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Could not load time series data for ${symbol}:`, timeSeriesError);
  }

  let peerData = null;
  let peerError = null;

  try {
    peerData = await findPeers(symbol);
  } catch (error) {
    peerError = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Could not load peers for ${symbol}:`, peerError);
  }

  let enhancedPriceTarget = null;
  let enhancedPriceTargetError = null;

  try {
    enhancedPriceTarget = await buildEnhancedPriceTarget(symbol, score);
  } catch (error) {
    enhancedPriceTargetError = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Could not build enhanced price target for ${symbol}:`, enhancedPriceTargetError);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <StockDetailView run={run} score={score} companyName={companyName} />

      {enhancedPriceTarget ? (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <EnhancedPriceTarget data={enhancedPriceTarget} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-2">Price Target Analysis</h3>
          <p className="text-sm text-text-muted">
            {enhancedPriceTargetError ?? 'Enhanced price target is not available for this symbol.'}
          </p>
        </div>
      )}

      {peerData ? (
        <div className="mt-6">
          <PeerComparison data={peerData} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-2">Peer Comparison</h3>
          <p className="text-sm text-text-muted">
            {peerError ?? 'Peer data not available for this symbol.'}
          </p>
        </div>
      )}

      {timeSeriesData ? (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <PerformanceTimeline data={timeSeriesData} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800 p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Performance Timeline
          </h3>
          <p className="text-sm text-text-muted">
            Historical data not available for this symbol.
            {timeSeriesError && (
              <span className="block mt-1 text-xs text-accent-red">{timeSeriesError}</span>
            )}
          </p>
          <p className="text-xs text-text-secondary mt-2">
            Run <code className="bg-navy-700 px-1.5 py-0.5 rounded">python scripts/backtesting/fetch-historical.py</code> to fetch historical data.
          </p>
        </div>
      )}
    </div>
  );
}
