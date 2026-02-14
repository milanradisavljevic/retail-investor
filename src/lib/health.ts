import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getDatabase } from '@/data/db';
import { getProviderCoverage } from '@/data/repositories/provider_merge';
import { detectRegime } from '@/regime/engine';

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
