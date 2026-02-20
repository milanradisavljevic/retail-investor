/**
 * Multi-Provider Fundamentals Merge
 * Strategy: Best field from best source per symbol
 * Priority: sec_edgar_bulk > sec_edgar > fmp > yfinance (for accounting metrics)
 *           FMP > yfinance (for default fundamental ratios)
 *           yfinance > FMP (for price-derived metrics)
 */

import { getDatabase } from '@/data/db';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

type ProviderSource = 'sec_edgar_bulk' | 'sec_edgar' | 'fmp' | 'yfinance';

interface SnapshotBySource {
  sec_edgar_bulk: SnapshotEntry | null;
  sec_edgar: SnapshotEntry | null;
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
    sec_edgar_bulk_available?: boolean;
    sec_edgar_available?: boolean;
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

const ACCOUNTING_PRIORITY_FIELDS = [
  'roe',
  'roa',
  'debtToEquity',
  'grossMargin',
  'fcf',
  'currentRatio',
  'revenue',
  'netIncome',
  'assets',
  'equity',
  'debt',
] as const;

const ACCOUNTING_SOURCE_PRIORITY: ProviderSource[] = [
  'sec_edgar_bulk',
  'sec_edgar',
  'fmp',
  'yfinance',
];

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
  if (rawSource === 'sec_edgar_bulk') return 'sec_edgar_bulk';
  if (rawSource === 'sec_edgar') return 'sec_edgar';
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
  const snapshots: SnapshotBySource = {
    sec_edgar_bulk: null,
    sec_edgar: null,
    fmp: null,
    yfinance: null,
  };

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

    if (snapshots.sec_edgar_bulk && snapshots.sec_edgar && snapshots.fmp && snapshots.yfinance) {
      break;
    }
  }

  return snapshots;
}

function mergeFromSnapshots(snapshots: SnapshotBySource): MergedFundamentalsData | null {
  const secEdgarBulkData = snapshots.sec_edgar_bulk?.data ?? null;
  const secEdgarData = snapshots.sec_edgar?.data ?? null;
  const fmpData = snapshots.fmp?.data ?? null;
  const yfData = snapshots.yfinance?.data ?? null;

  if (!secEdgarBulkData && !secEdgarData && !fmpData && !yfData) {
    return null;
  }

  const baseData = yfData ?? fmpData ?? secEdgarData ?? secEdgarBulkData;
  const merged: FundamentalsData = { ...(baseData as FundamentalsData) };
  const mergedRecord = merged as unknown as Record<string, unknown>;
  const sources: Record<string, string> = {};

  const getSourceData = (source: ProviderSource): FundamentalsData | null => {
    if (source === 'sec_edgar_bulk') return secEdgarBulkData;
    if (source === 'sec_edgar') return secEdgarData;
    if (source === 'fmp') return fmpData;
    return yfData;
  };

  const getAccountingFieldValue = (data: FundamentalsData | null, field: string): unknown => {
    if (!data) return null;
    const record = data as unknown as Record<string, unknown>;
    const secEdgar = record.secEdgar as Record<string, unknown> | undefined;

    switch (field) {
      case 'fcf':
        return record.fcf ?? record.freeCashFlow ?? null;
      case 'revenue':
        return record.revenue ?? secEdgar?.revenue ?? null;
      case 'netIncome':
        return record.netIncome ?? secEdgar?.netIncome ?? null;
      case 'assets':
        return record.assets ?? record.totalAssets ?? secEdgar?.totalAssets ?? null;
      case 'equity':
        return (
          record.equity ??
          record.totalEquity ??
          record.stockholdersEquity ??
          secEdgar?.stockholdersEquity ??
          null
        );
      case 'debt':
        return record.debt ?? record.totalDebt ?? secEdgar?.totalDebt ?? null;
      default:
        return record[field] ?? null;
    }
  };

  const pickAccountingField = (field: (typeof ACCOUNTING_PRIORITY_FIELDS)[number]): void => {
    for (const source of ACCOUNTING_SOURCE_PRIORITY) {
      const value = getAccountingFieldValue(getSourceData(source), field);
      if (!hasValue(value)) continue;

      mergedRecord[field] = value;
      sources[field] = source;

      if (field === 'fcf') {
        mergedRecord.freeCashFlow = value;
        sources.freeCashFlow = source;
      }
      return;
    }

    mergedRecord[field] = null;
    if (field === 'fcf') {
      mergedRecord.freeCashFlow = null;
    }
  };

  const pickField = (
    field: keyof FundamentalsData,
    primary: ProviderSource,
    secondary: ProviderSource
  ): void => {
    const primaryValue = getSourceData(primary)?.[field];
    if (hasValue(primaryValue)) {
      mergedRecord[String(field)] = primaryValue;
      sources[String(field)] = primary;
      return;
    }

    const secondaryValue = getSourceData(secondary)?.[field];
    if (hasValue(secondaryValue)) {
      mergedRecord[String(field)] = secondaryValue;
      sources[String(field)] = secondary;
      return;
    }

    mergedRecord[String(field)] = null;
  };

  for (const field of ACCOUNTING_PRIORITY_FIELDS) {
    pickAccountingField(field);
  }

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
      sec_edgar_bulk_available: Boolean(snapshots.sec_edgar_bulk),
      sec_edgar_available: Boolean(snapshots.sec_edgar),
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
    (snapshots.sec_edgar_bulk &&
      now - normalizeFetchedAtMs(snapshots.sec_edgar_bulk.fetchedAt) <= maxAgeMs) ||
    (snapshots.sec_edgar &&
      now - normalizeFetchedAtMs(snapshots.sec_edgar.fetchedAt) <= maxAgeMs) ||
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
