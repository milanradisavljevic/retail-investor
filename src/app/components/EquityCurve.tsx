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
  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-slate-500">
        No equity data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(d) => {
            const date = new Date(d);
            return `${date.getMonth()+1}/${date.getFullYear().toString().slice(2)}`;
          }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
          width={60}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number, name: string) => [
            `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            name === 'portfolio' ? 'Strategy' : 'Benchmark'
          ]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="portfolio"
          name="Strategy"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="Benchmark"
          stroke="#64748b"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="5 5"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}