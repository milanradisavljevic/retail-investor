import { describe, expect, it } from 'vitest';
import { computeDeltas } from '@/lib/runDelta';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type ScoreEntry = RunV1SchemaJson['scores'][number];

function makeDataQuality() {
  return {
    data_quality_score: 80,
    data_quality_confidence: 0.8,
    completeness_ratio: 0.9,
    imputed_ratio: 0.1,
    missing_critical: [],
    metrics: {},
    missing_fields: [],
    assumptions: [] as [],
    adjusted_price_mode: 'adjusted' as const,
  };
}

function makeScore({
  symbol,
  total,
  expectedReturn,
  confidence = 'medium',
  requiresDeepAnalysis = false,
}: {
  symbol: string;
  total: number;
  expectedReturn: number;
  confidence?: 'high' | 'medium' | 'low';
  requiresDeepAnalysis?: boolean;
}): ScoreEntry {
  return {
    symbol,
    total_score: total,
    breakdown: { fundamental: total, technical: total },
    evidence: { valuation: total, quality: total, technical: total, risk: total },
    data_quality: makeDataQuality(),
    price_target: {
      current_price: 100,
      fair_value: 110,
      upside_pct: 0.1,
      target_buy_price: 95,
      target_sell_price: 115,
      expected_return_pct: expectedReturn,
      holding_period_months: 6,
      target_date: '2026-12-31',
      confidence,
      requires_deep_analysis: requiresDeepAnalysis,
      deep_analysis_reasons: requiresDeepAnalysis ? ['Investigate further'] : [],
    },
  };
}

function makeRun(
  scores: ScoreEntry[],
  overrides?: Partial<Pick<RunV1SchemaJson, 'run_id' | 'run_date' | 'as_of_date'>>
): RunV1SchemaJson {
  const primarySymbol = scores[0]?.symbol ?? 'AAA';
  const top5 = Array(5).fill(primarySymbol) as [string, string, string, string, string];
  const top10 = Array(10).fill(primarySymbol) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ];
  const top15 = Array(15).fill(primarySymbol) as [
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string
  ];
  const top20 = Array(20).fill(primarySymbol) as [
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string
  ];
  const top30 = Array(30).fill(primarySymbol) as [
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string,
    string,string,string,string,string
  ];

  return {
    run_id: overrides?.run_id ?? 'run-latest',
    run_date: overrides?.run_date ?? '2026-01-14',
    as_of_date: overrides?.as_of_date ?? '2026-01-14',
    provider: {
      name: 'finnhub',
      cache_policy: {
        prices_ttl_hours: 12,
        fundamentals_ttl_days: 14,
        news_ttl_minutes: 60,
      },
      rate_limit_observed: { requests_made: 1 },
    },
    mode: {
      model_version: 'v1',
      label: 'NEUTRAL',
      score: 50,
      confidence: 0.5,
      benchmark: 'SPY',
      features: {},
    },
    data_quality_summary: {
      avg_data_quality_score: 80,
      pct_high: 0.5,
      pct_medium: 0.3,
      pct_low: 0.2,
      tickers_with_critical_fallback: [],
      most_missing_metrics: [],
      generated_at: '2026-01-14T00:00:00Z',
      universe_name: 'Test',
    },
    universe: {
      definition: {
        name: 'Test Universe',
        selection_rule: 'Top picks',
      },
      symbols: [primarySymbol, ...scores.slice(1).map((s) => s.symbol)],
    },
    benchmark: {
      type: 'index',
      name: 'S&P 500',
      provider_symbol: 'SPY',
    },
    scores,
    selections: {
      top5,
      top10,
      top15,
      top20,
      top30,
      pick_of_the_day: primarySymbol,
    },
    flags: {
      user_documents_missing: [],
      prompt_injection_suspected: [],
    },
  };
}

describe('computeDeltas', () => {
  it('calculates per-symbol deltas with confidence and deep analysis changes', () => {
    const previous = makeRun(
      [
        makeScore({
          symbol: 'AAA',
          total: 70,
          expectedReturn: 0.1,
          confidence: 'medium',
          requiresDeepAnalysis: true,
        }),
        makeScore({
          symbol: 'BBB',
          total: 55,
          expectedReturn: 0.05,
          confidence: 'low',
          requiresDeepAnalysis: false,
        }),
      ],
      { run_id: 'run-prev', run_date: '2026-01-13', as_of_date: '2026-01-13' }
    );

    const latest = makeRun(
      [
        makeScore({
          symbol: 'AAA',
          total: 74,
          expectedReturn: 0.12,
          confidence: 'high',
          requiresDeepAnalysis: false,
        }),
        makeScore({
          symbol: 'BBB',
          total: 50,
          expectedReturn: 0.05,
          confidence: 'low',
          requiresDeepAnalysis: false,
        }),
      ],
      { run_id: 'run-latest' }
    );

    const deltas = computeDeltas(latest, previous);
    const deltaA = deltas.get('AAA');
    const deltaB = deltas.get('BBB');

    expect(deltaA?.deltaTotal).toBe(4);
    expect(deltaA?.deltaReturn).toBeCloseTo(0.02, 6);
    expect(deltaA?.changedConfidence).toEqual({ from: 'medium', to: 'high' });
    expect(deltaA?.changedDeepAnalysis).toEqual({ from: true, to: false });

    expect(deltaB?.deltaTotal).toBe(-5);
    expect(deltaB?.deltaReturn).toBeCloseTo(0, 6);
    expect(deltaB?.changedConfidence).toBeNull();
    expect(deltaB?.changedDeepAnalysis).toBeNull();
  });

  it('returns null deltas when previous run data is missing', () => {
    const latest = makeRun([
      makeScore({
        symbol: 'NEW',
        total: 60,
        expectedReturn: 0.08,
        confidence: 'medium',
        requiresDeepAnalysis: false,
      }),
    ]);

    const previous = makeRun(
      [
        makeScore({
          symbol: 'OLD',
          total: 65,
          expectedReturn: 0.07,
          confidence: 'medium',
          requiresDeepAnalysis: false,
        }),
      ],
      { run_id: 'run-prev' }
    );

    const deltas = computeDeltas(latest, previous);
    const deltaNew = deltas.get('NEW');

    expect(deltaNew).toEqual({
      deltaTotal: null,
      deltaReturn: null,
      changedConfidence: null,
      changedDeepAnalysis: null,
    });
  });
});
