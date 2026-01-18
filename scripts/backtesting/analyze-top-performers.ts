/**
 * Top Performers Analysis for Momentum Backtest
 *
 * Extracts the stocks that contributed most to the 1300% return
 * and identifies potential red flags (penny stocks, meme stocks, survivorship bias)
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration
const HISTORICAL_DIR = path.join(process.cwd(), 'data/backtesting/historical');
const INITIAL_CAPITAL = 100_000;
const TOP_N = 10;

// Quarter start dates (from run-backtest.ts)
const QUARTER_STARTS = [
  '2020-01-02', '2020-04-01', '2020-07-01', '2020-10-01',
  '2021-01-04', '2021-04-01', '2021-07-01', '2021-10-01',
  '2022-01-03', '2022-04-01', '2022-07-01', '2022-10-03',
  '2023-01-03', '2023-04-03', '2023-07-03', '2023-10-02',
  '2024-01-02', '2024-04-01', '2024-07-01', '2024-10-01',
];

interface PriceData {
  date: string;
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
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  returnPct?: number;
  contribution?: number;
}

interface QuarterlyHolding {
  quarter: string;
  positions: Position[];
  quarterReturn: number;
  portfolioValueStart: number;
  portfolioValueEnd: number;
}

/**
 * Load historical price data
 */
