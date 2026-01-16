import { getDataQualityConfig } from './config';
import { MetricQuality } from './types';

export interface ResolveMetricInput {
  metric: string;
  primaryValue?: number | null;
  primarySource: string;
  fallbackValue?: number | null;
  fallbackSource?: string;
  industryMedian?: { value: number | null; sampleCount: number };
  sectorMedian?: { value: number | null; sampleCount: number };
  defaultValue?: number;
}

export function resolveMetric(input: ResolveMetricInput): MetricQuality {
  const cfg = getDataQualityConfig();
  const { metric, primaryValue, primarySource, fallbackValue, fallbackSource } = input;

  const defaultValue = input.defaultValue ?? cfg.metric_defaults[metric] ?? 50;
  const minIndustry = cfg.min_samples.industry;
  const minSector = cfg.min_samples.sector;

  // Level 0: primary raw
  if (isUsable(primaryValue)) {
    return buildQuality(primaryValue, primarySource, 1.0, false, false);
  }

  // Level 1: fallback raw
  if (isUsable(fallbackValue) && fallbackSource) {
    return buildQuality(fallbackValue, fallbackSource, 1.0, false, false);
  }

  // Level 2: industry median
  if (
    input.industryMedian &&
    isUsable(input.industryMedian.value) &&
    input.industryMedian.sampleCount >= minIndustry
  ) {
    return buildQuality(
      input.industryMedian.value,
      'imputed:industry_median',
      0.7,
      true,
      false,
      input.industryMedian.sampleCount < minIndustry * 2
        ? `industry sample ${input.industryMedian.sampleCount}`
        : undefined
    );
  }

  // Level 3: sector median
  if (
    input.sectorMedian &&
    isUsable(input.sectorMedian.value) &&
    input.sectorMedian.sampleCount >= minSector
  ) {
    return buildQuality(
      input.sectorMedian.value,
      'imputed:sector_median',
      0.6,
      true,
      false,
      input.sectorMedian.sampleCount < minSector * 2
        ? `sector sample ${input.sectorMedian.sampleCount}`
        : undefined
    );
  }

  // Level 5: fallback default
  return buildQuality(defaultValue, 'fallback:default', 0.3, true, false);
}

function isUsable(value?: number | null): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function buildQuality(
  value: number | null,
  source: string,
  confidence: number,
  isImputed: boolean,
  isMissing: boolean,
  notes?: string
): MetricQuality {
  return {
    value,
    source,
    confidence,
    isImputed,
    isMissing,
    ...(notes ? { notes } : {}),
  };
}
