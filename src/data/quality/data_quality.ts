import { getDataQualityConfig } from './config';
import type { MetricQuality, DataQuality } from './types';

export interface DataQualityInput {
  symbol: string;
  metrics: Record<string, MetricQuality>;
}

export interface DataQualitySummary {
  avg_data_quality_score: number;
  pct_high: number;
  pct_medium: number;
  pct_low: number;
  tickers_with_critical_fallback: string[];
  most_missing_metrics: string[];
  generated_at: string;
  universe_name: string;
}

export function computeDataQuality(input: DataQualityInput): DataQuality {
  const cfg = getDataQualityConfig();
  const required = cfg.required_metrics;
  const critical = cfg.critical_metrics;

  let presentRequired = 0;
  let imputedRequired = 0;
  const missingCriticalSet = new Set<string>();
  const criticalConfidences: number[] = [];
  let rawCritical = 0;
  let fallbackPenalties = 0;

  for (const metric of required) {
    const mq = input.metrics[metric];
    if (mq && mq.value !== null && mq.value !== undefined) {
      presentRequired += 1;
      if (mq.isImputed) imputedRequired += 1;
    }
  }

  for (const metric of critical) {
    const mq = input.metrics[metric];
    if (!mq || mq.value === null || mq.value === undefined) {
      missingCriticalSet.add(metric);
      criticalConfidences.push(0);
      continue;
    }
    criticalConfidences.push(mq.confidence);
    const isFallback = mq.source.startsWith('fallback');
    const isImputed = mq.isImputed || mq.source.startsWith('imputed');
    if (!isImputed && !isFallback && mq.confidence >= 0.95) {
      rawCritical += 1;
    } else {
      missingCriticalSet.add(metric);
    }
    if (mq.source.startsWith('fallback')) {
      fallbackPenalties += 5;
    }
  }

  const completenessRatio =
    required.length === 0 ? 1 : presentRequired / required.length;
  const imputedRatio =
    required.length === 0 ? 0 : imputedRequired / required.length;

  const confidenceCriticalAvg =
    criticalConfidences.length === 0
      ? 0
      : criticalConfidences.reduce((a, b) => a + b, 0) /
        criticalConfidences.length;

  const rawCriticalRatio =
    critical.length === 0 ? 0 : rawCritical / critical.length;

  let score =
    100 *
    (0.5 * completenessRatio +
      0.4 * confidenceCriticalAvg +
      0.1 * rawCriticalRatio);

  score -= fallbackPenalties;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const dataQualityConfidence = Math.max(
    0,
    Math.min(1, confidenceCriticalAvg)
  );

  return {
    dataQualityScore: Number(score.toFixed(1)),
    dataQualityConfidence,
    completenessRatio: Number(completenessRatio.toFixed(3)),
    imputedRatio: Number(imputedRatio.toFixed(3)),
    missingCritical: Array.from(missingCriticalSet),
    metrics: input.metrics,
    outlierFlags: [],
    fundamentalsAgeDays: null,
    staleFundamentals: false,
  };
}

const OUTLIER_FLAG_PENALTY = 1.5;
const MAX_OUTLIER_PENALTY = 12;

export function applyOutlierFlagsToDataQuality(
  dataQuality: DataQuality,
  outlierFlags: string[]
): DataQuality {
  const normalizedFlags = Array.from(
    new Set(
      outlierFlags
        .map((flag) => flag.trim())
        .filter((flag) => flag.length > 0)
    )
  ).sort();

  const scorePenalty = Math.min(
    MAX_OUTLIER_PENALTY,
    normalizedFlags.length * OUTLIER_FLAG_PENALTY
  );
  const adjustedScore = Math.max(
    0,
    Number((dataQuality.dataQualityScore - scorePenalty).toFixed(1))
  );

  for (const flag of normalizedFlags) {
    const [, metric] = flag.split(':');
    if (!metric) continue;
    const mq = dataQuality.metrics[metric];
    if (!mq) continue;
    mq.notes = mq.notes ? `${mq.notes}; outlier flagged` : 'outlier flagged';
  }

  return {
    ...dataQuality,
    dataQualityScore: adjustedScore,
    outlierFlags: normalizedFlags,
  };
}

export function summarizeDataQuality(
  perSymbol: { symbol: string; dataQuality: DataQuality }[],
  universeName: string
): DataQualitySummary {
  const cfg = getDataQualityConfig();
  if (perSymbol.length === 0) {
    return {
      avg_data_quality_score: 0,
      pct_high: 0,
      pct_medium: 0,
      pct_low: 0,
      tickers_with_critical_fallback: [],
      most_missing_metrics: [],
      generated_at: new Date().toISOString(),
      universe_name: universeName,
    };
  }

  let sum = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  const missingCount: Record<string, number> = {};
  const tickersWithCriticalFallback: string[] = [];

  for (const { symbol, dataQuality } of perSymbol) {
    sum += dataQuality.dataQualityScore;
    if (dataQuality.dataQualityScore >= 80) high += 1;
    else if (dataQuality.dataQualityScore >= 60) medium += 1;
    else low += 1;

    for (const m of dataQuality.missingCritical) {
      missingCount[m] = (missingCount[m] ?? 0) + 1;
    }
    const hasFallback = cfg.critical_metrics.some((metric) => {
      const mq = dataQuality.metrics[metric];
      return mq ? mq.source.startsWith('fallback') : false;
    });
    if (hasFallback) {
      tickersWithCriticalFallback.push(symbol);
    }
  }

  const avgDataQualityScore = sum / perSymbol.length;
  const mostMissingMetrics = Object.entries(missingCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([metric]) => metric);

  return {
    avg_data_quality_score: Number(avgDataQualityScore.toFixed(1)),
    pct_high: Number((high / perSymbol.length).toFixed(3)),
    pct_medium: Number((medium / perSymbol.length).toFixed(3)),
    pct_low: Number((low / perSymbol.length).toFixed(3)),
    tickers_with_critical_fallback: tickersWithCriticalFallback,
    most_missing_metrics: mostMissingMetrics,
    generated_at: new Date().toISOString(),
    universe_name: universeName,
  };
}
