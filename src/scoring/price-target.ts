/**
 * Price Target Model
 *
 * Calculates fair value, target prices, and holding period recommendations
 * based on sector-relative multiples and scoring confidence.
 *
 * Model based on:
 * - Multiple-blend fair value (PE, PB, PS weighted average)
 * - Confidence-adjusted target prices
 * - Volatility-aware holding periods
 */

import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('price-target');

// ============================================================================
// Types
// ============================================================================

export interface PriceTarget {
  currentPrice: number;
  fairValue: number;
  upsidePct: number;

  targetBuyPrice: number;
  targetSellPrice: number;
  expectedReturnPct: number;

  holdingPeriodMonths: number;
  targetDate: string;

  confidence: 'high' | 'medium' | 'low';
  requiresDeepAnalysis: boolean;
  deepAnalysisReasons: string[];
}

export interface StockMetrics {
  symbol: string;
  currentPrice: number;
  eps: number | null;
  bookValuePerShare: number | null;
  revenuePerShare: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  psRatio: number | null;
  sector: string | null;
  industry: string | null;
}

export interface SectorMedians {
  medianPE: number | null;
  medianPB: number | null;
  medianPS: number | null;
  sampleSize: number;
}

export interface PriceTargetConfig {
  minSectorSampleSize: number;
  defaultMedians: {
    pe: number;
    pb: number;
    ps: number;
    sampleSize: number;
  };
}

export interface PriceTargetDiagnostics {
  inputs: {
    pe_ratio: number | null;
    pb_ratio: number | null;
    ps_ratio: number | null;
    eps: number | null;
    book_value_per_share: number | null;
    revenue_per_share: number | null;
    sector: string | null;
    industry: string | null;
  };
  medians: {
    source: 'sector' | 'global';
    fallback_reason?: 'sector_sample_too_small' | 'missing_sector';
    sector: {
      median_pe: number | null;
      median_pb: number | null;
      median_ps: number | null;
      sample_size: number | null;
    };
    global: {
      median_pe: number | null;
      median_pb: number | null;
      median_ps: number | null;
      sample_size: number | null;
    };
  };
  components: {
    pe?: {
      included: boolean;
      weight: number;
      value?: number;
      clamped?: boolean;
      reason?: string;
    };
    pb?: {
      included: boolean;
      weight: number;
      value?: number;
      clamped?: boolean;
      reason?: string;
    };
    ps?: {
      included: boolean;
      weight: number;
      value?: number;
      clamped?: boolean;
      reason?: string;
    };
  };
  fair_value: {
    raw: number | null;
    bounded: number | null;
    min: number;
    max: number;
    was_clamped: boolean;
  };
}

export interface MonteCarloInputAssumption {
  base: number;
  std_dev: number;
  distribution: string;
  source: string;
}

export interface MonteCarloInputAssumptions {
  revenue_growth: MonteCarloInputAssumption;
  operating_margin: MonteCarloInputAssumption;
  discount_rate: MonteCarloInputAssumption;
}

export interface MonteCarloDiagnostics {
  value_p10: number;
  value_p50: number;
  value_p90: number;
  prob_value_gt_price: number;
  mos_15_prob: number;
  iterations_run: number;
  input_assumptions: MonteCarloInputAssumptions;
  data_quality: Record<string, any>;
  confidence: number;
}

export interface PriceTargetResult {
  target: PriceTarget | null;
  diagnostics: PriceTargetDiagnostics | null;
  monteCarlo: MonteCarloDiagnostics | null;
}

