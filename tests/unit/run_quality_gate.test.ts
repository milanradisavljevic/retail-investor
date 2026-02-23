import { describe, expect, it } from 'vitest';
import { evaluateRunQualityGate } from '@/run/quality_gate';
import type { DataQualitySummary } from '@/data/quality/data_quality';

function makeSummary(overrides: Partial<DataQualitySummary> = {}): DataQualitySummary {
  return {
    avg_data_quality_score: 82,
    pct_high: 0.6,
    pct_medium: 0.3,
    pct_low: 0.1,
    tickers_with_critical_fallback: [],
    most_missing_metrics: [],
    generated_at: new Date().toISOString(),
    universe_name: 'Test Universe',
    ...overrides,
  };
}

describe('evaluateRunQualityGate', () => {
  it('returns green for healthy quality signals', () => {
    const gate = evaluateRunQualityGate(makeSummary(), 100);
    expect(gate.status).toBe('green');
    expect(gate.blocked).toBe(false);
    expect(gate.reasons).toEqual([]);
  });

  it('returns yellow when medium-risk thresholds are crossed', () => {
    const gate = evaluateRunQualityGate(
      makeSummary({
        avg_data_quality_score: 68,
        pct_low: 0.32,
        tickers_with_critical_fallback: Array.from({ length: 38 }, (_, i) => `Y${i}`),
      }),
      100
    );

    expect(gate.status).toBe('yellow');
    expect(gate.blocked).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  it('returns red and blocks investable actions for catastrophic runs', () => {
    const gate = evaluateRunQualityGate(
      makeSummary({
        avg_data_quality_score: 42.1,
        pct_low: 0.98,
        tickers_with_critical_fallback: Array.from({ length: 91 }, (_, i) => `R${i}`),
      }),
      100
    );

    expect(gate.status).toBe('red');
    expect(gate.blocked).toBe(true);
    expect(gate.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('avg_data_quality_score'),
        expect.stringContaining('pct_low'),
        expect.stringContaining('critical_fallback_ratio'),
      ])
    );
  });
});
