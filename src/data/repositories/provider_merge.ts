/**
 * Multi-Provider Fundamentals Merge
 * Strategy: Best field from best source per symbol
 * Priority: FMP > yfinance (for fundamental ratios)
 *           yfinance > FMP (for price-derived metrics)
 */

import { getDatabase } from '@/data/db';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

type ProviderSource = 'fmp' | 'yfinance';

interface SnapshotBySource {
  fmp: SnapshotEntry | null;
  yfinance: SnapshotEntry | null;
}

interface SnapshotEntry {
  fetchedAt: number;
  data: FundamentalsData;
}

export interface MergedFundamentalsData extends FundamentalsData {
  _merge_meta?: {
    sources: Record<string, string>;
    fmp_available: boolean;
    yfinance_available: boolean;
    merged_at: number;
  };
}

export interface ProviderCoverageStats {
  total: number;
  fmp_only: number;
  yfinance_only: number;
  both: number;
  neither: number;
  field_coverage: Record<string, { fmp: number; yfinance: number; merged: number }>;
}

const FMP_PREFERRED_FIELDS: (keyof FundamentalsData)[] = [
  'peRatio',
  'pbRatio',
  'psRatio',
  'pegRatio',
  'roe',
  'roa',
  'debtToEquity',
  'currentRatio',
  'grossMargin',
  'operatingMargin',
  'netMargin',
  'dividendYield',
  'payoutRatio',
  'marketCap',
  'enterpriseValue',
  'revenueGrowth',
  'earningsGrowth',
];

const YFINANCE_PREFERRED_FIELDS: (keyof FundamentalsData)[] = ['beta', 'freeCashFlow'];

const COVERAGE_FIELDS: (keyof FundamentalsData)[] = [
  ...new Set<keyof FundamentalsData>([
    ...FMP_PREFERRED_FIELDS,
    ...YFINANCE_PREFERRED_FIELDS,
  ]),
];

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function normalizeSource(rawSource: unknown): ProviderSource {
  if (rawSource === 'fmp') return 'fmp';
  return 'yfinance';
}

function normalizeFetchedAtMs(fetchedAt: number): number {
  return fetchedAt < 1_000_000_000_000 ? fetchedAt * 1000 : fetchedAt;
}

function getLatestSnapshotsBySource(symbol: string): SnapshotBySource {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT fetched_at as fetchedAt, data_json
    FROM fundamentals_snapshot
    WHERE symbol = ?
    ORDER BY fetched_at DESC
  `);

  const rows = stmt.all(symbol) as Array<{ fetchedAt: number; data_json: string }>;
  const snapshots: SnapshotBySource = { fmp: null, yfinance: null };

  for (const row of rows) {
    let data: FundamentalsData;
    try {
      data = JSON.parse(row.data_json) as FundamentalsData;
    } catch {
      continue;
    }

    const source = normalizeSource(data?._source);
    if (!snapshots[source]) {
      snapshots[source] = {
        fetchedAt: row.fetchedAt,
        data,
      };
    }

    if (snapshots.fmp && snapshots.yfinance) {
      break;
    }
  }

  return snapshots;
}

function mergeFromSnapshots(snapshots: SnapshotBySource): MergedFundamentalsData | null {
  const fmpData = snapshots.fmp?.data ?? null;
  const yfData = snapshots.yfinance?.data ?? null;

  if (!fmpData && !yfData) {
    return null;
  }

  const merged: FundamentalsData = yfData ? { ...yfData } : { ...(fmpData as FundamentalsData) };
  const mergedRecord = merged as unknown as Record<string, unknown>;
  const sources: Record<string, string> = {};

  const pickField = (
    field: keyof FundamentalsData,
    primary: ProviderSource,
    secondary: ProviderSource
  ): void => {
    const primaryValue = (primary === 'fmp' ? fmpData : yfData)?.[field];
    if (hasValue(primaryValue)) {
      mergedRecord[String(field)] = primaryValue;
      sources[String(field)] = primary;
      return;
    }

    const secondaryValue = (secondary === 'fmp' ? fmpData : yfData)?.[field];
    if (hasValue(secondaryValue)) {
      mergedRecord[String(field)] = secondaryValue;
      sources[String(field)] = secondary;
      return;
    }

    mergedRecord[String(field)] = null;
  };

  for (const field of FMP_PREFERRED_FIELDS) {
    pickField(field, 'fmp', 'yfinance');
  }

  for (const field of YFINANCE_PREFERRED_FIELDS) {
    pickField(field, 'yfinance', 'fmp');
  }

  return {
    ...merged,
    _merge_meta: {
      sources,
      fmp_available: Boolean(snapshots.fmp),
      yfinance_available: Boolean(snapshots.yfinance),
      merged_at: Date.now(),
    },
  };
}

export function getMergedFundamentals(symbol: string): MergedFundamentalsData | null {
  const snapshots = getLatestSnapshotsBySource(symbol);
  return mergeFromSnapshots(snapshots);
}

export function getMergedFundamentalsIfFresh(
  symbol: string,
  maxAgeMs: number
): MergedFundamentalsData | null {
  const snapshots = getLatestSnapshotsBySource(symbol);
  const now = Date.now();

  const hasFreshSource =
    (snapshots.fmp &&
      now - normalizeFetchedAtMs(snapshots.fmp.fetchedAt) <= maxAgeMs) ||
    (snapshots.yfinance &&
      now - normalizeFetchedAtMs(snapshots.yfinance.fetchedAt) <= maxAgeMs);

  if (!hasFreshSource) {
    return null;
  }

  return mergeFromSnapshots(snapshots);
}

export function getProviderCoverage(symbols: string[]): ProviderCoverageStats {
  const stats: ProviderCoverageStats = {
    total: symbols.length,
    fmp_only: 0,
    yfinance_only: 0,
    both: 0,
    neither: 0,
    field_coverage: Object.fromEntries(
      COVERAGE_FIELDS.map((field) => [String(field), { fmp: 0, yfinance: 0, merged: 0 }])
    ),
  };

  for (const symbol of symbols) {
    const snapshots = getLatestSnapshotsBySource(symbol);
    const merged = mergeFromSnapshots(snapshots);

    const hasFmp = Boolean(snapshots.fmp);
    const hasYfinance = Boolean(snapshots.yfinance);

    if (hasFmp && hasYfinance) stats.both += 1;
    else if (hasFmp) stats.fmp_only += 1;
    else if (hasYfinance) stats.yfinance_only += 1;
    else stats.neither += 1;

    for (const field of COVERAGE_FIELDS) {
      const fieldKey = String(field);

      if (hasValue(snapshots.fmp?.data[field])) {
        stats.field_coverage[fieldKey].fmp += 1;
      }

      if (hasValue(snapshots.yfinance?.data[field])) {
        stats.field_coverage[fieldKey].yfinance += 1;
      }

      if (merged && hasValue(merged[field])) {
        stats.field_coverage[fieldKey].merged += 1;
      }
    }
  }

  return stats;
}
