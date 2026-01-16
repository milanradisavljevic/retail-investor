/**
 * Backtesting Runner
 *
 * Simulates quarterly rebalancing strategy using historical data.
 * Buy Top 10 stocks at start of each quarter, hold for 3 months.
 *
 * Usage: npx tsx scripts/backtesting/run-backtest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { calculateMetrics, type DailyRecord, type BacktestSummary } from './calculate-metrics';
import { calculateHybridScore, type HybridScoreInput } from './hybrid-scoring';

// Configuration
const HISTORICAL_DIR = path.join(process.cwd(), 'data/backtesting/historical');
const OUTPUT_DIR = path.join(process.cwd(), 'data/backtesting');
const START_DATE = '2020-01-01';
const END_DATE = '2024-12-31';
const INITIAL_CAPITAL = 100_000;
const TOP_N = 10;

// Scoring mode: 'momentum' (legacy) or 'hybrid' (new)
const SCORING_MODE = process.env.SCORING_MODE === 'momentum' ? 'momentum' : 'hybrid';

// Quarter start dates (first trading day approximation)
const QUARTER_STARTS = [
  '2020-01-02', '2020-04-01', '2020-07-01', '2020-10-01',
  '2020-01-02', '2021-01-04', '2021-04-01', '2021-07-01', '2021-10-01',
  '2022-01-03', '2022-04-01', '2022-07-01', '2022-10-03',
  '2023-01-03', '2023-04-03', '2023-07-03', '2023-10-02',
  '2024-01-02', '2024-04-01', '2024-07-01', '2024-10-01',
].filter((d, i, arr) => arr.indexOf(d) === i); // Remove duplicates

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolData {
  symbol: string;
  prices: Map<string, PriceData>;
  sortedDates: string[];
}

interface Position {
  symbol: string;
  shares: number;
  entryPrice: number;
}

interface Portfolio {
  positions: Position[];
  cash: number;
}

/**
 * Load historical price data for all symbols
 */
function loadHistoricalData(): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`Historical data directory not found: ${HISTORICAL_DIR}`);
    console.error('Run: python scripts/backtesting/fetch-historical.py first');
    process.exit(1);
  }

  const files = fs.readdirSync(HISTORICAL_DIR).filter((f) => f.endsWith('.csv'));
  console.log(`Loading ${files.length} symbol files...`);

  for (const file of files) {
    const symbol = file.replace('.csv', '');
    const filePath = path.join(HISTORICAL_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    const prices = new Map<string, PriceData>();
    const sortedDates: string[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 6) continue;

      const date = parts[0];
      const priceData: PriceData = {
        date,
        open: parseFloat(parts[1]),
        high: parseFloat(parts[2]),
        low: parseFloat(parts[3]),
        close: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
      };

      if (!isNaN(priceData.close) && priceData.close > 0) {
        prices.set(date, priceData);
        sortedDates.push(date);
      }
    }

    sortedDates.sort();
    dataMap.set(symbol, { symbol, prices, sortedDates });
  }

  return dataMap;
}

/**
 * Calculate momentum score for a symbol at a given date.
 * Uses 13-week (65 trading days) and 26-week (130 trading days) returns.
 */
function calculateMomentumScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null; // Need 26 weeks of history

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Find prices approximately 13 weeks and 26 weeks ago
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];

  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w || !price26w) return null;

  const return13w = (currentPrice - price13w) / price13w;
  const return26w = (currentPrice - price26w) / price26w;

  // Combined momentum score (weighted average)
  return return13w * 0.6 + return26w * 0.4;
}

/**
 * Calculate hybrid score for a symbol at a given date
 */
function calculateHybridScoreForDate(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null; // Need 26 weeks of history

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Get historical prices for calculations
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  // Calculate 52-week high/low
  const lookbackStart = Math.max(0, dateIdx - 252);
  let high52Week = currentPrice;
  let low52Week = currentPrice;

  for (let i = lookbackStart; i <= dateIdx; i++) {
    const price = symbolData.prices.get(allDates[i])?.close;
    if (price) {
      if (price > high52Week) high52Week = price;
      if (price < low52Week) low52Week = price;
    }
  }

  const input: HybridScoreInput = {
    symbol: symbolData.symbol,
    currentPrice,
    high52Week,
    low52Week,
    return13Week: price13w ? (currentPrice - price13w) / price13w : null,
    return26Week: price26w ? (currentPrice - price26w) / price26w : null,
    return52Week: null,
  };

  const result = calculateHybridScore(input);
  return result.totalScore;
}

/**
 * Select top N stocks based on score at given date
 */
function selectTopStocks(
  dataMap: Map<string, SymbolData>,
  asOfDate: string,
  allDates: string[],
  n: number
): string[] {
  const scores: Array<{ symbol: string; score: number }> = [];

  for (const [symbol, data] of dataMap) {
    if (symbol === 'SPY') continue; // Exclude benchmark

    const score = SCORING_MODE === 'hybrid'
      ? calculateHybridScoreForDate(data, asOfDate, allDates)
      : calculateMomentumScore(data, asOfDate, allDates);

    if (score !== null) {
      scores.push({ symbol, score });
    }
  }

  // Sort by score descending, then alphabetically for determinism
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  return scores.slice(0, n).map((s) => s.symbol);
}

/**
 * Find nearest trading day on or after given date
 */
function findNearestTradingDay(date: string, allDates: string[]): string | null {
  if (allDates.includes(date)) return date;

  for (const d of allDates) {
    if (d >= date) return d;
  }
  return null;
}

/**
 * Run the backtest simulation
 */
