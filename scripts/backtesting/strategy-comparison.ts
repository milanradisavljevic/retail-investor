/**
 * Strategy Comparison Backtest
 *
 * Compares two scoring strategies over 2020-2024:
 * 1. 4-Pillar Strategy: Valuation (25%), Quality (25%), Technical (25%), Risk (25%)
 * 2. Hybrid Strategy: Momentum (40%), Technical (30%), Quality (30%)
 *
 * Output: data/backtesting/strategy-comparison.json
 *
 * Usage: npx tsx scripts/backtesting/strategy-comparison.ts
 */

import * as fs from 'fs';
import * as path from 'path';

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
  calmar_ratio: number;
  volatility_pct: number;
  win_rate_pct: number;
  quarterly_returns: QuarterlyReturn[];
}

interface StrategyResult {
  name: string;
  description: string;
  weights: Record<string, number>;
  metrics: StrategyMetrics;
  daily_values: number[];
}

interface ComparisonResult {
  period: string;
  universe_size: number;
  rebalance_frequency: string;
  top_n: number;
  benchmark: {
    name: string;
    metrics: StrategyMetrics;
  };
  strategies: StrategyResult[];
  comparison_table: {
    metric: string;
    fourPillar: string;
    hybrid: string;
    benchmark: string;
    winner: string;
  }[];
  generated_at: string;
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
 * Calculate 4-Pillar Score
 * Since historical fundamentals aren't available, we approximate:
 * - Valuation (25%): Inverse of current price vs 52W range (lower = better value)
 * - Quality (25%): Proxy using price stability (lower volatility = higher quality)
 * - Technical (25%): Position in 52W range + trend
 * - Risk (25%): Inverse volatility (lower vol = lower risk = higher score)
 */
function calculate4PillarScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null;  // FIXED: Changed from 252 to 130 (same as Hybrid) to include 2020 data

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

  // 1. Valuation Score (25%) - Lower in range = better value
  // Inverted: Being at 52W low = 100, at 52W high = 0
  const positionInRange = (currentPrice - low52Week) / range52Week;
  const valuationScore = (1 - positionInRange) * 100;

  // 2. Quality Score (25%) - Approximated by price stability
  const volatility = calculateVolatility(symbolData, asOfDate, allDates, 60);
  let qualityScore = 50; // Default neutral
  if (volatility !== null) {
    // Lower volatility = higher quality score
    // Vol of 0.2 (20%) = 50, Vol of 0.4 (40%) = 0, Vol of 0 = 100
    qualityScore = Math.max(0, Math.min(100, (0.4 - volatility) / 0.4 * 100));
  }

  // 3. Technical Score (25%) - Trend + position in range
  const price50dAgo = symbolData.prices.get(allDates[Math.max(0, dateIdx - 50)])?.close;
  const price200dAgo = symbolData.prices.get(allDates[Math.max(0, dateIdx - 200)])?.close;

  let technicalScore = 50;
  if (price50dAgo && price200dAgo) {
    const ma50Trend = (currentPrice - price50dAgo) / price50dAgo;
    const ma200Trend = (currentPrice - price200dAgo) / price200dAgo;

    // Positive trends are good
    const trendScore = ((ma50Trend + 0.2) / 0.4 * 50) + ((ma200Trend + 0.4) / 0.8 * 50);
    technicalScore = Math.max(0, Math.min(100, trendScore));
  }

  // 4. Risk Score (25%) - Lower volatility = higher score
  const volatility20d = calculateVolatility(symbolData, asOfDate, allDates, 20);
  let riskScore = 50;
  if (volatility20d !== null) {
    riskScore = Math.max(0, Math.min(100, (0.5 - volatility20d) / 0.5 * 100));
  }

  // Weighted combination (all 25%)
  const totalScore =
    valuationScore * 0.25 +
    qualityScore * 0.25 +
    technicalScore * 0.25 +
    riskScore * 0.25;

