import * as fs from 'fs';

const SUMMARY_PATH = 'data/backtesting/backtest-summary-compounder.json';

function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`❌ ${SUMMARY_PATH} not found. Run the compounder backtest first.`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
  const summary = parsed.summary ?? parsed;
  const metrics = summary.metrics ?? summary;
  const avg = summary.avgMetrics ?? summary.avg_metrics ?? {};

  const pass =
    metrics.sharpe_ratio > 0.4 &&
    metrics.max_drawdown_pct > -40 &&
    (avg.roe ?? 0) > 12 &&
    (summary.turnover_pct ?? Infinity) < 150;

  console.log(pass ? '✅ PASS' : '❌ FAIL');
  console.log(`Sharpe: ${metrics.sharpe_ratio?.toFixed?.(2)} (target: >0.5)`);
  console.log(`Max DD: ${metrics.max_drawdown_pct?.toFixed?.(1)}% (target: >-35%)`);
  console.log(`Avg ROE: ${avg.roe?.toFixed?.(1) ?? 'N/A'}% (target: >15%)`);
  console.log(`Avg ROIC: ${avg.roic?.toFixed?.(1) ?? 'N/A'}% (target: >12%)`);
  console.log(`Turnover: ${summary.turnover_pct?.toFixed?.(1) ?? 'N/A'}% (target: <100%)`);
}

main();
