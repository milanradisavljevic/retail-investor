'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface MarketSparklineProps {
  name: string;
  value: number | null;
  changePercent: number | null;
  data: { value: number }[];
}

function formatValue(value: number | null) {
  if (value === null) return '--';
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatChange(change: number | null) {
  if (change === null || Number.isNaN(change)) return '--';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export default function MarketSparkline({ name, value, changePercent, data }: MarketSparklineProps) {
  const isPositive = (changePercent ?? 0) >= 0;
  const sparkData = data.length > 0 ? data : [{ value: value ?? 0 }];
  const lineColor = isPositive ? '#10B981' : '#EF4444';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium">{name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            isPositive
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-red-400 bg-red-500/10'
          }`}
        >
          {formatChange(changePercent)}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-slate-100 leading-tight">{formatValue(value)}</span>
      </div>
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
            <Tooltip
              cursor={{ stroke: '#1f2937', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1f2937',
                borderRadius: '0.5rem',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              labelFormatter={() => ''}
              formatter={(val: number) => formatValue(typeof val === 'number' ? val : null)}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