function loadHistoricalData(): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`Historical data directory not found: ${HISTORICAL_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(HISTORICAL_DIR).filter((f) => f.endsWith('.csv'));

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
      const close = parseFloat(parts[4]);
      const volume = parseFloat(parts[5]);

      if (!isNaN(close) && close > 0) {
        prices.set(date, { date, close, volume });
        sortedDates.push(date);
      }
    }

    if (sortedDates.length > 0) {
      dataMap.set(symbol, { symbol, prices, sortedDates });
    }
  }

  return dataMap;
}

/**
 * Calculate 13-week and 26-week momentum (with optional 26w for "fixed" version)
 */
function calculateMomentum(symbol: string, data: SymbolData, asOfDate: string): number | null {
  const asOfIdx = data.sortedDates.indexOf(asOfDate);
  if (asOfIdx < 0) return null;

  const w13Idx = asOfIdx - 65; // ~13 weeks = 65 trading days
  const w26Idx = asOfIdx - 130; // ~26 weeks = 130 trading days

  // Minimum requirement: 60+ days (for "fixed" version)
  if (asOfIdx < 60) return null;

  const currentPrice = data.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // 13-week momentum (required if enough data)
  let mom13w = 0;
  if (w13Idx >= 0) {
    const price13w = data.prices.get(data.sortedDates[w13Idx])?.close;
    if (price13w) {
      mom13w = ((currentPrice - price13w) / price13w) * 100;
    }
  }

  // 26-week momentum (optional)
  let mom26w = 0;
  if (w26Idx >= 0) {
    const price26w = data.prices.get(data.sortedDates[w26Idx])?.close;
    if (price26w) {
      mom26w = ((currentPrice - price26w) / price26w) * 100;
    }
  }

  // Average available momentum signals
  return mom26w !== 0 ? (mom13w + mom26w) / 2 : mom13w;
}

/**
 * Get top stocks by momentum for a given date
 */
function selectTopStocks(dataMap: Map<string, SymbolData>, asOfDate: string): { symbol: string; score: number; price: number }[] {
  const scores: { symbol: string; score: number; price: number }[] = [];

  for (const [symbol, data] of dataMap) {
    const momentum = calculateMomentum(symbol, data, asOfDate);
    if (momentum === null) continue;

    const price = data.prices.get(asOfDate)?.close;
    if (!price) continue;

    scores.push({ symbol, score: momentum, price });
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, TOP_N);
}

/**
 * Get next quarter start date
 */
function getNextQuarterStart(currentDate: string): string | null {
  const idx = QUARTER_STARTS.indexOf(currentDate);
  return idx >= 0 && idx < QUARTER_STARTS.length - 1 ? QUARTER_STARTS[idx + 1] : null;
}

/**
 * Get all available dates from any symbol
 */
function getAllDates(dataMap: Map<string, SymbolData>): string[] {
  const datesSet = new Set<string>();
  for (const [_, data] of dataMap) {
    for (const date of data.sortedDates) {
      datesSet.add(date);
    }
  }
  return Array.from(datesSet).sort();
}

/**
 * Run backtest and track holdings
 */
function analyzeTopPerformers(dataMap: Map<string, SymbolData>): QuarterlyHolding[] {
  const holdings: QuarterlyHolding[] = [];
  let portfolioValue = INITIAL_CAPITAL;

  // Add final date for last quarter
  const allDates = getAllDates(dataMap);
  const finalDate = allDates[allDates.length - 1]; // Last trading day in dataset
  const quartersWithEnd = [...QUARTER_STARTS, finalDate];

  for (let i = 0; i < quartersWithEnd.length - 1; i++) {
    const quarterStart = quartersWithEnd[i];
    const quarterEnd = quartersWithEnd[i + 1];

    console.log(`\nAnalyzing ${quarterStart} to ${quarterEnd}...`);

    // Select top stocks
    const topStocks = selectTopStocks(dataMap, quarterStart);
    if (topStocks.length === 0) {
      console.log(`  No stocks selected (insufficient data)`);
      continue;
    }

    // Buy positions
    const cashPerPosition = portfolioValue / topStocks.length;
    const positions: Position[] = topStocks.map((stock) => {
      const shares = Math.floor(cashPerPosition / stock.price);
      return {
        symbol: stock.symbol,
        shares,
        entryPrice: stock.price,
        entryDate: quarterStart,
      };
    });

    // Calculate portfolio value at quarter end
    let quarterEndValue = 0;
    for (const pos of positions) {
      const symbolData = dataMap.get(pos.symbol);
      if (!symbolData) continue;

      const exitPrice = symbolData.prices.get(quarterEnd)?.close;
      if (exitPrice) {
        pos.exitPrice = exitPrice;
        pos.exitDate = quarterEnd;
        pos.returnPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;

        const positionValue = pos.shares * exitPrice;
        quarterEndValue += positionValue;

        // Contribution to total portfolio
        pos.contribution = ((positionValue - (pos.shares * pos.entryPrice)) / portfolioValue) * 100;
      }
    }

    const quarterReturn = ((quarterEndValue - portfolioValue) / portfolioValue) * 100;

    holdings.push({
      quarter: `${quarterStart} to ${quarterEnd}`,
      positions,
      quarterReturn,
      portfolioValueStart: portfolioValue,
      portfolioValueEnd: quarterEndValue,
    });

    portfolioValue = quarterEndValue;
  }

  return holdings;
}

/**
 * Identify red flags
 */
function analyzeRedFlags(holdings: QuarterlyHolding[]): void {
  console.log('\n' + '='.repeat(85));
  console.log('RED FLAG ANALYSIS');
  console.log('='.repeat(85));

  const memeStocks = ['GME', 'AMC', 'BB', 'NOK', 'BBBY', 'KOSS'];
  const extremeReturns: Position[] = [];
  const memeStockHits: Position[] = [];

  for (const holding of holdings) {
    for (const pos of holding.positions) {
      if (!pos.returnPct) continue;

      // Check for extreme returns (>500%)
      if (pos.returnPct > 500) {
        extremeReturns.push({ ...pos, contribution: pos.contribution });
      }

      // Check for meme stocks
      if (memeStocks.includes(pos.symbol)) {
        memeStockHits.push({ ...pos, contribution: pos.contribution });
      }
    }
  }

  console.log('\n🚨 EXTREME RETURNS (>500%):');
  if (extremeReturns.length === 0) {
    console.log('  None found ✅');
  } else {
    extremeReturns
      .sort((a, b) => (b.returnPct || 0) - (a.returnPct || 0))
      .slice(0, 10)
      .forEach((pos, idx) => {
        console.log(`  ${idx + 1}. ${pos.symbol}: +${pos.returnPct?.toFixed(1)}% (${pos.entryDate})`);
      });
  }

  console.log('\n📈 MEME STOCK EXPOSURE:');
  if (memeStockHits.length === 0) {
    console.log('  None found ✅');
  } else {
    memeStockHits.forEach((pos) => {
      console.log(`  ${pos.symbol}: +${pos.returnPct?.toFixed(1)}% (${pos.entryDate} to ${pos.exitDate})`);
    });
  }
}

/**
 * Print quarterly top performers
 */
function printTopPerformers(holdings: QuarterlyHolding[]): void {
  console.log('\n' + '='.repeat(85));
  console.log('TOP PERFORMERS BY QUARTER');
  console.log('='.repeat(85));

  for (const holding of holdings) {
    console.log(`\n${holding.quarter}`);
    console.log(`Portfolio: $${holding.portfolioValueStart.toFixed(0)} → $${holding.portfolioValueEnd.toFixed(0)} (${holding.quarterReturn >= 0 ? '+' : ''}${holding.quarterReturn.toFixed(1)}%)`);
    console.log('\nTop 5 Contributors:');

    holding.positions
      .filter((p) => p.returnPct !== undefined)
      .sort((a, b) => (b.contribution || 0) - (a.contribution || 0))
      .slice(0, 5)
      .forEach((pos, idx) => {
        console.log(`  ${idx + 1}. ${pos.symbol}: ${pos.returnPct! >= 0 ? '+' : ''}${pos.returnPct!.toFixed(1)}% (contributed ${pos.contribution! >= 0 ? '+' : ''}${pos.contribution!.toFixed(1)}% to portfolio)`);
      });
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(85));
  console.log('TOP PERFORMERS ANALYSIS - Momentum Backtest');
  console.log('='.repeat(85));

  const dataMap = loadHistoricalData();
  console.log(`\nLoaded data for ${dataMap.size} symbols`);

  const holdings = analyzeTopPerformers(dataMap);

  printTopPerformers(holdings);
  analyzeRedFlags(holdings);

  // Summary
  const finalValue = holdings[holdings.length - 1]?.portfolioValueEnd || INITIAL_CAPITAL;
  const totalReturn = ((finalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;

  console.log('\n' + '='.repeat(85));
  console.log('SUMMARY');
  console.log('='.repeat(85));
  console.log(`Initial Capital: $${INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`Final Value: $${finalValue.toLocaleString()}`);
  console.log(`Total Return: ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
  console.log('='.repeat(85));
}

main().catch((err) => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
