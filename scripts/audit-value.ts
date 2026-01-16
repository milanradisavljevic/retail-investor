import { getLatestRun } from '@/lib/runLoader';
import { buildExplainSignals } from '@/lib/explainSignals';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

function fmtNum(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return value.toFixed(decimals);
}

function getTopIssues(score: RunV1SchemaJson['scores'][number], run: RunV1SchemaJson): string[] {
  const signals = buildExplainSignals(score, run);
  const warnings = signals.warnings.map((w) => w.label);
  const negatives = signals.negatives.map((n) => n.label);
  const combined = [...warnings, ...negatives];
  const missing = score.data_quality?.missing_fields ?? [];
  const deepReasons = score.price_target?.deep_analysis_reasons ?? [];
  const deepFlag = score.price_target?.requires_deep_analysis;

  if (missing.length > 0) {
    combined.push(`Missing: ${missing.slice(0, 3).join(', ')}`);
  }
  if (deepFlag) {
    combined.push(deepReasons.length > 0 ? `Deep analysis: ${deepReasons.slice(0, 2).join('; ')}` : 'Deep analysis recommended');
  }

  if (combined.length === 0) {
    combined.push('No major issues detected');
  }

  return combined.slice(0, 2);
}

function main() {
  const latest = getLatestRun();
  if (!latest) {
    console.error('No runs found under data/runs');
    process.exit(1);
  }

  const run = latest.run;
  const coverageCounts: Record<string, number> = { full: 0, partial: 0, fallback_neutral: 0, none: 0 };
  const sectorStats: Record<
    string,
    { total: number; valueSum: number; missingPsCount: number; count: number }
  > = {};

  console.log(`Run: ${run.run_id} | Universe: ${run.universe.definition.name} | ${run.scores.length} symbols`);
  console.log('');
  console.log(
    ['Symbol', 'Sector', 'Total', 'Value', 'Price', 'Fair', 'Upside%', 'Coverage', 'Issues']
      .map((h) => h.padEnd(14))
      .join(' | ')
  );
  console.log('-'.repeat(120));

  for (const score of run.scores) {
    const diag = score.price_target_diagnostics;
    const coverage = score.valuation_input_coverage ?? score.value_input_coverage;
    const coverageLabel = coverage
      ? `${coverage.strategy_used}${coverage.missing && coverage.missing.length ? ` (missing ${coverage.missing.join(',')})` : ''}`
      : 'n/a';
    const sector = diag?.inputs?.sector ?? 'n/a';
    const pt = score.price_target;
    const issues = getTopIssues(score, run).join('; ');

    coverageCounts[coverage?.strategy_used ?? 'none'] =
      (coverageCounts[coverage?.strategy_used ?? 'none'] ?? 0) + 1;

    if (!sectorStats[sector]) {
      sectorStats[sector] = { total: 0, valueSum: 0, missingPsCount: 0, count: 0 };
    }
    sectorStats[sector].valueSum += score.evidence.valuation ?? 0;
    sectorStats[sector].count += 1;
    if (coverage?.missing?.includes('ps')) {
      sectorStats[sector].missingPsCount += 1;
    }

    console.log(
      [
        score.symbol.padEnd(6),
        sector.padEnd(10),
        fmtNum(score.total_score).padEnd(6),
        fmtNum(score.evidence.valuation).padEnd(6),
        fmtNum(pt?.current_price, 2).padEnd(8),
        fmtNum(pt?.fair_value, 2).padEnd(8),
        pt ? `${(pt.upside_pct * 100).toFixed(1)}`.padEnd(8) : 'n/a'.padEnd(8),
        coverageLabel.padEnd(24),
        issues,
      ].join(' | ')
    );
  }

  console.log('\nCoverage summary:');
  Object.entries(coverageCounts).forEach(([key, count]) => {
    console.log(`- ${key}: ${count}`);
  });

  console.log('\nSector stats:');
  Object.entries(sectorStats).forEach(([sector, stats]) => {
    const avgValue = stats.count > 0 ? stats.valueSum / stats.count : 0;
    const pctMissingPs = stats.count > 0 ? (stats.missingPsCount / stats.count) * 100 : 0;
    console.log(
      `- ${sector}: avg value ${avgValue.toFixed(1)} | missing PS ${pctMissingPs.toFixed(0)}% (${stats.missingPsCount}/${stats.count})`
    );
  });
}

main();
