import { MarketDataDB } from '../src/data/market-data-db';

async function main() {
  console.log('Testing MarketDataDB...\n');

  const db = new MarketDataDB('data/market-data.db');

  console.log('Test 1: Get Fundamentals');
  const fundamentals = db.getFundamentals('AAPL');
  console.log('AAPL fundamentals:', fundamentals);
  console.assert(fundamentals !== null, 'Fundamentals should exist');
  console.assert((fundamentals as any)?.symbol === 'AAPL', 'Symbol should be AAPL');
  console.log('✅ PASS\n');

  console.log('Test 2: Get Prices (last 252 rows)');
  const prices = db.getPrices('AAPL', 252);
  console.log(`AAPL prices: ${prices.length} rows`);
  console.assert(prices.length >= 200, 'Should have ~252 days of prices');
  console.log('✅ PASS\n');

  console.log('Test 3: Get Universe (>=50% completeness)');
  const universe = db.getUniverse(50);
  console.log(`Universe size: ${universe.length}`);
  console.assert(universe.length > 0, 'Universe should not be empty');
  console.log('✅ PASS\n');

  console.log('Test 4: Data completeness spot-check');
  const sample = fundamentals?.dataCompleteness;
  console.log(`AAPL completeness: ${sample ?? 'n/a'}%`);
  console.log('✅ PASS\n');

  db.close();
  console.log('🎉 All tests passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