export interface ScoringContext {
  totalScore: number;
  volatilityScore: number;
  dataQualityScore: number;
  pillarSpread: number;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_RETURN_THRESHOLD = 0.08; // 8% minimum expected return
const FAIR_VALUE_MIN_FACTOR = 0.1; // Fair value should not be below 10% of current price
const FAIR_VALUE_MAX_FACTOR = 5.0; // Fair value should not exceed 500% of current price
const MIN_RELATIVE_MULTIPLE_FACTOR = 0.35; // Floor to avoid absurd downsides from outlier multiples (~-65%)
const MAX_RELATIVE_MULTIPLE_FACTOR = 2.5;  // Cap single-component upside contribution (~+150%)

// ============================================================================
// Fair Value Calculation
// ============================================================================

/**
 * Calculate fair value using a weighted blend of multiple-based valuations.
 *
 * Formula:
 * Fair Value = 0.40 × (EPS × Sector_Median_PE)
 *            + 0.30 × (Book_Value_per_Share × Sector_Median_PB)
 *            + 0.30 × (Revenue_per_Share × Sector_Median_PS)
 *
 * If a component is missing, weights are redistributed to available components.
 */
export function calculateFairValue(
  metrics: StockMetrics,
  sectorMedians: SectorMedians
): { fairValue: number | null; components: PriceTargetDiagnostics['components']; rawComponents: Array<{ key: 'pe' | 'pb' | 'ps'; value: number; weight: number; clamped: boolean }>; normalizedWeights: Record<string, number> } {
  const components: PriceTargetDiagnostics['components'] = {};
  const rawComponents: Array<{ key: 'pe' | 'pb' | 'ps'; value: number; weight: number; clamped: boolean }> = [];

  const registerMissing = (key: 'pe' | 'pb' | 'ps', reason: string, weight: number) => {
    components[key] = { included: false, weight, reason, value: undefined };
  };

  const pushComponent = (
    key: 'pe' | 'pb' | 'ps',
    baseValue: number,
    companyMultiple: number | null,
    sectorMedian: number | null,
    weight: number
  ) => {
    if (!metrics.currentPrice || !sectorMedian || !companyMultiple || companyMultiple <= 0) {
      rawComponents.push({ key, value: baseValue, weight, clamped: false });
      components[key] = { included: true, weight, value: baseValue, clamped: false };
      return;
    }

    const relative = sectorMedian / companyMultiple;
    const clamped = clampRelativeMultiple(relative);
    const clampedValue = clamped === relative ? baseValue : metrics.currentPrice * clamped;
    const wasClamped = clamped !== relative;
    rawComponents.push({ key, value: clampedValue, weight, clamped: wasClamped });
    components[key] = {
      included: true,
      weight,
      value: clampedValue,
      clamped: wasClamped,
      reason: wasClamped ? 'Component contribution clamped to avoid outlier multiples' : undefined,
    };
  };

  // PE-based valuation (40% weight)
  if (
    metrics.eps !== null &&
    metrics.eps > 0 &&
    sectorMedians.medianPE !== null &&
    sectorMedians.medianPE > 0
  ) {
    pushComponent('pe', metrics.eps * sectorMedians.medianPE, metrics.peRatio, sectorMedians.medianPE, 0.4);
  } else {
    registerMissing('pe', 'Missing EPS or sector PE median', 0.4);
  }

  // PB-based valuation (30% weight)
  if (
    metrics.bookValuePerShare !== null &&
    metrics.bookValuePerShare > 0 &&
    sectorMedians.medianPB !== null &&
    sectorMedians.medianPB > 0
  ) {
    pushComponent(
      'pb',
      metrics.bookValuePerShare * sectorMedians.medianPB,
      metrics.pbRatio,
      sectorMedians.medianPB,
      0.3
    );
  } else {
    registerMissing('pb', 'Missing Book Value or sector PB median', 0.3);
  }

  // PS-based valuation (30% weight)
  if (
    metrics.revenuePerShare !== null &&
    metrics.revenuePerShare > 0 &&
    sectorMedians.medianPS !== null &&
    sectorMedians.medianPS > 0
  ) {
    pushComponent(
      'ps',
      metrics.revenuePerShare * sectorMedians.medianPS,
      metrics.psRatio,
      sectorMedians.medianPS,
      0.3
    );
  } else {
    registerMissing('ps', 'Missing Revenue or sector PS median', 0.3);
  }

  const usableComponents = rawComponents.filter((c) => components[c.key]?.included);
  if (usableComponents.length === 0) {
    logger.debug({ symbol: metrics.symbol }, 'No valid components for fair value calculation');
    return { fairValue: null, components, rawComponents: [], normalizedWeights: {} };
  }

  const totalWeight = usableComponents.reduce((sum, c) => sum + c.weight, 0);
  const normalizedWeights: Record<string, number> = {};
  const fairValue = usableComponents.reduce((sum, c) => {
    const w = c.weight / totalWeight;
    normalizedWeights[c.key] = w;
    return sum + c.value * w;
  }, 0);

  logger.debug(
    { symbol: metrics.symbol, fairValue, components: usableComponents.length },
    'Calculated fair value'
  );

  return { fairValue, components, rawComponents: usableComponents, normalizedWeights };
}

// ============================================================================
// Holding Period Calculation
// ============================================================================

/**
 * Calculate recommended holding period based on upside potential and volatility.
 *
 * Logic:
 * - Larger upside = longer horizon (more time to realize)
 * - Higher volatility = shorter horizon (faster price movements)
 *
 * Returns holding period in months (3-18 range).
 */
export function calculateHoldingPeriod(
  upsidePct: number,
  volatilityScore: number
): number {
  // Base horizon based on upside
  let baseMonths: number;
  if (upsidePct >= 0.30) {
    baseMonths = 12;
  } else if (upsidePct >= 0.20) {
    baseMonths = 9;
  } else if (upsidePct >= 0.10) {
    baseMonths = 6;
  } else {
    baseMonths = 3;
  }

  // Volatility adjustment (score 0-100, higher = less volatile)
  let adjustment = 0;
  if (volatilityScore < 35) {
    adjustment = -3; // High volatility: shorter hold
  } else if (volatilityScore > 70) {
    adjustment = 3;  // Low volatility: can hold longer
  }

  return Math.max(3, Math.min(18, baseMonths + adjustment));
}

/**
 * Calculate target date based on holding period.
 */
export function calculateTargetDate(holdingMonths: number): string {
  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() + holdingMonths);
  return targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================================================
// Confidence Level Calculation
// ============================================================================

/**
 * Determine confidence level for price target.
 *
 * High Confidence when:
 * - Data Quality > 70
 * - Upside between 5-30% (realistic)
 * - Pillar Spread < 25 (consistent valuation)
 *
 * Low Confidence when:
 * - Data Quality < 50
 * - Upside > 50% or < 0% (unrealistic/overvalued)
 * - Pillar Spread > 40 (inconsistent)
 */
export function calculateConfidence(
  dataQualityScore: number,
  upsidePct: number,
  pillarSpread: number
): 'high' | 'medium' | 'low' {
  // Low confidence conditions
  if (
    dataQualityScore < 50 ||
    Math.abs(upsidePct) > 0.50 ||
    pillarSpread > 40
  ) {
    return 'low';
  }

  // High confidence conditions
  if (
    dataQualityScore > 70 &&
    upsidePct >= 0.05 &&
    upsidePct <= 0.30 &&
    pillarSpread < 25
  ) {
    return 'high';
  }

  return 'medium';
}

// ============================================================================
// Deep Analysis Flag
// ============================================================================

/**
 * Determine if LLM deep analysis is recommended.
 */
export function requiresDeepAnalysis(
  upsidePct: number,
  confidence: 'high' | 'medium' | 'low',
  volatilityScore: number,
  dataQualityScore: number
): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (upsidePct > 0.25) {
    reasons.push('High upside (>25%) requires growth validation');
  }
  if (upsidePct < 0) {
    reasons.push('Negative upside - potential value trap');
  }
  if (confidence === 'low') {
    reasons.push('Low price target confidence');
  }
  if (volatilityScore < 35) {
    reasons.push('High volatility - event risk possible');
  }
  if (dataQualityScore < 60) {
    reasons.push('Limited data quality - verify fundamentals');
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

// ============================================================================
// Main Price Target Calculation
// ============================================================================

/**
 * Calculate complete price target for a stock.
 *
 * @param options.computeMonteCarlo - Enable Monte Carlo fair value calculation
 * @param options.isTop30 - Whether this stock is in Top 30 (required for Monte Carlo)
 */
export async function calculatePriceTargets(
  metrics: StockMetrics,
  mediansSelection: MedianSelection,
  context: ScoringContext,
  config: PriceTargetConfig,
  options?: { computeMonteCarlo?: boolean; isTop30?: boolean }
): Promise<PriceTargetResult> {
  const { currentPrice } = metrics;
  const { totalScore, volatilityScore, dataQualityScore, pillarSpread } = context;
  const sectorMedians = mediansSelection.medians;

  if (!currentPrice || currentPrice <= 0) {
    logger.warn({ symbol: metrics.symbol }, 'Invalid current price');
    return { target: null, diagnostics: null, monteCarlo: null };
  }

  // Calculate fair value
  const fairValueResult = calculateFairValue(metrics, sectorMedians);
  let fairValue = fairValueResult.fairValue;
  if (fairValue === null || fairValue <= 0) {
    logger.debug({ symbol: metrics.symbol }, 'Could not calculate fair value');
    return {
      target: null,
      diagnostics: {
        inputs: extractDiagnosticsInputs(metrics),
        medians: buildMediansDiagnostics(mediansSelection),
        components: fairValueResult.components,
        fair_value: {
          raw: fairValue,
          bounded: null,
          min: 0,
          max: 0,
          was_clamped: false,
        },
      },
      monteCarlo: null,
    };
  }

  // Apply sanity bounds: Fair Value should stay between 10% and 500% of current price
  const minFairValue = currentPrice * FAIR_VALUE_MIN_FACTOR;
  const maxFairValue = currentPrice * FAIR_VALUE_MAX_FACTOR;
  const outOfBounds = fairValue < minFairValue || fairValue > maxFairValue;
  const unboundedFairValue = fairValue;
  fairValue = Math.max(minFairValue, Math.min(maxFairValue, fairValue));

  if (unboundedFairValue !== fairValue) {
    logger.debug(
      {
        symbol: metrics.symbol,
        unboundedFairValue,
        boundedFairValue: fairValue,
        minFairValue,
        maxFairValue,
      },
      'Fair value clamped to 10%-500% sanity bounds'
    );
  }

  // Calculate upside
  const upsidePct = (fairValue - currentPrice) / currentPrice;

  // Confidence factor based on total score (0.0 - 1.0)
  const confidenceFactor = totalScore / 100;

  // Target Sell Price (confidence-adjusted)
  let targetSellPrice: number;
  if (upsidePct > 0) {
    // Positive upside: score-adjusted target
    targetSellPrice = currentPrice * (1 + upsidePct * confidenceFactor);
  } else {
    // Negative upside (overvalued): minimum 5% target
    targetSellPrice = currentPrice * 1.05;
  }

  // Ensure minimum return threshold
  targetSellPrice = Math.max(targetSellPrice, currentPrice * (1 + MIN_RETURN_THRESHOLD));

  // Target Buy Price (current price as entry point)
  const targetBuyPrice = currentPrice;

  // Expected return
  const expectedReturnPct = (targetSellPrice - targetBuyPrice) / targetBuyPrice;

  // Holding period and target date
  const holdingPeriodMonths = calculateHoldingPeriod(upsidePct, volatilityScore);
  const targetDate = calculateTargetDate(holdingPeriodMonths);

  // Confidence level
  let confidence = calculateConfidence(dataQualityScore, upsidePct, pillarSpread);
  if (mediansSelection.source === 'global' && mediansSelection.fallbackReason === 'sector_sample_too_small') {
    confidence = downgradeConfidence(confidence);
  }

  // Deep analysis flag
  const deepAnalysis = requiresDeepAnalysis(
    upsidePct,
    confidence,
    volatilityScore,
    dataQualityScore
  );
  const deepAnalysisReasons = [...deepAnalysis.reasons];

  if (outOfBounds) {
    confidence = 'low';
    deepAnalysisReasons.push('Fair value outside 10%-500% of current price');
  }

  if (mediansSelection.source === 'global' && mediansSelection.fallbackReason) {
    deepAnalysisReasons.push('Sector medians fallback: ' + mediansSelection.fallbackReason);
  }

  const priceTarget: PriceTarget = {
    currentPrice,
    fairValue: Math.round(fairValue * 100) / 100,
    upsidePct: Math.round(upsidePct * 10000) / 10000, // 4 decimal places
    targetBuyPrice: Math.round(targetBuyPrice * 100) / 100,
    targetSellPrice: Math.round(targetSellPrice * 100) / 100,
    expectedReturnPct: Math.round(expectedReturnPct * 10000) / 10000,
    holdingPeriodMonths,
    targetDate,
    confidence,
    requiresDeepAnalysis: deepAnalysis.required || deepAnalysisReasons.length > 0,
    deepAnalysisReasons,
  };

  logger.debug(
    {
      symbol: metrics.symbol,
      fairValue: priceTarget.fairValue,
      upsidePct: priceTarget.upsidePct,
      confidence: priceTarget.confidence,
    },
    'Calculated price target'
  );

  // Monte Carlo fair value distribution (Top 30 stocks with deep analysis only)
  let monteCarlo: MonteCarloDiagnostics | null = null;
  if (
    options?.computeMonteCarlo !== false &&
    priceTarget.requiresDeepAnalysis &&
    options?.isTop30
  ) {
    logger.debug({ symbol: metrics.symbol }, 'Computing Monte Carlo fair value distribution');
    monteCarlo = await calculateMonteCarloFairValue(metrics.symbol);

    // Enhance confidence with Monte Carlo probability metrics
    if (monteCarlo && monteCarlo.confidence >= 0.6) {
      const enhancedConfidence = deriveConfidenceFromMonteCarlo(
        priceTarget.confidence,
        monteCarlo.prob_value_gt_price,
        monteCarlo.mos_15_prob
      );

      if (enhancedConfidence !== priceTarget.confidence) {
        logger.debug(
          {
            symbol: metrics.symbol,
            baseConfidence: priceTarget.confidence,
            enhancedConfidence,
            probValueGtPrice: monteCarlo.prob_value_gt_price,
            mos15Prob: monteCarlo.mos_15_prob,
          },
          'Confidence enhanced from Monte Carlo'
        );
        priceTarget.confidence = enhancedConfidence;
      }
    }
  }

  return {
    target: priceTarget,
    diagnostics: {
      inputs: extractDiagnosticsInputs(metrics),
      medians: buildMediansDiagnostics(mediansSelection),
      components: fairValueResult.components,
      fair_value: {
        raw: Math.round(unboundedFairValue * 100) / 100,
        bounded: priceTarget.fairValue,
        min: Math.round(minFairValue * 100) / 100,
        max: Math.round(maxFairValue * 100) / 100,
        was_clamped: outOfBounds,
      },
    },
    monteCarlo,
  };
}

// ============================================================================
// Sector Median Calculation
// ============================================================================

/**
 * Calculate sector medians from a universe of stocks.
 * Returns a map of sector name -> SectorMedians.
 */
export interface SectorMedianSet {
  sectors: Map<string, SectorMedians>;
  global: SectorMedians;
}

export interface MedianSelection {
  medians: SectorMedians;
  source: 'sector' | 'global';
  fallbackReason?: 'sector_sample_too_small' | 'missing_sector';
  sectorSampleSize: number | null;
  globalMedians: SectorMedians;
}

export function calculateSectorMedians(
  stocksData: StockMetrics[],
  config: PriceTargetConfig
): SectorMedianSet {
  const sectorGroups = new Map<string, StockMetrics[]>();
  const globalPe: number[] = [];
  const globalPb: number[] = [];
  const globalPs: number[] = [];

  // Group stocks by sector
  for (const stock of stocksData) {
    const sector = stock.sector ?? 'Unknown';
    if (!sectorGroups.has(sector)) {
      sectorGroups.set(sector, []);
    }
    sectorGroups.get(sector)!.push(stock);
  }

  const sectorMedians = new Map<string, SectorMedians>();
  const pushGlobals = (stock: StockMetrics) => {
    if (stock.peRatio && stock.peRatio > 0 && stock.peRatio < 200) globalPe.push(stock.peRatio);
    if (stock.pbRatio && stock.pbRatio > 0 && stock.pbRatio < 50) globalPb.push(stock.pbRatio);
    if (stock.psRatio && stock.psRatio > 0 && stock.psRatio < 50) globalPs.push(stock.psRatio);
  };

  for (const [sector, stocks] of sectorGroups) {
    // Collect valid PE, PB, PS values
    const peValues = stocks
      .map((s) => s.peRatio)
      .filter((v): v is number => v !== null && v > 0 && v < 200);
    const pbValues = stocks
      .map((s) => s.pbRatio)
      .filter((v): v is number => v !== null && v > 0 && v < 50);
    const psValues = stocks
      .map((s) => s.psRatio)
      .filter((v): v is number => v !== null && v > 0 && v < 50);

    const filteredPe = filterOutliersIQR(peValues);
    const filteredPb = filterOutliersIQR(pbValues);
    const filteredPs = filterOutliersIQR(psValues);

    stocks.forEach(pushGlobals);

    if (
      filteredPe.length !== peValues.length ||
      filteredPb.length !== pbValues.length ||
      filteredPs.length !== psValues.length
    ) {
      logger.debug(
        {
          sector,
          peTrimmed: peValues.length - filteredPe.length,
          pbTrimmed: pbValues.length - filteredPb.length,
          psTrimmed: psValues.length - filteredPs.length,
        },
        'Trimmed outlier multiples for sector medians'
      );
    }

    const medians: SectorMedians = {
      medianPE: calculateMedian(filteredPe),
      medianPB: calculateMedian(filteredPb),
      medianPS: calculateMedian(filteredPs),
      sampleSize: stocks.length,
    };

    sectorMedians.set(sector, medians);
  }

  const globalMedians: SectorMedians = {
    medianPE: calculateMedian(filterOutliersIQR(globalPe)) ?? config.defaultMedians.pe,
    medianPB: calculateMedian(filterOutliersIQR(globalPb)) ?? config.defaultMedians.pb,
    medianPS: calculateMedian(filterOutliersIQR(globalPs)) ?? config.defaultMedians.ps,
    sampleSize: Math.max(globalPe.length, globalPb.length, globalPs.length, config.defaultMedians.sampleSize),
  };

  return { sectors: sectorMedians, global: globalMedians };
}

/**
 * Get sector medians for a specific stock.
 * Falls back to universe medians if sector data unavailable.
 */
export function getSectorMediansForStock(
  stock: StockMetrics,
  sectorMedians: SectorMedianSet,
  config: PriceTargetConfig
): MedianSelection {
  const sector = stock.sector ?? 'Unknown';
  const medians = sectorMedians.sectors.get(sector);

  if (!medians) {
    return {
      medians: sectorMedians.global,
      source: 'global',
      fallbackReason: 'missing_sector',
      sectorSampleSize: 0,
      globalMedians: sectorMedians.global,
    };
  }

  if (medians.sampleSize < config.minSectorSampleSize) {
    logger.debug(
      { sector, sampleSize: medians.sampleSize, min: config.minSectorSampleSize },
      'Sector sample size too small, falling back to global medians'
    );
    return {
      medians: { ...sectorMedians.global, sampleSize: medians.sampleSize },
      source: 'global',
      fallbackReason: 'sector_sample_too_small',
      sectorSampleSize: medians.sampleSize,
      globalMedians: sectorMedians.global,
    };
  }

  return {
    medians,
    source: 'sector',
    sectorSampleSize: medians.sampleSize,
    globalMedians: sectorMedians.global,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function filterOutliersIQR(values: number[]): number[] {
  if (values.length < 4) return values;

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return sorted.filter((v) => v >= lower && v <= upper);
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function clampRelativeMultiple(relative: number): number {
  return Math.min(
    MAX_RELATIVE_MULTIPLE_FACTOR,
    Math.max(MIN_RELATIVE_MULTIPLE_FACTOR, relative)
  );
}

/**
 * Calculate pillar spread (range between min and max pillar scores).
 * High spread indicates inconsistent valuation signals.
 */
export function calculatePillarSpread(pillars: {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}): number {
  const values = [pillars.valuation, pillars.quality, pillars.technical, pillars.risk];
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max - min;
}

/**
 * Extract stock metrics from fundamentals and quote data.
 */
export function extractStockMetrics(
  symbol: string,
  currentPrice: number,
  fundamentals: {
    peRatio: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    marketCap: number | null;
  } | null,
  profile: {
    sector?: string;
    industry?: string;
    shareOutstanding?: number;
  } | null,
  financials?: {
    eps?: number | null;
    bookValuePerShare?: number | null;
    revenuePerShare?: number | null;
  } | null
): StockMetrics {
  // Derive per-share metrics from ratios if not directly provided
  let eps = financials?.eps ?? null;
  let bookValuePerShare = financials?.bookValuePerShare ?? null;
  let revenuePerShare = financials?.revenuePerShare ?? null;

  // Calculate from ratios: Price / Ratio = Per-Share Value
  if (eps === null && fundamentals?.peRatio && currentPrice) {
    eps = currentPrice / fundamentals.peRatio;
  }
  if (bookValuePerShare === null && fundamentals?.pbRatio && currentPrice) {
    bookValuePerShare = currentPrice / fundamentals.pbRatio;
  }
  if (revenuePerShare === null && fundamentals?.psRatio && currentPrice) {
    revenuePerShare = currentPrice / fundamentals.psRatio;
  }

  return {
    symbol,
    currentPrice,
    eps,
    bookValuePerShare,
    revenuePerShare,
    peRatio: fundamentals?.peRatio ?? null,
    pbRatio: fundamentals?.pbRatio ?? null,
    psRatio: fundamentals?.psRatio ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
  };
}

function extractDiagnosticsInputs(metrics: StockMetrics): PriceTargetDiagnostics['inputs'] {
  return {
    pe_ratio: metrics.peRatio,
    pb_ratio: metrics.pbRatio,
    ps_ratio: metrics.psRatio,
    eps: metrics.eps,
    book_value_per_share: metrics.bookValuePerShare,
    revenue_per_share: metrics.revenuePerShare,
    sector: metrics.sector,
    industry: metrics.industry,
  };
}

function buildMediansDiagnostics(selection: MedianSelection): PriceTargetDiagnostics['medians'] {
  return {
    source: selection.source,
    fallback_reason: selection.fallbackReason,
    sector: {
      median_pe: selection.medians.medianPE,
      median_pb: selection.medians.medianPB,
      median_ps: selection.medians.medianPS,
      sample_size: selection.sectorSampleSize,
    },
    global: {
      median_pe: selection.globalMedians.medianPE,
      median_pb: selection.globalMedians.medianPB,
      median_ps: selection.globalMedians.medianPS,
      sample_size: selection.globalMedians.sampleSize,
    },
  };
}

function downgradeConfidence(level: PriceTarget['confidence']): PriceTarget['confidence'] {
  if (level === 'high') return 'medium';
  if (level === 'medium') return 'low';
  return 'low';
}

// ============================================================================
// Monte Carlo Fair Value (Deep Analysis Enhancement)
// ============================================================================

/**
 * Calculate Monte Carlo fair value distribution using Python CLI.
 *
 * This function spawns the Python monte_carlo_cli.py script to perform
 * Monte Carlo simulation with Antithetic Variates for variance reduction.
 *
 * Used only for Top 30 stocks that require deep analysis.
 *
 * @param symbol Stock symbol
 * @param iterations Number of Monte Carlo iterations (default: 1000)
 * @param riskFreeRate Risk-free rate (default: 0.04)
 * @param marketRiskPremium Market risk premium (default: 0.055)
 * @returns MonteCarloDiagnostics or null if calculation fails
 */
async function calculateMonteCarloFairValue(
  symbol: string,
  iterations: number = 1000,
  riskFreeRate: number = 0.04,
  marketRiskPremium: number = 0.055
): Promise<MonteCarloDiagnostics | null> {
  const { spawn } = await import('child_process');
  const path = await import('path');

  return new Promise((resolve) => {
    const timeout = 30000; // 30 second timeout
    const scriptPath = path.join(process.cwd(), 'src', 'scoring', 'monte_carlo_cli.py');

    const args = [
      scriptPath,
      '--symbol', symbol,
      '--iterations', String(iterations),
      '--risk_free_rate', String(riskFreeRate),
      '--market_risk_premium', String(marketRiskPremium),
    ];

    const pythonProcess = spawn('python3', args, {
      timeout,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout);

          // Validate required fields
          if (
            typeof result.value_p10 === 'number' &&
            typeof result.value_p50 === 'number' &&
            typeof result.value_p90 === 'number' &&
            typeof result.prob_value_gt_price === 'number' &&
            typeof result.mos_15_prob === 'number' &&
            typeof result.iterations_run === 'number' &&
            result.input_assumptions &&
            typeof result.confidence === 'number'
          ) {
            resolve(result as MonteCarloDiagnostics);
          } else {
            logger.warn(`Monte Carlo result for ${symbol} missing required fields`);
            resolve(null);
          }
        } catch (err) {
          logger.error(`Failed to parse Monte Carlo JSON for ${symbol}: ${err}`);
          resolve(null);
        }
      } else {
        if (stderr.trim()) {
          logger.error(`Monte Carlo CLI error for ${symbol}: ${stderr}`);
        }
        logger.warn(`Monte Carlo calculation failed for ${symbol} (exit code: ${code})`);
        resolve(null);
      }
    });

    pythonProcess.on('error', (err) => {
      logger.error(`Failed to spawn Monte Carlo CLI for ${symbol}: ${err}`);
      resolve(null);
    });

    // Handle timeout
    setTimeout(() => {
      if (!pythonProcess.killed) {
        pythonProcess.kill('SIGTERM');
        logger.warn(`Monte Carlo calculation timed out for ${symbol}`);
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * Derive confidence level from Monte Carlo probability metrics.
 *
 * Enhances base confidence using probabilistic validation:
 * - High probability (>70%) of undervaluation → upgrade to "high"
 * - Low probability (<30%) → downgrade to "low"
 * - Moderate probability (>60%) with medium base → upgrade to "high"
 *
 * @param baseConfidence Base confidence level from fair value calculation
 * @param probValueGtPrice Probability that fair value > current price
 * @param mos15Prob Probability of 15%+ margin of safety
 * @returns Enhanced confidence level
 */
function deriveConfidenceFromMonteCarlo(
  baseConfidence: PriceTarget['confidence'],
  probValueGtPrice: number,
  mos15Prob: number
): PriceTarget['confidence'] {
  // Strong undervaluation signal
  if (probValueGtPrice > 0.7 && mos15Prob > 0.5) {
    return 'high';
  }

  // Weak undervaluation signal
  if (probValueGtPrice < 0.3) {
    return 'low';
  }

  // Moderate upgrade for medium confidence
  if (baseConfidence === 'medium' && probValueGtPrice > 0.6) {
    return 'high';
  }

  // Keep base confidence
  return baseConfidence;
}
