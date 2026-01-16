import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type { TechnicalMetrics } from '@/providers/types';
import type { CompanyProfile } from '@/providers/types';
import { calculateAndStoreGroupMedians, GroupMedianMap, MedianInputRow } from '@/data/quality/group_medians';
import { resolveMetric } from '@/data/quality/resolve_metric';
import { getDataQualityConfig } from '@/data/quality/config';
import { computeDataQuality } from '@/data/quality/data_quality';
import type { MetricQuality, DataQuality } from '@/data/quality/types';
import { getGroupMedian } from '@/data/repositories/group_medians_repo';

export interface SymbolRawData {
  symbol: string;
  fundamentals: FundamentalsData | null;
  technical: TechnicalMetrics | null;
  profile: CompanyProfile | null;
}

export interface ResolvedSymbolMetrics {
  fundamentals: FundamentalsData | null;
  technical: TechnicalMetrics | null;
  dataQuality: DataQuality;
}

export function buildGroupMedians(
  asOfDate: string,
  rawData: SymbolRawData[]
): GroupMedianMap {
  const rows: MedianInputRow[] = rawData.map((row) => ({
    symbol: row.symbol,
    industry: row.profile?.industry,
    sector: row.profile?.sector,
    metrics: extractFundamentalMetrics(row.fundamentals),
  }));

  return calculateAndStoreGroupMedians(asOfDate, rows);
}

export function resolveSymbolMetrics(
  symbol: string,
  raw: SymbolRawData,
  medians: GroupMedianMap,
  fallbackFundamentals?: FundamentalsData | null,
  fallbackProfile?: CompanyProfile | null
): ResolvedSymbolMetrics {
  const cfg = getDataQualityConfig();

  const metrics: Record<string, MetricQuality> = {};

  const profile = raw.profile || fallbackProfile;
  const industry = profile?.industry || 'UNKNOWN';
  const sector = profile?.sector || 'UNKNOWN';

  const getMedianEntry = (groupType: 'industry' | 'sector', metric: string) => {
    const groupName = groupType === 'industry' ? industry : sector;
    return medians[groupType]?.[groupName]?.[metric] ?? null;
  };

  const fundMetrics = extractFundamentalMetrics(raw.fundamentals);
  const fallbackMetrics = extractFundamentalMetrics(fallbackFundamentals);

  for (const metric of cfg.required_metrics) {
    const primaryValue = fundMetrics[metric];
    const fallbackValue = fallbackMetrics[metric];
    const industryMedian = getMedianEntry('industry', metric);
    const sectorMedian = getMedianEntry('sector', metric);
    metrics[metric] = resolveMetric({
      metric,
      primaryValue,
      primarySource: raw.fundamentals ? 'primary' : 'primary:missing',
      fallbackValue,
      fallbackSource: fallbackValue !== undefined ? 'fallback' : undefined,
      industryMedian: industryMedian
        ? { value: industryMedian.median, sampleCount: industryMedian.sampleCount }
        : undefined,
      sectorMedian: sectorMedian
        ? { value: sectorMedian.median, sampleCount: sectorMedian.sampleCount }
        : undefined,
    });
  }

  // Add beta and volatility if present in technical metrics
  if (raw.technical) {
    metrics.beta =
      metrics.beta ||
      resolveMetric({
        metric: 'beta',
        primaryValue: raw.technical.beta,
        primarySource: 'technical',
      });
    metrics.volatility3Month = resolveMetric({
      metric: 'volatility3Month',
      primaryValue: raw.technical.volatility3Month,
      primarySource: 'technical',
    });
  }

  const fundamentalsResolved: FundamentalsData | null = raw.fundamentals
    ? {
        ...raw.fundamentals,
        peRatio: metrics.peRatio?.value ?? null,
        pbRatio: metrics.pbRatio?.value ?? null,
        psRatio: metrics.psRatio?.value ?? null,
        roe: metrics.roe?.value ?? null,
        debtToEquity: metrics.debtToEquity?.value ?? null,
        beta: metrics.beta?.value ?? raw.fundamentals.beta ?? null,
      }
    : null;

  const dataQuality = computeDataQuality({
    symbol,
    metrics,
  });

  return {
    fundamentals: fundamentalsResolved,
    technical: raw.technical,
    dataQuality,
  };
}

export function getCachedGroupMedian(
  asOfDate: string,
  groupType: 'industry' | 'sector',
  groupName: string,
  metric: string
) {
  return getGroupMedian(asOfDate, groupType, groupName, metric);
}

function extractFundamentalMetrics(
  fundamentals: FundamentalsData | null | undefined
): Record<string, number | null> {
  if (!fundamentals) return {};
  return {
    peRatio: fundamentals.peRatio ?? null,
    pbRatio: fundamentals.pbRatio ?? null,
    psRatio: fundamentals.psRatio ?? null,
    roe: fundamentals.roe ?? null,
    debtToEquity: fundamentals.debtToEquity ?? null,
    beta: fundamentals.beta ?? null,
  };
}
