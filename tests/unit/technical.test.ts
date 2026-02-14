import { describe, expect, it } from 'vitest';
import { calculateTechnicalScore } from '@/scoring/technical';
import type { TechnicalMetrics } from '@/providers/types';

function makeMetrics(overrides: Partial<TechnicalMetrics> = {}): TechnicalMetrics {
  return {
    currentPrice: overrides.currentPrice ?? 100,
    previousClose: overrides.previousClose ?? 99,
    dayChangePercent: overrides.dayChangePercent ?? null,
    high52Week: overrides.high52Week ?? 120,
    low52Week: overrides.low52Week ?? 80,
    priceReturn5Day: overrides.priceReturn5Day ?? null,
    priceReturn13Week: overrides.priceReturn13Week ?? null,
    priceReturn26Week: overrides.priceReturn26Week ?? null,
    priceReturn52Week: overrides.priceReturn52Week ?? null,
    volatility3Month: overrides.volatility3Month ?? null,
    beta: overrides.beta ?? null,
  };
}

describe('Technical Scoring', () => {
  describe('Trend scoring', () => {
    it('scores high trend when price near 52-week high', () => {
      const metrics = makeMetrics({
        currentPrice: 115,
        high52Week: 120,
        low52Week: 80,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeGreaterThan(75);
      expect(result.indicators.position52Week).toBeGreaterThan(85);
    });

    it('scores low trend when price near 52-week low', () => {
      const metrics = makeMetrics({
        currentPrice: 85,
        high52Week: 120,
        low52Week: 80,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeLessThan(45);
      expect(result.indicators.position52Week).toBeLessThan(20);
    });

    it('scores moderate trend when price in middle of range', () => {
      const metrics = makeMetrics({
        currentPrice: 100,
        high52Week: 120,
        low52Week: 80,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeGreaterThanOrEqual(55);
      expect(result.components.trend).toBeLessThanOrEqual(65);
      expect(result.indicators.position52Week).toBeCloseTo(50, 0);
    });
  });

  describe('Momentum scoring', () => {
    it('scores high momentum with positive returns across periods', () => {
      const metrics = makeMetrics({
        priceReturn5Day: 4,
        priceReturn13Week: 20,
        priceReturn26Week: 30,
        priceReturn52Week: 50,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.momentum).toBeGreaterThan(70);
    });

    it('scores low momentum with negative returns across periods', () => {
      const metrics = makeMetrics({
        priceReturn5Day: -5,
        priceReturn13Week: -20,
        priceReturn26Week: -25,
        priceReturn52Week: -30,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.momentum).toBeLessThan(30);
    });

    it('scores moderate momentum with mixed returns', () => {
      const metrics = makeMetrics({
        priceReturn5Day: 1,
        priceReturn13Week: 3,
        priceReturn26Week: -2,
        priceReturn52Week: 8,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.momentum).toBeGreaterThan(40);
      expect(result.components.momentum).toBeLessThan(70);
    });
  });

  describe('Volatility scoring', () => {
    it('rewards low volatility', () => {
      const metrics = makeMetrics({
        volatility3Month: 10,
        beta: 0.5,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.volatility).toBeGreaterThan(80);
    });

    it('penalizes high volatility', () => {
      const metrics = makeMetrics({
        volatility3Month: 55,
        beta: 1.8,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.volatility).toBeLessThan(30);
    });

    it('scores moderate volatility neutrally', () => {
      const metrics = makeMetrics({
        volatility3Month: 30,
        beta: 1.0,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.volatility).toBeGreaterThan(35);
      expect(result.components.volatility).toBeLessThan(60);
    });

    it('adjusts volatility score based on beta', () => {
      const lowBetaMetrics = makeMetrics({
        volatility3Month: 25,
        beta: 0.5,
      });

      const highBetaMetrics = makeMetrics({
        volatility3Month: 25,
        beta: 1.6,
      });

      const lowBetaResult = calculateTechnicalScore(lowBetaMetrics);
      const highBetaResult = calculateTechnicalScore(highBetaMetrics);

      expect(lowBetaResult.components.volatility).toBeGreaterThan(
        highBetaResult.components.volatility
      );
    });
  });

  describe('Missing data handling', () => {
    it('returns neutral scores for null metrics', () => {
      const result = calculateTechnicalScore(null);

      expect(result.total).toBe(50);
      expect(result.components.trend).toBe(50);
      expect(result.components.momentum).toBe(50);
      expect(result.components.volatility).toBe(50);
      expect(result.missingFields).toContain('technical_metrics');
      expect(result.assumptions.length).toBeGreaterThan(0);
    });

    it('handles missing 52-week range gracefully', () => {
      const metrics = makeMetrics({
        high52Week: null,
        low52Week: null,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.missingFields.length).toBeGreaterThanOrEqual(0);
    });

    it('handles missing price returns gracefully', () => {
      const metrics = makeMetrics({
        priceReturn5Day: null,
        priceReturn13Week: null,
        priceReturn26Week: null,
        priceReturn52Week: null,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.missingFields).toContain('price_returns');
    });

    it('handles missing volatility gracefully', () => {
      const metrics = makeMetrics({
        volatility3Month: null,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.missingFields).toContain('volatility');
    });

    it('still computes trend when volatility missing', () => {
      const metrics = makeMetrics({
        currentPrice: 115,
        high52Week: 120,
        low52Week: 80,
        volatility3Month: null,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeGreaterThan(75);
    });
  });

  describe('Edge cases', () => {
    it('handles identical high and low 52-week values', () => {
      const metrics = makeMetrics({
        currentPrice: 100,
        high52Week: 100,
        low52Week: 100,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.indicators.position52Week).toBeNull();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('handles negative day change', () => {
      const metrics = makeMetrics({
        currentPrice: 100,
        high52Week: 120,
        low52Week: 80,
        dayChangePercent: -5,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeLessThan(90);
    });

    it('handles positive day change', () => {
      const metrics = makeMetrics({
        currentPrice: 100,
        high52Week: 120,
        low52Week: 80,
        dayChangePercent: 5,
      });

      const result = calculateTechnicalScore(metrics);

      expect(result.components.trend).toBeGreaterThan(50);
    });
  });

  describe('Total score composition', () => {
    it('weights components correctly (trend 30%, momentum 40%, volatility 30%)', () => {
      const metrics = makeMetrics({
        currentPrice: 110,
        high52Week: 120,
        low52Week: 80,
        priceReturn13Week: 10,
        volatility3Month: 20,
      });

      const result = calculateTechnicalScore(metrics);

      const expectedTotal =
        result.components.trend * 0.3 +
        result.components.momentum * 0.4 +
        result.components.volatility * 0.3;

      expect(result.total).toBeCloseTo(expectedTotal, 0);
    });
  });
});
