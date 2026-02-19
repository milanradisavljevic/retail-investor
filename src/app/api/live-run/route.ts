import { NextRequest, NextResponse } from 'next/server';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import { scoreUniverse } from '@/scoring/engine';
import { buildRunRecord } from '@/run/builder';
import { writeRunRecord } from '@/run/writer';
import { initializeDatabase, closeDatabase } from '@/data/db';
import type { LiveRunFilterConfig } from '@/scoring/filters';
import { progressStore } from '@/lib/progress/progressStore';
import { validateUniverseId, universeExists } from '@/lib/inputValidation';
import {
  acquireRunLock,
  getRunLockState,
  releaseRunLock,
  updateRunProgress,
} from '@/data/repositories/run_lock_repo';
import { sanitizeError } from '@/lib/apiError';
import { getAuthUserId } from '@/lib/auth';

type LiveRunRequest = {
  universe?: string;
  strategy?: string;
  weights?: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  filters?: {
    excludeCrypto?: boolean;
    marketCapMin?: number;
    liquidityMin?: number;
    excludeDefense?: boolean;
    excludeFossil?: boolean;
  };
  topK?: number;
  asOfDate?: string;
  preset?: string | null;
};

type LiveRunOutput = {
  runId: string;
  asOfDate: string;
  universe: string;
  strategy: string;
  topPicks: Array<{
    rank: number;
    symbol: string;
    companyName: string;
    currentPrice: number | null;
    targetPrice: number | null;
    upside: number | null;
    holdDuration: string;
    sector: string | null;
    totalScore: number | null;
    pillarScores: {
      valuation: number;
      quality: number;
      technical: number;
      risk: number;
    };
  }>;
};

function buildPicks(run: RunV1SchemaJson, topK: number): LiveRunOutput['topPicks'] {
  const ordered =
    run.selections.top20 ??
    run.selections.top15 ??
    run.selections.top10 ??
    run.selections.top5 ??
    [];

  return ordered.slice(0, topK).map((symbol, idx) => {
    const score = run.scores.find((s) => s.symbol === symbol);
    const pt = score?.price_target ?? null;
    const evidence = score?.evidence;

    return {
      rank: idx + 1,
      symbol,
      companyName: score?.company_name || symbol,
      currentPrice: pt?.current_price ?? null,
      targetPrice: pt?.target_sell_price ?? pt?.fair_value ?? null,
      upside: pt?.upside_pct ?? pt?.expected_return_pct ?? null,
      holdDuration: pt?.holding_period_months
        ? `${pt.holding_period_months} months`
        : 'N/A',
      sector: score?.industry ?? null,
      totalScore: score?.total_score ?? null,
      pillarScores: {
        valuation: evidence?.valuation ?? 0,
        quality: evidence?.quality ?? 0,
        technical: evidence?.technical ?? 0,
        risk: evidence?.risk ?? 0,
      },
    };
  });
}

async function executeScoringRun(
  runId: string,
  body: LiveRunRequest
): Promise<LiveRunOutput> {
  console.log('[LiveRun] Starting background run:', runId);

  try {
    const filterConfig: Partial<LiveRunFilterConfig> | undefined = body.filters
      ? {
          excludeCryptoMining: body.filters.excludeCrypto ?? false,
          excludeDefense: body.filters.excludeDefense ?? false,
          excludeFossilFuels: body.filters.excludeFossil ?? false,
          minMarketCap: body.filters.marketCapMin
            ? body.filters.marketCapMin * 1_000_000
            : null,
          minLiquidity: body.filters.liquidityMin
            ? body.filters.liquidityMin * 1_000_000
            : null,
          maxVolatility: null,
        }
      : undefined;

    console.log('[LiveRun] Filter config:', filterConfig);
    console.log('[LiveRun] Universe override:', body.universe);
    console.log('[LiveRun] Weights override:', body.weights);

    initializeDatabase();

    try {
      console.log('[LiveRun] Starting scoring pipeline...');
      const scoringResult = await scoreUniverse(filterConfig, runId, {
        universeOverride: body.universe,
        weightsOverride: body.weights,
      });

      console.log('[LiveRun] Scoring complete, building run record...');
      const runRecord = buildRunRecord(scoringResult);

      console.log('[LiveRun] Writing run record...');
      const writeResult = writeRunRecord(runRecord);

      console.log('[LiveRun] Run complete:', writeResult.runId);

      const topK = Math.max(1, Math.min(body.topK ?? 10, 20));
      const output: LiveRunOutput = {
        runId: runRecord.run_id,
        asOfDate: runRecord.as_of_date,
        universe: runRecord.universe?.definition?.name ?? body.universe ?? 'unknown',
        strategy: body.strategy || '4-pillar',
        topPicks: buildPicks(runRecord, topK),
      };

      return output;
    } finally {
      closeDatabase();
    }
  } catch (error) {
    console.error('[LiveRun] Error during background run:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    console.info('[LiveRun] Run requested', { userId });

    const body = (await request.json().catch(() => ({}))) as LiveRunRequest;

    if (body.universe) {
      const uniCheck = validateUniverseId(body.universe);
      if (!uniCheck.valid) {
        return NextResponse.json({ error: uniCheck.error || 'Invalid universe' }, { status: 400 });
      }
      if (!universeExists(body.universe)) {
        return NextResponse.json({ error: 'Universe not found' }, { status: 404 });
      }

      const lockAcquired = acquireRunLock({
        run_type: 'live',
        universe: body.universe,
        preset: body.preset ?? body.strategy ?? null,
        started_by: userId,
      });
      if (!lockAcquired) {
        const state = getRunLockState();
        return NextResponse.json(
          {
            error: 'Ein Run läuft bereits',
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

      try {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        console.log('[LiveRun] Triggering new run with universe:', body.universe, 'runId:', runId);

        progressStore.initRun(runId, body.universe, 0);
        updateRunProgress(3, `Run gestartet (${body.universe})`);

        executeScoringRun(runId, body)
          .then(() => {
            releaseRunLock();
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[LiveRun] Background run failed:', err);
            progressStore.errorRun(runId, message);
            releaseRunLock(message);
          });

        return NextResponse.json({
          success: true,
          runId,
          message: 'Run started',
          status: 'running',
        });
      } catch (error) {
        releaseRunLock(error instanceof Error ? error.message : String(error));
        console.error('[LiveRun] Error triggering run:', error);
        return NextResponse.json(
          { error: sanitizeError(error) },
          { status: 500 }
        );
      }
    }

    const latest = getLatestRun();
    if (!latest) {
      return NextResponse.json(
        { error: 'No runs available yet. Please select a universe and generate picks.' },
        { status: 404 }
      );
    }

    const topK = Math.max(1, Math.min(body.topK ?? 10, 20));
    const run = latest.run;

    const output: LiveRunOutput = {
      runId: run.run_id,
      asOfDate: run.as_of_date,
      universe: run.universe?.definition?.name ?? 'unknown',
      strategy: body.strategy || '4-pillar',
      topPicks: buildPicks(run, topK),
    };

    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[LiveRun] Error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
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
