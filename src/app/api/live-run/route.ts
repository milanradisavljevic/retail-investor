import { NextRequest, NextResponse } from 'next/server';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type LiveRunRequest = {
  universe?: string;
  strategy?: string;
  weights?: {
    valuation: number;
    quality: number;
    technical: number;
    risk: number;
  };
  filters?: Record<string, unknown>;
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
  const latest = getLatestRun();
  if (!latest) {
    return NextResponse.json(
      { error: 'No runs available yet' },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as LiveRunRequest;
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
