import * as fs from 'fs';
import * as path from 'path';

interface DailyRecord {
  date: string;
  portfolio_value: number;
  sp500_value: number;
  daily_return_pct: number;
  drawdown_pct: number;
}

interface BacktestSummary {
  period: string;
  strategy: string;
  metrics: {
    total_return_pct: number;
    annualized_return_pct: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    volatility_pct: number;
  };
  benchmark: {
    total_return_pct: number;
    annualized_return_pct: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
  };
  outperformance_pct: number;
}

function loadBacktestData(): { summary: BacktestSummary | null; records: DailyRecord[] } {
  const summaryPath = path.join(process.cwd(), 'data/backtesting/backtest-summary.json');
  const csvPath = path.join(process.cwd(), 'data/backtesting/backtest-results.csv');

  let summary: BacktestSummary | null = null;
  let records: DailyRecord[] = [];

  try {
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    }
  } catch {
    console.error('Failed to load backtest summary');
  }

  try {
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 5) {
          records.push({
            date: parts[0],
            portfolio_value: parseFloat(parts[1]),
            sp500_value: parseFloat(parts[2]),
            daily_return_pct: parseFloat(parts[3]),
            drawdown_pct: parseFloat(parts[4]),
          });
        }
      }
    }
  } catch {
    console.error('Failed to load backtest CSV');
  }

  return { summary, records };
}

