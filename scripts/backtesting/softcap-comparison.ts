/**
 * Soft-Cap Momentum A/B Comparison Backtest
 *
 * Compares scoring strategies over 2020-2024:
 * 1. hybrid_v1 (Hard-Cap): Original momentum normalization (clamp at ±50%)
 * 2. hybrid_v2 (Soft-Cap): New soft-cap momentum (saturation at +75%)
 * 3. momentum_only: Pure momentum baseline
 * 4. 4-pillar: Original balanced model
 *
 * Benchmark: IWM (iShares Russell 2000 ETF) or SPY if IWM unavailable
 *
 * Output: data/backtesting/russell2000-softcap-comparison.json
 *
 * Usage: npx tsx scripts/backtesting/softcap-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { momentumSoftCapScore } from '../../src/lib/scoring/advanced-signals';

// Configuration
const HISTORICAL_DIR = path.join(process.cwd(), 'data/backtesting/historical');
const OUTPUT_DIR = path.join(process.cwd(), 'data/backtesting');
const START_DATE = '2020-01-01';
const END_DATE = '2024-12-31';
const INITIAL_CAPITAL = 100_000;
const TOP_N = 10;
const RISK_FREE_RATE = 0.02; // 2% annual

// Quarter start dates
const QUARTER_STARTS = [
  '2020-01-02', '2020-04-01', '2020-07-01', '2020-10-01',
  '2021-01-04', '2021-04-01', '2021-07-01', '2021-10-01',
  '2022-01-03', '2022-04-01', '2022-07-01', '2022-10-03',
  '2023-01-03', '2023-04-03', '2023-07-03', '2023-10-02',
  '2024-01-02', '2024-04-01', '2024-07-01', '2024-10-01',
];

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

interface DailyRecord {
  date: string;
  portfolio_value: number;
  daily_return: number;
}

interface QuarterlyReturn {
  quarter: string;
  return_pct: number;
  profitable: boolean;
}

interface StrategyMetrics {
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  volatility_pct: number;
  win_rate_pct: number;
}

interface StrategyResult {
  name: string;
  description: string;
  metrics: StrategyMetrics;
  top_performers: string[];
}

/**
 * Load historical price data
 */
function loadHistoricalData(): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`Historical data directory not found: ${HISTORICAL_DIR}`);
    console.error('Run: npm run backtest:fetch first');
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
 * Calculate volatility for a symbol (20-day rolling std dev)
 */
function calculateVolatility(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[],
  lookback: number = 20
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < lookback) return null;

  const returns: number[] = [];
  for (let i = dateIdx - lookback + 1; i <= dateIdx; i++) {
    const prevPrice = symbolData.prices.get(allDates[i - 1])?.close;
    const currPrice = symbolData.prices.get(allDates[i])?.close;
    if (prevPrice && currPrice) {
      returns.push((currPrice - prevPrice) / prevPrice);
    }
  }

  if (returns.length < lookback / 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252); // Annualized
}

/**
 * Calculate 4-Pillar Score (original balanced model)
 */
function calculate4PillarScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 252) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

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

  const range52Week = high52Week - low52Week;
  if (range52Week <= 0) return null;

  // 1. Valuation Score (25%)
  const positionInRange = (currentPrice - low52Week) / range52Week;
  const valuationScore = (1 - positionInRange) * 100;

  // 2. Quality Score (25%)
  const volatility = calculateVolatility(symbolData, asOfDate, allDates, 60);
  let qualityScore = 50;
  if (volatility !== null) {
    qualityScore = Math.max(0, Math.min(100, (0.4 - volatility) / 0.4 * 100));
  }

  // 3. Technical Score (25%)
  const price50dAgo = symbolData.prices.get(allDates[Math.max(0, dateIdx - 50)])?.close;
  const price200dAgo = symbolData.prices.get(allDates[Math.max(0, dateIdx - 200)])?.close;

  let technicalScore = 50;
  if (price50dAgo && price200dAgo) {
    const ma50Trend = (currentPrice - price50dAgo) / price50dAgo;
    const ma200Trend = (currentPrice - price200dAgo) / price200dAgo;
    const trendScore = ((ma50Trend + 0.2) / 0.4 * 50) + ((ma200Trend + 0.4) / 0.8 * 50);
    technicalScore = Math.max(0, Math.min(100, trendScore));
  }

  // 4. Risk Score (25%)
  const volatility20d = calculateVolatility(symbolData, asOfDate, allDates, 20);
  let riskScore = 50;
  if (volatility20d !== null) {
    riskScore = Math.max(0, Math.min(100, (0.5 - volatility20d) / 0.5 * 100));
  }

  return valuationScore * 0.25 + qualityScore * 0.25 + technicalScore * 0.25 + riskScore * 0.25;
}

