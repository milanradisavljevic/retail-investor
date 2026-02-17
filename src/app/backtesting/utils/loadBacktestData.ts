import fs from 'fs';
import path from 'path';

export interface TimeSeriesPoint {
  date: string;
  portfolio_value: number;
  sp500_value: number;
  daily_return_pct: number;
  drawdown_pct: number;
}

export interface BacktestSummary {
  period: string;
  strategy: string;
  metrics: {
    total_return_pct: number;
    annualized_return_pct: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    calmar_ratio?: number;
    volatility_pct?: number;
  };
  benchmark: {
    total_return_pct: number;
    annualized_return_pct: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    calmar_ratio?: number;
    volatility_pct?: number;
  };
  outperformance_pct: number;
  rebalance_events?: {
    date: string;
    action: 'rebalance';
    sold: string[];
    bought: string[];
    turnover: number;
  }[];
  rebalance_frequency?: string;
  top_n?: number;
}

export interface BacktestData {
  strategyName: string;
  summary: BacktestSummary | null;
  timeSeries: TimeSeriesPoint[];
}

export interface StrategyComparisonRow {
  name: string;
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  outperformance: number;
}

const BACKTEST_DIR = path.join(process.cwd(), 'data', 'backtesting');

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function parseCsv(content: string): TimeSeriesPoint[] {
  const lines = content.trim().split('\n');
  const rows: TimeSeriesPoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const [date, portfolio_value, sp500_value, daily_return_pct, drawdown_pct] = lines[i].split(',');
    rows.push({
      date,
      portfolio_value: parseFloat(portfolio_value),
      sp500_value: parseFloat(sp500_value),
      daily_return_pct: parseFloat(daily_return_pct),
      drawdown_pct: parseFloat(drawdown_pct),
    });
  }

  return rows;
}

export function loadBacktestData(strategyName: string): BacktestData {
  const summaryPath = firstExisting([
    path.join(BACKTEST_DIR, `backtest-summary-${strategyName}.json`),
    path.join(BACKTEST_DIR, 'backtest-summary.json'),
  ]);

  const csvPath = firstExisting([
    path.join(BACKTEST_DIR, `backtest-results-${strategyName}.csv`),
    path.join(BACKTEST_DIR, 'backtest-results.csv'),
  ]);

  let summary: BacktestSummary | null = null;
  let timeSeries: TimeSeriesPoint[] = [];

  if (summaryPath) {
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } catch (err) {
      console.error(`Failed to read summary for ${strategyName}:`, err);
    }
  }

  if (csvPath) {
    try {
      const content = fs.readFileSync(csvPath, 'utf-8');
      timeSeries = parseCsv(content);
    } catch (err) {
      console.error(`Failed to read CSV for ${strategyName}:`, err);
    }
  }

  return { strategyName, summary, timeSeries };
}

export function loadStrategyComparison(): StrategyComparisonRow[] {
  const comparisonPath = path.join(BACKTEST_DIR, 'strategy-comparison.json');
  if (!fs.existsSync(comparisonPath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(comparisonPath, 'utf-8'));
    const benchmark = raw?.benchmark?.metrics?.total_return_pct ?? 0;

    return (raw?.strategies || []).map((s: any) => {
      const metrics = s?.metrics || {};
      return {
        name: s?.name || 'Strategy',
        totalReturn: Number(metrics.total_return_pct ?? 0),
        sharpe: Number(metrics.sharpe_ratio ?? 0),
        maxDrawdown: Number(metrics.max_drawdown_pct ?? 0),
        outperformance: Number(metrics.total_return_pct ?? 0) - benchmark,
      };
    });
  } catch (err) {
    console.error('Failed to read strategy comparison:', err);
    return [];
  }
}
