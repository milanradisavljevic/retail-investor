import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import { getDataQualityConfig } from './config';

type StatisticalMetric =
  | 'peRatio'
  | 'pbRatio'
  | 'psRatio'
  | 'roe'
  | 'roa'
  | 'debtToEquity'
  | 'grossMargin'
  | 'currentRatio'
  | 'fcf'
  | 'operatingCashFlow'
  | 'revenue'
  | 'netIncome';

interface SectorMetricStats {
  median: number;
  stdDev: number;
  sampleSize: number;
}

export interface OutlierDetectionInput {
  symbol: string;
  sector?: string | null;
  fundamentals: FundamentalsData | null;
}

export interface OutlierDetectionResult {
  flagsBySymbol: Record<string, string[]>;
  summary: {
    symbolsEvaluated: number;
    symbolsWithOutliers: number;
    statisticalFlags: number;
    ruleFlags: number;
    sectorsWithStats: number;
  };
  sectorStats: Record<string, Partial<Record<StatisticalMetric, SectorMetricStats>>>;
}

const SIGMA_THRESHOLD = 3;
const STATISTICAL_METRICS: StatisticalMetric[] = [
  'peRatio',
  'pbRatio',
  'psRatio',
  'roe',
  'roa',
  'debtToEquity',
  'grossMargin',
  'currentRatio',
  'fcf',
  'operatingCashFlow',
  'revenue',
  'netIncome',
];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSector(sector: string | null | undefined): string {
  if (!sector || !sector.trim()) return 'UNKNOWN';
  return sector.trim();
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function getMetricValue(
  fundamentals: FundamentalsData | null,
  metric: StatisticalMetric
): number | null {
  if (!fundamentals) return null;
  const raw = fundamentals as unknown as Record<string, unknown>;
  const secEdgar = raw.secEdgar as Record<string, unknown> | undefined;

  switch (metric) {
    case 'roa':
      return toFiniteNumber(raw.roa ?? secEdgar?.roa);
    case 'grossMargin':
      return toFiniteNumber(raw.grossMargin ?? secEdgar?.grossMargin);
    case 'currentRatio':
      return toFiniteNumber(raw.currentRatio ?? secEdgar?.currentRatio);
    case 'fcf':
      return toFiniteNumber(raw.fcf ?? raw.freeCashFlow ?? secEdgar?.fcf);
    case 'operatingCashFlow':
      return toFiniteNumber(raw.operatingCashFlow ?? secEdgar?.operatingCashFlow);
    case 'revenue':
      return toFiniteNumber(raw.revenue ?? secEdgar?.revenue);
    case 'netIncome':
      return toFiniteNumber(raw.netIncome ?? secEdgar?.netIncome);
    default:
      return toFiniteNumber(raw[metric]);
  }
}

export function detectFundamentalOutliers(
  rows: OutlierDetectionInput[]
): OutlierDetectionResult {
  const cfg = getDataQualityConfig();
  const minSamplesPerSector = Math.max(3, cfg.min_samples?.sector ?? 5);

  const sectorBuckets = new Map<string, Map<StatisticalMetric, number[]>>();
  for (const row of rows) {
    if (!row.fundamentals) continue;
    const sector = normalizeSector(row.sector);
    let metricMap = sectorBuckets.get(sector);
    if (!metricMap) {
      metricMap = new Map<StatisticalMetric, number[]>();
      sectorBuckets.set(sector, metricMap);
    }

    for (const metric of STATISTICAL_METRICS) {
      const value = getMetricValue(row.fundamentals, metric);
      if (value === null) continue;
      const values = metricMap.get(metric) ?? [];
      values.push(value);
      metricMap.set(metric, values);
    }
  }

  const sectorStatsMap = new Map<string, Map<StatisticalMetric, SectorMetricStats>>();
  const sectorStats: Record<string, Partial<Record<StatisticalMetric, SectorMetricStats>>> = {};

  for (const [sector, metricMap] of sectorBuckets.entries()) {
    const metricStats = new Map<StatisticalMetric, SectorMetricStats>();
    for (const metric of STATISTICAL_METRICS) {
      const values = metricMap.get(metric) ?? [];
      if (values.length < minSamplesPerSector) continue;
      const stats: SectorMetricStats = {
        median: median(values),
        stdDev: sampleStdDev(values),
        sampleSize: values.length,
      };
      metricStats.set(metric, stats);
      if (!sectorStats[sector]) sectorStats[sector] = {};
      sectorStats[sector][metric] = stats;
    }
    sectorStatsMap.set(sector, metricStats);
  }

  let statisticalFlags = 0;
  let ruleFlags = 0;
  let symbolsWithOutliers = 0;
  const flagsBySymbol: Record<string, string[]> = {};

  for (const row of rows) {
    const symbol = row.symbol.toUpperCase();
    const flags = new Set<string>();
    const fundamentals = row.fundamentals;
    const sector = normalizeSector(row.sector);
    const sectorMetricStats = sectorStatsMap.get(sector);

    const revenue = getMetricValue(fundamentals, 'revenue');
    if (revenue !== null && revenue < 0) {
      flags.add('rule:negative_revenue');
      ruleFlags += 1;
    }

    const peRatio = getMetricValue(fundamentals, 'peRatio');
    if (peRatio !== null && peRatio > 1000) {
      flags.add('rule:pe_over_1000');
      ruleFlags += 1;
    }

    const debtToEquity = getMetricValue(fundamentals, 'debtToEquity');
    if (debtToEquity !== null && debtToEquity < 0) {
      flags.add('rule:negative_debt_to_equity');
      ruleFlags += 1;
    }

    if (fundamentals && sectorMetricStats) {
      for (const metric of STATISTICAL_METRICS) {
        const value = getMetricValue(fundamentals, metric);
        if (value === null) continue;
        const stats = sectorMetricStats.get(metric);
        if (!stats || stats.stdDev <= 0) continue;
        const zScore = Math.abs(value - stats.median) / stats.stdDev;
        if (zScore > SIGMA_THRESHOLD) {
          flags.add(`sector_3sigma:${metric}`);
          statisticalFlags += 1;
        }
      }
    }

    const normalizedFlags = Array.from(flags).sort();
    if (normalizedFlags.length > 0) {
      symbolsWithOutliers += 1;
    }
    flagsBySymbol[symbol] = normalizedFlags;
  }

  return {
    flagsBySymbol,
    summary: {
      symbolsEvaluated: rows.length,
      symbolsWithOutliers,
      statisticalFlags,
      ruleFlags,
      sectorsWithStats: sectorStatsMap.size,
    },
    sectorStats,
  };
}
