import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getDatabase } from '@/data/db';
import { getProviderCoverage } from '@/data/repositories/provider_merge';
import { detectRegime } from '@/regime/engine';
import { getRecentEtlRuns, type EtlRun } from './etl_log';

const CACHE_TTL_MS = 5 * 60 * 1000;

type CoverageMap = {
  trailing_pe: string;
  earnings_growth: string;
  dividend_yield: string;
  payout_ratio: string;
};

type CoverageNumericMap = {
  trailing_pe: number;
  earnings_growth: number;
  dividend_yield: number;
  payout_ratio: number;
};

export interface HealthSnapshot {
  generated_at: string;
  system: {
    version: string;
  };
  database: {
    privatinvestor_db: {
      size_mb: number;
      tables: {
        prices_eod: { row_count: number; latest_date: string | null; oldest_date: string | null };
        fundamentals_snapshot: { row_count: number; latest_fetched: string | null };
        macro_indicators: {
          row_count: number;
          series: string[];
          latest_date: string | null;
          latest_fetched: string | null;
        };
        run_index: { row_count: number; latest_run: string | null };
      };
    };
    market_data_db: {
      size_mb: number;
      tables: {
        fundamentals: {
          row_count: number;
          snapshot_date: string | null;
          coverage: CoverageMap;
          coverage_numeric: CoverageNumericMap;
        };
        prices: { row_count: number; latest_date: string | null; oldest_date: string | null };
      };
    };
  };
  etl: {
    last_price_update: string | null;
    last_fundamental_update: string | null;
    last_fred_update: string | null;
    last_run_update: string | null;
    universes_loaded: string[];
    universes: Array<{
      id: string;
      name: string;
      symbol_count: number;
      symbols_with_price: number;
      coverage_pct: number;
      last_price_date: string | null;
    }>;
  };
  regime: {
    current: string;
    composite_score: number | null;
    as_of: string | null;
  };
  provider_coverage: ProviderHealthData[];
  quality_monitor: QualityMonitorData;
  etl_runs: EtlRun[];
}

export interface ProviderHealthData {
  universe: string;
  total_symbols: number;
  fmp_coverage: number;
  yfinance_coverage: number;
  merged_coverage: number;
  gap: number;
  key_fields: Array<{
    field: string;
    fmp_pct: number;
    yfinance_pct: number;
    merged_pct: number;
  }>;
}

export interface QualityMonitorMetricCoverage {
  field: string;
  covered_symbols: number;
  coverage_pct: number;
}

export interface QualityMonitorProviderBreakdown {
  sec_edgar_bulk: number;
  sec_edgar: number;
  fmp: number;
  yfinance: number;
  unknown: number;
  gap: number;
}

export interface QualityMonitorFreshness {
  oldest_days: number | null;
  median_days: number | null;
  pct_older_than_7d: number;
  sample_size: number;
}

export interface QualityMonitorUniverse {
  id: string;
  name: string;
  symbol_count: number;
  fundamentals_symbols: number;
  fundamentals_coverage_pct: number;
  piotroski_ready_symbols: number;
  piotroski_ready_pct: number;
  freshness: QualityMonitorFreshness;
  provider_breakdown: QualityMonitorProviderBreakdown;
  metric_coverage: QualityMonitorMetricCoverage[];
}

export interface QualityMonitorTrendPoint {
  timestamp_utc: string;
  overall_field_coverage_pct: number | null;
  piotroski_ready_pct: number | null;
  processed: number | null;
}

export interface QualityMonitorData {
  universes: QualityMonitorUniverse[];
  trend: QualityMonitorTrendPoint[];
}

let cached: { expiresAt: number; data: HealthSnapshot } | null = null;

type TableInfoRow = {
  row_count: number;
  latest_date?: string | null;
  oldest_date?: string | null;
  latest_fetched?: number | null;
  latest_run?: string | null;
};

type CoverageRow = {
  row_count: number;
  trailing_pe_count: number;
  earnings_growth_count: number;
  dividend_yield_count: number;
  payout_ratio_count: number;
};

type UniverseCatalogItem = {
  id: string;
  name: string;
  symbolCount: number;
  symbols: string[];
};

type LatestFundamentalsRow = {
  symbol: string;
  fetchedAt: number;
  dataJson: string;
};

type LatestFundamentalsSnapshot = {
  fetchedAtMs: number;
  source: 'sec_edgar_bulk' | 'sec_edgar' | 'fmp' | 'yfinance' | 'unknown';
  data: Record<string, unknown>;
};