/**
 * Calculate Momentum-Only Score (baseline)
 */
function calculateMomentumOnlyScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w || !price26w) return null;

  const return13w = (currentPrice - price13w) / price13w;
  const return26w = (currentPrice - price26w) / price26w;
  const weightedReturn = return13w * 0.6 + return26w * 0.4;

  // Simple linear scale: higher return = higher score
  // No capping at all - pure momentum signal
  return (weightedReturn + 0.5) * 100; // Can exceed 100
}

/**
 * Calculate Hybrid V1 Score (Hard-Cap momentum at ±50%)
 */
function calculateHybridV1Score(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w || !price26w) return null;

  // 1. Momentum Score (40%) - HARD-CAP at ±50%
  const return13w = (currentPrice - price13w) / price13w;
  const return26w = (currentPrice - price26w) / price26w;
  const weightedReturn = return13w * 0.6 + return26w * 0.4;
  // Original normalization: clamp to [0, 100]
  const momentumScore = Math.max(0, Math.min(100, (weightedReturn + 0.5) * 100));

  // 2. Technical Strength Score (30%)
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

  const range = high52Week - low52Week;
  let technicalScore = 50;
  if (range > 0) {
    const position = (currentPrice - low52Week) / range;
    if (position >= 0.6 && position <= 0.8) {
      technicalScore = 70 + (position - 0.6) * 100;
    } else if (position > 0.8) {
      technicalScore = 90 - (position - 0.8) * 50;
    } else if (position >= 0.4) {
      technicalScore = 50 + (position - 0.4) * 100;
    } else if (position >= 0.2) {
      technicalScore = 30 + (position - 0.2) * 100;
    } else {
      technicalScore = position * 150;
    }
  }

  // 3. Quality Score (30%)
  const volatility = calculateVolatility(symbolData, asOfDate, allDates, 60);
  let qualityScore = 50;
  if (volatility !== null) {
    qualityScore = Math.max(0, Math.min(100, (0.4 - volatility) / 0.4 * 100));
  }

  return momentumScore * 0.40 + technicalScore * 0.30 + qualityScore * 0.30;
}

/**
 * Calculate Hybrid V2 Score (Soft-Cap momentum at +75%)
 */
function calculateHybridV2Score(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w || !price26w) return null;

  // 1. Momentum Score (40%) - SOFT-CAP with new function
  const return13w = (currentPrice - price13w) / price13w;
  const return26w = (currentPrice - price26w) / price26w;
  const weightedReturn = return13w * 0.6 + return26w * 0.4;
  // New soft-cap normalization: f(-1)=0, f(0)=50, f(0.5)=75, f(0.75)=100
  const momentumScore = momentumSoftCapScore(weightedReturn);

  // 2. Technical Strength Score (30%) - Same as V1
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

  const range = high52Week - low52Week;
  let technicalScore = 50;
  if (range > 0) {
    const position = (currentPrice - low52Week) / range;
    if (position >= 0.6 && position <= 0.8) {
      technicalScore = 70 + (position - 0.6) * 100;
    } else if (position > 0.8) {
      technicalScore = 90 - (position - 0.8) * 50;
    } else if (position >= 0.4) {
      technicalScore = 50 + (position - 0.4) * 100;
    } else if (position >= 0.2) {
      technicalScore = 30 + (position - 0.2) * 100;
    } else {
      technicalScore = position * 150;
    }
  }

  // 3. Quality Score (30%) - Same as V1
  const volatility = calculateVolatility(symbolData, asOfDate, allDates, 60);
  let qualityScore = 50;
  if (volatility !== null) {
    qualityScore = Math.max(0, Math.min(100, (0.4 - volatility) / 0.4 * 100));
  }

  return momentumScore * 0.40 + technicalScore * 0.30 + qualityScore * 0.30;
}

