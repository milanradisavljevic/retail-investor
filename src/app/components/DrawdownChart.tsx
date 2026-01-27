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
  if (!data || data.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-slate-500">
        No drawdown data available
      </div>
    );
  }

  // Calculate min drawdown from the data (values should be in decimal form)
  const minDataDrawdown = Math.min(...data.map(d => d.drawdown));
  // Use the passed maxDrawdown if provided and it's smaller (worse drawdown) than min in data
  const minDD = maxDrawdown !== undefined ? Math.min(maxDrawdown, minDataDrawdown) : minDataDrawdown;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart
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
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          domain={[minDD * 1.1, 0]}  // Expand the lower bound slightly for visualization
          width={50}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
          formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Drawdown']}
        />
        <ReferenceLine y={0} stroke="#334155" />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.3}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}