function hasTable(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return !!row?.name;
}

function getDbSizeMb(filePath: string): number {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const bytes = fs.statSync(filePath).size;
    return Number((bytes / (1024 * 1024)).toFixed(1));
  } catch {
    return 0;
  }
}

function toDateStringFromEpoch(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const millis = value > 1_000_000_000_000 ? value : value * 1000;
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toPercentString(value: number): string {
  return `${value.toFixed(1)}%`;
}

function normalizeDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePrefix) return datePrefix[1];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function safeReadPackageVersion(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const raw = fs.readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function normalizeFetchedAtMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // ignore invalid rows in health dashboard
  }
  return null;
}

function normalizeProviderSource(
  value: unknown
): 'sec_edgar_bulk' | 'sec_edgar' | 'fmp' | 'yfinance' | 'unknown' {
  if (value === 'sec_edgar_bulk') return 'sec_edgar_bulk';
  if (value === 'sec_edgar') return 'sec_edgar';
  if (value === 'fmp') return 'fmp';
  if (value === 'yfinance' || value === null || value === undefined) return 'yfinance';
  return 'unknown';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function loadLatestFundamentalsBySymbol(
  privateDb: Database.Database
): Map<string, LatestFundamentalsSnapshot> {
  if (!hasTable(privateDb, 'fundamentals_snapshot')) return new Map();

  const rows = privateDb
    .prepare(
      `
      SELECT fs.symbol AS symbol, fs.fetched_at AS fetchedAt, fs.data_json AS dataJson
      FROM fundamentals_snapshot fs
      WHERE fs.fetched_at = (
        SELECT MAX(fs2.fetched_at)
        FROM fundamentals_snapshot fs2
        WHERE fs2.symbol = fs.symbol
      )
    `
    )
    .all() as LatestFundamentalsRow[];

  const bySymbol = new Map<string, LatestFundamentalsSnapshot>();
  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    const data = parseJsonObject(row.dataJson);
    if (!data) continue;

    const fetchedAtMs = normalizeFetchedAtMs(row.fetchedAt);
    if (!fetchedAtMs) continue;

    bySymbol.set(symbol, {
      fetchedAtMs,
      source: normalizeProviderSource(data._source),
      data,
    });
  }
  return bySymbol;
}

function hasPiotroskiData(secEdgar: Record<string, unknown> | null): boolean {
  if (!secEdgar) return false;

  const currentFields = [
    secEdgar.netIncome,
    secEdgar.totalAssets,
    secEdgar.operatingCashFlow,
    secEdgar.totalDebt,
    secEdgar.currentAssets,
    secEdgar.currentLiabilities,
    secEdgar.sharesOutstanding,
    secEdgar.revenue,
    secEdgar.grossProfit,
  ];

  const priorFields = [
    secEdgar.net_income_py,
    secEdgar.total_assets_py,
    secEdgar.total_debt_py,
    secEdgar.current_assets_py,
    secEdgar.current_liabilities_py,
    secEdgar.shares_outstanding_py,
    secEdgar.revenue_py,
    secEdgar.gross_profit_py,
  ];

  const hasCurrent = currentFields.every((v) => safeNumber(v) !== null);
  const hasPrior = priorFields.every((v) => safeNumber(v) !== null);
  return hasCurrent && hasPrior;
}

function readAuditTrend(): QualityMonitorTrendPoint[] {
  const auditsDir = path.join(process.cwd(), 'data', 'audits');
  if (!fs.existsSync(auditsDir)) return [];

  const candidates = fs
    .readdirSync(auditsDir)
    .filter((name) => name.startsWith('sec_edgar_bulk_audit_') && name.endsWith('.json'))
    .sort()
    .slice(-20);

  const points: QualityMonitorTrendPoint[] = [];
  for (const filename of candidates) {
    const fullPath = path.join(auditsDir, filename);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        timestamp_utc?: string;
        summary?: {
          overall_field_coverage_pct?: number;
          piotroski_ready?: { pct?: number; count?: number };
          processed?: number;
        };
      };

      const ts = parsed.timestamp_utc ?? filename.replace('sec_edgar_bulk_audit_', '').replace('.json', '');
      points.push({
        timestamp_utc: ts,
        overall_field_coverage_pct: safeNumber(parsed.summary?.overall_field_coverage_pct),
        piotroski_ready_pct: safeNumber(parsed.summary?.piotroski_ready?.pct),
        processed: safeNumber(parsed.summary?.processed),
      });
    } catch {
      // ignore malformed audit snapshots
    }
  }

  return points;
}

