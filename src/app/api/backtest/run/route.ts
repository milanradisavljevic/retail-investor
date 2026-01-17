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
    const { strategy = 'hybrid', weights, universe = 'russell2000_full' } = body || {};

    if (!weights || typeof weights !== 'object') {
      return NextResponse.json({ error: 'Missing weights' }, { status: 400 });
    }

    const total = sumWeights(weights);
    if (total !== 100) {
      return NextResponse.json({ error: 'Weights must sum to 100%' }, { status: 400 });
    }

    const cmd = 'npx tsx scripts/backtesting/run-backtest.ts';
    const env = {
      ...process.env,
      SCORING_MODE: strategy,
      CUSTOM_WEIGHTS: JSON.stringify(weights),
      UNIVERSE: universe,
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
    let summary: any = null;
    if (fs.existsSync(summaryPath)) {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    }

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[backtest run error]', error);
    return NextResponse.json({ error: 'Backtest execution failed' }, { status: 500 });
  }
}
