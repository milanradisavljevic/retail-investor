'use client';

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
import type { TimeSeriesPoint } from '../utils/loadBacktestData';

interface Props {
  data: TimeSeriesPoint[];
  currencySymbol?: string;
}

function formatCurrency(value: number, symbol: string): string {
  if (Number.isNaN(value)) return '-';
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
  return `${symbol}${value.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload, label, currencySymbol }: any) => {
  if (!active || !payload?.length) return null;
  const [portfolio, benchmark] = payload;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/90 px-4 py-3 text-sm shadow-lg">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-amber-300">Portfolio</span>
          <span className="text-slate-100 font-semibold">
            {formatCurrency(portfolio?.value ?? 0, currencySymbol)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">S&P 500</span>
          <span className="text-slate-200">
            {formatCurrency(benchmark?.value ?? 0, currencySymbol)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function EquityCurveChart({ data, currencySymbol = '$' }: Props) {
  if (!data?.length) {
    return <div className="text-slate-500 text-sm">Keine Zeitreihen-Daten gefunden.</div>;
  }

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
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
            tickFormatter={(v) => formatCurrency(v, currencySymbol)}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="portfolio_value"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
            name="Portfolio"
          />
          <Line
            type="monotone"
            dataKey="sp500_value"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            name="S&P 500"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
