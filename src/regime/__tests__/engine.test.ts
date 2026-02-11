import { describe, expect, it } from 'vitest';
import { detectRegimeFromSnapshot } from '../engine';

describe('regime engine', () => {
  it('classifies March 2020 stress as CRISIS (VIX override)', () => {
    const snapshot: Record<string, number | null> = {
      DGS10: 0.72,
      T10Y2Y: -0.45,
      VIXCLS: 82.69,
      CPIAUCSL: 258.115,
      CPIAUCSL_12M_AGO: 255.233,
      FEDFUNDS: 0.65,
      FEDFUNDS_3M_AGO: 1.55,
      FEDFUNDS_6M_AGO: 2.4,
    };

    const result = detectRegimeFromSnapshot(snapshot, '2020-03-16');
    expect(result.label).toBe('CRISIS');
    expect(result.signals.vix.score).toBe(-1);
    expect(result.confidence).toBe(1);
  });

  it('classifies mid-2021 as RISK_ON in a calm, steep-curve setup', () => {
    const snapshot: Record<string, number | null> = {
      DGS10: 1.45,
      T10Y2Y: 1.6,
      VIXCLS: 14.8,
      CPIAUCSL: 271.696,
      CPIAUCSL_12M_AGO: 265.0,
      FEDFUNDS: 0.08,
      FEDFUNDS_3M_AGO: 0.09,
      FEDFUNDS_6M_AGO: 0.1,
    };

    const result = detectRegimeFromSnapshot(snapshot, '2021-06-15');
    expect(result.label).toBe('RISK_ON');
    expect(result.composite_score).toBeGreaterThan(0.4);
  });

  it('classifies October 2022 hiking regime as RISK_OFF', () => {
    const snapshot: Record<string, number | null> = {
      DGS10: 4.1,
      T10Y2Y: -0.4,
      VIXCLS: 30.0,
      CPIAUCSL: 296.808,
      CPIAUCSL_12M_AGO: 275.0,
      FEDFUNDS: 3.08,
      FEDFUNDS_3M_AGO: 1.83,
      FEDFUNDS_6M_AGO: 1.0,
    };

    const result = detectRegimeFromSnapshot(snapshot, '2022-10-14');
    expect(result.label).toBe('RISK_OFF');
    expect(result.composite_score).toBeLessThanOrEqual(-0.2);
    expect(result.composite_score).toBeGreaterThanOrEqual(-0.6);
  });

  it('falls back to NEUTRAL with low confidence when data is missing', () => {
    const snapshot: Record<string, number | null> = {
      DGS10: null,
      T10Y2Y: null,
      VIXCLS: 22,
      CPIAUCSL: null,
      FEDFUNDS: null,
    };

    const result = detectRegimeFromSnapshot(snapshot, '2024-01-15');
    expect(result.label).toBe('NEUTRAL');
    expect(result.confidence).toBe(0.25);
    expect(result.data_gaps).toContain('T10Y2Y');
    expect(result.data_gaps).toContain('FEDFUNDS');
    expect(result.data_gaps).toContain('CPIAUCSL');
  });
});