  return totalScore;
}

/**
 * Calculate Hybrid Score (Momentum 40%, Technical 30%, Quality 30%)
 */
function calculateHybridScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Get historical prices
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w || !price26w) return null;

  // 1. Momentum Score (40%)
  const return13w = (currentPrice - price13w) / price13w;
  const return26w = (currentPrice - price26w) / price26w;
  const weightedReturn = return13w * 0.6 + return26w * 0.4;
  // Normalize: -50% → 0, 0% → 50, +50% → 100
  const momentumScore = Math.max(0, Math.min(100, (weightedReturn + 0.5) * 100));

  // 2. Technical Strength Score (30%) - Position in 52W range
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
    // Optimal zone: 60-80% of range
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

  // 3. Quality Score (30%) - Based on volatility as proxy
  const volatility = calculateVolatility(symbolData, asOfDate, allDates, 60);
  let qualityScore = 50;
  if (volatility !== null) {
    qualityScore = Math.max(0, Math.min(100, (0.4 - volatility) / 0.4 * 100));
  }

  // Weighted total
  const totalScore =
    momentumScore * 0.40 +
    technicalScore * 0.30 +
    qualityScore * 0.30;

  return totalScore;
}

/**
 * Select top N stocks based on scoring function
 */
function selectTopStocks(
  dataMap: Map<string, SymbolData>,
  asOfDate: string,
  allDates: string[],
  n: number,
  scoringFn: (data: SymbolData, date: string, dates: string[]) => number | null
): string[] {
  const scores: Array<{ symbol: string; score: number }> = [];

  for (const [symbol, data] of dataMap) {
    if (symbol === 'SPY') continue;

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
): { dailyRecords: DailyRecord[]; quarterlyReturns: QuarterlyReturn[] } {
  let portfolio: Portfolio = { positions: [], cash: INITIAL_CAPITAL };
  const dailyRecords: DailyRecord[] = [];
  const quarterlyReturns: QuarterlyReturn[] = [];

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

  return { dailyRecords, quarterlyReturns };
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
 * Calculate metrics from daily records
 */
function calculateMetrics(
  dailyRecords: DailyRecord[],
  quarterlyReturns: QuarterlyReturn[]
): StrategyMetrics {
  const startValue = dailyRecords[0].portfolio_value;
  const endValue = dailyRecords[dailyRecords.length - 1].portfolio_value;
  const years = 5; // 2020-2024

  // Total Return
  const totalReturn = ((endValue / startValue) - 1) * 100;

  // Annualized Return (CAGR)
  const annualizedReturn = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;

  // Max Drawdown
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

  // Volatility
  const dailyReturns = dailyRecords.slice(1).map((r, i) => r.daily_return);
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  // Sharpe Ratio
  const sharpeRatio = volatility > 0 ? (annualizedReturn - RISK_FREE_RATE * 100) / volatility : 0;

  // Calmar Ratio (Annualized Return / |Max Drawdown|)
  const calmarRatio = maxDrawdownPct !== 0 ? annualizedReturn / Math.abs(maxDrawdownPct) : 0;

  // Win Rate (% profitable quarters)
  const profitableQuarters = quarterlyReturns.filter((q) => q.profitable).length;
  const winRate = (profitableQuarters / quarterlyReturns.length) * 100;

  return {
    total_return_pct: Math.round(totalReturn * 100) / 100,
    annualized_return_pct: Math.round(annualizedReturn * 100) / 100,
    max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100,
    sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
    calmar_ratio: Math.round(calmarRatio * 100) / 100,
    volatility_pct: Math.round(volatility * 100) / 100,
    win_rate_pct: Math.round(winRate * 100) / 100,
    quarterly_returns: quarterlyReturns,
  };
}

/**
 * Calculate benchmark (SPY buy & hold) metrics
 */
function calculateBenchmarkMetrics(
  spyData: SymbolData,
  allDates: string[]
): StrategyMetrics {
  const startPrice = spyData.prices.get(allDates[0])?.close || 1;
  const dailyRecords: DailyRecord[] = [];

  for (const date of allDates) {
    const price = spyData.prices.get(date)?.close || startPrice;
    const value = (price / startPrice) * INITIAL_CAPITAL;
    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;

    dailyRecords.push({
      date,
      portfolio_value: Math.round(value * 100) / 100,
      daily_return: (value - prevValue) / prevValue,
    });
  }

  // Calculate quarterly returns for benchmark
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
 * Determine winner for a metric
 * For max drawdown (negative values), less negative = better, so higherIsBetter should be true
 */
function determineWinner(
  fourPillar: number,
  hybrid: number,
  benchmark: number,
  higherIsBetter: boolean
): string {
  const values = [
    { name: '4-Pillar', value: fourPillar },
    { name: 'Hybrid', value: hybrid },
    { name: 'S&P 500', value: benchmark },
  ];

  values.sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value);
  return values[0].name;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('STRATEGY COMPARISON BACKTEST');
  console.log('4-Pillar vs Hybrid Scoring | 2020-2024');
  console.log('='.repeat(70));

  // Load data
  const dataMap = loadHistoricalData();
  console.log(`\nLoaded data for ${dataMap.size} symbols`);

  const spyData = dataMap.get('SPY');
  if (!spyData) {
    console.error('SPY data not found');
    process.exit(1);
  }

  const allDates = spyData.sortedDates.filter((d) => d >= START_DATE && d <= END_DATE);
  console.log(`Trading days in period: ${allDates.length}`);

  // Run 4-Pillar Strategy
  console.log('\n[1/3] Running 4-Pillar Strategy backtest...');
  const fourPillarResult = runStrategyBacktest(dataMap, allDates, calculate4PillarScore, '4-Pillar');
  const fourPillarMetrics = calculateMetrics(fourPillarResult.dailyRecords, fourPillarResult.quarterlyReturns);
  console.log(`      Total Return: ${fourPillarMetrics.total_return_pct}%`);

  // Run Hybrid Strategy
  console.log('\n[2/3] Running Hybrid Strategy backtest...');
  const hybridResult = runStrategyBacktest(dataMap, allDates, calculateHybridScore, 'Hybrid');
  const hybridMetrics = calculateMetrics(hybridResult.dailyRecords, hybridResult.quarterlyReturns);
  console.log(`      Total Return: ${hybridMetrics.total_return_pct}%`);

  // Calculate benchmark
  console.log('\n[3/3] Calculating S&P 500 benchmark...');
  const benchmarkMetrics = calculateBenchmarkMetrics(spyData, allDates);
  console.log(`      Total Return: ${benchmarkMetrics.total_return_pct}%`);

  // Build comparison table
  const comparisonTable = [
    {
      metric: 'Total Return',
      fourPillar: `${fourPillarMetrics.total_return_pct}%`,
      hybrid: `${hybridMetrics.total_return_pct}%`,
      benchmark: `${benchmarkMetrics.total_return_pct}%`,
      winner: determineWinner(fourPillarMetrics.total_return_pct, hybridMetrics.total_return_pct, benchmarkMetrics.total_return_pct, true),
    },
    {
      metric: 'Annualized Return',
      fourPillar: `${fourPillarMetrics.annualized_return_pct}%`,
      hybrid: `${hybridMetrics.annualized_return_pct}%`,
      benchmark: `${benchmarkMetrics.annualized_return_pct}%`,
      winner: determineWinner(fourPillarMetrics.annualized_return_pct, hybridMetrics.annualized_return_pct, benchmarkMetrics.annualized_return_pct, true),
    },
    {
      metric: 'Max Drawdown',
      fourPillar: `${fourPillarMetrics.max_drawdown_pct}%`,
      hybrid: `${hybridMetrics.max_drawdown_pct}%`,
      benchmark: `${benchmarkMetrics.max_drawdown_pct}%`,
      winner: determineWinner(fourPillarMetrics.max_drawdown_pct, hybridMetrics.max_drawdown_pct, benchmarkMetrics.max_drawdown_pct, true), // Less negative = better
    },
    {
      metric: 'Sharpe Ratio',
      fourPillar: `${fourPillarMetrics.sharpe_ratio}`,
      hybrid: `${hybridMetrics.sharpe_ratio}`,
      benchmark: `${benchmarkMetrics.sharpe_ratio}`,
      winner: determineWinner(fourPillarMetrics.sharpe_ratio, hybridMetrics.sharpe_ratio, benchmarkMetrics.sharpe_ratio, true),
    },
    {
      metric: 'Calmar Ratio',
      fourPillar: `${fourPillarMetrics.calmar_ratio}`,
      hybrid: `${hybridMetrics.calmar_ratio}`,
      benchmark: `${benchmarkMetrics.calmar_ratio}`,
      winner: determineWinner(fourPillarMetrics.calmar_ratio, hybridMetrics.calmar_ratio, benchmarkMetrics.calmar_ratio, true),
    },
    {
      metric: 'Win Rate',
      fourPillar: `${fourPillarMetrics.win_rate_pct}%`,
      hybrid: `${hybridMetrics.win_rate_pct}%`,
      benchmark: `${benchmarkMetrics.win_rate_pct}%`,
      winner: determineWinner(fourPillarMetrics.win_rate_pct, hybridMetrics.win_rate_pct, benchmarkMetrics.win_rate_pct, true),
    },
  ];

  // Build result object
  const result: ComparisonResult = {
    period: `${START_DATE} to ${END_DATE}`,
    universe_size: dataMap.size - 1, // Excluding SPY
    rebalance_frequency: 'Quarterly',
    top_n: TOP_N,
    benchmark: {
      name: 'S&P 500 (SPY Buy & Hold)',
      metrics: benchmarkMetrics,
    },
    strategies: [
      {
        name: '4-Pillar Strategy',
        description: 'Balanced approach: Valuation, Quality, Technical, Risk',
        weights: { valuation: 0.25, quality: 0.25, technical: 0.25, risk: 0.25 },
        metrics: fourPillarMetrics,
        daily_values: fourPillarResult.dailyRecords.map((r) => r.portfolio_value),
      },
      {
        name: 'Hybrid Strategy',
        description: 'Momentum-focused: Momentum, Technical, Quality',
        weights: { momentum: 0.40, technical: 0.30, quality: 0.30 },
        metrics: hybridMetrics,
        daily_values: hybridResult.dailyRecords.map((r) => r.portfolio_value),
      },
    ],
    comparison_table: comparisonTable,
    generated_at: new Date().toISOString(),
  };

  // Write results
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, 'strategy-comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  // Print comparison table
  console.log('\n' + '='.repeat(70));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(70));
  console.log('\n┌─────────────────────┬───────────────┬───────────────┬───────────────┬───────────┐');
  console.log('│ Metric              │ 4-Pillar      │ Hybrid        │ S&P 500       │ Winner    │');
  console.log('├─────────────────────┼───────────────┼───────────────┼───────────────┼───────────┤');

  for (const row of comparisonTable) {
    const metric = row.metric.padEnd(19);
    const fp = row.fourPillar.padStart(12);
    const hy = row.hybrid.padStart(12);
    const bm = row.benchmark.padStart(12);
    const win = row.winner.padEnd(9);
    console.log(`│ ${metric} │ ${fp} │ ${hy} │ ${bm} │ ${win} │`);
  }

  console.log('└─────────────────────┴───────────────┴───────────────┴───────────────┴───────────┘');
  console.log('\n' + '='.repeat(70));
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