/**
 * Find nearest trading day
 */
function findNearestTradingDay(date: string, allDates: string[]): string | null {
  if (allDates.includes(date)) return date;
  for (const d of allDates) {
    if (d >= date) return d;
  }
  return null;
}

/**
 * Select top N stocks based on scoring function
 */
function selectTopStocks(
  dataMap: Map<string, SymbolData>,
  asOfDate: string,
  allDates: string[],
  n: number,
  scoringFn: (data: SymbolData, date: string, dates: string[]) => number | null,
  excludeSymbols: string[] = ['SPY', 'IWM']
): string[] {
  const scores: Array<{ symbol: string; score: number }> = [];

  for (const [symbol, data] of dataMap) {
    if (excludeSymbols.includes(symbol)) continue;

    const score = scoringFn(data, asOfDate, allDates);
    if (score !== null) {
      scores.push({ symbol, score });
    }
  }

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  return scores.slice(0, n).map((s) => s.symbol);
}

/**
 * Run backtest for a single strategy
 */
function runStrategyBacktest(
  dataMap: Map<string, SymbolData>,
  allDates: string[],
  scoringFn: (data: SymbolData, date: string, dates: string[]) => number | null,
  strategyName: string
): { dailyRecords: DailyRecord[]; quarterlyReturns: QuarterlyReturn[]; topPerformers: Map<string, number> } {
  let portfolio: Portfolio = { positions: [], cash: INITIAL_CAPITAL };
  const dailyRecords: DailyRecord[] = [];
  const quarterlyReturns: QuarterlyReturn[] = [];
  const symbolAppearances = new Map<string, number>();

  let currentQuarterIdx = 0;
  let nextRebalanceDate = findNearestTradingDay(QUARTER_STARTS[0], allDates);
  let quarterStartValue = INITIAL_CAPITAL;
  let currentQuarter = '';

  for (const date of allDates) {
    if (nextRebalanceDate && date >= nextRebalanceDate) {
      // Record previous quarter's return
      if (currentQuarter && dailyRecords.length > 0) {
        const endValue = dailyRecords[dailyRecords.length - 1].portfolio_value;
        const quarterReturn = ((endValue - quarterStartValue) / quarterStartValue) * 100;
        quarterlyReturns.push({
          quarter: currentQuarter,
          return_pct: Math.round(quarterReturn * 100) / 100,
          profitable: quarterReturn > 0,
        });
      }

      // Sell all positions
      for (const pos of portfolio.positions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          portfolio.cash += pos.shares * price;
        }
      }
      portfolio.positions = [];

      // Select new stocks
      const topStocks = selectTopStocks(dataMap, date, allDates, TOP_N, scoringFn);

      // Track symbol appearances
      for (const symbol of topStocks) {
        symbolAppearances.set(symbol, (symbolAppearances.get(symbol) || 0) + 1);
      }

      // Buy equal weight
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

      // Update quarter tracking
      quarterStartValue = portfolio.cash + portfolio.positions.reduce((sum, pos) => {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close || 0;
        return sum + pos.shares * price;
      }, 0);

      const quarterNum = Math.floor((currentQuarterIdx % 4) + 1);
      const year = 2020 + Math.floor(currentQuarterIdx / 4);
      currentQuarter = `${year}-Q${quarterNum}`;

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
    }

    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;
    const dailyReturn = (portfolioValue - prevValue) / prevValue;

    dailyRecords.push({
      date,
      portfolio_value: Math.round(portfolioValue * 100) / 100,
      daily_return: dailyReturn,
    });
  }

  // Record final quarter
  if (currentQuarter && dailyRecords.length > 0) {
    const endValue = dailyRecords[dailyRecords.length - 1].portfolio_value;
    const quarterReturn = ((endValue - quarterStartValue) / quarterStartValue) * 100;
    quarterlyReturns.push({
      quarter: currentQuarter,
      return_pct: Math.round(quarterReturn * 100) / 100,
      profitable: quarterReturn > 0,
    });
  }

  return { dailyRecords, quarterlyReturns, topPerformers: symbolAppearances };
}

