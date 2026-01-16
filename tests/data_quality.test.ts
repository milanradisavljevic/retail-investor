import { describe, it, expect } from 'vitest';
import { resolveMetric } from '@/data/quality/resolve_metric';
import { computeDataQuality } from '@/data/quality/data_quality';

describe('resolveMetric hierarchy', () => {
  it('uses primary raw when available', () => {
    const mq = resolveMetric({
      metric: 'peRatio',
      primaryValue: 10,
      primarySource: 'primary',
    });
    expect(mq.value).toBe(10);
    expect(mq.source).toBe('primary');
    expect(mq.isImputed).toBe(false);
    expect(mq.confidence).toBe(1);
  });

  it('falls back to industry median when primary missing', () => {
    const mq = resolveMetric({
      metric: 'peRatio',
      primaryValue: null,
      primarySource: 'primary',
      industryMedian: { value: 15, sampleCount: 10 },
    });
    expect(mq.value).toBe(15);
    expect(mq.source).toBe('imputed:industry_median');
    expect(mq.isImputed).toBe(true);
  });

  it('uses default fallback with low confidence when nothing else is available', () => {
    const mq = resolveMetric({
      metric: 'debtToEquity',
      primaryValue: null,
      primarySource: 'primary',
    });
    expect(mq.source.startsWith('fallback')).toBe(true);
    expect(mq.confidence).toBeCloseTo(0.3);
    expect(mq.isImputed).toBe(true);
  });
});

describe('computeDataQuality', () => {
  it('scores higher when metrics are raw and complete', () => {
    const metrics = {
      peRatio: {
        value: 10,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      pbRatio: {
        value: 2,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      psRatio: {
        value: 4,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      roe: {
        value: 15,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      debtToEquity: {
        value: 1,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      beta: {
        value: 1,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
    };
    const dq = computeDataQuality({ symbol: 'TEST', metrics });
    expect(dq.dataQualityScore).toBeGreaterThan(90);
    expect(dq.missingCritical.length).toBe(0);
  });

  it('penalizes fallback defaults for critical metrics', () => {
    const metrics = {
      peRatio: {
        value: 50,
        source: 'fallback:default',
        confidence: 0.3,
        isImputed: true,
        isMissing: false,
      },
      pbRatio: {
        value: 3,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      psRatio: {
        value: 4,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      roe: {
        value: 12,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      debtToEquity: {
        value: 0.8,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
      beta: {
        value: 1,
        source: 'primary',
        confidence: 1,
        isImputed: false,
        isMissing: false,
      },
    };
    const dq = computeDataQuality({ symbol: 'TEST', metrics });
    expect(dq.dataQualityScore).toBeLessThan(90);
    expect(dq.missingCritical).toContain('peRatio');
  });
});
