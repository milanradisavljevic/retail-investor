/**
 * Technical Score Calculation
 * Uses pre-calculated metrics from Finnhub API (Free Tier compatible)
 * Based on: Price Returns, 52-Week Range, Volatility, Beta
 */

import { roundScore } from './normalize';
import type { TechnicalMetrics } from '@/providers/types';

export interface TechnicalScoreResult {
  total: number;
  components: {
    trend: number;
    momentum: number;
    volatility: number;
  };
  indicators: {
    currentPrice: number | null;
    high52Week: number | null;
    low52Week: number | null;
    priceReturn13Week: number | null;
    priceReturn52Week: number | null;
    beta: number | null;
    volatility3Month: number | null;
    position52Week: number | null;
  };
  missingFields: string[];
  assumptions: string[];
}

/**
 * Calculate technical score from pre-calculated Finnhub metrics
 * This approach works with the free tier since it doesn't require historical candles
 */
export function calculateTechnicalScore(
  metrics: TechnicalMetrics | null
): TechnicalScoreResult {
  const missingFields: string[] = [];
  const assumptions: string[] = [];

  // Handle missing data
  if (!metrics) {
    missingFields.push('technical_metrics');
    assumptions.push('No technical metrics available - using neutral score');

    return {
      total: 50,
      components: { trend: 50, momentum: 50, volatility: 50 },
      indicators: {
        currentPrice: null,
        high52Week: null,
        low52Week: null,
        priceReturn13Week: null,
        priceReturn52Week: null,
        beta: null,
        volatility3Month: null,
        position52Week: null,
      },
      missingFields,
      assumptions,
    };
  }

  const {
    currentPrice = null,
    dayChangePercent = null,
    high52Week = null,
    low52Week = null,
    priceReturn5Day = null,
    priceReturn13Week = null,
    priceReturn26Week = null,
    priceReturn52Week = null,
    volatility3Month = null,
    beta = null,
  } = metrics;

  // Calculate position within 52-week range (0-100)
  let position52Week: number | null = null;
  if (currentPrice !== null && high52Week && low52Week && high52Week !== low52Week) {
    position52Week = ((currentPrice - low52Week) / (high52Week - low52Week)) * 100;
  }

  // TREND SCORE (0-100)
  // Based on price position within 52-week range and short-term momentum
  let trendScore = 50;

  if (position52Week !== null) {
    // Higher position in 52-week range = stronger trend
    if (position52Week >= 80) {
      trendScore = 90; // Near 52-week highs
    } else if (position52Week >= 60) {
      trendScore = 75;
    } else if (position52Week >= 40) {
      trendScore = 60;
    } else if (position52Week >= 20) {
      trendScore = 40;
    } else {
      trendScore = 25; // Near 52-week lows
    }
  } else {
    missingFields.push('52week_range');
    assumptions.push('52-week range unavailable - using neutral trend score');
  }

  // Adjust trend based on recent price action
  if (dayChangePercent !== null && dayChangePercent !== undefined) {
    if (dayChangePercent > 2) {
      trendScore = Math.min(100, trendScore + 10);
    } else if (dayChangePercent < -2) {
      trendScore = Math.max(0, trendScore - 10);
    }
  }

  // MOMENTUM SCORE (0-100)
  // Based on price returns over different time periods
  let momentumScore = 50;
  let momentumSignals = 0;
  let momentumTotal = 0;

  // 5-day momentum (short-term)
  if (priceReturn5Day !== null) {
    if (priceReturn5Day > 3) momentumTotal += 80;
    else if (priceReturn5Day > 0) momentumTotal += 60;
    else if (priceReturn5Day > -3) momentumTotal += 40;
    else momentumTotal += 20;
    momentumSignals++;
  }

  // 13-week momentum (medium-term)
  if (priceReturn13Week !== null) {
    if (priceReturn13Week > 15) momentumTotal += 90;
    else if (priceReturn13Week > 5) momentumTotal += 70;
    else if (priceReturn13Week > -5) momentumTotal += 50;
    else if (priceReturn13Week > -15) momentumTotal += 30;
    else momentumTotal += 15;
    momentumSignals++;
  }

  // 26-week momentum (intermediate-term)
  if (priceReturn26Week !== null) {
    if (priceReturn26Week > 20) momentumTotal += 85;
    else if (priceReturn26Week > 10) momentumTotal += 70;
    else if (priceReturn26Week > 0) momentumTotal += 55;
    else if (priceReturn26Week > -10) momentumTotal += 35;
    else momentumTotal += 15;
    momentumSignals++;
  }

  // 52-week momentum (long-term)
  if (priceReturn52Week !== null) {
    if (priceReturn52Week > 30) momentumTotal += 80;
    else if (priceReturn52Week > 15) momentumTotal += 65;
    else if (priceReturn52Week > 0) momentumTotal += 50;
    else if (priceReturn52Week > -15) momentumTotal += 35;
    else momentumTotal += 20;
    momentumSignals++;
  }

  if (momentumSignals > 0) {
    momentumScore = momentumTotal / momentumSignals;
  } else {
    missingFields.push('price_returns');
    assumptions.push('Price return data unavailable - using neutral momentum score');
  }

  // VOLATILITY/RISK SCORE (0-100, higher = lower risk = better)
  let volatilityScore = 50;

  // Use 3-month volatility (standard deviation)
  if (volatility3Month !== null) {
    // Lower volatility = higher score
    if (volatility3Month < 15) {
      volatilityScore = 90; // Very low volatility
    } else if (volatility3Month < 25) {
      volatilityScore = 70;
    } else if (volatility3Month < 35) {
      volatilityScore = 50;
    } else if (volatility3Month < 50) {
      volatilityScore = 35;
    } else {
      volatilityScore = 20; // High volatility
    }
  } else {
    missingFields.push('volatility');
    assumptions.push('Volatility data unavailable - using neutral score');
  }

  // Adjust based on beta (stronger mapping: low beta => safer => higher score)
  if (beta !== null) {
    let betaAdj = 0;
    if (beta < 0.6) betaAdj = 20;
    else if (beta < 0.8) betaAdj = 12;
    else if (beta <= 1.0) betaAdj = 0;
    else if (beta <= 1.2) betaAdj = -10;
    else if (beta <= 1.5) betaAdj = -20;
    else betaAdj = -30;

    volatilityScore = Math.max(0, Math.min(100, volatilityScore + betaAdj));
  }

  // Total technical score (weighted: trend 30%, momentum 40%, volatility 30%)
  const total = trendScore * 0.3 + momentumScore * 0.4 + volatilityScore * 0.3;

  return {
    total: roundScore(total),
    components: {
      trend: roundScore(trendScore),
      momentum: roundScore(momentumScore),
      volatility: roundScore(volatilityScore),
    },
    indicators: {
      currentPrice,
      high52Week,
      low52Week,
      priceReturn13Week,
      priceReturn52Week,
      beta,
      volatility3Month,
      position52Week: position52Week !== null ? roundScore(position52Week) : null,
    },
    missingFields,
    assumptions,
  };
}

/**
 * Legacy function for backwards compatibility - converts price array to neutral result
 * @deprecated Use calculateTechnicalScore with TechnicalMetrics instead
 */
export function calculateTechnicalScoreFromPrices(
  _prices: unknown[]
): TechnicalScoreResult {
  return {
    total: 50,
    components: { trend: 50, momentum: 50, volatility: 50 },
    indicators: {
      currentPrice: null,
      high52Week: null,
      low52Week: null,
      priceReturn13Week: null,
      priceReturn52Week: null,
      beta: null,
      volatility3Month: null,
      position52Week: null,
    },
    missingFields: ['historical_prices'],
    assumptions: ['Historical price data not available in Finnhub Free Tier - using metrics-based scoring'],
  };
}
