'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DataPoint {
  date: string;
  drawdown: number;
}

interface DrawdownChartProps {
  data: DataPoint[];
  maxDrawdown?: number;
}

export function DrawdownChart({ data, maxDrawdown }: DrawdownChartProps) {
  console.log('[DrawdownChart] Received data points:', data?.length || 0);

  if (!data || data.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded">
        No drawdown data available
      </div>
    );
  }

  // Sample data when too many points (performance)
  const sampledData = data.length > 500
    ? data.filter((_, i) => i % Math.ceil(data.length / 500) === 0)
    : data;

  const minDataDrawdown = Math.min(...data.map(d => d.drawdown));
  const minDD = maxDrawdown !== undefined ? Math.min(maxDrawdown, minDataDrawdown) : minDataDrawdown;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart
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
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          domain={[Math.min(minDD * 1.1, -0.5), 0.05]}
          width={50}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Drawdown']}
        />
        <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.3}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}