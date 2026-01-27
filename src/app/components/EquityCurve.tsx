'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DataPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

interface EquityCurveProps {
  data: DataPoint[];
}

export function EquityCurve({ data }: EquityCurveProps) {
  // Debug logging
  console.log('[EquityCurve] Received data points:', data?.length || 0);

  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded">
        No equity curve data available ({data?.length || 0} points)
      </div>
    );
  }

  // Sample data when too many points (performance)
  const sampledData = data.length > 500
    ? data.filter((_, i) => i % Math.ceil(data.length / 500) === 0)
    : data;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart
        data={sampledData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(d) => {
            try {
              const date = new Date(d);
              return `${date.getMonth()+1}/${date.getFullYear().toString().slice(2)}`;
            } catch { return d; }
          }}
          interval="preserveStartEnd"
          minTickGap={50}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
          width={60}
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number, name: string) => [
            `$${value?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || 'N/A'}`,
            name === 'portfolio' ? 'Strategy' : 'Benchmark'
          ]}
        />
        <Legend wrapperStyle={{ color: '#94a3b8' }} />
        <Line
          type="monotone"
          dataKey="portfolio"
          name="Strategy"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="Benchmark"
          stroke="#64748b"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="5 5"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}