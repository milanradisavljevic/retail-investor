import * as fs from 'fs';

const SUMMARY_PATH = 'data/backtesting/backtest-summary-deep-value.json';

function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`❌ ${SUMMARY_PATH} not found. Run the deep value backtest first.`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
  const summary = parsed.summary ?? parsed;
  const metrics = summary.metrics ?? summary;
  const avg = summary.avgMetrics ?? summary.avg_metrics ?? {};

  const pass =
    metrics.sharpe_ratio > 0.3 &&
    metrics.max_drawdown_pct > -50 &&
    (avg.pe ?? Infinity) < 20 &&
    (avg.pb ?? Infinity) < 3.0;

  console.log(pass ? '✅ PASS' : '❌ FAIL');
  console.log(`Sharpe: ${metrics.sharpe_ratio?.toFixed?.(2)} (target: >0.4)`);
  console.log(`Max DD: ${metrics.max_drawdown_pct?.toFixed?.(1)}% (target: >-45%)`);
  console.log(`Avg P/E: ${avg.pe?.toFixed?.(1) ?? 'N/A'} (target: <15)`);
  console.log(`Avg P/B: ${avg.pb?.toFixed?.(2) ?? 'N/A'} (target: <2.0)`);

  if (summary.periods) {
    console.log(`\n2020-2021 (Growth Era): ${summary.periods.growth_era ?? 'N/A'}%`);
    console.log(`2022-2024 (Value Era): ${summary.periods.value_era ?? 'N/A'}%`);
    console.log('Note: Value typically lags in growth markets, leads in value rotations');
  }
}

main();