function loadUniverseSymbols(id: string): string[] {
  const universesDir = path.join(process.cwd(), 'config', 'universes');
  const candidates = Array.from(
    new Set([
      `${id}.json`,
      `${id.replace(/_/g, '-')}.json`,
      `${id.replace(/-/g, '_')}.json`,
    ])
  );

  for (const filename of candidates) {
    const fullPath = path.join(universesDir, filename);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw) as { symbols?: unknown };
      if (Array.isArray(parsed.symbols)) {
        return parsed.symbols
          .map((value) => (typeof value === 'string' ? value.toUpperCase() : ''))
          .filter((value) => value.length > 0);
      }
    } catch {
      // ignore invalid universe files for health endpoint robustness
    }
  }

  return [];
}

function loadUniverseCatalog(): UniverseCatalogItem[] {
  const indexPath = path.join(process.cwd(), 'config', 'universes', 'index.json');
  if (!fs.existsSync(indexPath)) return [];

  type IndexUniverse = { id: string; name: string; symbolCount?: number };
  type IndexFormat = {
    universes?: Record<string, IndexUniverse[]>;
  };

  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as IndexFormat;
    const groups = parsed.universes ?? {};
    const items = Object.values(groups).flat();

    return items.map((item) => {
      const symbols = loadUniverseSymbols(item.id);
      return {
        id: item.id,
        name: item.name,
        symbolCount: item.symbolCount ?? symbols.length,
        symbols,
      };
    });
  } catch {
    return [];
  }
}

function universeCoverageFromPrices(
  marketDb: Database.Database | null,
  symbols: string[]
): { symbols_with_price: number; last_price_date: string | null } {
  if (!marketDb || symbols.length === 0 || !hasTable(marketDb, 'prices')) {
    return { symbols_with_price: 0, last_price_date: null };
  }

  let symbolsWithPrice = 0;
  let lastPriceDate: string | null = null;

  for (const symbolsChunk of chunked(symbols, 500)) {
    const placeholders = symbolsChunk.map(() => '?').join(', ');
    const query = `
      SELECT COUNT(DISTINCT symbol) AS symbols_with_price, MAX(date) AS latest_date
      FROM prices
      WHERE symbol IN (${placeholders})
    `;
    const row = marketDb.prepare(query).get(...symbolsChunk) as
      | { symbols_with_price: number; latest_date: string | null }
      | undefined;

    symbolsWithPrice += row?.symbols_with_price ?? 0;
    const chunkDate = row?.latest_date ?? null;
    if (chunkDate && (!lastPriceDate || chunkDate > lastPriceDate)) {
      lastPriceDate = chunkDate;
    }
  }

  return { symbols_with_price: symbolsWithPrice, last_price_date: lastPriceDate };
}

