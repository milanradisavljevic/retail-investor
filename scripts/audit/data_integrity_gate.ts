#!/usr/bin/env tsx
/**
 * Data Integrity Gate
 *
 * Validates that a universe has sufficient data coverage before running
 * backtests or live runs. Exits non-zero on failure and writes an audit report.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type GateMode = 'backtest' | 'live';

type GateOptions = {
  dbPath: string;
  universeName?: string;
  universeFile?: string;
  benchmark?: string;
  minPriceCoverage?: number;
  minAvgCoverage?: number;
  mode?: GateMode;
};

type GateResult = {
  ok: boolean;
  failureReason?: 'invalid_universe' | 'insufficient_data' | 'missing_benchmark';
  exitCode: number;
  reportPath: string;
  summary: any;
};

const EXIT_CODES: Record<NonNullable<GateResult['failureReason']>, number> = {
  invalid_universe: 4,
  insufficient_data: 2,
  missing_benchmark: 3,
};

function parseArgs(argv: string[]): GateOptions {
  const opts: any = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    switch (key) {
      case 'db-path':
        opts.dbPath = next;
        i++;
        break;
      case 'universe':
        opts.universeName = next;
        i++;
        break;
      case 'universe-file':
        opts.universeFile = next;
        i++;
        break;
      case 'benchmark':
        opts.benchmark = next?.toUpperCase();
        i++;
        break;
      case 'min-price-coverage':
        opts.minPriceCoverage = Number(next);
        i++;
        break;
      case 'min-avgmetrics-coverage':
        opts.minAvgCoverage = Number(next);
        i++;
        break;
      case 'mode':
        opts.mode = (next as GateMode) ?? 'backtest';
        i++;
        break;
      default:
        break;
    }
  }
  
  if (!opts.universeName && !opts.universeFile) {
    console.error('ERROR: Either --universe or --universe-file must be provided');
    console.error('');
    console.error('Usage:');
    console.error('  tsx scripts/audit/data_integrity_gate.ts --universe <universe-name>');
    console.error('  tsx scripts/audit/data_integrity_gate.ts --universe-file <path/to/universe.json>');
    console.error('');
    console.error('Examples:');
    console.error('  tsx scripts/audit/data_integrity_gate.ts --universe russell2000_full');
    console.error('  tsx scripts/audit/data_integrity_gate.ts --universe-file config/universes/sp500_full.json');
    console.error('');
    console.error('Options:');
    console.error('  --universe <name>           Universe name (looks in config/universes/)');
    console.error('  --universe-file <path>       Path to custom universe JSON file');
    console.error('  --db-path <path>             Path to market-data.db (default: data/market-data.db)');
    console.error('  --benchmark <symbol>         Benchmark symbol to validate (e.g., SPY)');
    console.error('  --min-price-coverage <num>   Minimum price coverage (default: 0.9)');
    console.error('  --min-avgmetrics-coverage <num> Minimum avgMetrics coverage (default: 0.7)');
    console.error('  --mode <backtest|live>      Gate mode (default: backtest)');
    process.exit(4);
  }
  
  return opts as GateOptions;
}

function loadUniverseSymbols(universeName?: string, universeFile?: string): { name: string; symbols: string[] } {
  const resolvedPath = universeFile
    ? path.isAbsolute(universeFile)
      ? universeFile
      : path.resolve(process.cwd(), universeFile)
    : path.resolve(process.cwd(), 'config', 'universes', `${universeName ?? 'universe'}.json`);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Universe file not found: ${resolvedPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  const symbols: string[] = (parsed.symbols ?? parsed)?.map((s: any) => String(s).toUpperCase());
  const name = parsed.name || path.basename(resolvedPath, '.json');
  return { name, symbols };
}

function gatherDbSets(db: Database.Database) {
  const prices = new Set<string>(
    db.prepare('SELECT DISTINCT symbol FROM prices').all().map((r: any) => String(r.symbol).toUpperCase())
  );
  const avg = new Set<string>(
    db.prepare('SELECT DISTINCT symbol FROM fundamentals_avg').all().map((r: any) => String(r.symbol).toUpperCase())
  );
  return { prices, avg };
}

function setMissing(universe: Set<string>, have: Set<string>, limit = 25): string[] {
  const missing: string[] = [];
  for (const sym of universe) {
    if (!have.has(sym)) {
      missing.push(sym);
      if (missing.length >= limit) break;
    }
  }
  return missing;
}

export function runDataIntegrityGate(options: GateOptions): GateResult {
  const {
    dbPath = path.resolve(process.cwd(), 'data', 'market-data.db'),
    universeName,
    universeFile,
    benchmark,
    minPriceCoverage = 0.9,
    minAvgCoverage = 0.7,
    mode = 'backtest',
  } = options;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const auditDir = path.resolve(process.cwd(), 'data', 'audits');
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  let universe;
  try {
    universe = loadUniverseSymbols(universeName, universeFile);
  } catch (err: any) {
    const reportPath = path.join(auditDir, `${ts}-invalid_universe-${mode}.json`);
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ ok: false, error: String(err), universeName, universeFile }, null, 2)
    );
    return {
      ok: false,
      failureReason: 'invalid_universe',
      exitCode: EXIT_CODES.invalid_universe,
      reportPath,
      summary: { error: String(err) },
    };
  }

  if (!universe.symbols || universe.symbols.length === 0) {
    const reportPath = path.join(auditDir, `${ts}-empty-universe-${mode}.json`);
    const payload = { ok: false, error: 'Universe has no symbols', universe };
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
    return {
      ok: false,
      failureReason: 'invalid_universe',
      exitCode: EXIT_CODES.invalid_universe,
      reportPath,
      summary: payload,
    };
  }

  if (!fs.existsSync(dbPath)) {
    const reportPath = path.join(auditDir, `${ts}-missing-db-${mode}.json`);
    const payload = { ok: false, error: `DB not found at ${dbPath}` };
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
    return {
      ok: false,
      failureReason: 'insufficient_data',
      exitCode: EXIT_CODES.insufficient_data,
      reportPath,
      summary: payload,
    };
  }

  const db = new Database(dbPath, { readonly: true });
  const { prices, avg } = gatherDbSets(db);
  db.close();

  const uniSet = new Set(universe.symbols);
  const priceCovered = [...uniSet].filter((s) => prices.has(s)).length;
  const avgCovered = [...uniSet].filter((s) => avg.has(s)).length;
  const universeSize = universe.symbols.length;
  const priceCoverage = priceCovered / universeSize;
  const avgCoverage = avgCovered / universeSize;

  let benchmarkRows = 0;
  if (benchmark) {
    const db2 = new Database(dbPath, { readonly: true });
    const row = db2.prepare('SELECT COUNT(*) as c FROM prices WHERE symbol = ?').get(benchmark) as { c?: number };
    benchmarkRows = row?.c ?? 0;
    db2.close();
  }

  const missingPrices = setMissing(uniSet, prices);
  const missingAvg = setMissing(uniSet, avg);

  let ok = true;
  let failureReason: GateResult['failureReason'] | undefined;
  let exitCode = 0;

  if (benchmark && benchmarkRows === 0) {
    ok = false;
    failureReason = 'missing_benchmark';
    exitCode = EXIT_CODES.missing_benchmark;
  } else if (priceCoverage < minPriceCoverage || avgCoverage < minAvgCoverage) {
    ok = false;
    failureReason = 'insufficient_data';
    exitCode = EXIT_CODES.insufficient_data;
  }

  const report = {
    ok,
    failure_reason: failureReason,
    timestamp: ts,
    mode,
    db_path: dbPath,
    universe_name: universe.name,
    universe_file: universeFile,
    universe_size: universeSize,
    thresholds: {
      min_price_coverage: minPriceCoverage,
      min_avgmetrics_coverage: minAvgCoverage,
    },
    coverage: {
      price_symbols: priceCovered,
      avg_symbols: avgCovered,
      price_coverage: priceCoverage,
      avg_coverage: avgCoverage,
    },
    missing: {
      prices: missingPrices,
      avgmetrics: missingAvg,
    },
    benchmark: benchmark
      ? {
          symbol: benchmark,
          rows: benchmarkRows,
        }
      : undefined,
  };

  const safeName = universe.name.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const reportPath = path.join(auditDir, `${ts}-${safeName}-${mode}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (!ok && exitCode === 0) {
    exitCode = EXIT_CODES.insufficient_data;
  }

  return {
    ok,
    failureReason,
    exitCode,
    reportPath,
    summary: report,
  };
}

if (process.argv[1]?.includes('data_integrity_gate')) {
  const args = parseArgs(process.argv);
  const result = runDataIntegrityGate(args);
  if (!result.ok) {
    console.error('Data Integrity Gate FAILED:', result.summary.failure_reason || result.failureReason);
    console.error('See audit report:', result.reportPath);
    process.exit(result.exitCode);
  }
  console.log('Data Integrity Gate PASSED');
  console.log('Audit report:', result.reportPath);
  process.exit(0);
}
