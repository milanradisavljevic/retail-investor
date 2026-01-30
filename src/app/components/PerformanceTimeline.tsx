'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  const chartData = data.timeSeries.map((point, idx) => {
    const firstPoint = data.timeSeries[0];
    return {
      date: point.date,
      stock: ((point.price - firstPoint.price) / firstPoint.price) * 100,
      market: ((point.sp500 - firstPoint.sp500) / firstPoint.sp500) * 100
    };
  });

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
      <div className="h-80 rounded-xl border border-navy-700 bg-navy-800 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(date) => {
                const d = new Date(date);
                return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
              }}
              minTickGap={50}
            />
            <YAxis
              stroke="#94a3b8"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px'
              }}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
              formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="stock"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
              name={data.symbol}
            />
            <Line
              type="monotone"
              dataKey="market"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="S&P 500"
            />
          </LineChart>
        </ResponsiveContainer>
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