/**
 * Calculate metrics from daily records
 */
function calculateMetrics(
  dailyRecords: DailyRecord[],
  quarterlyReturns: QuarterlyReturn[]
): StrategyMetrics {
  const startValue = dailyRecords[0].portfolio_value;
  const endValue = dailyRecords[dailyRecords.length - 1].portfolio_value;
  const years = 5;

  const totalReturn = ((endValue / startValue) - 1) * 100;
  const annualizedReturn = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;

  let peak = startValue;
  let maxDrawdown = 0;
  for (const record of dailyRecords) {
    if (record.portfolio_value > peak) {
      peak = record.portfolio_value;
    }
    const drawdown = (record.portfolio_value - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  const maxDrawdownPct = maxDrawdown * 100;

  const dailyReturns = dailyRecords.slice(1).map((r) => r.daily_return);
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const sharpeRatio = volatility > 0 ? (annualizedReturn - RISK_FREE_RATE * 100) / volatility : 0;

  const profitableQuarters = quarterlyReturns.filter((q) => q.profitable).length;
  const winRate = (profitableQuarters / quarterlyReturns.length) * 100;

  return {
    total_return_pct: Math.round(totalReturn * 100) / 100,
    annualized_return_pct: Math.round(annualizedReturn * 100) / 100,
    max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100,
    sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
    volatility_pct: Math.round(volatility * 100) / 100,
    win_rate_pct: Math.round(winRate * 100) / 100,
  };
}

/**
 * Calculate benchmark metrics
 */
function calculateBenchmarkMetrics(
  benchmarkData: SymbolData,
  allDates: string[]
): StrategyMetrics {
  const startPrice = benchmarkData.prices.get(allDates[0])?.close || 1;
  const dailyRecords: DailyRecord[] = [];

  for (const date of allDates) {
    const price = benchmarkData.prices.get(date)?.close || startPrice;
    const value = (price / startPrice) * INITIAL_CAPITAL;
    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;

    dailyRecords.push({
      date,
      portfolio_value: Math.round(value * 100) / 100,
      daily_return: (value - prevValue) / prevValue,
    });
  }

  const quarterlyReturns: QuarterlyReturn[] = [];
  for (let i = 0; i < QUARTER_STARTS.length; i++) {
    const startDate = findNearestTradingDay(QUARTER_STARTS[i], allDates);
    const endDate = i < QUARTER_STARTS.length - 1
      ? findNearestTradingDay(QUARTER_STARTS[i + 1], allDates)
      : allDates[allDates.length - 1];

    if (startDate && endDate) {
      const startRecord = dailyRecords.find((r) => r.date === startDate);
      const endRecord = dailyRecords.find((r) => r.date >= endDate);

      if (startRecord && endRecord) {
        const ret = ((endRecord.portfolio_value - startRecord.portfolio_value) / startRecord.portfolio_value) * 100;
        const quarterNum = (i % 4) + 1;
        const year = 2020 + Math.floor(i / 4);
        quarterlyReturns.push({
          quarter: `${year}-Q${quarterNum}`,
          return_pct: Math.round(ret * 100) / 100,
          profitable: ret > 0,
        });
      }
    }
  }

  return calculateMetrics(dailyRecords, quarterlyReturns);
}

/**
 * Print comparison table
 */
function printComparisonTable(
  strategies: Map<string, StrategyMetrics>,
  benchmark: { name: string; metrics: StrategyMetrics }
): void {
  console.log('\n' + '='.repeat(85));
  console.log('SOFT-CAP MOMENTUM A/B COMPARISON RESULTS');
  console.log('='.repeat(85));

  console.log('\n┌────────────────────┬────────────┬─────────┬────────────┬────────────┐');
  console.log('│ Strategy           │ TotalRet   │ Sharpe  │ MaxDD      │ vs. Bench  │');
  console.log('├────────────────────┼────────────┼─────────┼────────────┼────────────┤');

  const benchReturn = benchmark.metrics.total_return_pct;

  for (const [name, metrics] of strategies) {
    const vsBench = metrics.total_return_pct - benchReturn;
    const vsBenchStr = vsBench >= 0 ? `+${vsBench.toFixed(2)}%` : `${vsBench.toFixed(2)}%`;

    console.log(`│ ${name.padEnd(18)} │ ${(metrics.total_return_pct.toFixed(2) + '%').padStart(10)} │ ${metrics.sharpe_ratio.toFixed(2).padStart(7)} │ ${(metrics.max_drawdown_pct.toFixed(2) + '%').padStart(10)} │ ${vsBenchStr.padStart(10)} │`);
  }

  console.log(`│ ${benchmark.name.padEnd(18)} │ ${(benchReturn.toFixed(2) + '%').padStart(10)} │ ${benchmark.metrics.sharpe_ratio.toFixed(2).padStart(7)} │ ${(benchmark.metrics.max_drawdown_pct.toFixed(2) + '%').padStart(10)} │ ${('0.00%').padStart(10)} │`);
  console.log('└────────────────────┴────────────┴─────────┴────────────┴────────────┘');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(85));
  console.log('SOFT-CAP MOMENTUM A/B COMPARISON BACKTEST');
  console.log('Comparing: hybrid_v1 (Hard-Cap) vs hybrid_v2 (Soft-Cap) | 2020-2024');
  console.log('='.repeat(85));

  // Load data
  const dataMap = loadHistoricalData();
  console.log(`\nLoaded data for ${dataMap.size} symbols`);

  // Determine benchmark (IWM preferred, SPY as fallback)
  let benchmarkSymbol = 'IWM';
  let benchmarkData = dataMap.get('IWM');
  if (!benchmarkData) {
    benchmarkSymbol = 'SPY';
    benchmarkData = dataMap.get('SPY');
  }

  if (!benchmarkData) {
    console.error('No benchmark data found (IWM or SPY)');
    process.exit(1);
  }

  console.log(`Using benchmark: ${benchmarkSymbol}`);

  const allDates = benchmarkData.sortedDates.filter((d) => d >= START_DATE && d <= END_DATE);
  console.log(`Trading days in period: ${allDates.length}`);

  const strategies = new Map<string, { metrics: StrategyMetrics; topPerformers: string[] }>();

  // Run 4-Pillar Strategy
  console.log('\n[1/4] Running 4-Pillar Strategy backtest...');
  const fourPillarResult = runStrategyBacktest(dataMap, allDates, calculate4PillarScore, '4-pillar');
  const fourPillarMetrics = calculateMetrics(fourPillarResult.dailyRecords, fourPillarResult.quarterlyReturns);
  const fourPillarTop = [...fourPillarResult.topPerformers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);
  strategies.set('4-pillar', { metrics: fourPillarMetrics, topPerformers: fourPillarTop });
  console.log(`      Total Return: ${fourPillarMetrics.total_return_pct}%`);

  // Run Hybrid V1 (Hard-Cap)
  console.log('\n[2/4] Running hybrid_v1 (Hard-Cap) backtest...');
  const hybridV1Result = runStrategyBacktest(dataMap, allDates, calculateHybridV1Score, 'hybrid_v1');
  const hybridV1Metrics = calculateMetrics(hybridV1Result.dailyRecords, hybridV1Result.quarterlyReturns);
  const hybridV1Top = [...hybridV1Result.topPerformers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);
  strategies.set('hybrid_v1', { metrics: hybridV1Metrics, topPerformers: hybridV1Top });
  console.log(`      Total Return: ${hybridV1Metrics.total_return_pct}%`);

  // Run Hybrid V2 (Soft-Cap)
  console.log('\n[3/4] Running hybrid_v2 (Soft-Cap) backtest...');
  const hybridV2Result = runStrategyBacktest(dataMap, allDates, calculateHybridV2Score, 'hybrid_v2');
  const hybridV2Metrics = calculateMetrics(hybridV2Result.dailyRecords, hybridV2Result.quarterlyReturns);
  const hybridV2Top = [...hybridV2Result.topPerformers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);
  strategies.set('hybrid_v2', { metrics: hybridV2Metrics, topPerformers: hybridV2Top });
  console.log(`      Total Return: ${hybridV2Metrics.total_return_pct}%`);

  // Run Momentum-Only Strategy
  console.log('\n[4/4] Running momentum_only backtest...');
  const momentumResult = runStrategyBacktest(dataMap, allDates, calculateMomentumOnlyScore, 'momentum_only');
  const momentumMetrics = calculateMetrics(momentumResult.dailyRecords, momentumResult.quarterlyReturns);
  const momentumTop = [...momentumResult.topPerformers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);
  strategies.set('momentum_only', { metrics: momentumMetrics, topPerformers: momentumTop });
  console.log(`      Total Return: ${momentumMetrics.total_return_pct}%`);

  // Calculate benchmark
  const benchmarkMetrics = calculateBenchmarkMetrics(benchmarkData, allDates);
  console.log(`\nBenchmark (${benchmarkSymbol}): ${benchmarkMetrics.total_return_pct}%`);

  // Build output
  const output = {
    universe: 'Russell 2000',
    period: '2020-2024',
    trading_days: allDates.length,
    rebalance_frequency: 'Quarterly',
    top_n: TOP_N,
    strategies: Object.fromEntries(
      [...strategies.entries()].map(([name, data]) => [
        name,
        {
          total_return: data.metrics.total_return_pct,
          sharpe: data.metrics.sharpe_ratio,
          max_drawdown: data.metrics.max_drawdown_pct,
          volatility: data.metrics.volatility_pct,
          win_rate: data.metrics.win_rate_pct,
          top_performers: data.topPerformers,
        },
      ])
    ),
    benchmark: {
      [benchmarkSymbol]: {
        total_return: benchmarkMetrics.total_return_pct,
        sharpe: benchmarkMetrics.sharpe_ratio,
        max_drawdown: benchmarkMetrics.max_drawdown_pct,
      },
    },
    analysis: {
      v1_vs_v2_return_diff: Math.round((hybridV2Metrics.total_return_pct - hybridV1Metrics.total_return_pct) * 100) / 100,
      v1_vs_v2_sharpe_diff: Math.round((hybridV2Metrics.sharpe_ratio - hybridV1Metrics.sharpe_ratio) * 100) / 100,
      soft_cap_improvement_pct: Math.round(((hybridV2Metrics.total_return_pct / hybridV1Metrics.total_return_pct) - 1) * 10000) / 100,
      success_criterion_met: (hybridV2Metrics.total_return_pct - hybridV1Metrics.total_return_pct) >= 5,
    },
    generated_at: new Date().toISOString(),
  };

  // Write output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, 'russell2000-softcap-comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  // Print comparison table
  const metricsMap = new Map<string, StrategyMetrics>();
  for (const [name, data] of strategies) {
    metricsMap.set(name, data.metrics);
  }
  printComparisonTable(metricsMap, { name: benchmarkSymbol, metrics: benchmarkMetrics });

  // Print analysis summary
  console.log('\n' + '='.repeat(85));
  console.log('SOFT-CAP ANALYSIS SUMMARY');
  console.log('='.repeat(85));
  console.log(`\n  hybrid_v1 (Hard-Cap) Total Return: ${hybridV1Metrics.total_return_pct}%`);
  console.log(`  hybrid_v2 (Soft-Cap) Total Return: ${hybridV2Metrics.total_return_pct}%`);
  console.log(`  Difference: ${output.analysis.v1_vs_v2_return_diff >= 0 ? '+' : ''}${output.analysis.v1_vs_v2_return_diff}%`);
  console.log(`  Improvement: ${output.analysis.soft_cap_improvement_pct >= 0 ? '+' : ''}${output.analysis.soft_cap_improvement_pct}%`);
  console.log(`\n  Success Criterion (>= +5% improvement): ${output.analysis.success_criterion_met ? 'PASSED' : 'NOT MET'}`);
  console.log('='.repeat(85));
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
