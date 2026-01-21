/**
 * Fundamental Score Calculation
 * Based on P/E, P/B, P/S, ROE, Debt/Equity
 * Missing values: median imputation or neutral score (50)
 */

import { normalizeToRange, roundScore } from './normalize';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type { FundamentalThresholds } from './scoring_config';

export interface FundamentalScoreResult {
  total: number;
  components: {
    valuation: number;
    quality: number;
  };
  breakdown: {
    peScore: number;
    pbScore: number;
    psScore: number;
    roeScore: number;
    debtEquityScore: number;
  };
  valuationInputCoverage?: {
    present: string[];
    missing: string[];
    strategy_used: 'full' | 'partial' | 'fallback_neutral';
  };
  missingFields: string[];
  assumptions: string[];
}

// Thresholds for scoring (based on spec)
export const DEFAULT_THRESHOLDS: FundamentalThresholds = {
  pe: { low: 15, high: 30 }, // Lower is better
  pb: { low: 1.5, high: 5 }, // Lower is better
  ps: { low: 1, high: 5 }, // Lower is better
  // Quality thresholds calibrated for Russell 2000 Small Caps (Jan 2026)
  // ROE: Top quartile ~25-30%, so high=35% for differentiation
  // D/E: Most profitable small caps have <0.3, so low=0.2 for spread
  roe: { low: 8, high: 35 }, // Higher is better (%)
  debtEquity: { low: 0.2, high: 1.5 }, // Lower is better
};

export function calculateFundamentalScore(
  data: FundamentalsData | null,
  universeMediData?: Partial<FundamentalsData>,
  thresholds: FundamentalThresholds = DEFAULT_THRESHOLDS
): FundamentalScoreResult {
  const missingFields: string[] = [];
  const assumptions: string[] = [];
  const present: string[] = [];
  const missingMetrics: string[] = [];

  if (!data) {
    return {
      total: 50,
      components: { valuation: 50, quality: 50 },
      breakdown: {
        peScore: 50,
        pbScore: 50,
        psScore: 50,
        roeScore: 50,
        debtEquityScore: 50,
      },
      missingFields: ['all_fundamentals'],
      assumptions: ['No fundamental data available - using neutral score'],
    };
  }

  // Impute missing values with median or neutral
  const impute = (
    value: number | null,
    median: number | null | undefined,
    fieldName: string
  ): number => {
    if (value !== null && !isNaN(value)) {
      present.push(fieldName);
      return value;
    }

    missingMetrics.push(fieldName);
    missingFields.push(fieldName);

    if (median !== null && median !== undefined && !isNaN(median)) {
      assumptions.push(`${fieldName}: imputed with universe median (${median.toFixed(2)})`);
      return median;
    }

    assumptions.push(`${fieldName}: missing, using neutral score`);
    return NaN; // Will result in score of 50
  };

  const pe = impute(data.peRatio, universeMediData?.peRatio, 'peRatio');
  const pb = impute(data.pbRatio, universeMediData?.pbRatio, 'pbRatio');
  const ps = impute(data.psRatio, universeMediData?.psRatio, 'psRatio');
  const roe = impute(data.roe, universeMediData?.roe, 'roe');
  const debtEquity = impute(data.debtToEquity, universeMediData?.debtToEquity, 'debtToEquity');

  // Calculate individual scores
  const peScore = normalizeToRange(pe, thresholds.pe, true);
  const pbScore = normalizeToRange(pb, thresholds.pb, true);
  const psScore = normalizeToRange(ps, thresholds.ps, true);
  const roeScore = normalizeToRange(roe, thresholds.roe, false);

  // Special handling for Debt/Equity: negative D/E indicates negative equity
  // (company has more liabilities than assets) which is a SEVERE problem.
  // Score 0 for negative D/E, otherwise use normal normalization.
  let debtEquityScore: number;
  if (debtEquity !== null && !isNaN(debtEquity) && debtEquity < 0) {
    debtEquityScore = 0; // Negative equity = worst possible score
    assumptions.push('debtToEquity: negative value indicates negative equity - scored 0');
  } else {
    debtEquityScore = normalizeToRange(debtEquity, thresholds.debtEquity, true);
  }

  // Valuation pillar: P/E, P/B, P/S
  const valuationComponents: Array<{ key: 'pe' | 'pb' | 'ps'; score: number; present: boolean }> = [
    { key: 'pe', score: peScore, present: !missingMetrics.includes('peRatio') },
    { key: 'pb', score: pbScore, present: !missingMetrics.includes('pbRatio') },
    { key: 'ps', score: psScore, present: !missingMetrics.includes('psRatio') },
  ];

  const presentComponents = valuationComponents.filter((c) => c.present);
  let valuation = 50;
  let strategy: 'full' | 'partial' | 'fallback_neutral' = 'fallback_neutral';

  if (presentComponents.length === 3) {
    valuation = (peScore + pbScore + psScore) / 3;
    strategy = 'full';
  } else if (presentComponents.length > 0) {
    const weight = 1 / presentComponents.length;
    valuation = presentComponents.reduce((sum, c) => sum + c.score * weight, 0);
    strategy = 'partial';
    const missingList = valuationComponents.filter((c) => !c.present).map((c) => c.key.toUpperCase());
    assumptions.push(`valuation: computed with partial inputs (missing ${missingList.join(', ')})`);
    if (presentComponents.length === 1) {
      assumptions.push('valuation: single-input - treat as low confidence');
    }
  } else {
    valuation = 50;
    strategy = 'fallback_neutral';
    assumptions.push('value: insufficient valuation inputs (PE/PB/PS missing); fallback=neutral');
  }

  // Quality pillar: ROE, Debt/Equity
  const quality = (roeScore + debtEquityScore) / 2;

  // Total fundamental score (equal weight valuation and quality)
  const total = (valuation + quality) / 2;

  return {
    total: roundScore(total),
    components: {
      valuation: roundScore(valuation),
      quality: roundScore(quality),
    },
    breakdown: {
      peScore: roundScore(peScore),
      pbScore: roundScore(pbScore),
      psScore: roundScore(psScore),
      roeScore: roundScore(roeScore),
      debtEquityScore: roundScore(debtEquityScore),
    },
    valuationInputCoverage: {
      present: valuationComponents.filter((c) => c.present).map((c) => c.key),
      missing: valuationComponents.filter((c) => !c.present).map((c) => c.key),
      strategy_used: strategy,
    },
    missingFields,
    assumptions,
  };
}
