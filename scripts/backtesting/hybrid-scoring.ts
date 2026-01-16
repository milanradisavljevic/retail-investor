/**
 * Hybrid Scoring System for Backtesting
 *
 * Combines multiple factors for more realistic historical scoring:
 * - 40% Momentum (13W + 26W returns)
 * - 30% Technical Strength (52W range position)
 * - 30% Quality Filter (basic fundamentals check)
 *
 * This scoring can be used with historical data where full fundamental
 * data is not available.
 */

export interface HybridScoreInput {
  symbol: string;
  currentPrice: number;
  high52Week: number;
  low52Week: number;
  return13Week: number | null;  // 13-week return (decimal, e.g., 0.15 = 15%)
  return26Week: number | null;  // 26-week return
  return52Week: number | null;  // 52-week return (optional, for quality filter)
  volatility?: number;          // 3-month volatility (optional)
  // Basic fundamentals (if available)
  roe?: number | null;          // Return on Equity (decimal, e.g., 0.15 = 15%)
  debtToEquity?: number | null; // Debt/Equity ratio
  pe?: number | null;           // P/E ratio
}

export interface HybridScoreResult {
  symbol: string;
  totalScore: number;           // 0-100
  components: {
    momentum: number;           // 0-100
    technicalStrength: number;  // 0-100
    qualityFilter: number;      // 0-100
  };
  weights: {
    momentum: number;
    technicalStrength: number;
    qualityFilter: number;
  };
  flags: {
    hasMomentumData: boolean;
    hasTechnicalData: boolean;
    hasQualityData: boolean;
    qualityPassed: boolean;
  };
}

// Scoring weights
const WEIGHTS = {
  momentum: 0.40,
  technicalStrength: 0.30,
  qualityFilter: 0.30,
};

// Quality thresholds
const QUALITY_THRESHOLDS = {
  minROE: 0.10,           // 10% minimum ROE
  maxDebtEquity: 2.0,     // Max 2.0 D/E ratio
  maxPE: 50,              // Max P/E of 50 (avoid extreme valuations)
  minPE: 0,               // Avoid negative P/E
};

/**
 * Calculate momentum score (0-100)
 * Based on 13-week and 26-week returns
 */
function calculateMomentumScore(
  return13Week: number | null,
  return26Week: number | null
): { score: number; hasData: boolean } {
  if (return13Week === null && return26Week === null) {
    return { score: 50, hasData: false }; // Neutral if no data
  }

  // Weight: 60% on 13W, 40% on 26W
  const weight13W = 0.6;
  const weight26W = 0.4;

  let weightedReturn = 0;
  let totalWeight = 0;

  if (return13Week !== null) {
    weightedReturn += return13Week * weight13W;
    totalWeight += weight13W;
  }

  if (return26Week !== null) {
    weightedReturn += return26Week * weight26W;
    totalWeight += weight26W;
  }

  const avgReturn = weightedReturn / totalWeight;

  // Normalize to 0-100 scale
  // -50% return → 0, 0% return → 50, +50% return → 100
  const normalized = Math.max(0, Math.min(100, (avgReturn + 0.5) * 100));

  return { score: normalized, hasData: true };
}

/**
 * Calculate technical strength score (0-100)
 * Based on position within 52-week range
 */
function calculateTechnicalStrengthScore(
  currentPrice: number,
  high52Week: number,
  low52Week: number
): { score: number; hasData: boolean } {
  if (!currentPrice || !high52Week || !low52Week || high52Week <= low52Week) {
    return { score: 50, hasData: false };
  }

  // Position in 52-week range: 0 = at low, 1 = at high
  const range = high52Week - low52Week;
  const position = (currentPrice - low52Week) / range;

  // Score: being higher in range is better (momentum/trend following)
  // But not too close to high (overbought)
  // Optimal: 60-80% of range
  let score: number;

  if (position >= 0.6 && position <= 0.8) {
    // Optimal zone: high score
    score = 70 + (position - 0.6) * 100; // 70-90
  } else if (position > 0.8) {
    // Near high: slightly lower (overbought risk)
    score = 90 - (position - 0.8) * 50; // 90-80
  } else if (position >= 0.4) {
    // Middle zone: moderate score
    score = 50 + (position - 0.4) * 100; // 50-70
  } else if (position >= 0.2) {
    // Lower zone: lower score
    score = 30 + (position - 0.2) * 100; // 30-50
  } else {
    // Near low: lowest score (downtrend)
    score = position * 150; // 0-30
  }

  return { score: Math.max(0, Math.min(100, score)), hasData: true };
}

/**
 * Calculate quality filter score (0-100)
 * Based on basic fundamental checks
 */
