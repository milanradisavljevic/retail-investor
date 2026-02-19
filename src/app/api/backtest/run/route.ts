import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { resolvePythonExecutable } from '@/utils/python';
import { validateUniverseId, validatePresetId, universeExists } from '@/lib/inputValidation';
import {
  acquireRunLock,
  getRunLockState,
  releaseRunLock,
  updateRunProgress,
} from '@/data/repositories/run_lock_repo';
import { getAuthUserId } from '@/lib/auth';

const execAsync = promisify(exec);
const BACKTEST_DIR = path.join(process.cwd(), 'data', 'backtesting');
const BACKTEST_TIMEOUT_MS = 30 * 60 * 1000;

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((acc, v) => acc + Number(v || 0), 0);
}

export async function POST(request: NextRequest) {
  let lockAcquired = false;
  try {
    const userId = await getAuthUserId();
    console.info('[Backtest Run] Run requested', { userId });

    const body = await request.json();
    const {
      strategy = 'hybrid',
      weights,
      universe = 'russell2000_full',
      preset,
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

    const uniCheck = validateUniverseId(universe);
    if (!uniCheck.valid) {
      return NextResponse.json({ error: uniCheck.error || 'Invalid universe' }, { status: 400 });
    }
    if (!universeExists(universe)) {
      return NextResponse.json({ error: 'Universe not found' }, { status: 404 });
    }

    if (preset) {
      const presetCheck = validatePresetId(preset);
      if (!presetCheck.valid) {
        return NextResponse.json({ error: presetCheck.error || 'Invalid preset' }, { status: 400 });
      }
    }

    lockAcquired = acquireRunLock({
      run_type: 'backtest',
      universe,
      preset: preset || strategy || null,
      started_by: userId,
    });
    if (!lockAcquired) {
      const state = getRunLockState();
      return NextResponse.json(
        {
          error: 'Ein Backtest läuft bereits',
          currentRun: {
            runType: state.run_type,
            universe: state.universe,
            preset: state.preset,
            startedAt: state.started_at,
            startedBy: state.started_by,
            progressPct: state.progress_pct,
            progressMsg: state.progress_msg,
          },
        },
        { status: 409 }
      );
    }

    updateRunProgress(5, `Backtest gestartet (${universe})`);
    const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    if (!fs.existsSync(tsxPath)) {
      const errorMessage = 'TSX binary not found. Install dependencies first (npm install).';
      releaseRunLock(errorMessage);
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'backtesting', 'run-backtest.ts');
    const cmd = `${process.execPath} --import tsx ${scriptPath}`;
    const env = {
      ...process.env,
      PYTHON_EXECUTABLE: resolvePythonExecutable(),
      SCORING_MODE: strategy,
      CUSTOM_WEIGHTS: JSON.stringify(weights),
      UNIVERSE: universe,
      BACKTEST_START: period?.startDate,
      BACKTEST_END: period?.endDate,
      REBALANCING: rebalancing,
      SLIPPAGE_MODEL: slippage,
      TOP_N: String(topK),
      TOP_K: String(topK),
      STARTING_CAPITAL: String(startingCapital),
    };

    updateRunProgress(15, 'Backtest-Berechnung läuft...');
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      env,
      timeout: BACKTEST_TIMEOUT_MS,
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

    releaseRunLock();
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
    if (lockAcquired) {
      releaseRunLock(error instanceof Error ? error.message : String(error));
    }
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[backtest run error]', error);
    const err = error as {
      message?: string;
      stderr?: string;
      stdout?: string;
      code?: number | string;
      signal?: string;
      killed?: boolean;
    };

    const isDev = process.env.NODE_ENV === 'development';
    const detail = isDev
      ? (err.stderr?.trim() || err.stdout?.trim() || err.message || 'Unknown error')
      : 'Backtest execution failed';

    const hint = !fs.existsSync(path.join(process.cwd(), 'data', 'market-data.db'))
      ? 'market-data.db fehlt in data/; ETL ausführen oder Datenbank kopieren.'
      : undefined;

    return NextResponse.json(
      {
        error: detail,
        code: err.code ?? null,
        signal: err.signal ?? null,
        killed: err.killed ?? false,
        hint: isDev ? hint : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const state = getRunLockState();
  return NextResponse.json({
    isRunning: state.status === 'running',
    currentRun: state.status === 'running' || state.status === 'failed'
      ? {
          runType: state.run_type,
          universe: state.universe,
          preset: state.preset,
          startedAt: state.started_at,
          startedBy: state.started_by,
          progressPct: state.progress_pct,
          progressMsg: state.progress_msg,
          errorMsg: state.error_msg,
        }
      : undefined,
    state,
  });
}