function buildHealthSnapshot(): HealthSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();

  const privateDbPath = path.join(process.cwd(), 'data', 'privatinvestor.db');
  const marketDbPath = path.join(process.cwd(), 'data', 'market-data.db');

  const privateDb = getDatabase();
  const marketDb = fs.existsSync(marketDbPath) ? new Database(marketDbPath, { readonly: true }) : null;

  try {
    const privatePrices = hasTable(privateDb, 'prices_eod')
      ? (privateDb
          .prepare(
            'SELECT COUNT(*) AS row_count, MAX(date) AS latest_date, MIN(date) AS oldest_date FROM prices_eod'
          )
          .get() as TableInfoRow)
      : { row_count: 0, latest_date: null, oldest_date: null };

    const privateFundamentals = hasTable(privateDb, 'fundamentals_snapshot')
      ? (privateDb
          .prepare('SELECT COUNT(*) AS row_count, MAX(fetched_at) AS latest_fetched FROM fundamentals_snapshot')
          .get() as TableInfoRow)
      : { row_count: 0, latest_fetched: null };

    const privateMacro = hasTable(privateDb, 'macro_indicators')
      ? (privateDb
          .prepare(
            'SELECT COUNT(*) AS row_count, MAX(date) AS latest_date, MAX(fetched_at) AS latest_fetched FROM macro_indicators'
          )
          .get() as TableInfoRow)
      : { row_count: 0, latest_date: null, latest_fetched: null };

    const macroSeries = hasTable(privateDb, 'macro_indicators')
      ? (privateDb
          .prepare('SELECT DISTINCT series_id FROM macro_indicators ORDER BY series_id ASC')
          .all() as Array<{ series_id: string }>)
          .map((r) => r.series_id)
      : [];

    const privateRuns = hasTable(privateDb, 'run_index')
      ? (privateDb
          .prepare('SELECT COUNT(*) AS row_count, MAX(timestamp) AS latest_run FROM run_index')
          .get() as TableInfoRow)
      : { row_count: 0, latest_run: null };

    const marketFundSnapshotDate =
      marketDb && hasTable(marketDb, 'fundamentals')
        ? ((marketDb.prepare('SELECT MAX(date) AS latest_date FROM fundamentals').get() as { latest_date: string | null })
            ?.latest_date ?? null)
        : null;

    const marketFundamentals = marketDb && hasTable(marketDb, 'fundamentals') && marketFundSnapshotDate
      ? (marketDb
          .prepare(
            `SELECT
              COUNT(*) AS row_count,
              SUM(CASE WHEN trailing_pe IS NOT NULL THEN 1 ELSE 0 END) AS trailing_pe_count,
              SUM(CASE WHEN earnings_growth IS NOT NULL THEN 1 ELSE 0 END) AS earnings_growth_count,
              SUM(CASE WHEN dividend_yield IS NOT NULL THEN 1 ELSE 0 END) AS dividend_yield_count,
              SUM(CASE WHEN payout_ratio IS NOT NULL THEN 1 ELSE 0 END) AS payout_ratio_count
            FROM fundamentals
            WHERE date = ?`
          )
          .get(marketFundSnapshotDate) as CoverageRow)
      : {
          row_count: 0,
          trailing_pe_count: 0,
          earnings_growth_count: 0,
          dividend_yield_count: 0,
          payout_ratio_count: 0,
        };

    const marketPrices = marketDb && hasTable(marketDb, 'prices')
      ? (marketDb
          .prepare('SELECT COUNT(*) AS row_count, MAX(date) AS latest_date, MIN(date) AS oldest_date FROM prices')
          .get() as TableInfoRow)
      : { row_count: 0, latest_date: null, oldest_date: null };

    const rowCount = marketFundamentals.row_count || 0;
    const coverageNumeric: CoverageNumericMap = {
      trailing_pe: rowCount > 0 ? (marketFundamentals.trailing_pe_count / rowCount) * 100 : 0,
      earnings_growth: rowCount > 0 ? (marketFundamentals.earnings_growth_count / rowCount) * 100 : 0,
      dividend_yield: rowCount > 0 ? (marketFundamentals.dividend_yield_count / rowCount) * 100 : 0,
      payout_ratio: rowCount > 0 ? (marketFundamentals.payout_ratio_count / rowCount) * 100 : 0,
    };

    const coverage: CoverageMap = {
      trailing_pe: toPercentString(coverageNumeric.trailing_pe),
      earnings_growth: toPercentString(coverageNumeric.earnings_growth),
      dividend_yield: toPercentString(coverageNumeric.dividend_yield),
      payout_ratio: toPercentString(coverageNumeric.payout_ratio),
    };

    const universeCatalog = loadUniverseCatalog();
    const universes = universeCatalog
      .map((u) => {
        const coverageInfo = universeCoverageFromPrices(marketDb, u.symbols);
        const denom = u.symbols.length > 0 ? u.symbols.length : u.symbolCount;
        const coveragePct = denom > 0 ? (coverageInfo.symbols_with_price / denom) * 100 : 0;
        return {
          id: u.id,
          name: u.name,
          symbol_count: u.symbolCount,
          symbols_with_price: coverageInfo.symbols_with_price,
          coverage_pct: Number(coveragePct.toFixed(1)),
          last_price_date: normalizeDateString(coverageInfo.last_price_date),
        };
      })
      .filter((u) => u.symbol_count >= 40)
      .sort((a, b) => b.coverage_pct - a.coverage_pct);

    const universesLoaded = universes
      .filter((u) => u.symbols_with_price > 0)
      .map((u) => u.name);

    const latestFundamentalsBySymbol = loadLatestFundamentalsBySymbol(privateDb);
    const monitorMetrics = [
      'peRatio',
      'pbRatio',
      'psRatio',
      'roe',
      'roa',
      'debtToEquity',
      'grossMargin',
      'fcf',
      'currentRatio',
      'operatingCashFlow',
      'revenue',
      'netIncome',
    ] as const;

    const qualityMonitorUniverses: QualityMonitorUniverse[] = universeCatalog
      .filter((u) => u.symbols.length > 0)
      .map((u) => {
        const symbolCount = u.symbols.length;
        const metricCounts = new Map<string, number>(monitorMetrics.map((m) => [m, 0]));
        const providerBreakdown: QualityMonitorProviderBreakdown = {
          sec_edgar_bulk: 0,
          sec_edgar: 0,
          fmp: 0,
          yfinance: 0,
          unknown: 0,
          gap: 0,
        };
        const freshnessAgesDays: number[] = [];
        let piotroskiReadySymbols = 0;
        let fundamentalsSymbols = 0;

        for (const symbol of u.symbols) {
          const snapshot = latestFundamentalsBySymbol.get(symbol);
          if (!snapshot) {
            providerBreakdown.gap += 1;
            continue;
          }

          fundamentalsSymbols += 1;
          providerBreakdown[snapshot.source] += 1;

          const ageDays = (nowMs - snapshot.fetchedAtMs) / (1000 * 60 * 60 * 24);
          if (Number.isFinite(ageDays)) {
            freshnessAgesDays.push(ageDays);
          }

          for (const metric of monitorMetrics) {
            const value = metric === 'fcf'
              ? snapshot.data.fcf ?? snapshot.data.freeCashFlow
              : snapshot.data[metric];
            if (safeNumber(value) !== null) {
              metricCounts.set(metric, (metricCounts.get(metric) ?? 0) + 1);
            }
          }

          const secEdgar =
            snapshot.data.secEdgar && typeof snapshot.data.secEdgar === 'object'
              ? (snapshot.data.secEdgar as Record<string, unknown>)
              : null;
          if (hasPiotroskiData(secEdgar)) {
            piotroskiReadySymbols += 1;
          }
        }

        const staleCount = freshnessAgesDays.filter((days) => days > 7).length;
        const oldestDays = freshnessAgesDays.length > 0 ? Math.max(...freshnessAgesDays) : null;
        const medianDays = median(freshnessAgesDays);
        const denom = symbolCount > 0 ? symbolCount : 1;

        return {
          id: u.id,
          name: u.name,
          symbol_count: symbolCount,
          fundamentals_symbols: fundamentalsSymbols,
          fundamentals_coverage_pct: Number(((fundamentalsSymbols / denom) * 100).toFixed(1)),
          piotroski_ready_symbols: piotroskiReadySymbols,
          piotroski_ready_pct: Number(((piotroskiReadySymbols / denom) * 100).toFixed(1)),
          freshness: {
            oldest_days: oldestDays === null ? null : Number(oldestDays.toFixed(1)),
            median_days: medianDays === null ? null : Number(medianDays.toFixed(1)),
            pct_older_than_7d: Number(((staleCount / Math.max(freshnessAgesDays.length, 1)) * 100).toFixed(1)),
            sample_size: freshnessAgesDays.length,
          },
          provider_breakdown: providerBreakdown,
          metric_coverage: monitorMetrics.map((metric) => {
            const coveredSymbols = metricCounts.get(metric) ?? 0;
            return {
              field: metric,
              covered_symbols: coveredSymbols,
              coverage_pct: Number(((coveredSymbols / denom) * 100).toFixed(1)),
            };
          }),
        };
      })
      .filter((u) => u.symbol_count >= 40)
      .sort((a, b) => b.fundamentals_coverage_pct - a.fundamentals_coverage_pct);

    const qualityMonitorTrend = readAuditTrend();

    const providerKeyFields = [
      'peRatio',
      'roe',
      'debtToEquity',
      'grossMargin',
      'earningsGrowth',
      'dividendYield',
    ] as const;

    const providerCoverage: ProviderHealthData[] = universeCatalog
      .filter((u) => u.symbols.length > 0)
      .map((u) => {
        const coverage = getProviderCoverage(u.symbols);
        const total = coverage.total;
        const mergedCoverage = coverage.total - coverage.neither;
        const fmpCoverage = coverage.fmp_only + coverage.both;
        const yfinanceCoverage = coverage.yfinance_only + coverage.both;
        const gap = coverage.neither;
        const denom = total > 0 ? total : 1;

        return {
          universe: u.name,
          total_symbols: total,
          fmp_coverage: fmpCoverage,
          yfinance_coverage: yfinanceCoverage,
          merged_coverage: mergedCoverage,
          gap,
          key_fields: providerKeyFields.map((field) => {
            const fieldCoverage = coverage.field_coverage[field] ?? {
              fmp: 0,
              yfinance: 0,
              merged: 0,
            };
            return {
              field,
              fmp_pct: Number(((fieldCoverage.fmp / denom) * 100).toFixed(1)),
              yfinance_pct: Number(((fieldCoverage.yfinance / denom) * 100).toFixed(1)),
              merged_pct: Number(((fieldCoverage.merged / denom) * 100).toFixed(1)),
            };
          }),
        };
      })
      .sort((a, b) => b.merged_coverage - a.merged_coverage);

    let regimeCurrent = 'UNKNOWN';
    let regimeComposite: number | null = null;
    let regimeAsOf: string | null = null;

    try {
      const regime = detectRegime(today);
      regimeCurrent = regime.label;
      regimeComposite = Number(regime.composite_score.toFixed(2));
      regimeAsOf = regime.as_of_date;
    } catch {
      // keep UNKNOWN when regime cannot be computed
    }

    const response: HealthSnapshot = {
      generated_at: today,
      system: {
        version: safeReadPackageVersion(),
      },
      database: {
        privatinvestor_db: {
          size_mb: getDbSizeMb(privateDbPath),
          tables: {
            prices_eod: {
              row_count: privatePrices.row_count ?? 0,
              latest_date: privatePrices.latest_date ?? null,
              oldest_date: privatePrices.oldest_date ?? null,
            },
            fundamentals_snapshot: {
              row_count: privateFundamentals.row_count ?? 0,
              latest_fetched: toDateStringFromEpoch(privateFundamentals.latest_fetched),
            },
            macro_indicators: {
              row_count: privateMacro.row_count ?? 0,
              series: macroSeries,
              latest_date: privateMacro.latest_date ?? null,
              latest_fetched: toDateStringFromEpoch(privateMacro.latest_fetched),
            },
            run_index: {
              row_count: privateRuns.row_count ?? 0,
              latest_run: privateRuns.latest_run ?? null,
            },
          },
        },
        market_data_db: {
          size_mb: getDbSizeMb(marketDbPath),
          tables: {
            fundamentals: {
              row_count: rowCount,
              snapshot_date: marketFundSnapshotDate,
              coverage,
              coverage_numeric: {
                trailing_pe: Number(coverageNumeric.trailing_pe.toFixed(1)),
                earnings_growth: Number(coverageNumeric.earnings_growth.toFixed(1)),
                dividend_yield: Number(coverageNumeric.dividend_yield.toFixed(1)),
                payout_ratio: Number(coverageNumeric.payout_ratio.toFixed(1)),
              },
            },
            prices: {
              row_count: marketPrices.row_count ?? 0,
              latest_date: normalizeDateString(marketPrices.latest_date),
              oldest_date: normalizeDateString(marketPrices.oldest_date),
            },
          },
        },
      },
      etl: {
        last_price_update:
          normalizeDateString(privatePrices.latest_date) ??
          normalizeDateString(marketPrices.latest_date) ??
          null,
        last_fundamental_update:
          toDateStringFromEpoch(privateFundamentals.latest_fetched) ?? marketFundSnapshotDate ?? null,
        last_fred_update: toDateStringFromEpoch(privateMacro.latest_fetched) ?? privateMacro.latest_date ?? null,
        last_run_update: privateRuns.latest_run ?? null,
        universes_loaded: universesLoaded,
        universes,
      },
      regime: {
        current: regimeCurrent,
        composite_score: regimeComposite,
        as_of: regimeAsOf,
      },
      provider_coverage: providerCoverage,
      quality_monitor: {
        universes: qualityMonitorUniverses,
        trend: qualityMonitorTrend,
      },
      etl_runs: getRecentEtlRuns(20),
    };

    return response;
  } finally {
    if (marketDb) {
      marketDb.close();
    }
  }
}

export function getHealthSnapshot(opts: { forceRefresh?: boolean } = {}): HealthSnapshot {
  const now = Date.now();
  const forceRefresh = opts.forceRefresh ?? false;

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }

  const data = buildHealthSnapshot();
  cached = {
    data,
    expiresAt: now + CACHE_TTL_MS,
  };
  return data;
}
