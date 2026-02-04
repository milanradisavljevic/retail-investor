import * as fs from 'fs';

const SUMMARY_PATH = 'data/backtesting/backtest-summary-shield.json';

function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    console.error(`❌ ${SUMMARY_PATH} not found. Run the shield backtest first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(SUMMARY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const summary = parsed.summary ?? parsed;
  const metrics = summary.metrics ?? summary;

  const pass =
    metrics.sharpe_ratio > 0.5 &&
    metrics.max_drawdown_pct > -30 &&
    metrics.volatility_pct < 25;

  console.log(pass ? '✅ PASS' : '❌ FAIL');
  console.log(`Sharpe: ${metrics.sharpe_ratio?.toFixed?.(2)} (target: >0.6)`);
  console.log(`Max DD: ${metrics.max_drawdown_pct?.toFixed?.(1)}% (target: >-25%)`);
  console.log(`Vol: ${metrics.volatility_pct?.toFixed?.(1)}% (target: <20%)`);
}

main();
