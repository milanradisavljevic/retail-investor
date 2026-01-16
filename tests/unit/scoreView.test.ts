import { describe, expect, it } from 'vitest';
import { buildScoreView, type ScoreQuery } from '@/lib/scoreView';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

type ScoreEntry = RunV1SchemaJson['scores'][number];

function makeScore(symbol: string, overrides: Partial<ScoreEntry> = {}): ScoreEntry {
  const baseTarget: NonNullable<ScoreEntry['price_target']> = {
    current_price: 100,
    fair_value: 110,
    upside_pct: 0.1,
    target_buy_price: 95,
    target_sell_price: 115,
    expected_return_pct: 0.12,
    holding_period_months: 6,
    target_date: '2026-12-31',
    confidence: 'medium',
    requires_deep_analysis: false,
    deep_analysis_reasons: [],
  };

  return {
    symbol,
    total_score: 70,
    breakdown: { fundamental: 65, technical: 60 },
    evidence: { valuation: 60, quality: 65, technical: 60, risk: 55 },
    data_quality: {
      data_quality_score: 80,
      data_quality_confidence: 0.8,
      completeness_ratio: 1,
      imputed_ratio: 0,
      missing_critical: [],
      metrics: {},
    },
    price_target: baseTarget,
    ...overrides,
  };
}

function makeRun(scores: ScoreEntry[]): RunV1SchemaJson {
  return {
    run_id: 'run',
    run_date: '2026-01-14',
    as_of_date: '2026-01-14',
    provider: {
      name: 'finnhub',
      cache_policy: {
        prices_ttl_hours: 1,
        fundamentals_ttl_days: 1,
        news_ttl_minutes: 1,
      },
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
        name: 'Test',
        selection_rule: 'Top picks',
      },
      symbols: scores.map((s) => s.symbol) as [string, ...string[]],
    },
    benchmark: {
      type: 'index',
      name: 'S&P 500',
      provider_symbol: 'SPY',
    },
    scores,
    selections: {
      top5: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
      top10: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ'],
      pick_of_the_day: 'AAA',
    },
    flags: { user_documents_missing: [], prompt_injection_suspected: [] },
  };
}

describe('buildScoreView filters', () => {
  it('filters upside_negative using upside_pct < 0', () => {
    const baseTarget = makeScore('tmp').price_target!;
    const scores = [
      makeScore('POS', { price_target: { ...baseTarget, upside_pct: 0.1 } }),
      makeScore('NEG', { price_target: { ...baseTarget, upside_pct: -0.05 } }),
    ];
    const run = makeRun(scores);
    const query: ScoreQuery = {
      sort: 'total',
      filters: {
        deepAnalysis: false,
        confidenceLow: false,
        missingData: false,
        upsideNegative: true,
      },
    };

    const result = buildScoreView(run, query);
    expect(result.map((s) => s.symbol)).toEqual(['NEG']);
  });

  it('handles missing price_target without crashing', () => {
    const baseTarget = makeScore('tmp').price_target!;
    const scores = [
      makeScore('NO_PT', { price_target: null }),
      makeScore('NEG', { price_target: { ...baseTarget, upside_pct: -0.01 } }),
    ];
    const run = makeRun(scores);
    const query: ScoreQuery = {
      sort: 'total',
      filters: {
        deepAnalysis: false,
        confidenceLow: false,
        missingData: false,
        upsideNegative: true,
      },
    };

    const result = buildScoreView(run, query);
    expect(result.map((s) => s.symbol)).toEqual(['NEG']);
  });
});