function calculateQualityScore(
  roe: number | null | undefined,
  debtToEquity: number | null | undefined,
  pe: number | null | undefined
): { score: number; hasData: boolean; passed: boolean } {
  let score = 50; // Start neutral
  let hasData = false;
  let checks = 0;
  let passed = 0;

  // ROE check
  if (roe !== null && roe !== undefined) {
    hasData = true;
    checks++;
    if (roe >= QUALITY_THRESHOLDS.minROE) {
      score += 15;
      passed++;
      // Bonus for high ROE
      if (roe >= 0.20) score += 5;
      if (roe >= 0.30) score += 5;
    } else if (roe < 0) {
      score -= 20; // Negative ROE is bad
    } else {
      score -= 5; // Low but positive ROE
    }
  }

  // Debt/Equity check
  if (debtToEquity !== null && debtToEquity !== undefined) {
    hasData = true;
    checks++;
    if (debtToEquity <= QUALITY_THRESHOLDS.maxDebtEquity) {
      score += 10;
      passed++;
      // Bonus for low debt
      if (debtToEquity <= 0.5) score += 5;
      if (debtToEquity <= 0.2) score += 5;
    } else {
      score -= 10; // High debt
      if (debtToEquity > 4) score -= 10; // Very high debt
    }
  }

  // P/E check
  if (pe !== null && pe !== undefined) {
    hasData = true;
    checks++;
    if (pe > QUALITY_THRESHOLDS.minPE && pe <= QUALITY_THRESHOLDS.maxPE) {
      score += 10;
      passed++;
      // Bonus for reasonable P/E
      if (pe >= 10 && pe <= 25) score += 5;
    } else if (pe <= 0) {
      score -= 15; // Negative earnings
    } else {
      score -= 5; // Very high P/E
    }
  }

  // Normalize score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Quality passed if most checks pass
  const qualityPassed = checks === 0 || passed >= checks * 0.5;

  return { score, hasData, passed: qualityPassed };
}

/**
 * Calculate hybrid score for a single stock
 */
export function calculateHybridScore(input: HybridScoreInput): HybridScoreResult {
  const momentum = calculateMomentumScore(input.return13Week, input.return26Week);
  const technical = calculateTechnicalStrengthScore(
    input.currentPrice,
    input.high52Week,
    input.low52Week
  );
  const quality = calculateQualityScore(input.roe, input.debtToEquity, input.pe);

  // Calculate weighted total
  let totalScore =
    momentum.score * WEIGHTS.momentum +
    technical.score * WEIGHTS.technicalStrength +
    quality.score * WEIGHTS.qualityFilter;

  // Apply quality penalty if quality check failed
  if (quality.hasData && !quality.passed) {
    totalScore *= 0.9; // 10% penalty for failing quality checks
  }

  return {
    symbol: input.symbol,
    totalScore: Math.round(totalScore * 10) / 10,
    components: {
      momentum: Math.round(momentum.score * 10) / 10,
      technicalStrength: Math.round(technical.score * 10) / 10,
      qualityFilter: Math.round(quality.score * 10) / 10,
    },
    weights: WEIGHTS,
    flags: {
      hasMomentumData: momentum.hasData,
      hasTechnicalData: technical.hasData,
      hasQualityData: quality.hasData,
      qualityPassed: quality.passed,
    },
  };
}

/**
 * Rank stocks by hybrid score
 */
export function rankByHybridScore(
  inputs: HybridScoreInput[],
  topN?: number
): HybridScoreResult[] {
  const results = inputs.map(calculateHybridScore);

  // Sort by total score descending, then alphabetically for ties
  results.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  if (topN && topN > 0) {
    return results.slice(0, topN);
  }

  return results;
}

/**
 * Calculate score for backtesting at a specific date
 * Uses historical price data to compute metrics
 */
export function calculateBacktestScore(
  symbol: string,
  priceHistory: Array<{ date: string; close: number }>,
  asOfDate: string,
  fundamentals?: {
    roe?: number | null;
    debtToEquity?: number | null;
    pe?: number | null;
  }
): HybridScoreResult | null {
  // Find the as-of date index
  const dateIdx = priceHistory.findIndex((p) => p.date === asOfDate);
  if (dateIdx < 0) return null;

  const currentPrice = priceHistory[dateIdx].close;

  // Need at least 130 trading days (26 weeks) of history
  if (dateIdx < 130) return null;

  // Calculate returns
  const price13WeeksAgo = priceHistory[Math.max(0, dateIdx - 65)]?.close;
  const price26WeeksAgo = priceHistory[Math.max(0, dateIdx - 130)]?.close;

  const return13Week = price13WeeksAgo
    ? (currentPrice - price13WeeksAgo) / price13WeeksAgo
    : null;
  const return26Week = price26WeeksAgo
    ? (currentPrice - price26WeeksAgo) / price26WeeksAgo
    : null;

  // Calculate 52-week high/low (looking back from asOfDate)
  const lookbackStart = Math.max(0, dateIdx - 252);
  const lookbackPrices = priceHistory
    .slice(lookbackStart, dateIdx + 1)
    .map((p) => p.close);

  const high52Week = Math.max(...lookbackPrices);
  const low52Week = Math.min(...lookbackPrices);

  return calculateHybridScore({
    symbol,
    currentPrice,
    high52Week,
    low52Week,
    return13Week,
    return26Week,
    return52Week: null,
    roe: fundamentals?.roe,
    debtToEquity: fundamentals?.debtToEquity,
    pe: fundamentals?.pe,
  });
}
