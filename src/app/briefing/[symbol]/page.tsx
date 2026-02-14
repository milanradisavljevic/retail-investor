import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLatestRunFile } from '@/run/files';
import { ScoreForensics } from '@/app/components/ScoreForensics';
import { PerformanceTimeline } from '@/app/components/PerformanceTimeline';
import { PeerComparison } from '@/app/components/PeerComparison';
import { EnhancedPriceTarget } from '@/app/components/EnhancedPriceTarget';
import { loadTimeSeriesData } from '@/lib/analysis/timeSeriesAnalysis';
import { buildEnhancedPriceTarget } from '@/lib/analysis/priceTargetAnalysis';
import { getCompanyName } from '@/core/company';
import { AddToWatchlistButton } from '@/app/components/AddToWatchlistButton';

export default async function StockDetailPage({
  params
}: {
  params: Promise<{ symbol?: string | string[] }>
}) {
  const { symbol: rawSymbol } = await params;
  const symbolParam = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
  if (!symbolParam) {
    notFound();
  }
  const symbol = symbolParam.toUpperCase();
  
  // 1. Load latest run
  const latestRun = getLatestRunFile();
  if (!latestRun) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            No Run Data Available
          </h1>
          <p className="text-text-secondary mb-4">
            Please run the daily scoring engine first.
          </p>
          <Link
            href="/"
            className="text-accent-blue hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }
  
  // 2. Find stock in run
  const stockScore = latestRun.run.scores.find(
    s => s.symbol === symbol
  );
  
  if (!stockScore) {
    notFound();
  }
  
  // 3. Load all data in parallel
  const [timeSeriesData, enhancedTarget] = await Promise.all([
    loadTimeSeriesData(symbol, '1Y').catch(e => {
        console.warn(`Failed to load time series for ${symbol}`, e);
        return null; 
    }),
    buildEnhancedPriceTarget(symbol, stockScore).catch(e => {
        console.warn(`Failed to build enhanced price target for ${symbol}`, e);
        return null;
    })
  ]);
  
  // 4. Get company name
  const companyName = getCompanyName(symbol);
  const currentPrice = stockScore.price_target?.current_price ?? null;
  
  return (
    <div className="min-h-screen bg-navy-900">
      {/* Header */}
      <header className="border-b border-navy-700 bg-navy-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Breadcrumb */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-text-muted hover:text-accent-blue transition-colors"
              >
                ← Latest Briefing
              </Link>
              <span className="text-navy-600">/</span>
              <h1 className="text-2xl font-bold text-text-primary">
                {symbol}
              </h1>
              <span className="text-text-secondary text-lg">
                {companyName}
              </span>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3">
              <ExportButton symbol={symbol} />
              <AddToWatchlistButton
                symbol={symbol}
                companyName={companyName}
                lastScore={stockScore.total_score}
                lastPrice={currentPrice ?? undefined}
              />
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="mt-4 flex items-center gap-6 text-sm">
            <QuickStat
              label="Total Score"
              value={stockScore.total_score.toFixed(1)}
              color="text-accent-gold"
            />
          <QuickStat
            label="Current Price"
            value={currentPrice !== null ? `$${currentPrice.toFixed(2)}` : '—'}
            color="text-text-primary"
          />
            <QuickStat
              label="1Y Return"
              value={timeSeriesData ? `${timeSeriesData.summary['1Y'].return > 0 ? '+' : ''}${timeSeriesData.summary['1Y'].return.toFixed(1)}%` : '—'}
              color={timeSeriesData ? (timeSeriesData.summary['1Y'].return > 0 ? 'text-green-400' : 'text-red-400') : 'text-text-secondary'}
            />
            <QuickStat
              label="Risk Score"
              value={stockScore.evidence.risk.toFixed(1)}
              color="text-blue-400"
            />
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Score Forensics */}
            <section className="rounded-xl border border-navy-700 bg-navy-800 p-6">
              <ScoreForensics
                symbol={symbol}
                totalScore={stockScore.total_score}
                pillars={{
                  valuation: buildPillarData(stockScore, 'valuation'),
                  quality: buildPillarData(stockScore, 'quality'),
                  technical: buildPillarData(stockScore, 'technical'),
                  risk: buildPillarData(stockScore, 'risk')
                }}
              />
            </section>
            
            {/* Performance Timeline */}
            <section className="rounded-xl border border-navy-700 bg-navy-800 p-6 min-w-0">
              {timeSeriesData ? (
                 <PerformanceTimeline data={timeSeriesData} />
              ) : (
                <div className="text-center text-text-secondary p-4">
                  Performance data not available.
                </div>
              )}
            </section>
            
            {/* Peer Comparison */}
            <section className="rounded-xl border border-navy-700 bg-navy-800 p-6">
              <PeerComparison run={latestRun.run} currentScore={stockScore} />
            </section>
          </div>
          
          {/* Right Column (1/3 width) - Sticky */}
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {/* Enhanced Price Target */}
            <section className="rounded-xl border border-navy-700 bg-navy-800 p-6">
              {enhancedTarget ? (
                <EnhancedPriceTarget data={enhancedTarget} />
              ) : (
                 <div className="text-center text-text-secondary p-4">
                  Price target analysis not available.
                </div>
              )}
            </section>
            
            {/* Data Quality Card */}
            {stockScore.data_quality && (
                <section className="rounded-xl border border-navy-700 bg-navy-800 p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">
                    Data Quality
                </h3>
                <DataQualityIndicator
                    score={stockScore.data_quality.data_quality_score}
                    completeness={stockScore.data_quality.completeness_ratio ?? 0}
                />
                </section>
            )}
            
            {/* Run Info */}
            <section className="rounded-lg border border-navy-700 bg-navy-800 p-4">
              <div className="text-xs text-text-muted space-y-2">
                <div className="flex justify-between">
                  <span>Run Date:</span>
                  <span className="text-text-secondary">
                    {latestRun.run.run_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>As Of:</span>
                  <span className="text-text-secondary">
                    {latestRun.run.as_of_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Universe:</span>
                  <span className="text-text-secondary">
                    {latestRun.run.universe.definition.name}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

// Helper Components
function QuickStat({ 
  label, 
  value, 
  color 
}: { 
  label: string; 
  value: string; 
  color: string;
}) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ExportButton({ symbol }: { symbol: string }) {
  // This needs to be a client component or use a link to API
  // Since this is a server component, we can render a simple link or we'd need to extract it to a client component.
  // For simplicity matching the snippet, I'll make it an <a> tag styled as button.
  return (
    <a
      href={`/api/stock/${symbol}/export?format=json`}
      target="_blank"
      className="px-4 py-2 text-sm bg-navy-700 text-text-primary rounded-lg hover:bg-navy-600 transition-colors inline-block"
    >
      Export JSON
    </a>
  );
}

function DataQualityIndicator({ 
  score, 
  completeness 
}: { 
  score: number; 
  completeness: number;
}) {
  const getColor = (value: number) => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-muted">Quality Score</span>
          <span className={`font-semibold ${getColor(score)}`}>
            {score.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-navy-900 rounded-full overflow-hidden">
          <div
            className={`h-full ${
              score >= 80 ? 'bg-green-500' :
              score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-muted">Completeness</span>
          <span className={`font-semibold ${getColor(completeness * 100)}`}>
            {(completeness * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-navy-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${completeness * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper function to build pillar data
function buildPillarData(stockScore: any, pillar: string) {
  const score = stockScore.evidence?.[pillar] ?? 0;
  return {
    score: score,
    percentile: 50, // Placeholder
    metrics: {} // Placeholder for specific metrics
  };
}
