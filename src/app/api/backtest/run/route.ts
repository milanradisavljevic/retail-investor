import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const BACKTEST_DIR = path.join(process.cwd(), 'data', 'backtesting');

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((acc, v) => acc + Number(v || 0), 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      strategy = 'hybrid',
      weights,
      universe = 'russell2000_full',
      period,
      rebalancing = 'quarterly',
      slippage = 'realistic',
      topK = 10,
      startingCapital = 100000,
    } = body || {};

    if (!weights || typeof weights !== 'object') {
      return NextResponse.json({ error: 'Missing weights' }, { status: 400 });
    }

    const total = sumWeights(weights);
    if (total !== 100) {
      return NextResponse.json({ error: 'Weights must sum to 100%' }, { status: 400 });
    }

    // Use local tsx binary to avoid PATH/npx issues in server runtimes
    const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsxPath)) {
      return NextResponse.json(
        { error: 'TSX binary not found. Install dependencies first (npm install).' },
        { status: 500 }
      );
    }
    const cmd = `${tsxPath} scripts/backtesting/run-backtest.ts`;
    const env = {
      ...process.env,
      SCORING_MODE: strategy,
      CUSTOM_WEIGHTS: JSON.stringify(weights),
      UNIVERSE: universe,
      BACKTEST_START: period?.startDate,
      BACKTEST_END: period?.endDate,
      REBALANCING: rebalancing,
      SLIPPAGE_MODEL: slippage,
      TOP_K: String(topK),
      STARTING_CAPITAL: String(startingCapital),
    };

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      env,
      timeout: 5 * 60 * 1000,
    });

    if (stderr) {
      console.error('[backtest run stderr]', stderr);
    }
    console.log('[backtest run stdout]', stdout);

    const summaryPath = path.join(BACKTEST_DIR, 'backtest-summary.json');
    let summary: Record<string, unknown> | null = null;
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    }

    return NextResponse.json({
      success: true,
      status: 'completed',
      summary,
      config: {
        strategy,
        universe,
        period,
        rebalancing,
        slippage,
        topK,
        startingCapital,
      },
    });
  } catch (error) {
    console.error('[backtest run error]', error);
    return NextResponse.json({ error: 'Backtest execution failed' }, { status: 500 });
  }
}
