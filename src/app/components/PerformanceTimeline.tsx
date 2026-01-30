'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimeSeriesData, QuarterlyPerformance } from '@/lib/analysis/timeSeriesAnalysis';

interface Props {
  data: TimeSeriesData;
}

type PeriodOption = '1Y' | '3Y' | '5Y';

export function PerformanceTimeline({ data: initialData }: Props) {
  const [period, setPeriod] = useState<PeriodOption>('1Y');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const chartHeight = 260;

  // When period changes, reload data
  const handlePeriodChange = async (newPeriod: PeriodOption) => {
    if (newPeriod === period) return;

    setPeriod(newPeriod);
    setLoading(true);

    try {
      // Fetch new data for period
      const response = await fetch(
        `/api/stock/${data.symbol}/timeseries?period=${newPeriod}`
      );
      const newData = await response.json();
      setData(newData);
    } catch (error) {
      console.error('Failed to load time series data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data (normalize to percentage from start)
  const sortedSeries = useMemo(
    () =>
      [...data.timeSeries]
        .filter((p) => isFinite(p.price) && isFinite(p.sp500))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data.timeSeries]
  );

  const chartData = useMemo(() => {
    if (sortedSeries.length < 2) return [];
    const firstPoint = sortedSeries[0];
    return sortedSeries.map((point) => ({
      date: point.date,
      stock: ((point.price - firstPoint.price) / firstPoint.price) * 100,
      market: ((point.sp500 - firstPoint.sp500) / firstPoint.sp500) * 100,
    }));
  }, [sortedSeries]);

  const hasChartData = chartData.length > 1;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pathData = useMemo(() => {
    if (!hasChartData) return { stock: '', market: '' };
    const padding = 8;
    const h = chartHeight - padding * 2;
    const w = width - padding * 2;

    const toPath = (key: 'stock' | 'market') => {
      const values = chartData.map((d) => d[key]);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      const points = chartData
        .map((d, i) => {
          const x = padding + (i / (chartData.length - 1)) * w;
          const y = padding + ((max - d[key]) / range) * h;
          return `${x},${y}`;
        })
        .join(' ');
      return `M ${points}`;
    };

    return {
      stock: toPath('stock'),
      market: toPath('market'),
    };
  }, [chartData, hasChartData, width]);

  const summary = data.summary[period] ?? { return: 0, vsMarket: 0, vsSector: 0 };
  const stockReturn = summary.return ?? 0;
  const vsMarket = summary.vsMarket ?? 0;
  const benchmarkReturn = stockReturn - vsMarket;

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          Performance vs. Benchmarks
        </h3>
        <div className="flex gap-2">
          {(['1Y', '3Y', '5Y'] as PeriodOption[]).map(p => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              disabled={loading}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                period === p
                  ? 'bg-accent-blue text-white'
                  : 'bg-navy-700 text-text-secondary hover:bg-navy-600'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={`${data.symbol} Return`}
          value={`${stockReturn > 0 ? '+' : ''}${stockReturn.toFixed(1)}%`}
          color="text-accent-gold"
        />
        <StatCard
          label="S&P 500 Return"
          value={`${benchmarkReturn > 0 ? '+' : ''}${benchmarkReturn.toFixed(1)}%`}
          color="text-text-secondary"
        />
        <StatCard
          label="Outperformance"
          value={`${vsMarket > 0 ? '+' : ''}${vsMarket.toFixed(1)}%`}
          color={vsMarket > 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* Chart */}
      <div className="h-[320px] w-full min-w-0 rounded-xl border border-navy-700 bg-navy-800 p-4">
        {hasChartData ? (
          <div ref={containerRef} className="relative h-full w-full">
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${chartHeight}`}
              preserveAspectRatio="none"
              className="absolute inset-0"
            >
              <defs>
                <linearGradient id="perf-stock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={pathData.market} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 5" />
              <path d={`${pathData.stock} L ${width} ${chartHeight} L 0 ${chartHeight} Z`} fill="url(#perf-stock)" />
              <path d={pathData.stock} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-text-secondary text-sm">
            Performance-Daten sind aktuell nicht verfügbar.
          </div>
        )}
      </div>

      {/* Quarterly Breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">
          Quarterly Performance
        </h4>
        <div className="grid gap-2">
          {data.quarterlyPerformance.slice(-4).reverse().map(q => (
            <QuarterlyRow key={q.quarter} quarter={q} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function QuarterlyRow({ quarter }: { quarter: QuarterlyPerformance }) {
  const interpretationLabels = {
    defensive: { text: 'Defensive', color: 'text-blue-400', icon: '🛡️' },
    capture: { text: 'Capture Upside', color: 'text-green-400', icon: '📈' },
    consistent: { text: 'Consistent', color: 'text-text-secondary', icon: '➡️' },
    underperform: { text: 'Underperform', color: 'text-red-400', icon: '📉' }
  };

  const label = interpretationLabels[quarter.interpretation];

  return (
    <div className="flex items-center justify-between rounded-lg border border-navy-700 bg-navy-800 p-3">
      <div className="flex items-center gap-3">
        <div className="text-sm font-mono text-text-secondary">
          {quarter.quarter}
        </div>
        <div className="text-sm">
          <span className={`font-semibold ${
            quarter.stockReturn > 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {quarter.stockReturn > 0 ? '+' : ''}{quarter.stockReturn}%
          </span>
          <span className="text-text-muted mx-2">vs Market</span>
          <span className="text-text-secondary">
            {quarter.marketReturn > 0 ? '+' : ''}{quarter.marketReturn}%
          </span>
        </div>
      </div>
      <div className={`flex items-center gap-2 text-sm ${label.color}`}>
        <span>{label.icon}</span>
        <span>{label.text}</span>
      </div>
    </div>
  );
}
