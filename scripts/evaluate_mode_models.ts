import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { calculateModeV1 } from '@/mode/mode_v1';
import { YFinanceProvider } from '@/providers/yfinance_provider';

async function main() {
  const benchmark = process.env.BENCHMARK || 'SPY';
  const lookbackDays = Number(process.env.LOOKBACK_DAYS || 500);

  const yf = new YFinanceProvider();
  const candles = await yf.getCandles(benchmark, lookbackDays);
  const closes = (candles?.c ?? []).filter(
    (c): c is number => typeof c === 'number'
  );

  const history: Array<{
    index: number;
    label: string;
    score: number;
    confidence: number;
    features: Record<string, number | null>;
  }> = [];

  for (let i = 60; i < closes.length; i++) {
    const windowCloses = closes.slice(0, i + 1);
    const mode = calculateModeV1(benchmark, windowCloses, null);
    history.push({
      index: i,
      label: mode.label,
      score: mode.score,
      confidence: mode.confidence,
      features: mode.features,
    });
  }

  const outDir = join(process.cwd(), 'data', 'mode_eval');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const outPath = join(outDir, `mode_v1_${benchmark}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        benchmark,
        lookbackDays,
        observations: history.length,
        history,
      },
      null,
      2
    )
  );

  console.log(`Mode evaluation written to ${outPath}`);
}

main().catch((err) => {
  console.error('Mode evaluation failed', err);
  process.exit(1);
});
