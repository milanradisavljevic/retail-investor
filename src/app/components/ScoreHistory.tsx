'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type ScoreHistoryPoint = {
  date: string;
  score: number;
};

interface ScoreHistoryProps {
  symbol: string;
  history: ScoreHistoryPoint[];
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getUTCMonth() + 1}/${String(parsed.getUTCFullYear()).slice(2)}`;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ScoreHistoryPoint; value: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-navy-700 bg-navy-900 px-2 py-1 text-xs text-text-secondary">
      <div className="text-text-muted">{item.date}</div>
      <div className="font-semibold text-text-primary">Score: {item.score.toFixed(1)}</div>
    </div>
  );
}

export function ScoreHistory({ symbol, history }: ScoreHistoryProps) {
  if (history.length < 3) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
        <h3 className="text-base font-semibold text-text-primary">Score History</h3>
        <p className="mt-2 text-sm text-text-muted">Not enough historical data</p>
      </div>
    );
  }

  const first = history[0].score;
  const last = history[history.length - 1].score;
  const trendUp = last >= first;
  const lineColor = trendUp ? '#10b981' : '#ef4444';

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold text-text-primary">Score History</h3>
        <span className={`text-xs ${trendUp ? 'text-accent-green' : 'text-accent-red'}`}>
          {symbol} {trendUp ? 'uptrend' : 'downtrend'}
        </span>
      </div>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              minTickGap={20}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
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
