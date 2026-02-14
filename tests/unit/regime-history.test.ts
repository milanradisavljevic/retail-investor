import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { computeRegimeHistory } from '@/regime/history';

const DB_PATH = join(process.cwd(), 'data', 'privatinvestor.db');
const hasDb = existsSync(DB_PATH);

const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Regime History', () => {
  describe('computeRegimeHistory', () => {
    it('returns array of regime results for valid date range', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns approximately correct number of trading days', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-06-30');

      const expectedTradingDays = 125;
      const tolerance = 10;

      expect(results.length).toBeGreaterThan(expectedTradingDays - tolerance);
      expect(results.length).toBeLessThan(expectedTradingDays + tolerance);
    });

    it('includes CRISIS periods during COVID crash (March 2020)', () => {
      const results = computeRegimeHistory('2020-03-01', '2020-04-30');

      const crisisPeriods = results.filter(r => r.label === 'CRISIS');

      expect(crisisPeriods.length).toBeGreaterThan(0);
    });

    it('all results have valid label and confidence', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-03-31');

      const validLabels = ['RISK_ON', 'NEUTRAL', 'RISK_OFF', 'CRISIS'];

      for (const result of results) {
        expect(validLabels).toContain(result.label);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('all results have as_of_date field', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      for (const result of results) {
        expect(result.as_of_date).toBeDefined();
        expect(result.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('all results have signals object', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      for (const result of results) {
        expect(result.signals).toBeDefined();
        expect(result.signals.vix).toBeDefined();
        expect(result.signals.yield_curve).toBeDefined();
        expect(result.signals.fed_rate).toBeDefined();
        expect(result.signals.cpi).toBeDefined();
      }
    });

    it('results are sorted by date ascending', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-03-31');

      for (let i = 1; i < results.length; i++) {
        expect(results[i].as_of_date >= results[i - 1].as_of_date).toBe(true);
      }
    });

    it('composite_score is within valid range', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-03-31');

      for (const result of results) {
        expect(result.composite_score).toBeGreaterThanOrEqual(-1);
        expect(result.composite_score).toBeLessThanOrEqual(1);
      }
    });

    it('data_gaps array is present and contains valid series IDs', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      const validGapIds = ['VIXCLS', 'T10Y2Y', 'FEDFUNDS', 'CPIAUCSL'];

      for (const result of results) {
        expect(Array.isArray(result.data_gaps)).toBe(true);
        for (const gap of result.data_gaps) {
          expect(validGapIds).toContain(gap);
        }
      }
    });
  });

  describe('Regime transitions', () => {
    it('can transition between different regimes over time', () => {
      const results = computeRegimeHistory('2020-01-01', '2020-12-31');

      const uniqueLabels = new Set(results.map(r => r.label));

      expect(uniqueLabels.size).toBeGreaterThan(1);
    });

    it('shows RISK_OFF or CRISIS during March 2020 crash', () => {
      const results = computeRegimeHistory('2020-03-09', '2020-03-23');

      const riskOffOrCrisis = results.filter(
        r => r.label === 'RISK_OFF' || r.label === 'CRISIS'
      );

      expect(riskOffOrCrisis.length).toBeGreaterThan(0);
    });
  });

  describe('Signal values', () => {
    it('VIX signal has valid score range', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      for (const result of results) {
        expect(result.signals.vix.score).toBeGreaterThanOrEqual(-1);
        expect(result.signals.vix.score).toBeLessThanOrEqual(1);
      }
    });

    it('yield_curve signal has valid score range', () => {
      const results = computeRegimeHistory('2024-01-01', '2024-01-31');

      for (const result of results) {
        expect(result.signals.yield_curve.score).toBeGreaterThanOrEqual(-1);
        expect(result.signals.yield_curve.score).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('Regime History (no DB required)', () => {
  it('function signature is correct', () => {
    expect(typeof computeRegimeHistory).toBe('function');
  });
});
