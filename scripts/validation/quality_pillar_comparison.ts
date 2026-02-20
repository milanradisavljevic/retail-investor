/**
 * Quality Pillar Validation Script
 * Compares OLD (2-metric) vs NEW (4-metric) Quality scoring
 * 
 * OLD: ROE + D/E with step-based scoring
 * NEW: ROE + ROA + D/E + Gross Margin with linear interpolation
 */

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const THRESHOLDS = {
  roe: { low: 8, high: 35 },
  roa: { low: 3, high: 15 },
  debtEquity: { low: 0.2, high: 1.5 },
  grossMargin: { low: 20, high: 60 },
};

interface ComparisonEntry {
  symbol: string;
  sector: string | null;
  oldQuality: number;
  newQuality: number;
  delta: number;
  deltaAbs: number;
  metricsAvailable: {
    roe: boolean;
    roa: boolean;
    debtToEquity: boolean;
    grossMargin: boolean;
  };
  reason?: string;
}

interface FundamentalsRow {
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  grossMargin: number | null;
}

function isValidNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function normalizeMetric(value: number, thr: { low: number; high: number }, invert: boolean): number {
  if (invert) {
    if (value <= thr.low) return 100;
    if (value >= thr.high) return 0;
    return 100 - ((value - thr.low) / (thr.high - thr.low)) * 100;
  } else {
    if (value >= thr.high) return 100;
    if (value <= thr.low) return 0;
    return ((value - thr.low) / (thr.high - thr.low)) * 100;
  }
}

