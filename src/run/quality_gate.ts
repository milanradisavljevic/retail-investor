import type { DataQualitySummary } from '@/data/quality/data_quality';

export type QualityGateStatus = 'green' | 'yellow' | 'red';

export interface RunQualityGateThresholds {
  red_avg_data_quality_score_lt: number;
  red_pct_low_gte: number;
  red_critical_fallback_ratio_gte: number;
  yellow_avg_data_quality_score_lt: number;
  yellow_pct_low_gte: number;
  yellow_critical_fallback_ratio_gte: number;
}

export interface RunQualityGateMetrics {
  symbol_count: number;
  avg_data_quality_score: number;
  pct_low: number;
  critical_fallback_ratio: number;
}

export interface RunQualityGate {
  status: QualityGateStatus;
  blocked: boolean;
  reasons: string[];
  metrics: RunQualityGateMetrics;
  thresholds: RunQualityGateThresholds;
  evaluated_at: string;
}

export const DEFAULT_RUN_QUALITY_GATE_THRESHOLDS: RunQualityGateThresholds = {
  red_avg_data_quality_score_lt: 55,
  red_pct_low_gte: 0.7,
  red_critical_fallback_ratio_gte: 0.6,
  yellow_avg_data_quality_score_lt: 70,
  yellow_pct_low_gte: 0.4,
  yellow_critical_fallback_ratio_gte: 0.35,
};

export function evaluateRunQualityGate(
  summary: DataQualitySummary,
  symbolCount: number,
  thresholds: RunQualityGateThresholds = DEFAULT_RUN_QUALITY_GATE_THRESHOLDS
): RunQualityGate {
  const safeSymbolCount = Math.max(0, Math.floor(symbolCount));
  const criticalFallbackCount = summary.tickers_with_critical_fallback.length;
  const criticalFallbackRatio =
    safeSymbolCount > 0 ? criticalFallbackCount / safeSymbolCount : 0;

  const reasons: string[] = [];
  const trippedRed =
    summary.avg_data_quality_score < thresholds.red_avg_data_quality_score_lt ||
    summary.pct_low >= thresholds.red_pct_low_gte ||
    criticalFallbackRatio >= thresholds.red_critical_fallback_ratio_gte;

  const trippedYellow =
    summary.avg_data_quality_score < thresholds.yellow_avg_data_quality_score_lt ||
    summary.pct_low >= thresholds.yellow_pct_low_gte ||
    criticalFallbackRatio >= thresholds.yellow_critical_fallback_ratio_gte;

  if (summary.avg_data_quality_score < thresholds.red_avg_data_quality_score_lt) {
    reasons.push(
      `avg_data_quality_score ${summary.avg_data_quality_score.toFixed(1)} < ${thresholds.red_avg_data_quality_score_lt}`
    );
  } else if (summary.avg_data_quality_score < thresholds.yellow_avg_data_quality_score_lt) {
    reasons.push(
      `avg_data_quality_score ${summary.avg_data_quality_score.toFixed(1)} < ${thresholds.yellow_avg_data_quality_score_lt}`
    );
  }

  if (summary.pct_low >= thresholds.red_pct_low_gte) {
    reasons.push(`pct_low ${(summary.pct_low * 100).toFixed(1)}% >= ${(thresholds.red_pct_low_gte * 100).toFixed(1)}%`);
  } else if (summary.pct_low >= thresholds.yellow_pct_low_gte) {
    reasons.push(`pct_low ${(summary.pct_low * 100).toFixed(1)}% >= ${(thresholds.yellow_pct_low_gte * 100).toFixed(1)}%`);
  }

  if (criticalFallbackRatio >= thresholds.red_critical_fallback_ratio_gte) {
    reasons.push(
      `critical_fallback_ratio ${(criticalFallbackRatio * 100).toFixed(1)}% >= ${(thresholds.red_critical_fallback_ratio_gte * 100).toFixed(1)}%`
    );
  } else if (criticalFallbackRatio >= thresholds.yellow_critical_fallback_ratio_gte) {
    reasons.push(
      `critical_fallback_ratio ${(criticalFallbackRatio * 100).toFixed(1)}% >= ${(thresholds.yellow_critical_fallback_ratio_gte * 100).toFixed(1)}%`
    );
  }

  const status: QualityGateStatus = trippedRed ? 'red' : trippedYellow ? 'yellow' : 'green';

  return {
    status,
    blocked: status === 'red',
    reasons,
    metrics: {
      symbol_count: safeSymbolCount,
      avg_data_quality_score: Number(summary.avg_data_quality_score.toFixed(1)),
      pct_low: Number(summary.pct_low.toFixed(3)),
      critical_fallback_ratio: Number(criticalFallbackRatio.toFixed(3)),
    },
    thresholds,
    evaluated_at: new Date().toISOString(),
  };
}
