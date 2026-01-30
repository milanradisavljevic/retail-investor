#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';

interface ScorePillars {
  total: number;
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

interface ScoreComparison {
  symbol: string;
  before: ScorePillars;
  after: ScorePillars;
  delta: ScorePillars;
}

type RunFile = {
  scores: Array<{
    symbol: string;
    total_score: number;
    evidence: {
      valuation: number;
      quality: number;
      technical: number;
      risk: number;
    };
  }>;
};

async function compareRuns(beforeFile: string, afterFile: string) {
  const before = (await readRun(beforeFile)) as RunFile;
  const after = (await readRun(afterFile)) as RunFile;

  const comparisons: ScoreComparison[] = [];

  for (const beforeStock of before.scores) {
    const afterStock = after.scores.find((s) => s.symbol === beforeStock.symbol);
    if (!afterStock) continue;

    const beforePillars: ScorePillars = {
      total: beforeStock.total_score,
      valuation: beforeStock.evidence.valuation,
      quality: beforeStock.evidence.quality,
      technical: beforeStock.evidence.technical,
      risk: beforeStock.evidence.risk,
    };

    const afterPillars: ScorePillars = {
      total: afterStock.total_score,
      valuation: afterStock.evidence.valuation,
      quality: afterStock.evidence.quality,
      technical: afterStock.evidence.technical,
      risk: afterStock.evidence.risk,
    };

    comparisons.push({
      symbol: beforeStock.symbol,
      before: beforePillars,
      after: afterPillars,
      delta: {
        total: afterPillars.total - beforePillars.total,
        valuation: afterPillars.valuation - beforePillars.valuation,
        quality: afterPillars.quality - beforePillars.quality,
        technical: afterPillars.technical - beforePillars.technical,
        risk: afterPillars.risk - beforePillars.risk,
      },
    });
  }

  if (comparisons.length === 0) {
    console.error('No overlapping symbols between runs. Aborting.');
    process.exit(1);
  }

  const stats = buildStats(comparisons);

  const winners = [...comparisons]
    .sort((a, b) => b.delta.total - a.delta.total)
    .slice(0, 10);

  const losers = [...comparisons]
    .sort((a, b) => a.delta.total - b.delta.total)
    .slice(0, 10);

  printReport(beforeFile, afterFile, stats, winners, losers);

  await fs.writeFile(
    '/tmp/score-comparison-detailed.json',
    JSON.stringify({ stats, winners, losers, allComparisons: comparisons }, null, 2)
  );
  console.log('Detailed comparison saved to: /tmp/score-comparison-detailed.json\n');
}

async function readRun(file: string) {
  const data = await fs.readFile(file, 'utf-8');
  return JSON.parse(data);
}

function buildStats(comparisons: ScoreComparison[]) {
  const totals = comparisons.map((c) => c.delta.total);
  const valuations = comparisons.map((c) => c.delta.valuation);
  const qualities = comparisons.map((c) => c.delta.quality);
  const technicals = comparisons.map((c) => c.delta.technical);
  const risks = comparisons.map((c) => c.delta.risk);

  const tTest = performTTest(totals);

  return {
    totalStocks: comparisons.length,
    avgDelta: {
      total: mean(totals),
      valuation: mean(valuations),
      quality: mean(qualities),
      technical: mean(technicals),
      risk: mean(risks),
    },
    medianDelta: {
      total: median(totals),
      valuation: median(valuations),
      quality: median(qualities),
      technical: median(technicals),
      risk: median(risks),
    },
    improved: comparisons.filter((c) => c.delta.total > 0).length,
    declined: comparisons.filter((c) => c.delta.total < 0).length,
    unchanged: comparisons.filter((c) => Math.abs(c.delta.total) < 0.1).length,
    tTest,
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  const color = delta > 0 ? '🟢' : delta < 0 ? '🔴' : '⚪';
  return `${color} ${sign}${delta.toFixed(2)}`;
}

function performTTest(deltas: number[]): { t: number; p: number } {
  const n = deltas.length;
  if (n < 2) {
    return { t: 0, p: 1 };
  }
  const meanDelta = mean(deltas);
  const variance =
    deltas.reduce((sum, d) => sum + Math.pow(d - meanDelta, 2), 0) / (n - 1 || 1);
  const stderr = Math.sqrt(variance / n) || Number.EPSILON;
  const t = meanDelta / stderr;
  const p = 2 * (1 - normalCDF(Math.abs(t)));
  return { t, p };
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-ax * ax);

  return sign * y;
}

function printReport(
  beforeFile: string,
  afterFile: string,
  stats: ReturnType<typeof buildStats>,
  winners: ScoreComparison[],
  losers: ScoreComparison[]
) {
  console.log('\n═══════════════════════════════════════════');
  console.log('SCORE COMPARISON REPORT');
  console.log('═══════════════════════════════════════════\n');
  console.log(`Before: ${path.basename(beforeFile)}`);
  console.log(`After:  ${path.basename(afterFile)}`);
  console.log(`Stocks Compared: ${stats.totalStocks}\n`);

  console.log('AVERAGE DELTAS:');
  console.log(`  Total Score:  ${formatDelta(stats.avgDelta.total)}`);
  console.log(`  Valuation:    ${formatDelta(stats.avgDelta.valuation)}`);
  console.log(`  Quality:      ${formatDelta(stats.avgDelta.quality)}`);
  console.log(`  Technical:    ${formatDelta(stats.avgDelta.technical)}`);
  console.log(`  Risk:         ${formatDelta(stats.avgDelta.risk)}\n`);

  console.log('SCORE DISTRIBUTION:');
  console.log(
    `  Improved:  ${stats.improved} stocks (${percent(stats.improved, stats.totalStocks)})`
  );
  console.log(
    `  Declined:  ${stats.declined} stocks (${percent(stats.declined, stats.totalStocks)})`
  );
  console.log(
    `  Unchanged: ${stats.unchanged} stocks (${percent(stats.unchanged, stats.totalStocks)})\n`
  );

  console.log('TOP 10 WINNERS (biggest improvement):');
  winners.forEach((w, i) => {
    console.log(
      `  ${i + 1}. ${w.symbol.padEnd(6)} ${formatDelta(w.delta.total)} (${w.before.total.toFixed(1)} → ${w.after.total.toFixed(1)})`
    );
  });

  console.log('\nTOP 10 LOSERS (biggest decline):');
  losers.forEach((l, i) => {
    console.log(
      `  ${i + 1}. ${l.symbol.padEnd(6)} ${formatDelta(l.delta.total)} (${l.before.total.toFixed(1)} → ${l.after.total.toFixed(1)})`
    );
  });

  console.log('\nSTATISTICAL SIGNIFICANCE:');
  console.log(`  t-statistic: ${stats.tTest.t.toFixed(3)}`);
  console.log(`  p-value: ${stats.tTest.p.toFixed(4)}`);
  console.log(`  Significant (p < 0.05): ${stats.tTest.p < 0.05 ? 'YES ✅' : 'NO ❌'}`);
  console.log('\n═══════════════════════════════════════════\n');
}

function percent(value: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: tsx scripts/compare-scores.ts <before-run.json> <after-run.json>');
  process.exit(1);
}

compareRuns(args[0], args[1]).catch((err) => {
  console.error('Comparison failed:', err);
  process.exit(1);
});
