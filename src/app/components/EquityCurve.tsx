'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Brush } from 'recharts';

interface DataPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

interface EquityCurveProps {
  data: DataPoint[];
}

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
            ${entry.value?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
};

export function EquityCurve({ data }: EquityCurveProps) {
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
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={sampledData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
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
            stroke="#475569"
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
            width={50}
            domain={['auto', 'auto']}
            stroke="#475569"
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />
          <Line
            type="monotone"
            dataKey="portfolio"
            name="Strategy"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, fill: '#10b981' }}
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
    </div>
  );
}