function runBacktest(dataMap: Map<string, SymbolData>): DailyRecord[] {
  console.log('\nRunning backtest simulation...');
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Initial capital: $${INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`Strategy: Quarterly rebalance, Top ${TOP_N} stocks`);
  console.log(`Scoring mode: ${SCORING_MODE.toUpperCase()}`);

  // Get all trading dates from SPY
  const spyData = dataMap.get('SPY');
  if (!spyData) {
    console.error('SPY data not found. Cannot run backtest.');
    process.exit(1);
  }

  const allDates = spyData.sortedDates.filter((d) => d >= START_DATE && d <= END_DATE);
  console.log(`Trading days in period: ${allDates.length}`);

  // Initialize portfolio
  let portfolio: Portfolio = { positions: [], cash: INITIAL_CAPITAL };
  const dailyRecords: DailyRecord[] = [];

  // Track current quarter
  let currentQuarterIdx = 0;
  let nextRebalanceDate = findNearestTradingDay(QUARTER_STARTS[0], allDates);

  // Initial SPY value for benchmark
  const spyStartPrice = spyData.prices.get(allDates[0])?.close || 1;

  for (const date of allDates) {
    // Check if rebalance needed
    if (nextRebalanceDate && date >= nextRebalanceDate) {
      // Sell all positions
      for (const pos of portfolio.positions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          portfolio.cash += pos.shares * price;
        }
        // If stock delisted (no price), position value = 0
      }
      portfolio.positions = [];

      // Select new top stocks
      const topStocks = selectTopStocks(dataMap, date, allDates, TOP_N);
      console.log(`\n${date}: Rebalancing to ${topStocks.length} stocks`);
      console.log(`  Top 5: ${topStocks.slice(0, 5).join(', ')}`);

      // Buy equal weight positions
      const cashPerPosition = portfolio.cash / topStocks.length;
      for (const symbol of topStocks) {
        const price = dataMap.get(symbol)?.prices.get(date)?.close;
        if (price && price > 0) {
          const shares = Math.floor(cashPerPosition / price);
          if (shares > 0) {
            portfolio.positions.push({ symbol, shares, entryPrice: price });
            portfolio.cash -= shares * price;
          }
        }
      }

      // Move to next quarter
      currentQuarterIdx++;
      nextRebalanceDate =
        currentQuarterIdx < QUARTER_STARTS.length
          ? findNearestTradingDay(QUARTER_STARTS[currentQuarterIdx], allDates)
          : null;
    }

    // Calculate portfolio value
    let portfolioValue = portfolio.cash;
    for (const pos of portfolio.positions) {
      const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
      if (price) {
        portfolioValue += pos.shares * price;
      }
      // Delisted stocks contribute 0
    }

    // Calculate SPY value (benchmark)
    const spyPrice = spyData.prices.get(date)?.close || spyStartPrice;
    const spyValue = (spyPrice / spyStartPrice) * INITIAL_CAPITAL;

    // Calculate daily return
    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;
    const dailyReturn = (portfolioValue - prevValue) / prevValue;

    // Calculate drawdown
    const peakValue = dailyRecords.reduce((max, r) => Math.max(max, r.portfolio_value), INITIAL_CAPITAL);
    const drawdown = (portfolioValue - peakValue) / peakValue;

    dailyRecords.push({
      date,
      portfolio_value: Math.round(portfolioValue * 100) / 100,
      sp500_value: Math.round(spyValue * 100) / 100,
      daily_return_pct: Math.round(dailyReturn * 10000) / 100,
      drawdown_pct: Math.round(drawdown * 10000) / 100,
    });
  }

  return dailyRecords;
}

/**
 * Write results to CSV and JSON
 */
function writeResults(dailyRecords: DailyRecord[], summary: BacktestSummary): void {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write CSV
  const csvPath = path.join(OUTPUT_DIR, 'backtest-results.csv');
  const csvHeader = 'date,portfolio_value,sp500_value,daily_return_pct,drawdown_pct\n';
  const csvRows = dailyRecords
    .map((r) => `${r.date},${r.portfolio_value},${r.sp500_value},${r.daily_return_pct},${r.drawdown_pct}`)
    .join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`\nCSV written: ${csvPath}`);

  // Write JSON summary
  const jsonPath = path.join(OUTPUT_DIR, 'backtest-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`JSON written: ${jsonPath}`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Backtesting Runner - Retail Investor MVP');
  console.log('='.repeat(60));

  // Load data
  const dataMap = loadHistoricalData();
  console.log(`Loaded data for ${dataMap.size} symbols`);

  // Run backtest
  const dailyRecords = runBacktest(dataMap);

  // Calculate metrics
  const summary = calculateMetrics(dailyRecords, START_DATE, END_DATE);

  // Write results
  writeResults(dailyRecords, summary);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`\nStrategy: ${summary.strategy}`);
  console.log(`Period: ${summary.period}`);
  console.log('\nPortfolio Performance:');
  console.log(`  Total Return:      ${summary.metrics.total_return_pct.toFixed(2)}%`);
  console.log(`  Annualized Return: ${summary.metrics.annualized_return_pct.toFixed(2)}%`);
  console.log(`  Max Drawdown:      ${summary.metrics.max_drawdown_pct.toFixed(2)}%`);
  console.log(`  Volatility:        ${summary.metrics.volatility_pct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio:      ${summary.metrics.sharpe_ratio.toFixed(2)}`);
  console.log('\nBenchmark (S&P 500):');
  console.log(`  Total Return:      ${summary.benchmark.total_return_pct.toFixed(2)}%`);
  console.log(`  Annualized Return: ${summary.benchmark.annualized_return_pct.toFixed(2)}%`);
  console.log(`  Max Drawdown:      ${summary.benchmark.max_drawdown_pct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio:      ${summary.benchmark.sharpe_ratio.toFixed(2)}`);
  console.log(`\nOutperformance: ${summary.outperformance_pct.toFixed(2)}%`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
