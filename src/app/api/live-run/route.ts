import { NextRequest, NextResponse } from 'next/server';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import { scoreUniverse } from '@/scoring/engine';
import { buildRunRecord } from '@/run/builder';
import { writeRunRecord } from '@/run/writer';
import { initializeDatabase, closeDatabase } from '@/data/db';
import type { LiveRunFilterConfig } from '@/scoring/filters';

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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LiveRunRequest;

  // If universe is provided, trigger a new run
  if (body.universe) {
    try {
      console.log('[LiveRun] Triggering new run with universe:', body.universe);

      // Set environment variables for this run
      if (body.universe) {
        process.env.UNIVERSE = body.universe;
        process.env.UNIVERSE_CONFIG = body.universe;
      }

      // Convert UI weights (0-100) to scoring config weights (0-1)
      if (body.weights) {
        const customWeights = {
          valuation: body.weights.valuation / 100,
          quality: body.weights.quality / 100,
          technical: body.weights.technical / 100,
          risk: body.weights.risk / 100,
        };
        process.env.CUSTOM_WEIGHTS = JSON.stringify(customWeights);
      }

      // Convert UI filters to LiveRunFilterConfig
      const filterConfig: Partial<LiveRunFilterConfig> | undefined = body.filters ? {
        excludeCryptoMining: body.filters.excludeCrypto ?? false,
        excludeDefense: body.filters.excludeDefense ?? false,
        excludeFossilFuels: body.filters.excludeFossil ?? false,
        minMarketCap: body.filters.marketCapMin ? body.filters.marketCapMin * 1_000_000 : null,
        minLiquidity: body.filters.liquidityMin ? body.filters.liquidityMin * 1_000_000 : null,
        maxVolatility: null,
      } : undefined;

      console.log('[LiveRun] Filter config:', filterConfig);

      // Initialize database
      initializeDatabase();

      try {
        // Execute scoring
        console.log('[LiveRun] Starting scoring pipeline...');
        const scoringResult = await scoreUniverse(filterConfig);

        console.log('[LiveRun] Scoring complete, building run record...');
        const runRecord = buildRunRecord(scoringResult);

        console.log('[LiveRun] Writing run record...');
        const writeResult = writeRunRecord(runRecord);

        console.log('[LiveRun] Run complete:', writeResult.runId);

        // Build response from the new run
        const topK = Math.max(1, Math.min(body.topK ?? 10, 20));
        const output: LiveRunOutput = {
          runId: runRecord.run_id,
          asOfDate: runRecord.as_of_date,
          universe: runRecord.universe?.definition?.name ?? body.universe ?? 'unknown',
          strategy: body.strategy || '4-pillar',
          topPicks: buildPicks(runRecord, topK),
        };

        return NextResponse.json(output);
      } finally {
        closeDatabase();

        // Clean up env vars
        delete process.env.UNIVERSE;
        delete process.env.UNIVERSE_CONFIG;
        delete process.env.CUSTOM_WEIGHTS;
      }
    } catch (error) {
      console.error('[LiveRun] Error during run:', error);

      // Fallback to latest run if available
      const latest = getLatestRun();
      if (latest) {
        const topK = Math.max(1, Math.min(body.topK ?? 10, 20));
        const output: LiveRunOutput = {
          runId: latest.run.run_id,
          asOfDate: latest.run.as_of_date,
          universe: latest.run.universe?.definition?.name ?? 'unknown',
          strategy: body.strategy || '4-pillar',
          topPicks: buildPicks(latest.run, topK),
        };

        return NextResponse.json({
          ...output,
          warning: 'Live run failed, showing latest available run',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      return NextResponse.json(
        {
          error: 'Live run failed and no previous runs available',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  }

  // Fallback: return latest run if no universe specified
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
}
