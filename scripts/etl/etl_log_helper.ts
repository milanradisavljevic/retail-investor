import { startEtlRun, finishEtlRun } from '../../src/lib/etl_log';

const action = process.argv[2];
const provider = process.argv[3] as 'sec' | 'fmp' | 'yfinance' | 'daily_run';
const metadataJson = process.argv[4] || '{}';

async function main() {
  const metadata = JSON.parse(metadataJson);

  if (action === 'start') {
    const id = startEtlRun(provider, metadata);
    console.log(id);
  } else if (action === 'finish') {
    const id = process.argv[4];
    const status = process.argv[5] as 'success' | 'failed';
    const symbolCount = process.argv[6] ? parseInt(process.argv[6], 10) : null;
    const errorMessage = process.argv[7] || null;
    const finishMetadata = process.argv[8] ? JSON.parse(process.argv[8]) : {};
    finishEtlRun(id, status, symbolCount, errorMessage, finishMetadata);
  } else {
    console.error('Usage: etl_log_helper.ts <start|finish> <provider> [metadata]');
    console.error('  start: etl_log_helper.ts start <provider> \'{"universe":"sp500"}\'');
    console.error('  finish: etl_log_helper.ts finish <id> <success|failed> [symbolCount] [errorMessage] [metadata]');
    process.exit(1);
  }
}

main().catch(console.error);