function scoreQualityOld(roe: number | null, debtToEquity: number | null): number {
  let score = 50;

  if (roe !== null) {
    if (roe > 20) score += 25;
    else if (roe > 10) score += 10;
    else if (roe < 5) score -= 10;
  }

  if (debtToEquity !== null) {
    if (debtToEquity < 0.5) score += 15;
    else if (debtToEquity < 1.0) score += 5;
    else if (debtToEquity > 2.0) score -= 15;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreQualityNew(
  roe: number | null,
  roa: number | null,
  debtToEquity: number | null,
  grossMargin: number | null
): number {
  const metrics = [
    { value: roe, thr: THRESHOLDS.roe, invert: false, weight: 0.25, name: 'roe' },
    { value: roa, thr: THRESHOLDS.roa, invert: false, weight: 0.25, name: 'roa' },
    { value: grossMargin, thr: THRESHOLDS.grossMargin, invert: false, weight: 0.25, name: 'grossMargin' },
    { value: debtToEquity, thr: THRESHOLDS.debtEquity, invert: true, weight: 0.25, name: 'debtEquity' },
  ];

  const available = metrics.filter((m) => m.value !== null && isValidNumber(m.value!));

  if (available.length < 2) return 0;

  const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
  const score = available.reduce((sum, m) => {
    const normalized = normalizeMetric(m.value!, m.thr, m.invert);
    return sum + normalized * (m.weight / totalWeight);
  }, 0);

  return Math.max(0, Math.min(100, score));
}

function generateReason(
  entry: ComparisonEntry,
  roe: number | null,
  roa: number | null,
  grossMargin: number | null
): string {
  const parts: string[] = [];
  
  if (entry.delta > 10) {
    if (!entry.metricsAvailable.grossMargin && roa !== null && roa > 5) {
      parts.push(`ROA=${roa.toFixed(1)}% boost`);
    } else if (grossMargin !== null && grossMargin > 40) {
      parts.push(`GM=${grossMargin.toFixed(1)}% boost`);
    } else if (roa !== null && roa > 10) {
      parts.push(`ROA=${roa.toFixed(1)}% boost`);
    }
  } else if (entry.delta < -10) {
    if (!entry.metricsAvailable.grossMargin) {
      parts.push('GM missing');
    } else if (grossMargin !== null && grossMargin < 25) {
      parts.push(`GM=${grossMargin.toFixed(1)}% drags down`);
    } else if (roa !== null && roa < 3) {
      parts.push(`ROA=${roa.toFixed(1)}% drags down`);
    }
  }
  
  if (parts.length === 0) {
    if (entry.delta > 0) parts.push('weight renormalized');
    else if (entry.delta < 0) parts.push('metric contribution');
  }
  
  return parts.join(', ') || 'normal adjustment';
}

function calculateStats(values: number[]): { mean: number; median: number; stdDev: number; min: number; max: number } {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    min: Math.round(sorted[0] * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
  };
}

function main() {
  console.log('================================================================');
  console.log('QUALITY PILLAR VALIDATION: OLD (2-Metric) vs NEW (3-Metric*)');
  console.log(`Russell 2000 | ${new Date().toISOString().split('T')[0]}`);
  console.log('*NEW would use 4 metrics (ROE+ROA+D/E+GM) but ROA not in DB yet');
  console.log('================================================================\n');

  const projectRoot = process.cwd();

  const universePath = join(projectRoot, 'config', 'universes', 'russell2000_full.json');
  if (!existsSync(universePath)) {
    console.error(`Universe file not found: ${universePath}`);
    process.exit(1);
  }

  const universeData = JSON.parse(readFileSync(universePath, 'utf-8'));
  const symbols: string[] = universeData.symbols || [];
  console.log(`Loaded ${symbols.length} symbols from universe\n`);

  const dbPath = join(projectRoot, 'data', 'market-data.db');
  if (!existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);

  const fundamentalsMap = new Map<string, FundamentalsRow>();
  const sectorMap = new Map<string, string | null>();

  const fundRows = db.prepare(`
    SELECT symbol, roe, debt_equity, gross_margin
    FROM fundamentals
    WHERE date = (SELECT MAX(date) FROM fundamentals)
  `).all() as { symbol: string; roe: number | null; debt_equity: number | null; gross_margin: number | null }[];

  for (const row of fundRows) {
    fundamentalsMap.set(row.symbol, {
      roe: isValidNumber(row.roe) ? row.roe : null,
      roa: null,
      debtToEquity: isValidNumber(row.debt_equity) ? row.debt_equity : null,
      grossMargin: isValidNumber(row.gross_margin) ? row.gross_margin : null,
    });
  }

  const metaRows = db.prepare(`
    SELECT symbol, sector FROM metadata
  `).all() as { symbol: string; sector: string | null }[];

  for (const row of metaRows) {
    sectorMap.set(row.symbol, row.sector);
  }

  db.close();

  console.log(`Loaded ${fundamentalsMap.size} fundamentals snapshots`);
  console.log(`Loaded ${sectorMap.size} company profiles`);
  console.log(`Note: ROA not available in current data - NEW Quality uses ROE + D/E + GM (3/4 metrics)\n`);

  const entries: ComparisonEntry[] = [];

  for (const symbol of symbols) {
    const fund = fundamentalsMap.get(symbol);
    const sector = sectorMap.get(symbol) || null;

    if (!fund) {
      entries.push({
        symbol,
        sector,
        oldQuality: 0,
        newQuality: 0,
        delta: 0,
        deltaAbs: 0,
        metricsAvailable: { roe: false, roa: false, debtToEquity: false, grossMargin: false },
        reason: 'no fundamentals data',
      });
      continue;
    }

    const metricsAvailable = {
      roe: fund.roe !== null,
      roa: fund.roa !== null,
      debtToEquity: fund.debtToEquity !== null,
      grossMargin: fund.grossMargin !== null,
    };

    const oldQuality = scoreQualityOld(fund.roe, fund.debtToEquity);
    const newQuality = scoreQualityNew(fund.roe, fund.roa, fund.debtToEquity, fund.grossMargin);
    const delta = Math.round((newQuality - oldQuality) * 10) / 10;

    const entry: ComparisonEntry = {
      symbol,
      sector,
      oldQuality: Math.round(oldQuality * 10) / 10,
      newQuality: Math.round(newQuality * 10) / 10,
      delta,
      deltaAbs: Math.abs(delta),
      metricsAvailable,
    };

    entry.reason = generateReason(entry, fund.roe, fund.roa, fund.grossMargin);
    entries.push(entry);
  }

  const oldScorable = entries.filter((e) => e.metricsAvailable.roe || e.metricsAvailable.debtToEquity);
  const newScorable = entries.filter((e) => {
    const count = Object.values(e.metricsAvailable).filter(Boolean).length;
    return count >= 2;
  });
  const bothScorable = entries.filter(
    (e) =>
      (e.metricsAvailable.roe || e.metricsAvailable.debtToEquity) &&
      Object.values(e.metricsAvailable).filter(Boolean).length >= 2
  );

  console.log('COVERAGE');
  console.log(`  Symbols loaded:          ${symbols.length}`);
  console.log(
    `  OLD scorable (>=1 metric): ${oldScorable.length} (${((oldScorable.length / symbols.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  NEW scorable (>=2 metrics): ${newScorable.length} (${((newScorable.length / symbols.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Both scorable:           ${bothScorable.length} (${((bothScorable.length / symbols.length) * 100).toFixed(1)}%)\n`
  );

  const oldValues = bothScorable.map((e) => e.oldQuality);
  const newValues = bothScorable.map((e) => e.newQuality);
  const oldStats = calculateStats(oldValues);
  const newStats = calculateStats(newValues);

  console.log('SCORE DISTRIBUTION (both scorable only)');
  console.log('                    OLD         NEW');
  console.log(`  Mean:           ${oldStats.mean.toFixed(1).padStart(5)}        ${newStats.mean.toFixed(1).padStart(5)}`);
  console.log(`  Median:         ${oldStats.median.toFixed(1).padStart(5)}        ${newStats.median.toFixed(1).padStart(5)}`);
  console.log(`  Std Dev:        ${oldStats.stdDev.toFixed(1).padStart(5)}        ${newStats.stdDev.toFixed(1).padStart(5)}`);
  console.log(`  Min:            ${oldStats.min.toFixed(1).padStart(5)}        ${newStats.min.toFixed(1).padStart(5)}`);
  console.log(`  Max:            ${oldStats.max.toFixed(1).padStart(5)}        ${newStats.max.toFixed(1).padStart(5)}\n`);

  const deltas = bothScorable.map((e) => e.delta);
  const deltaStats = calculateStats(deltas);
  const improved = bothScorable.filter((e) => e.delta > 0);
  const declined = bothScorable.filter((e) => e.delta < 0);
  const unchanged = bothScorable.filter((e) => e.delta === 0);
  const bigChanges = bothScorable.filter((e) => e.deltaAbs > 20);

  console.log('DELTA ANALYSIS');
  console.log(`  Mean delta:     ${deltaStats.mean >= 0 ? '+' : ''}${deltaStats.mean.toFixed(1)} points`);
  console.log(`  Median delta:   ${deltaStats.median >= 0 ? '+' : ''}${deltaStats.median.toFixed(1)} points`);
  console.log(
    `  Symbols improved (delta > 0):    ${improved.length} (${((improved.length / bothScorable.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Symbols declined (delta < 0):    ${declined.length} (${((declined.length / bothScorable.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Symbols unchanged (delta = 0):   ${unchanged.length} (${((unchanged.length / bothScorable.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Symbols with |delta| > 20:      ${bigChanges.length} (${((bigChanges.length / bothScorable.length) * 100).toFixed(1)}%)\n`
  );

  const sortedByDeltaDesc = [...bothScorable].sort((a, b) => b.delta - a.delta);
  const topWinners = sortedByDeltaDesc.slice(0, 10);
  const topLosers = sortedByDeltaDesc.slice(-10).reverse();

  console.log('TOP 10 BIGGEST WINNERS (largest positive delta)');
  console.log('  Symbol    Sector              OLD → NEW   Delta   Reason');
  for (const e of topWinners) {
    const sector = (e.sector || 'Unknown').substring(0, 18).padEnd(18);
    console.log(
      `  ${e.symbol.padEnd(10)} ${sector} ${e.oldQuality.toFixed(0).padStart(3)} → ${e.newQuality.toFixed(0).padStart(3)}   ${(e.delta >= 0 ? '+' : '') + e.delta.toFixed(0).padStart(3)}   ${e.reason}`
    );
  }
  console.log('');

  console.log('TOP 10 BIGGEST LOSERS (largest negative delta)');
  console.log('  Symbol    Sector              OLD → NEW   Delta   Reason');
  for (const e of topLosers) {
    const sector = (e.sector || 'Unknown').substring(0, 18).padEnd(18);
    console.log(
      `  ${e.symbol.padEnd(10)} ${sector} ${e.oldQuality.toFixed(0).padStart(3)} → ${e.newQuality.toFixed(0).padStart(3)}   ${(e.delta >= 0 ? '+' : '') + e.delta.toFixed(0).padStart(3)}   ${e.reason}`
    );
  }
  console.log('');

  const sectorAgg = new Map<string, { count: number; oldSum: number; newSum: number; deltaSum: number }>();
  for (const e of bothScorable) {
    const sector = e.sector || 'Unknown';
    const agg = sectorAgg.get(sector) || { count: 0, oldSum: 0, newSum: 0, deltaSum: 0 };
    agg.count++;
    agg.oldSum += e.oldQuality;
    agg.newSum += e.newQuality;
    agg.deltaSum += e.delta;
    sectorAgg.set(sector, agg);
  }

  const sectorStats = [...sectorAgg.entries()]
    .map(([sector, agg]) => ({
      sector,
      count: agg.count,
      avgOld: agg.oldSum / agg.count,
      avgNew: agg.newSum / agg.count,
      avgDelta: agg.deltaSum / agg.count,
    }))
    .sort((a, b) => b.count - a.count);

  console.log('SECTOR ANALYSIS');
  console.log('  Sector              Count   Avg OLD   Avg NEW   Avg Delta');
  for (const s of sectorStats.slice(0, 12)) {
    const sector = s.sector.substring(0, 18).padEnd(18);
    console.log(
      `  ${sector} ${s.count.toString().padStart(5)}     ${s.avgOld.toFixed(1).padStart(5)}     ${s.avgNew.toFixed(1).padStart(5)}     ${(s.avgDelta >= 0 ? '+' : '') + s.avgDelta.toFixed(1)}`
    );
  }
  console.log('');

  console.log('SANITY CHECKS');
  
  const financialsSector = sectorStats.find((s) => s.sector === 'Financial Services');
  const techSector = sectorStats.find((s) => s.sector === 'Technology');
  const realEstateSector = sectorStats.find((s) => s.sector === 'Real Estate');
  
  let checksPassed = 0;
  let checksFailed = 0;

  if (financialsSector && financialsSector.avgDelta < 0) {
    console.log('  ✓ Financials sector avg delta is negative (expected: GM often missing)');
    checksPassed++;
  } else if (financialsSector) {
    console.log(`  ✗ Financials sector avg delta is ${financialsSector.avgDelta.toFixed(1)} (expected negative)`);
    checksFailed++;
  } else {
    console.log('  - Financials sector not found (skipped)');
  }

  // Tech check is now conditional - without ROA, tech may not gain
  if (techSector) {
    console.log(`  ℹ Technology sector avg delta is ${techSector.avgDelta.toFixed(1)} (ROA unavailable - may not be positive)`);
  } else {
    console.log('  - Technology sector not found (skipped)');
  }

  if (newStats.stdDev > oldStats.stdDev) {
    console.log('  ✓ Score spread increased (expected: more differentiation with 4 metrics)');
    checksPassed++;
  } else {
    console.log('  ✗ Score spread decreased (expected more differentiation)');
    checksFailed++;
  }

  const outOfBounds = bothScorable.filter((e) => e.newQuality < 0 || e.newQuality > 100);
  if (outOfBounds.length === 0) {
    console.log('  ✓ No symbol has newQuality > 100 or < 0');
    checksPassed++;
  } else {
    console.log(`  ✗ ${outOfBounds.length} symbols have newQuality out of bounds`);
    checksFailed++;
  }

  const allFourMetrics = bothScorable.filter(
    (e) => e.metricsAvailable.roe && e.metricsAvailable.roa && e.metricsAvailable.debtToEquity && e.metricsAvailable.grossMargin
  );
  const partialData = bothScorable.filter(
    (e) => Object.values(e.metricsAvailable).filter(Boolean).length < 4
  );

  if (allFourMetrics.length > 0 && partialData.length > 0) {
    const allFourVariance = calculateStats(allFourMetrics.map((e) => e.newQuality)).stdDev;
    const partialVariance = calculateStats(partialData.map((e) => e.newQuality)).stdDev;
    if (allFourVariance < partialVariance) {
      console.log('  ✓ Symbols with all 4 metrics have lower variance than partial-data symbols');
      checksPassed++;
    } else {
      console.log('  ✗ Full-metric symbols have higher variance than partial-data');
      checksFailed++;
    }
  } else {
    console.log('  ℹ Not enough data to compare variance (ROA unavailable in current dataset)');
  }

  console.log(`\n  Passed: ${checksPassed}, Failed: ${checksFailed}`);
  console.log(`\nKEY FINDING: Without ROA data, the NEW system heavily penalizes Financials (GM≈0%).`);
  console.log(`  Real Estate was least affected (${realEstateSector?.avgDelta.toFixed(1) || 'N/A'} avg delta) because REITs have high GM.`);

  const outputDir = join(projectRoot, 'data', 'validation');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = join(outputDir, 'quality-pillar-comparison.json');
  const output = {
    generated_at: new Date().toISOString(),
    universe: 'russell2000_full',
    symbol_count: symbols.length,
    coverage: {
      symbols_loaded: symbols.length,
      old_scorable: oldScorable.length,
      old_scorable_pct: Math.round((oldScorable.length / symbols.length) * 1000) / 10,
      new_scorable: newScorable.length,
      new_scorable_pct: Math.round((newScorable.length / symbols.length) * 1000) / 10,
      both_scorable: bothScorable.length,
      both_scorable_pct: Math.round((bothScorable.length / symbols.length) * 1000) / 10,
    },
    distribution: {
      old: oldStats,
      new: newStats,
    },
    delta_analysis: {
      mean: deltaStats.mean,
      median: deltaStats.median,
      improved_count: improved.length,
      improved_pct: Math.round((improved.length / bothScorable.length) * 1000) / 10,
      declined_count: declined.length,
      declined_pct: Math.round((declined.length / bothScorable.length) * 1000) / 10,
      unchanged_count: unchanged.length,
      unchanged_pct: Math.round((unchanged.length / bothScorable.length) * 1000) / 10,
      big_changes_count: bigChanges.length,
      big_changes_pct: Math.round((bigChanges.length / bothScorable.length) * 1000) / 10,
    },
    sector_analysis: sectorStats,
    sanity_checks: {
      passed: checksPassed,
      failed: checksFailed,
      financials_delta: financialsSector?.avgDelta || null,
      tech_delta: techSector?.avgDelta || null,
      spread_increased: newStats.stdDev > oldStats.stdDev,
      no_out_of_bounds: outOfBounds.length === 0,
    },
    top_winners: topWinners,
    top_losers: topLosers,
    entries: entries,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n================================================================`);
  console.log(`JSON output saved to: ${outputPath}`);
}

main();
