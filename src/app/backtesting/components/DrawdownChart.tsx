'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '../utils/loadBacktestData';

interface Props {
  data: TimeSeriesPoint[];
}

const DDTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/90 px-4 py-3 text-sm shadow-lg">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      <div className="text-red-400 font-semibold">{value.toFixed(2)}%</div>
    </div>
  );
};

export default function DrawdownChart({ data }: Props) {
  if (!data?.length) {
    return <div className="text-slate-500 text-sm">Keine Drawdown-Daten gefunden.</div>;
  }

  const maxDrawdown = Math.min(...data.map((d) => d.drawdown_pct));

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<DDTooltip />} />
          <ReferenceLine
            y={maxDrawdown}
            stroke="#dc2626"
            strokeDasharray="3 3"
            label={{ value: 'Max DD', fill: '#dc2626', position: 'insideRight', fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="drawdown_pct"
            stroke="#ef4444"
            fill="url(#drawdownGradient)"
            strokeWidth={1.5}
            name="Drawdown"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
