'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesData, QuarterlyPerformance } from '@/lib/analysis/timeSeriesAnalysis';

interface Props {
  data: TimeSeriesData;
}

type PeriodOption = '1Y' | '3Y' | '5Y';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-lg text-sm">
      <p className="text-slate-400 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-300">{entry.name}:</span>
          <span className="font-mono text-white font-medium">
            {entry.value > 0 ? '+' : ''}{Number(entry.value).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
};

export function PerformanceTimeline({ data: initialData }: Props) {
  const [period, setPeriod] = useState<PeriodOption>('1Y');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

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
  const chartData = [...data.timeSeries]
    .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.sp500))
    .sort((a, b) => a.date.localeCompare(b.date));

  const normalizedData = chartData.length > 1 ? chartData.map((point) => {
    const firstPoint = chartData[0];
    return {
      date: point.date,
      stock: ((point.price - firstPoint.price) / firstPoint.price) * 100,
      market: ((point.sp500 - firstPoint.sp500) / firstPoint.sp500) * 100,
    };
  }) : [];

  const hasChartData = normalizedData.length > 1;

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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={normalizedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickFormatter={(d) => {
                  try {
                    const date = new Date(d);
                    return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
                  } catch {
                    return d;
                  }
                }}
                interval="preserveStartEnd"
                minTickGap={50}
                stroke="#475569"
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                width={45}
                stroke="#475569"
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Area
                type="monotone"
                dataKey="stock"
                name={data.symbol}
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorStock)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="market"
                name="S&P 500"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
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
