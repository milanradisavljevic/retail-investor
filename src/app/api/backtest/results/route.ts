export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

type CsvRow = {
  date: string;
  portfolio_value: number;
  sp500_value: number;
  daily_return_pct: number;
  drawdown_pct: number;
};

const BACKTEST_DIR = path.join(process.cwd(), 'data', 'backtesting');

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  const rows: CsvRow[] = [];

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

async function loadBacktestSummary(strategy: string): Promise<Record<string, unknown> | null> {
  const summaryPath = firstExisting([
    path.join(BACKTEST_DIR, `backtest-summary-${strategy}.json`),
    path.join(BACKTEST_DIR, `backtest-summary-${strategy}-full.json`),
    path.join(BACKTEST_DIR, 'backtest-summary.json'),
  ]);
  if (!summaryPath) return null;

  try {
    return JSON.parse(readFileSync(summaryPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read backtest summary for ${strategy}:`, err);
    return null;
  }
}

async function loadBacktestResults(strategy: string): Promise<CsvRow[]> {
  const csvPath = firstExisting([
    path.join(BACKTEST_DIR, `backtest-results-${strategy}.csv`),
    path.join(BACKTEST_DIR, `backtest-results-${strategy}-full.csv`),
    path.join(BACKTEST_DIR, 'backtest-results.csv'),
  ]);
  if (!csvPath) return [];

  try {
    const content = readFileSync(csvPath, 'utf-8');
    return parseCsv(content);
  } catch (err) {
    console.error(`Failed to read backtest results for ${strategy}:`, err);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const strategy = searchParams.get('strategy') || 'momentum';
  const universe = searchParams.get('universe') || 'russell2000';

  const summary = await loadBacktestSummary(strategy);
  const results = await loadBacktestResults(strategy);

  if (!summary && results.length === 0) {
    return NextResponse.json(
      { error: 'No backtest data found for the requested strategy/universe.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    strategy,
    universe,
    summary,
    equityCurve: results.map((r) => ({
      date: r.date,
      portfolio_value: r.portfolio_value,
      sp500_value: r.sp500_value,
    })),
    drawdown: results.map((r) => ({
      date: r.date,
      drawdown_pct: r.drawdown_pct,
    })),
  });
}
