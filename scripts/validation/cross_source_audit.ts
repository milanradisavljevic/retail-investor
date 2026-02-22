#!/usr/bin/env tsx
/**
 * Cross-source consistency audit for fundamentals snapshots.
 *
 * Compares ROE, debtToEquity, revenue and netIncome across providers and
 * flags large deviations:
 * - Conflict: deviation > 15%
 * - Critical: deviation > 50%
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';

type CanonicalSource = 'sec_edgar_bulk' | 'sec_edgar' | 'fmp' | 'yfinance' | 'unknown';
type MetricName = 'roe' | 'debtToEquity' | 'revenue' | 'netIncome';
type Severity = 'ok' | 'conflict' | 'critical';
type PairKey = `${CanonicalSource}__${CanonicalSource}`;

interface CliOptions {
  universe: string;
  dbPath: string;
  marketDbPath: string;
  conflictThresholdPct: number;
  criticalThresholdPct: number;
  topN: number;
}

interface SourceSnapshot {
  source: CanonicalSource;
  fetchedAt: number;
  data: Record<string, unknown>;
  sourceWasMissing: boolean;
}

interface PairEvent {
  symbol: string;
  metric: MetricName;
  sourceA: CanonicalSource;
  sourceB: CanonicalSource;
  valueA: number;
  valueB: number;
  deviationPct: number;
  severity: Severity;
  sector: string;
}

interface OutlierEvent {
  symbol: string;
  metric: MetricName;
  source: CanonicalSource;
  value: number;
  medianValue: number;
  deviationFromMedianPct: number;
  severity: Severity;
  sector: string;
}

const METRICS: MetricName[] = ['roe', 'debtToEquity', 'revenue', 'netIncome'];
const SOURCES: CanonicalSource[] = ['sec_edgar_bulk', 'sec_edgar', 'fmp', 'yfinance'];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    universe: 'russell2000_full',
    dbPath: 'data/privatinvestor.db',
    marketDbPath: 'data/market-data.db',
    conflictThresholdPct: 15,
    criticalThresholdPct: 50,
    topN: 40,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined) continue;

    if (key === 'universe') options.universe = value;
    if (key === 'db-path') options.dbPath = value;
    if (key === 'market-db-path') options.marketDbPath = value;
    if (key === 'conflict-threshold') options.conflictThresholdPct = Number(value);
    if (key === 'critical-threshold') options.criticalThresholdPct = Number(value);
    if (key === 'top') options.topN = Number(value);
    i += 1;
  }

  return options;
}

function normalizeSource(rawSource: unknown): { source: CanonicalSource; sourceWasMissing: boolean } {
  if (rawSource === 'sec_edgar_bulk') return { source: 'sec_edgar_bulk', sourceWasMissing: false };
  if (rawSource === 'sec_edgar') return { source: 'sec_edgar', sourceWasMissing: false };
  if (rawSource === 'fmp') return { source: 'fmp', sourceWasMissing: false };
  if (rawSource === 'yfinance') return { source: 'yfinance', sourceWasMissing: false };
  if (rawSource === null || rawSource === undefined) return { source: 'yfinance', sourceWasMissing: true };
  return { source: 'unknown', sourceWasMissing: false };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getMetricValue(data: Record<string, unknown>, metric: MetricName): number | null {
  const secEdgar = data.secEdgar && typeof data.secEdgar === 'object'
    ? (data.secEdgar as Record<string, unknown>)
    : undefined;

  if (metric === 'roe') return toFiniteNumber(data.roe ?? secEdgar?.roe);
  if (metric === 'debtToEquity') return toFiniteNumber(data.debtToEquity ?? secEdgar?.debtToEquity);
  if (metric === 'revenue') return toFiniteNumber(data.revenue ?? secEdgar?.revenue);
  return toFiniteNumber(data.netIncome ?? secEdgar?.netIncome);
}

function percentDeviation(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return (Math.abs(a - b) / denom) * 100;
}

function severityForDeviation(
  deviationPct: number,
  conflictThresholdPct: number,
  criticalThresholdPct: number
): Severity {
  if (deviationPct > criticalThresholdPct) return 'critical';
  if (deviationPct > conflictThresholdPct) return 'conflict';
  return 'ok';
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function pairKey(a: CanonicalSource, b: CanonicalSource): PairKey {
  return [a, b].sort().join('__') as PairKey;
}

function loadUniverseSymbols(universeName: string): string[] {
  const universeFile = universeName.endsWith('.json') ? universeName : `${universeName}.json`;
  const universePath = resolve(process.cwd(), 'config', 'universes', universeFile);
  const payload = JSON.parse(readFileSync(universePath, 'utf-8')) as { symbols?: string[] };
  return [...new Set((payload.symbols ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
}

function loadLatestSnapshotsBySource(
  db: Database.Database,
  symbols: Set<string>
): {
  bySymbol: Map<string, Map<CanonicalSource, SourceSnapshot>>;
  missingSourceInferredAsYfCount: number;
  unknownSourceCount: number;
} {
  const stmt = db.prepare(`
    SELECT symbol, fetched_at as fetchedAt, data_json as dataJson
    FROM fundamentals_snapshot
    ORDER BY symbol ASC, fetched_at DESC
  `);

  const rows = stmt.iterate() as Iterable<{ symbol: string; fetchedAt: number; dataJson: string }>;
  const bySymbol = new Map<string, Map<CanonicalSource, SourceSnapshot>>();
  let missingSourceInferredAsYfCount = 0;
  let unknownSourceCount = 0;

  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    if (!symbols.has(symbol)) continue;

    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(row.dataJson);
      if (!parsed || typeof parsed !== 'object') continue;
      data = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const normalized = normalizeSource(data._source);
    if (normalized.sourceWasMissing) missingSourceInferredAsYfCount += 1;
    if (normalized.source === 'unknown') unknownSourceCount += 1;

    let sourceMap = bySymbol.get(symbol);
    if (!sourceMap) {
      sourceMap = new Map<CanonicalSource, SourceSnapshot>();
      bySymbol.set(symbol, sourceMap);
    }

    if (sourceMap.has(normalized.source)) continue;
    sourceMap.set(normalized.source, {
      source: normalized.source,
      fetchedAt: Number(row.fetchedAt),
      data,
      sourceWasMissing: normalized.sourceWasMissing,
    });

    if (SOURCES.every((s) => sourceMap?.has(s))) {
      continue;
    }
  }

  return { bySymbol, missingSourceInferredAsYfCount, unknownSourceCount };
}

function loadSectors(
  symbols: Set<string>,
  privateDbPath: string,
  marketDbPath: string
): Map<string, string> {
  const sectorBySymbol = new Map<string, string>();
  const privateDb = new Database(resolve(process.cwd(), privateDbPath), { readonly: true });
  try {
    const hasCompanyProfile = privateDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_profile' LIMIT 1")
      .get();

    if (hasCompanyProfile) {
      const rows = privateDb.prepare(`
        WITH latest_profile AS (
          SELECT symbol, MAX(fetched_at) as fetched_at
          FROM company_profile
          GROUP BY symbol
        )
        SELECT p.symbol, p.sector
        FROM company_profile p
        JOIN latest_profile lp
          ON lp.symbol = p.symbol
         AND lp.fetched_at = p.fetched_at
      `).all() as Array<{ symbol: string; sector: string | null }>;

      for (const row of rows) {
        const symbol = String(row.symbol).toUpperCase();
        if (!symbols.has(symbol)) continue;
        if (row.sector && row.sector.trim()) {
          sectorBySymbol.set(symbol, row.sector.trim());
        }
      }
    }
  } finally {
    privateDb.close();
  }

  const resolvedMarketDbPath = resolve(process.cwd(), marketDbPath);
  if (!existsSync(resolvedMarketDbPath)) return sectorBySymbol;

  const marketDb = new Database(resolvedMarketDbPath, { readonly: true });
  try {
    const hasMetadata = marketDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata' LIMIT 1")
      .get();
    if (!hasMetadata) return sectorBySymbol;

    const rows = marketDb.prepare('SELECT symbol, sector FROM metadata').all() as Array<{
      symbol: string;
      sector: string | null;
    }>;

    for (const row of rows) {
      const symbol = String(row.symbol).toUpperCase();
      if (!symbols.has(symbol)) continue;
      if (sectorBySymbol.has(symbol)) continue;
      if (row.sector && row.sector.trim()) {
        sectorBySymbol.set(symbol, row.sector.trim());
      }
    }
  } finally {
    marketDb.close();
  }

  return sectorBySymbol;
}

function runAudit(options: CliOptions) {
  const symbols = new Set(loadUniverseSymbols(options.universe));
  const db = new Database(resolve(process.cwd(), options.dbPath), { readonly: true });

  const {
    bySymbol,
    missingSourceInferredAsYfCount,
    unknownSourceCount,
  } = loadLatestSnapshotsBySource(db, symbols);
  db.close();

  const sectors = loadSectors(symbols, options.dbPath, options.marketDbPath);
  const pairEvents: PairEvent[] = [];
  const outlierEvents: OutlierEvent[] = [];
  const metricCoverageBySource: Record<MetricName, Record<CanonicalSource, number>> = {
    roe: { sec_edgar_bulk: 0, sec_edgar: 0, fmp: 0, yfinance: 0, unknown: 0 },
    debtToEquity: { sec_edgar_bulk: 0, sec_edgar: 0, fmp: 0, yfinance: 0, unknown: 0 },
    revenue: { sec_edgar_bulk: 0, sec_edgar: 0, fmp: 0, yfinance: 0, unknown: 0 },
    netIncome: { sec_edgar_bulk: 0, sec_edgar: 0, fmp: 0, yfinance: 0, unknown: 0 },
  };

  let symbolsWithAnyData = 0;
  let symbolsWithAtLeast2Sources = 0;
  let symbolsWithAllThreePrimarySources = 0;

  for (const [symbol, sourceMap] of bySymbol.entries()) {
    if (sourceMap.size === 0) continue;
    symbolsWithAnyData += 1;
    if (sourceMap.size >= 2) symbolsWithAtLeast2Sources += 1;
    if (
      sourceMap.has('sec_edgar_bulk') &&
      sourceMap.has('fmp') &&
      sourceMap.has('yfinance')
    ) {
      symbolsWithAllThreePrimarySources += 1;
    }

    const sector = sectors.get(symbol) ?? 'Unknown';

    for (const metric of METRICS) {
      const available: Array<{ source: CanonicalSource; value: number }> = [];
      for (const snapshot of sourceMap.values()) {
        const value = getMetricValue(snapshot.data, metric);
        if (value === null) continue;
        metricCoverageBySource[metric][snapshot.source] += 1;
        available.push({ source: snapshot.source, value });
      }

      if (available.length < 2) continue;

      for (let i = 0; i < available.length; i += 1) {
        for (let j = i + 1; j < available.length; j += 1) {
          const left = available[i];
          const right = available[j];
          const deviationPct = percentDeviation(left.value, right.value);
          const severity = severityForDeviation(
            deviationPct,
            options.conflictThresholdPct,
            options.criticalThresholdPct
          );

          pairEvents.push({
            symbol,
            metric,
            sourceA: left.source,
            sourceB: right.source,
            valueA: left.value,
            valueB: right.value,
            deviationPct,
            severity,
            sector,
          });
        }
      }

      if (available.length >= 3) {
        const metricMedian = median(available.map((e) => e.value));
        for (const entry of available) {
          const deviation = percentDeviation(entry.value, metricMedian);
          const severity = severityForDeviation(
            deviation,
            options.conflictThresholdPct,
            options.criticalThresholdPct
          );
          if (severity === 'ok') continue;
          outlierEvents.push({
            symbol,
            metric,
            source: entry.source,
            value: entry.value,
            medianValue: metricMedian,
            deviationFromMedianPct: deviation,
            severity,
            sector,
          });
        }
      }
    }
  }

  const pairSummary: Record<
    MetricName,
    Record<PairKey, {
      comparisons: number;
      conflictCount: number;
      criticalCount: number;
      conflictRatePct: number;
      criticalRatePct: number;
      meanDeviationPct: number;
      p95DeviationPct: number;
    }>
  > = {
    roe: {} as Record<PairKey, any>,
    debtToEquity: {} as Record<PairKey, any>,
    revenue: {} as Record<PairKey, any>,
    netIncome: {} as Record<PairKey, any>,
  };

  const eventsByMetricAndPair = new Map<string, PairEvent[]>();
  for (const event of pairEvents) {
    const key = `${event.metric}::${pairKey(event.sourceA, event.sourceB)}`;
    const bucket = eventsByMetricAndPair.get(key) ?? [];
    bucket.push(event);
    eventsByMetricAndPair.set(key, bucket);
  }

  for (const metric of METRICS) {
    for (const left of SOURCES) {
      for (const right of SOURCES) {
        if (left >= right) continue;
        const pKey = pairKey(left, right);
        const events = eventsByMetricAndPair.get(`${metric}::${pKey}`) ?? [];
        const comparisons = events.length;
        const conflictCount = events.filter((e) => e.severity === 'conflict').length;
        const criticalCount = events.filter((e) => e.severity === 'critical').length;
        const deviations = events.map((e) => e.deviationPct);

        pairSummary[metric][pKey] = {
          comparisons,
          conflictCount,
          criticalCount,
          conflictRatePct: comparisons > 0 ? (conflictCount / comparisons) * 100 : 0,
          criticalRatePct: comparisons > 0 ? (criticalCount / comparisons) * 100 : 0,
          meanDeviationPct: mean(deviations),
          p95DeviationPct: percentile(deviations, 95),
        };
      }
    }
  }

  const sourceOutlierSummary: Record<
    CanonicalSource,
    Record<MetricName, { conflictCount: number; criticalCount: number }>
  > = {
    sec_edgar_bulk: {
      roe: { conflictCount: 0, criticalCount: 0 },
      debtToEquity: { conflictCount: 0, criticalCount: 0 },
      revenue: { conflictCount: 0, criticalCount: 0 },
      netIncome: { conflictCount: 0, criticalCount: 0 },
    },
    sec_edgar: {
      roe: { conflictCount: 0, criticalCount: 0 },
      debtToEquity: { conflictCount: 0, criticalCount: 0 },
      revenue: { conflictCount: 0, criticalCount: 0 },
      netIncome: { conflictCount: 0, criticalCount: 0 },
    },
    fmp: {
      roe: { conflictCount: 0, criticalCount: 0 },
      debtToEquity: { conflictCount: 0, criticalCount: 0 },
      revenue: { conflictCount: 0, criticalCount: 0 },
      netIncome: { conflictCount: 0, criticalCount: 0 },
    },
    yfinance: {
      roe: { conflictCount: 0, criticalCount: 0 },
      debtToEquity: { conflictCount: 0, criticalCount: 0 },
      revenue: { conflictCount: 0, criticalCount: 0 },
      netIncome: { conflictCount: 0, criticalCount: 0 },
    },
    unknown: {
      roe: { conflictCount: 0, criticalCount: 0 },
      debtToEquity: { conflictCount: 0, criticalCount: 0 },
      revenue: { conflictCount: 0, criticalCount: 0 },
      netIncome: { conflictCount: 0, criticalCount: 0 },
    },
  };

  const sectorSummary = new Map<string, { conflicts: number; critical: number }>();
  for (const event of outlierEvents) {
    if (event.severity === 'conflict') {
      sourceOutlierSummary[event.source][event.metric].conflictCount += 1;
    }
    if (event.severity === 'critical') {
      sourceOutlierSummary[event.source][event.metric].criticalCount += 1;
    }
    const aggregate = sectorSummary.get(event.sector) ?? { conflicts: 0, critical: 0 };
    if (event.severity === 'critical') aggregate.critical += 1;
    if (event.severity === 'conflict') aggregate.conflicts += 1;
    sectorSummary.set(event.sector, aggregate);
  }

  const topPairConflicts = [...pairEvents]
    .filter((e) => e.severity !== 'ok')
    .sort((a, b) => b.deviationPct - a.deviationPct)
    .slice(0, options.topN);

  const topSourceOutliers = [...outlierEvents]
    .sort((a, b) => b.deviationFromMedianPct - a.deviationFromMedianPct)
    .slice(0, options.topN);

  const sectorRows = [...sectorSummary.entries()]
    .map(([sector, values]) => ({ sector, ...values }))
    .sort((a, b) => (b.critical + b.conflicts) - (a.critical + a.conflicts))
    .slice(0, options.topN);

  const report = {
    generated_at: new Date().toISOString(),
    universe: options.universe,
    thresholds: {
      conflict_pct: options.conflictThresholdPct,
      critical_pct: options.criticalThresholdPct,
    },
    summary: {
      universe_symbols: symbols.size,
      symbols_with_any_snapshot: symbolsWithAnyData,
      symbols_with_multi_source: symbolsWithAtLeast2Sources,
      symbols_with_sec_fmp_yf: symbolsWithAllThreePrimarySources,
      pair_comparisons_total: pairEvents.length,
      pair_conflicts_total: pairEvents.filter((e) => e.severity === 'conflict').length,
      pair_critical_total: pairEvents.filter((e) => e.severity === 'critical').length,
      source_outliers_total: outlierEvents.length,
      inferred_yfinance_from_missing_source: missingSourceInferredAsYfCount,
      unknown_source_rows: unknownSourceCount,
    },
    metric_coverage_by_source: metricCoverageBySource,
    pair_summary: pairSummary,
    source_outlier_summary: sourceOutlierSummary,
    sector_summary: sectorRows,
    top_pair_conflicts: topPairConflicts,
    top_source_outliers: topSourceOutliers,
  };

  const validationDir = join(process.cwd(), 'data', 'validation');
  if (!existsSync(validationDir)) mkdirSync(validationDir, { recursive: true });
  const auditsDir = join(process.cwd(), 'data', 'audits');
  if (!existsSync(auditsDir)) mkdirSync(auditsDir, { recursive: true });

  const stablePath = join(validationDir, 'cross-source-audit.json');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = join(auditsDir, `cross_source_audit_${timestamp}.json`);

  writeFileSync(stablePath, JSON.stringify(report, null, 2));
  writeFileSync(timestampedPath, JSON.stringify(report, null, 2));

  return { report, stablePath, timestampedPath };
}

function printSummary(
  result: ReturnType<typeof runAudit>['report'],
  stablePath: string,
  timestampedPath: string
) {
  console.log('================================================================');
  console.log('CROSS-SOURCE CONSISTENCY AUDIT');
  console.log(`Universe: ${result.universe}`);
  console.log(
    `Thresholds: conflict > ${result.thresholds.conflict_pct}% | critical > ${result.thresholds.critical_pct}%`
  );
  console.log('================================================================\n');

  console.log('SUMMARY');
  console.log(`  Universe symbols:             ${result.summary.universe_symbols}`);
  console.log(`  Symbols with snapshots:       ${result.summary.symbols_with_any_snapshot}`);
  console.log(`  Symbols with >=2 sources:     ${result.summary.symbols_with_multi_source}`);
  console.log(`  Symbols with SEC+FMP+YF:      ${result.summary.symbols_with_sec_fmp_yf}`);
  console.log(`  Pair comparisons:             ${result.summary.pair_comparisons_total}`);
  console.log(`  Pair conflicts:               ${result.summary.pair_conflicts_total}`);
  console.log(`  Pair critical:                ${result.summary.pair_critical_total}`);
  console.log(`  Source outliers (>=3 source): ${result.summary.source_outliers_total}`);
  console.log('');

  for (const metric of METRICS) {
    const secVsFmp = result.pair_summary[metric]['fmp__sec_edgar_bulk'];
    const secVsYf = result.pair_summary[metric]['sec_edgar_bulk__yfinance'];
    const fmpVsYf = result.pair_summary[metric]['fmp__yfinance'];
    console.log(`METRIC ${metric}`);
    if (secVsFmp) {
      console.log(
        `  SEC vs FMP: comparisons=${secVsFmp.comparisons}, conflict=${secVsFmp.conflictRatePct.toFixed(1)}%, critical=${secVsFmp.criticalRatePct.toFixed(1)}%`
      );
    }
    if (secVsYf) {
      console.log(
        `  SEC vs YF:  comparisons=${secVsYf.comparisons}, conflict=${secVsYf.conflictRatePct.toFixed(1)}%, critical=${secVsYf.criticalRatePct.toFixed(1)}%`
      );
    }
    if (fmpVsYf) {
      console.log(
        `  FMP vs YF:  comparisons=${fmpVsYf.comparisons}, conflict=${fmpVsYf.conflictRatePct.toFixed(1)}%, critical=${fmpVsYf.criticalRatePct.toFixed(1)}%`
      );
    }
    console.log('');
  }

  console.log(`Stable report: ${stablePath}`);
  console.log(`Snapshot report: ${timestampedPath}`);
}

function main() {
  const options = parseArgs(process.argv);
  const { report, stablePath, timestampedPath } = runAudit(options);
  printSummary(report, stablePath, timestampedPath);
}

main();