function MetricCard({
  label,
  value,
  suffix = '',
  color = 'text-text-primary',
  subValue,
  subLabel,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  color?: string;
  subValue?: string | number;
  subLabel?: string;
}) {
  return (
    <div className="bg-navy-800 rounded-xl border border-navy-700 p-5">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={`text-3xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}
        {suffix && <span className="text-lg ml-1">{suffix}</span>}
      </div>
      {subValue !== undefined && (
        <div className="text-sm text-text-secondary mt-1">
          {subLabel}: {typeof subValue === 'number' ? subValue.toFixed(2) : subValue}
          {suffix}
        </div>
      )}
    </div>
  );
}

function SimpleChart({
  records,
  height = 200,
}: {
  records: DailyRecord[];
  height?: number;
}) {
  if (records.length === 0) return null;

  // Sample every 5th record for performance
  const sampled = records.filter((_, i) => i % 5 === 0 || i === records.length - 1);

  const portfolioValues = sampled.map((r) => r.portfolio_value);
  const sp500Values = sampled.map((r) => r.sp500_value);

  const allValues = [...portfolioValues, ...sp500Values];
  const minVal = Math.min(...allValues) * 0.95;
  const maxVal = Math.max(...allValues) * 1.05;
  const range = maxVal - minVal;

  const width = 800;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding;

  const toX = (i: number) => padding + (i / (sampled.length - 1)) * chartWidth;
  const toY = (v: number) => height - padding - ((v - minVal) / range) * chartHeight;

  const portfolioPath = sampled
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(r.portfolio_value)}`)
    .join(' ');

  const sp500Path = sampled
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(r.sp500_value)}`)
    .join(' ');

  // Y-axis labels
  const yLabels = [minVal, (minVal + maxVal) / 2, maxVal];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Grid lines */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line
            x1={padding}
            y1={toY(v)}
            x2={width - padding}
            y2={toY(v)}
            stroke="#334155"
            strokeDasharray="4"
          />
          <text
            x={padding - 5}
            y={toY(v) + 4}
            textAnchor="end"
            className="text-[10px] fill-slate-500"
          >
            ${(v / 1000).toFixed(0)}k
          </text>
        </g>
      ))}

      {/* S&P 500 line */}
      <path d={sp500Path} fill="none" stroke="#94a3b8" strokeWidth="2" />

      {/* Portfolio line */}
      <path d={portfolioPath} fill="none" stroke="#22c55e" strokeWidth="2.5" />

      {/* Legend */}
      <g transform={`translate(${width - 150}, 20)`}>
        <line x1="0" y1="0" x2="20" y2="0" stroke="#22c55e" strokeWidth="2.5" />
        <text x="25" y="4" className="text-[11px] fill-slate-300">
          Portfolio
        </text>
        <line x1="0" y1="15" x2="20" y2="15" stroke="#94a3b8" strokeWidth="2" />
        <text x="25" y="19" className="text-[11px] fill-slate-500">
          S&P 500
        </text>
      </g>

      {/* X-axis labels */}
      {[0, Math.floor(sampled.length / 4), Math.floor(sampled.length / 2), Math.floor((3 * sampled.length) / 4), sampled.length - 1].map(
        (i) =>
          sampled[i] && (
            <text
              key={i}
              x={toX(i)}
              y={height - 5}
              textAnchor="middle"
              className="text-[10px] fill-slate-500"
            >
              {sampled[i].date.slice(0, 7)}
            </text>
          )
      )}
    </svg>
  );
}

function DrawdownChart({
  records,
  height = 120,
}: {
  records: DailyRecord[];
  height?: number;
}) {
  if (records.length === 0) return null;

  const sampled = records.filter((_, i) => i % 5 === 0 || i === records.length - 1);
  const drawdowns = sampled.map((r) => r.drawdown_pct);

  const minDD = Math.min(...drawdowns, -30);
  const maxDD = 0;
  const range = maxDD - minDD;

  const width = 800;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding;

  const toX = (i: number) => padding + (i / (sampled.length - 1)) * chartWidth;
  const toY = (v: number) => padding + ((maxDD - v) / range) * chartHeight;

  const areaPath =
    `M ${toX(0)} ${toY(0)} ` +
    sampled.map((r, i) => `L ${toX(i)} ${toY(r.drawdown_pct)}`).join(' ') +
    ` L ${toX(sampled.length - 1)} ${toY(0)} Z`;

  const linePath = sampled
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(r.drawdown_pct)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* Zero line */}
      <line
        x1={padding}
        y1={toY(0)}
        x2={width - padding}
        y2={toY(0)}
        stroke="#334155"
        strokeWidth="1"
      />

      {/* -10%, -20%, -30% lines */}
      {[-10, -20, -30].map(
        (v) =>
          v >= minDD && (
            <g key={v}>
              <line
                x1={padding}
                y1={toY(v)}
                x2={width - padding}
                y2={toY(v)}
                stroke="#334155"
                strokeDasharray="4"
              />
              <text
                x={padding - 5}
                y={toY(v) + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-500"
              >
                {v}%
              </text>
            </g>
          )
      )}

      {/* Drawdown area */}
      <path d={areaPath} fill="rgba(239, 68, 68, 0.2)" />
      <path d={linePath} fill="none" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  );
}

function QuarterlyBreakdown({ records }: { records: DailyRecord[] }) {
  // Group by quarter
  const quarters: Record<string, { start: number; end: number; return: number }> = {};

  for (const record of records) {
    const date = new Date(record.date);
    const q = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;

    if (!quarters[q]) {
      quarters[q] = { start: record.portfolio_value, end: record.portfolio_value, return: 0 };
    }
    quarters[q].end = record.portfolio_value;
  }

  // Calculate returns
  const quarterData = Object.entries(quarters).map(([q, data]) => ({
    quarter: q,
    return: ((data.end / data.start - 1) * 100),
  }));

  return (
    <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2">
      {quarterData.map(({ quarter, return: ret }) => (
        <div
          key={quarter}
          className={`p-2 rounded-lg text-center ${
            ret >= 0
              ? 'bg-accent-green/10 border border-accent-green/30'
              : 'bg-accent-red/10 border border-accent-red/30'
          }`}
        >
          <div className="text-[10px] text-text-muted">{quarter}</div>
          <div
            className={`text-sm font-semibold ${
              ret >= 0 ? 'text-accent-green' : 'text-accent-red'
            }`}
          >
            {ret >= 0 ? '+' : ''}
            {ret.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BacktestingPage() {
  const { summary, records } = loadBacktestData();

  if (!summary) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-navy-800 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-3">
          No Backtest Results Available
        </h2>
        <p className="text-text-secondary mb-6 max-w-md mx-auto">
          Run the backtest to see historical performance of the momentum strategy.
        </p>
        <code className="inline-block bg-navy-800 border border-navy-700 px-4 py-2 rounded-lg text-sm font-mono text-accent-blue">
          npm run backtest
        </code>
      </div>
    );
  }

  const { metrics, benchmark } = summary;
  const outperformed = summary.outperformance_pct > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h2 className="text-2xl font-semibold text-text-primary">
            Backtesting Results
          </h2>
          <span
            className={`text-xs px-3 py-1 rounded-full border ${
              outperformed
                ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                : 'bg-accent-red/10 border-accent-red/30 text-accent-red'
            }`}
          >
            {outperformed ? 'Outperformed' : 'Underperformed'} by{' '}
            {Math.abs(summary.outperformance_pct).toFixed(1)}%
          </span>
        </div>
        <p className="text-text-secondary text-sm">
          <span className="text-text-primary font-medium">{summary.strategy}</span>
          {' · '}
          {summary.period}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Return"
          value={metrics.total_return_pct}
          suffix="%"
          color={metrics.total_return_pct >= 0 ? 'text-accent-green' : 'text-accent-red'}
          subValue={benchmark.total_return_pct}
          subLabel="S&P 500"
        />
        <MetricCard
          label="Annualized Return"
          value={metrics.annualized_return_pct}
          suffix="%"
          color={metrics.annualized_return_pct >= 0 ? 'text-accent-green' : 'text-accent-red'}
          subValue={benchmark.annualized_return_pct}
          subLabel="S&P 500"
        />
        <MetricCard
          label="Max Drawdown"
          value={metrics.max_drawdown_pct}
          suffix="%"
          color="text-accent-red"
          subValue={benchmark.max_drawdown_pct}
          subLabel="S&P 500"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={metrics.sharpe_ratio}
          color={metrics.sharpe_ratio >= 1 ? 'text-accent-green' : 'text-accent-gold'}
          subValue={benchmark.sharpe_ratio}
          subLabel="S&P 500"
        />
      </div>

      {/* Equity Curve */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Portfolio Value Over Time
        </h3>
        <SimpleChart records={records} height={250} />
      </div>

      {/* Drawdown Chart */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Drawdown
        </h3>
        <DrawdownChart records={records} height={150} />
      </div>

      {/* Quarterly Breakdown */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6 mb-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Quarterly Returns
        </h3>
        <QuarterlyBreakdown records={records} />
      </div>

      {/* Volatility */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <MetricCard
          label="Volatility (Annualized)"
          value={metrics.volatility_pct}
          suffix="%"
          color="text-text-primary"
        />
        <MetricCard
          label="Trading Days"
          value={records.length}
          color="text-text-primary"
        />
      </div>

      {/* Methodology */}
      <div className="bg-navy-800 rounded-xl border border-navy-700 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Methodology & Limitations
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-text-secondary">
          <div>
            <h4 className="text-text-primary font-medium mb-2">Strategy Rules</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Quarterly rebalancing (Q1-Q4)</li>
              <li>Top 10 stocks by momentum score</li>
              <li>Equal weight (10% per position)</li>
              <li>Momentum: 60% × 13W return + 40% × 26W return</li>
            </ul>
          </div>
          <div>
            <h4 className="text-text-primary font-medium mb-2">Limitations</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>No transaction costs</li>
              <li>No slippage or market impact</li>
              <li>Survivorship bias in universe</li>
              <li>Close price execution (unrealistic)</li>
              <li>No dividends included</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
