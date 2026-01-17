'use client';

import type { BacktestSummary } from '../utils/loadBacktestData';

interface Props {
  summary: BacktestSummary;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  highlight?: 'up' | 'down' | 'neutral';
  accent?: string;
}

function MetricCard({ title, value, subtitle, highlight = 'neutral', accent }: MetricCardProps) {
  const color =
    highlight === 'up'
      ? 'text-emerald-400'
      : highlight === 'down'
        ? 'text-red-400'
        : 'text-amber-400';

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 shadow-lg shadow-black/20">
      <div className="text-slate-400 text-xs uppercase tracking-wide">{title}</div>
      <div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div>
      {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      {accent && <div className="mt-3 text-xs text-slate-400">{accent}</div>}
    </div>
  );
}

function formatPct(value: number, digits = 2): string {
  if (Number.isNaN(value)) return '–';
  return `${value.toFixed(digits)}%`;
}

export default function MetricsCards({ summary }: Props) {
  const { metrics, benchmark, outperformance_pct } = summary;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Return"
        value={formatPct(metrics.total_return_pct)}
        highlight={metrics.total_return_pct >= 0 ? 'up' : 'down'}
        accent={`vs. S&P 500: ${formatPct(outperformance_pct, 1)}`}
      />
      <MetricCard
        title="Sharpe Ratio"
        value={metrics.sharpe_ratio.toFixed(2)}
        highlight={metrics.sharpe_ratio >= 1 ? 'up' : 'neutral'}
        accent={`Benchmark: ${benchmark.sharpe_ratio.toFixed(2)}`}
      />
      <MetricCard
        title="Max Drawdown"
        value={formatPct(metrics.max_drawdown_pct)}
        highlight="down"
        accent={`Benchmark: ${formatPct(benchmark.max_drawdown_pct)}`}
      />
      <MetricCard
        title="Volatility"
        value={formatPct(metrics.volatility_pct ?? 0)}
        highlight="neutral"
        accent="Annualized"
      />
    </div>
  );
}
