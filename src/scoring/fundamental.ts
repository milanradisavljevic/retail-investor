/**
 * Fundamental Score Calculation
 * Based on P/E, P/B, P/S, ROE, Debt/Equity
 * Missing values: median imputation or neutral score (50)
 */

import { normalizeToRange, roundScore } from './normalize';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type { FundamentalThresholds } from './scoring_config';
import { calculatePEG } from './formulas/peg';
import { calculatePiotroskiFScore, mapFundamentalsToPiotroski, type PiotroskiResult } from './formulas/piotroski';

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
    roaScore: number;
    debtEquityScore: number;
    grossMarginScore: number;
    fcfYieldScore: number;
    pegScore?: number;
    pegRatio?: number | null;
  };
  piotroski?: PiotroskiResult;
  valuationInputCoverage?: {
    present: string[];
    missing: string[];
    strategy_used: 'full' | 'partial' | 'fallback_neutral' | 'insufficient_data';
  };
  qualityInputCoverage?: {
    present: string[];
    missing: string[];
  };
  missingFields: string[];
  assumptions: string[];
  isInsufficient?: boolean;
}

// Thresholds for scoring (based on spec)
export const DEFAULT_THRESHOLDS: FundamentalThresholds = {
  pe: { low: 15, high: 30 },
  pb: { low: 1.5, high: 5 },
  ps: { low: 1, high: 5 },
  roe: { low: 8, high: 35 },
  roa: { low: 3, high: 15 },
  debtEquity: { low: 0.2, high: 1.5 },
  grossMargin: { low: 20, high: 60 },
  fcfYield: { low: 2, high: 10 },
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function resolveEarningsGrowthDecimal(data: FundamentalsData): number | null {
  const raw = data.raw as Record<string, unknown> | undefined;
  const rawBasic = raw?.basicFinancials as Record<string, unknown> | undefined;

  const rawCandidates = [
    toFiniteNumber(raw?.earningsGrowthTTM),
    toFiniteNumber(rawBasic?.earningsGrowth),
    toFiniteNumber(raw?.earningsGrowth),
  ];

  for (const candidate of rawCandidates) {
    if (candidate !== null) return candidate;
  }

  const fallback = toFiniteNumber(data.earningsGrowth);
  if (fallback === null) return null;

  // Preserve decimal values (0.15 => 15%) while still accepting clear %-style fallbacks (e.g. 15).
  return Math.abs(fallback) > 3 ? fallback / 100 : fallback;
}

export function calculateFundamentalScore(
  data: FundamentalsData | null,
  universeMediData?: Partial<FundamentalsData>,
  thresholds: FundamentalThresholds = DEFAULT_THRESHOLDS
): FundamentalScoreResult {
  const missingFields: string[] = [];
  const assumptions: string[] = [];
  const present: string[] = [];
  const missingMetrics: string[] = [];
  const isGarpPreset = (process.env.SCORING_PRESET || process.env.PRESET || '').toLowerCase() === 'garp';

  if (!data) {
    return {
      total: 0,
      components: { valuation: 0, quality: 0 },
      breakdown: {
        peScore: 0,
        pbScore: 0,
        psScore: 0,
        roeScore: 0,
        roaScore: 0,
        debtEquityScore: 0,
        grossMarginScore: 0,
        fcfYieldScore: 0,
      },
      missingFields: ['all_fundamentals'],
      assumptions: ['No fundamental data available - insufficient data'],
      isInsufficient: true,
    };
  }

  // Impute missing values with median or neutral
  const impute = (
    value: number | null,
    median: number | null | undefined,
    fieldName: string
  ): { value: number; isImputed: boolean; isMissing: boolean } => {
    if (value !== null && !isNaN(value)) {
      present.push(fieldName);
      return { value, isImputed: false, isMissing: false };
    }

    missingMetrics.push(fieldName);
    missingFields.push(fieldName);

    if (median !== null && median !== undefined && !isNaN(median)) {
      assumptions.push(`${fieldName}: imputed with universe median (${median.toFixed(2)})`);
      return { value: median, isImputed: true, isMissing: false };
    }

    assumptions.push(`${fieldName}: missing, using neutral score`);
    return { value: NaN, isImputed: false, isMissing: true }; // Will result in score of 50 via normalizeToRange if used
  };

  const peObj = impute(data.peRatio, universeMediData?.peRatio, 'peRatio');
  const pbObj = impute(data.pbRatio, universeMediData?.pbRatio, 'pbRatio');
  const psObj = impute(data.psRatio, universeMediData?.psRatio, 'psRatio');
  const roeObj = impute(data.roe, universeMediData?.roe, 'roe');
  const roaObj = impute(data.roa, universeMediData?.roa, 'roa');
  const debtEquityObj = impute(data.debtToEquity, universeMediData?.debtToEquity, 'debtToEquity');
  const grossMarginObj = impute(data.grossMargin, universeMediData?.grossMargin, 'grossMargin');

  // Calculate individual scores
  // Note: normalizeToRange returns 50 for NaN. We only use these scores if !isMissing.
  const peScore = normalizeToRange(peObj.value, thresholds.pe, true);
  const pbScore = normalizeToRange(pbObj.value, thresholds.pb, true);
  const psScore = normalizeToRange(psObj.value, thresholds.ps, true);
  const roeScore = normalizeToRange(roeObj.value, thresholds.roe, false);
  const roaScore = normalizeToRange(roaObj.value, thresholds.roa, false);
  const grossMarginScore = normalizeToRange(grossMarginObj.value, thresholds.grossMargin, false);

  // Special handling for Debt/Equity
  let debtEquityScore: number;
  if (!debtEquityObj.isMissing && debtEquityObj.value < 0) {
    debtEquityScore = 0; // Negative equity = worst possible score
    assumptions.push('debtToEquity: negative value indicates negative equity - scored 0');
  } else {
    debtEquityScore = normalizeToRange(debtEquityObj.value, thresholds.debtEquity, true);
  }

  // FCF Yield = free cash flow / market cap (%)
  const freeCashFlow = data.freeCashFlow ?? null;
  const marketCap = data.marketCap ?? null;
  let fcfYield: number | null = null;
  if (freeCashFlow !== null && marketCap !== null && marketCap > 0) {
    fcfYield = (freeCashFlow / marketCap) * 100;
  }

  let fcfYieldScore: number;
  let fcfYieldPresent: boolean;
  if (fcfYield !== null) {
    present.push('fcfYield');
    if (fcfYield < 0) {
      fcfYieldScore = 0;
      assumptions.push('fcfYield: negative FCF (cash burner) - scored 0');
    } else {
      fcfYieldScore = normalizeToRange(fcfYield, thresholds.fcfYield, false);
    }
    fcfYieldPresent = true;
  } else {
    missingFields.push('fcfYield');
    missingMetrics.push('fcfYield');
    fcfYieldScore = 50;
    fcfYieldPresent = false;
    assumptions.push('fcfYield: missing (freeCashFlow or marketCap unavailable)');
  }

  // Valuation pillar: P/E, P/B, P/S, FCF Yield
  // We only consider a component "present" if it wasn't missing (original or imputed)
  const valuationComponents = [
    { key: 'pe', score: peScore, present: !peObj.isMissing },
    { key: 'pb', score: pbScore, present: !pbObj.isMissing },
    { key: 'ps', score: psScore, present: !psObj.isMissing },
    { key: 'fcfYield', score: fcfYieldScore, present: fcfYieldPresent },
  ];

  const presentValuation = valuationComponents.filter((c) => c.present);
  let valuation = 0;
  let strategy: 'full' | 'partial' | 'fallback_neutral' | 'insufficient_data' = 'insufficient_data';
  let isInsufficient = false;

  if (presentValuation.length >= 2) {
    // We have at least 2 valuation metrics. Average them.
    const weight = 1 / presentValuation.length;
    valuation = presentValuation.reduce((sum, c) => sum + c.score * weight, 0);
    strategy = presentValuation.length === valuationComponents.length ? 'full' : 'partial';
    
    const missingList = valuationComponents.filter((c) => !c.present).map((c) => c.key.toUpperCase());
    if (missingList.length > 0) {
        assumptions.push(`valuation: computed with partial inputs (missing ${missingList.join(', ')})`);
    }
  } else {
    // Insufficient data (< 2 metrics)
    valuation = 0;
    strategy = 'insufficient_data';
    assumptions.push('value: insufficient valuation inputs (< 2 available); score=0');
    isInsufficient = true;
  }

  const pegResult = isGarpPreset
    ? calculatePEG(data.peRatio, resolveEarningsGrowthDecimal(data))
    : null;
  if (pegResult) {
    valuation = valuation * 0.7 + pegResult.pegScore * 0.3;
    if (pegResult.skipped && pegResult.reason) {
      assumptions.push(`peg: ${pegResult.reason} (neutral score=50)`);
    }
  }

  // Quality pillar: ROE, ROA, Debt/Equity, Gross Margin (4 metrics)
  const qualityComponents = [
      { key: 'roe', score: roeScore, present: !roeObj.isMissing },
      { key: 'roa', score: roaScore, present: !roaObj.isMissing },
      { key: 'de', score: debtEquityScore, present: !debtEquityObj.isMissing },
      { key: 'grossMargin', score: grossMarginScore, present: !grossMarginObj.isMissing }
  ];
  const presentQuality = qualityComponents.filter(c => c.present);
  
  let quality = 0;
  if (presentQuality.length >= 2) {
       const weight = 1 / presentQuality.length;
       quality = presentQuality.reduce((sum, c) => sum + c.score * weight, 0);
  } else {
       quality = 0;
       assumptions.push('quality: insufficient inputs (< 2 available); score=0');
  }

  // Piotroski F-Score calculation (requires raw data with prior year fields)
  let piotroski: PiotroskiResult | undefined;
  if (data.raw) {
    const piotroskiInputs = mapFundamentalsToPiotroski(data.raw as Record<string, unknown>);
    if (piotroskiInputs.netIncome !== null || piotroskiInputs.operatingCashFlow !== null) {
      piotroski = calculatePiotroskiFScore(piotroskiInputs);
      if (piotroski.maxScore < 9) {
        assumptions.push(`piotroski: partial data (${9 - piotroski.maxScore}/9 checks skipped)`);
      }
    }
  }

  // Total fundamental score
  // If insufficient, total is 0.
  const total = isInsufficient ? 0 : (valuation + quality) / 2;

  return {
    total: roundScore(total),
    components: {
      valuation: roundScore(valuation),
      quality: roundScore(quality),
    },
    breakdown: {
      peScore: !peObj.isMissing ? roundScore(peScore) : 0,
      pbScore: !pbObj.isMissing ? roundScore(pbScore) : 0,
      psScore: !psObj.isMissing ? roundScore(psScore) : 0,
      roeScore: !roeObj.isMissing ? roundScore(roeScore) : 0,
      roaScore: !roaObj.isMissing ? roundScore(roaScore) : 0,
      debtEquityScore: !debtEquityObj.isMissing ? roundScore(debtEquityScore) : 0,
      grossMarginScore: !grossMarginObj.isMissing ? roundScore(grossMarginScore) : 0,
      fcfYieldScore: fcfYieldPresent ? roundScore(fcfYieldScore) : 0,
      ...(pegResult
        ? {
            pegScore: roundScore(pegResult.pegScore),
            pegRatio: pegResult.peg,
          }
        : {}),
    },
    piotroski,
    valuationInputCoverage: {
      present: presentValuation.map((c) => c.key),
      missing: valuationComponents.filter((c) => !c.present).map((c) => c.key),
      strategy_used: strategy,
    },
    qualityInputCoverage: {
      present: presentQuality.map((c) => c.key),
      missing: qualityComponents.filter((c) => !c.present).map((c) => c.key),
    },
    missingFields,
    assumptions,
    isInsufficient
  };
}
