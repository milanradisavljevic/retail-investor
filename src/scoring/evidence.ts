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
  technicalResult: TechnicalScoreResult
): EvidencePillars {
  // Valuation: from fundamental analysis (P/E, P/B, P/S)
  const valuation = fundamentalResult.components.valuation;

  // Quality: from fundamental analysis (ROE, Debt/Equity)
  const quality = fundamentalResult.components.quality;

  // Technical: from technical analysis (trend + momentum)
  const technical =
    (technicalResult.components.trend + technicalResult.components.momentum) / 2;

  // Risk: inverse of volatility (higher volatility = lower risk score)
  // Combined with debt consideration
  const volatilityRisk = technicalResult.components.volatility;
  const debtRisk = fundamentalResult.breakdown.debtEquityScore;
  const risk = (volatilityRisk + debtRisk) / 2;

  return {
    valuation: roundScore(valuation),
    quality: roundScore(quality),
    technical: roundScore(technical),
    risk: roundScore(risk),
  };
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
