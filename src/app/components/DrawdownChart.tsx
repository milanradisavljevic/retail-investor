'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

interface DataPoint {
  date: string;
  drawdown: number;
}

interface DrawdownChartProps {
  data: DataPoint[];
  maxDrawdown?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-lg text-sm">
      <p className="text-slate-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-red-400">Drawdown:</span>
        <span className="font-mono text-white font-medium">
          {(payload[0].value * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

export function DrawdownChart({ data, maxDrawdown }: DrawdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-slate-500 border border-dashed border-slate-700 rounded">
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
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={sampledData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="90%" stopColor="#ef4444" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            domain={[Math.min(minDD * 1.1, -0.05), 0]}
            width={50}
            stroke="#475569"
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" opacity={0.5} />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#ef4444"
            fill="url(#drawdownGradient)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}