import { describe, it, expect } from 'vitest';
import {
  clamp,
  linearScale,
  inverseLinearScale,
  normalizeToRange,
  roundScore,
} from '@/scoring/normalize';

describe('normalize', () => {
  describe('clamp', () => {
    it('clamps values below minimum', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('clamps values above maximum', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('leaves values in range unchanged', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });

  describe('linearScale', () => {
    it('scales value from input range to output range', () => {
      expect(linearScale(50, 0, 100, 0, 100)).toBe(50);
      expect(linearScale(0, 0, 100, 0, 100)).toBe(0);
      expect(linearScale(100, 0, 100, 0, 100)).toBe(100);
    });

    it('handles different ranges', () => {
      expect(linearScale(5, 0, 10, 0, 100)).toBe(50);
      expect(linearScale(15, 10, 20, 0, 100)).toBe(50);
    });

    it('clamps output to range', () => {
      expect(linearScale(200, 0, 100, 0, 100)).toBe(100);
      expect(linearScale(-50, 0, 100, 0, 100)).toBe(0);
    });
  });

  describe('inverseLinearScale', () => {
    it('inverts the scaling', () => {
      expect(inverseLinearScale(0, 0, 100, 0, 100)).toBe(100);
      expect(inverseLinearScale(100, 0, 100, 0, 100)).toBe(0);
      expect(inverseLinearScale(50, 0, 100, 0, 100)).toBe(50);
    });
  });

  describe('normalizeToRange', () => {
    it('returns 50 for null values', () => {
      expect(normalizeToRange(null, { low: 0, high: 100 })).toBe(50);
    });

    it('returns 50 for NaN values', () => {
      expect(normalizeToRange(NaN, { low: 0, high: 100 })).toBe(50);
    });

    it('returns 95 for values at or below low threshold (inverted soft-cap)', () => {
      expect(normalizeToRange(10, { low: 15, high: 30 }, true)).toBe(95);
    });

    it('returns 0 for values at or above high threshold (inverted)', () => {
      expect(normalizeToRange(35, { low: 15, high: 30 }, true)).toBe(0);
    });

    it('returns 95 for values at or above high threshold (normal soft-cap)', () => {
      expect(normalizeToRange(25, { low: 5, high: 20 }, false)).toBe(95);
    });

    it('returns 0 for values at or below low threshold (normal)', () => {
      expect(normalizeToRange(3, { low: 5, high: 20 }, false)).toBe(0);
    });

    it('caps interpolated scores at 95', () => {
      expect(normalizeToRange(20, { low: 10, high: 20 }, false)).toBe(95);
      expect(normalizeToRange(10, { low: 10, high: 20 }, true)).toBe(95);
    });
  });

  describe('roundScore', () => {
    it('rounds to one decimal by default', () => {
      expect(roundScore(50.456)).toBe(50.5);
      expect(roundScore(50.444)).toBe(50.4);
    });

    it('respects decimals parameter', () => {
      expect(roundScore(50.456, 2)).toBe(50.46);
      expect(roundScore(50.456, 0)).toBe(50);
    });
  });
});
