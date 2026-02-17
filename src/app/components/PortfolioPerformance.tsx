'use client';

import { useEffect, useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';

interface BenchmarkPoint {
  date: string;
  value: number;
}

interface PerformanceMetrics {
  portfolio_return: number;
  spy_return: number;
  qqq_return: number;
  alpha_vs_spy: number;
  tracking_error: number | null;
}

interface PerformanceResponse {
  portfolio: BenchmarkPoint[];
  benchmarks: {
    spy: BenchmarkPoint[];
    qqq: BenchmarkPoint[];
  };
  metrics: PerformanceMetrics;
  period: string;
  start_date: string;
  end_date: string;
  snapshot_count: number;
  message?: string;
}

type Period = '1m' | '3m' | '6m' | '1y' | 'max';

const PERIOD_LABELS: Record<Period, string> = {
  '1m': '1M',
  '3m': '3M',
  '6m': '6M',
  '1y': '1Y',
  'max': 'Max',
};

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getReturnColor(value: number): string {
  return value >= 0 ? 'text-emerald-400' : 'text-red-400';
}

export function PortfolioPerformance() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('3m');
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/portfolio/performance?period=${period}`);
        if (!response.ok) throw new Error('Fehler beim Laden der Performance-Daten');
        const result: PerformanceResponse = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [period]);
  
  if (loading) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-navy-700 rounded" />
          <div className="h-64 bg-navy-700 rounded" />
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }
  
  if (!data) return null;
  
  if (data.message || data.snapshot_count < 7) {
    return (
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4">Performance vs. Benchmark</h2>
        <div className="flex items-center gap-3 text-text-muted">
          <AlertCircle className="w-5 h-5" />
          <div>
            <p>
              {data.message || `Noch nicht genug Daten für aussagekräftigen Vergleich (${data.snapshot_count} Snapshots).`}
            </p>
            <p className="text-xs mt-1">
              Snapshots werden täglich gespeichert. Mindestens 7 benötigt.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  const chartData = data.portfolio.map((point, idx) => ({
    date: formatDate(point.date),
    portfolio: point.value,
    spy: data.benchmarks.spy[idx]?.value ?? null,
    qqq: data.benchmarks.qqq[idx]?.value ?? null,
  }));
  
  const metrics = data.metrics;
  
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Performance vs. Benchmark</h2>
        <div className="flex gap-1 bg-navy-700 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-accent-blue text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={{ stroke: '#1e293b' }}
              axisLine={{ stroke: '#1e293b' }}
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={{ stroke: '#1e293b' }}
              axisLine={{ stroke: '#1e293b' }}
              domain={['dataMin - 5', 'dataMax + 5']}
              tickFormatter={(v) => `${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1e293b',
                borderRadius: '0.5rem',
                color: '#e2e8f0',
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number, name: string) => [
                value?.toFixed(2) ?? '--',
                name === 'portfolio' ? 'Portfolio' : name.toUpperCase()
              ]}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => value === 'portfolio' ? 'Portfolio' : value.toUpperCase()}
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="portfolio"
            />
            <Line
              type="monotone"
              dataKey="spy"
              stroke="#64748b"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="spy"
            />
            <Line
              type="monotone"
              dataKey="qqq"
              stroke="#64748b"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              dot={false}
              name="qqq"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-navy-700">
        <div>
          <div className="text-xs text-text-muted mb-1">Portfolio</div>
          <div className={`text-lg font-bold flex items-center gap-1 ${getReturnColor(metrics.portfolio_return)}`}>
            {metrics.portfolio_return >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {formatPercent(metrics.portfolio_return)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">SPY</div>
          <div className={`text-lg font-bold ${getReturnColor(metrics.spy_return)}`}>
            {formatPercent(metrics.spy_return)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">QQQ</div>
          <div className={`text-lg font-bold ${getReturnColor(metrics.qqq_return)}`}>
            {formatPercent(metrics.qqq_return)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Alpha vs SPY</div>
          <div className={`text-lg font-bold flex items-center gap-1 ${getReturnColor(metrics.alpha_vs_spy)}`}>
            {formatPercent(metrics.alpha_vs_spy)}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-navy-700 text-xs text-text-muted">
        <span>
          Zeitraum: {formatDate(data.start_date)} – {formatDate(data.end_date)}
        </span>
        <span>
          {data.snapshot_count} Snapshots · Basis 100
        </span>
      </div>
    </div>
  );
}
