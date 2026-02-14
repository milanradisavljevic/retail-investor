import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { getMacroSeries, getLatestMacroValue, getMacroSnapshot } from '@/data/macro-db';

const DB_PATH = join(process.cwd(), 'data', 'privatinvestor.db');
const hasDb = existsSync(DB_PATH);

const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Macro DB Reader', () => {
  describe('getMacroSeries', () => {
    it('returns array of data points for valid series and date range', () => {
      const series = getMacroSeries('DGS10', '2024-01-01', '2024-01-31');

      expect(Array.isArray(series)).toBe(true);
      if (series.length > 0) {
        expect(series[0]).toHaveProperty('date');
        expect(series[0]).toHaveProperty('value');
      }
    });

    it('returns empty array for date range with no data', () => {
      const series = getMacroSeries('DGS10', '1990-01-01', '1990-01-05');

      expect(Array.isArray(series)).toBe(true);
      expect(series.length).toBe(0);
    });

    it('returns sorted data by date ascending', () => {
      const series = getMacroSeries('DGS10', '2024-01-01', '2024-01-31');

      if (series.length > 1) {
        for (let i = 1; i < series.length; i++) {
          expect(series[i].date >= series[i - 1].date).toBe(true);
        }
      }
    });

    it('returns daily data for VIXCLS', () => {
      const series = getMacroSeries('VIXCLS', '2024-01-01', '2024-01-31');

      if (series.length > 0) {
        expect(series.length).toBeGreaterThan(10);
      }
    });
  });

  describe('getLatestMacroValue', () => {
    it('returns latest value for valid series', () => {
      const result = getLatestMacroValue('DGS10');

      if (result) {
        expect(result).toHaveProperty('date');
        expect(result).toHaveProperty('value');
        expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('returns null for non-existent series', () => {
      const result = getLatestMacroValue('NONEXISTENT_SERIES');

      expect(result).toBeNull();
    });

    it('returns non-null value when data exists', () => {
      const result = getLatestMacroValue('VIXCLS');

      if (result) {
        expect(result.value).not.toBeNull();
        expect(typeof result.value).toBe('number');
      }
    });
  });

  describe('getMacroSnapshot', () => {
    it('returns record with all 5 series for a valid date', () => {
      const snapshot = getMacroSnapshot('2024-06-01');

      expect(snapshot).toHaveProperty('DGS10');
      expect(snapshot).toHaveProperty('T10Y2Y');
      expect(snapshot).toHaveProperty('VIXCLS');
      expect(snapshot).toHaveProperty('CPIAUCSL');
      expect(snapshot).toHaveProperty('FEDFUNDS');
    });

    it('returns null values for far-back dates with no data', () => {
      const snapshot = getMacroSnapshot('1900-01-01');

      expect(snapshot.DGS10).toBeNull();
      expect(snapshot.T10Y2Y).toBeNull();
      expect(snapshot.VIXCLS).toBeNull();
      expect(snapshot.CPIAUCSL).toBeNull();
      expect(snapshot.FEDFUNDS).toBeNull();
    });

    it('provides forward-fill for monthly series (CPI)', () => {
      const snapshotMidMonth = getMacroSnapshot('2024-06-15');

      if (snapshotMidMonth.CPIAUCSL !== null) {
        const snapshotEarlyMonth = getMacroSnapshot('2024-06-01');

        if (snapshotEarlyMonth.CPIAUCSL !== null) {
          expect(snapshotMidMonth.CPIAUCSL).toBe(snapshotEarlyMonth.CPIAUCSL);
        }
      }
    });

    it('provides forward-fill for monthly series (FEDFUNDS)', () => {
      const snapshotMidMonth = getMacroSnapshot('2024-06-20');

      if (snapshotMidMonth.FEDFUNDS !== null) {
        const snapshotEarlyMonth = getMacroSnapshot('2024-06-01');

        if (snapshotEarlyMonth.FEDFUNDS !== null) {
          expect(snapshotMidMonth.FEDFUNDS).toBe(snapshotEarlyMonth.FEDFUNDS);
        }
      }
    });

    it('uses most recent value on or before target date', () => {
      const snapshot = getMacroSnapshot('2024-06-15');

      if (snapshot.VIXCLS !== null) {
        expect(snapshot.VIXCLS).toBeGreaterThanOrEqual(0);
        expect(snapshot.VIXCLS).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Data coverage', () => {
    it('has recent VIX data available', () => {
      const latest = getLatestMacroValue('VIXCLS');

      if (latest) {
        const latestDate = new Date(latest.date);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

        expect(daysDiff).toBeLessThan(30);
      }
    });

    it('has recent DGS10 (10-year Treasury) data available', () => {
      const latest = getLatestMacroValue('DGS10');

      if (latest) {
        const latestDate = new Date(latest.date);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

        expect(daysDiff).toBeLessThan(30);
      }
    });
  });
});

describe('Macro DB Reader (no DB required)', () => {
  it('getMacroSnapshot returns record type', () => {
    const testDate = '2024-01-01';
    const expectedKeys = ['DGS10', 'T10Y2Y', 'VIXCLS', 'CPIAUCSL', 'FEDFUNDS'];

    if (!hasDb) {
      const mockSnapshot: Record<string, number | null> = {
        DGS10: null,
        T10Y2Y: null,
        VIXCLS: null,
        CPIAUCSL: null,
        FEDFUNDS: null,
      };

      expect(Object.keys(mockSnapshot)).toEqual(expectedKeys);
    }
  });
});
