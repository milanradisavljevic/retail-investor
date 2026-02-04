import { describe, expect, it } from 'vitest';
import { buildExplainSignals } from '@/lib/explainSignals';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

function makeRun(score: RunV1SchemaJson['scores'][number]): RunV1SchemaJson {
  return {
    run_id: 'run',
    run_date: '2024-01-01',
    as_of_date: '2024-01-01',
    provider: {
      name: 'finnhub',
      cache_policy: {
        prices_ttl_hours: 1,
        fundamentals_ttl_days: 1,
        news_ttl_minutes: 1,
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
      pct_high: 0,
      pct_medium: 0,
      pct_low: 0,
      tickers_with_critical_fallback: [],
      most_missing_metrics: [],
      generated_at: '2024-01-01T00:00:00Z',
      universe_name: 'Test',
    },
    universe: {
      definition: {
        name: 'Test',
        selection_rule: 'rule',
      },
      symbols: ['AAA'],
    },
    benchmark: {
      type: 'index',
      name: 'SPY',
      provider_symbol: 'SPY',
    },
    scores: [score],
    selections: {
      top5: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'],
      top10: ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ'],
      top15: ['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ','KKK','LLL','MMM','NNN','OOO'],
      top20: ['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ','KKK','LLL','MMM','NNN','OOO','PPP','QQQ','RRR','SSS','TTT'],
      top30: [
        'AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ',
        'KKK','LLL','MMM','NNN','OOO','PPP','QQQ','RRR','SSS','TTT',
        'UUU','VVV','WWW','XXX','YYY','ZZZ','AAA1','BBB1','CCC1','DDD1'
      ],
      pick_of_the_day: 'AAA',
    },
    flags: { user_documents_missing: [], prompt_injection_suspected: [] },
  };
}

describe('buildExplainSignals', () => {
  it('builds positive valuation and pillar signals when upside is strong', () => {
    const score: RunV1SchemaJson['scores'][number] = {
      symbol: 'AAA',
      total_score: 82,
      breakdown: { fundamental: 78, technical: 75 },
      evidence: { valuation: 72, quality: 81, technical: 76, risk: 68 },
      valuation_input_coverage: {
        present: ['pe', 'pb', 'ps'],
        missing: [],
        strategy_used: 'full',
      },
      data_quality: {
        data_quality_score: 85,
        data_quality_confidence: 0.9,
        completeness_ratio: 0.95,
        imputed_ratio: 0.1,
        missing_critical: [],
        metrics: {},
        missing_fields: [],
        assumptions: [],
      },
      price_target: {
        current_price: 100,
        fair_value: 125,
        upside_pct: 0.25,
        target_buy_price: 95,
        target_sell_price: 125,
        expected_return_pct: 0.3,
        holding_period_months: 6,
        target_date: '2024-12-31',
        confidence: 'high',
        requires_deep_analysis: false,
        deep_analysis_reasons: [],
      },
    };

    const run = makeRun(score);
    const signals = buildExplainSignals(score, run);

    expect(signals.warnings).toHaveLength(0);
    expect(signals.positives.some((s) => s.label.includes('Upside vs model fair value'))).toBe(true);
    expect(signals.positives.some((s) => s.label.includes('Valuation pillar strong'))).toBe(true);
    expect(signals.positives.some((s) => s.label.includes('Quality pillar strong'))).toBe(true);
    const total = signals.positives.length + signals.negatives.length + signals.warnings.length;
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(10);
  });

  it('builds negatives and warnings when upside is negative with weak pillars', () => {
    const score: RunV1SchemaJson['scores'][number] = {
      symbol: 'BBB',
      total_score: 42,
      breakdown: { fundamental: 30, technical: 28 },
      evidence: { valuation: 35, quality: 30, technical: 25, risk: 30 },
      valuation_input_coverage: {
        present: ['pe'],
        missing: ['pb', 'ps'],
        strategy_used: 'partial',
      },
      data_quality: {
        data_quality_score: 55,
        data_quality_confidence: 0.4,
        completeness_ratio: 0.6,
        imputed_ratio: 0.2,
        missing_critical: [],
        metrics: {},
        missing_fields: ['equity', 'cashflow'],
        assumptions: ['Negative equity flagged'],
      },
      price_target: {
        current_price: 80,
        fair_value: 70,
        upside_pct: -0.1,
        target_buy_price: 65,
        target_sell_price: 75,
        expected_return_pct: -0.05,
        holding_period_months: 6,
        target_date: '2024-12-31',
        confidence: 'low',
        requires_deep_analysis: true,
        deep_analysis_reasons: ['Data gaps'],
      },
    };

    const run = makeRun(score);
    const signals = buildExplainSignals(score, run);

    expect(signals.warnings.length).toBeGreaterThanOrEqual(2);
    expect(signals.warnings.some((w) => w.label.includes('Negative equity detected'))).toBe(true);
    expect(signals.warnings.some((w) => w.label.includes('Negative upside'))).toBe(true);
    expect(signals.warnings.some((w) => w.label.includes('partial inputs'))).toBe(true);
    expect(signals.negatives.some((s) => s.label.includes('Valuation pillar weak'))).toBe(true);
    expect(signals.negatives.some((s) => s.label.includes('Quality pillar weak'))).toBe(true);
    expect(signals.negatives.some((s) => s.label.includes('Technical momentum weak'))).toBe(true);
    expect(signals.negatives.some((s) => s.label.includes('Risk profile elevated'))).toBe(true);
    const total = signals.positives.length + signals.negatives.length + signals.warnings.length;
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(10);
  });
});
