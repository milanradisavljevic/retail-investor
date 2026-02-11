/**
 * Evidence Pillars
 * Valuation, Quality, Technical, Risk (each 0-100)
 */

import { roundScore } from './normalize';
import type { FundamentalScoreResult } from './fundamental';
import type { TechnicalScoreResult } from './technical';
import type { PillarWeights } from './scoring_config';

export interface EvidencePillars {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

export function calculateEvidencePillars(
  fundamentalResult: FundamentalScoreResult,
  technicalResult: TechnicalScoreResult,
  isShieldStrategy: boolean = false
): EvidencePillars {
  // Valuation: from fundamental analysis (P/E, P/B, P/S)
  const valuation = fundamentalResult.components.valuation;

  // Quality: from fundamental analysis (ROE, Debt/Equity)
  const quality = fundamentalResult.components.quality;

  // Technical: from technical analysis (trend + momentum)
  const technical =
    (technicalResult.components.trend + technicalResult.components.momentum) / 2;

  // Risk: depends on strategy
  let risk: number;
  if (isShieldStrategy) {
    // For Shield strategy: Risk = weighted combination of Beta (40%), Volatility (40%), Max Drawdown (20%)
    // Note: We don't have max drawdown in the current technical result, so we'll use volatility and beta
    // with 40/40 split for now, reserving 20% for when max drawdown is available
    const betaRisk = technicalResult.indicators.beta !== null ? 
      mapBetaToRiskScore(technicalResult.indicators.beta) : 50; // Neutral score if missing
    const volatilityRisk = technicalResult.components.volatility;
    
    // Using 50/50 split between beta and volatility for now (equivalent to 40% beta + 40% volatility of risk pillar)
    // When max drawdown is available, we'll adjust to 40% beta + 40% volatility + 20% max drawdown
    risk = (betaRisk * 0.5) + (volatilityRisk * 0.5);
  } else {
    // Original risk calculation for other strategies
    const volatilityRisk = technicalResult.components.volatility;
    const debtRisk = fundamentalResult.breakdown.debtEquityScore;
    risk = (volatilityRisk + debtRisk) / 2;
  }

  return {
    valuation: roundScore(valuation),
    quality: roundScore(quality),
    technical: roundScore(technical),
    risk: roundScore(risk),
  };
}

// Helper function to map beta to risk score (lower beta = higher risk score for low-vol strategy)
function mapBetaToRiskScore(beta: number): number {
  // Lower beta = lower risk = higher score for low-vol strategy
  if (beta < 0.5) return 95;    // Very low beta = very low risk
  if (beta < 0.7) return 85;    // Low beta = low risk
  if (beta < 0.9) return 75;    // Moderately low beta = moderately low risk
  if (beta < 1.1) return 65;    // Around 1.0 = moderate risk
  if (beta < 1.3) return 50;    // Slightly above 1.0 = moderate-high risk
  if (beta < 1.5) return 35;    // Above 1.3 = high risk
  return 20;                    // Very high beta = very high risk
}

export const DEFAULT_PILLAR_WEIGHTS: PillarWeights = {
  valuation: 0.25,
  quality: 0.25,
  technical: 0.25,
  risk: 0.25,
};

export function calculateTotalScore(
  pillars: EvidencePillars,
  weights: PillarWeights = DEFAULT_PILLAR_WEIGHTS
): number {
  const total =
    pillars.valuation * weights.valuation +
    pillars.quality * weights.quality +
    pillars.technical * weights.technical +
    pillars.risk * weights.risk;

  return roundScore(total);
}

export function getConfidenceLevel(pillars: EvidencePillars): 'high' | 'medium' | 'low' {
  const scores = [pillars.valuation, pillars.quality, pillars.technical, pillars.risk];
  const min = Math.min(...scores);
  const spread = Math.max(...scores) - min;

  // High confidence: all pillars are relatively aligned
  if (spread < 20 && min >= 50) {
    return 'high';
  }

  // Low confidence: wide spread or some pillars very low
  if (spread > 40 || min < 30) {
    return 'low';
  }

  return 'medium';
}

export function getPillarFlags(pillars: EvidencePillars): string[] {
  const flags: string[] = [];

  if (pillars.valuation < 40) {
    flags.push('overvalued');
  }

  if (pillars.quality < 40) {
    flags.push('quality_concerns');
  }

  if (pillars.technical < 40) {
    flags.push('weak_technicals');
  }

  if (pillars.risk < 40) {
    flags.push('high_risk');
  }

  return flags;
}
