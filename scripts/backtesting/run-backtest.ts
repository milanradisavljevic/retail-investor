/**
 * Backtesting Runner
 *
 * Simulates configurable rebalancing strategy (monthly/quarterly/annually) using historical data.
 * Buy Top N stocks at rebalance dates, hold until next rebalance.
 *
 * Usage: npx tsx scripts/backtesting/run-backtest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { calculateMetrics, type DailyRecord, type BacktestSummary, type RebalanceEvent } from './calculate-metrics';
import { calculateHybridScore, type HybridScoreInput } from './hybrid-scoring';
import { calculateAvgMetrics } from './avg-metrics';
import { YFinanceProvider } from '../../src/providers/yfinance_provider';
import type { FundamentalsData } from '../../src/data/repositories/fundamentals_repo';
import type { TechnicalMetrics } from '../../src/providers/types';

// Configuration
const HISTORICAL_DIR = path.join(process.cwd(), 'data/backtesting/historical');
const OUTPUT_DIR = path.join(process.cwd(), 'data/backtesting');
const START_DATE = process.env.BACKTEST_START || '2015-01-01';
const END_DATE = process.env.BACKTEST_END || '2025-12-31';
const INITIAL_CAPITAL = 100_000;
const TOP_N = Number(process.env.TOP_N || 10);
const MIN_MARKET_CAP = Number(process.env.MIN_MARKET_CAP || 1_000_000_000); // $1B default
const MAX_ANNUALIZED_VOL = Number(process.env.MAX_ANNUALIZED_VOL || 25); // % cap for shield-style filters
const MC_CANDIDATE_LIMIT = Number(process.env.MC_CANDIDATE_LIMIT || 200);
const FUND_FETCH_TIMEOUT_MS = Number(process.env.FUND_FETCH_TIMEOUT_MS || 4000);

// Preset + scoring mode
const PRESET = (process.env.PRESET || process.env.SCORING_PRESET || '').toLowerCase();
const HOLD_BUFFER = Number(process.env.HOLD_BUFFER || 5); // how many extra ranks we allow before selling
type ScoringMode = 'momentum' | 'hybrid' | 'shield';
const SCORING_MODE: ScoringMode = (() => {
  const env = (process.env.SCORING_MODE || '').toLowerCase();
  if (env === 'momentum') return 'momentum';
  if (env === 'shield') return 'shield';
  if (PRESET === 'shield') return 'shield';
  return 'hybrid';
})();

type RebalanceFrequency = 'monthly' | 'quarterly' | 'annually' | 'semiannual';
const REBALANCE_FREQUENCY: RebalanceFrequency = (() => {
  const env = (process.env.REBALANCING || 'quarterly').toLowerCase();
  if (env === 'monthly' || env === 'quarterly' || env === 'annually') return env;
  if (env === 'semi-annual' || env === 'semiannual' || env === 'semi') return 'semiannual';
  return 'quarterly';
})();

// Slippage and transaction costs
interface SlippageModel {
  type: 'optimistic' | 'realistic' | 'conservative';
  buySlippage: number;   // e.g. 0.005 for 0.5%
  sellSlippage: number;  // e.g. 0.005 for 0.5%
}

const SLIPPAGE_MODELS: Record<string, SlippageModel> = {
  optimistic: { type: 'optimistic', buySlippage: 0.001, sellSlippage: 0.001 },
  realistic: { type: 'realistic', buySlippage: 0.005, sellSlippage: 0.005 },
  conservative: { type: 'conservative', buySlippage: 0.015, sellSlippage: 0.015 }
};

const DEFAULT_SLIPPAGE_MODEL = 'realistic';
const TRANSACTION_COST_PCT = 0.001; // 0.1% per trade

// Slippage model selection (moved after SLIPPAGE_MODELS definition)
const ENV_SLIPPAGE_MODEL = process.env.SLIPPAGE_MODEL || DEFAULT_SLIPPAGE_MODEL;
const SLIPPAGE_MODEL_KEY = Object.keys(SLIPPAGE_MODELS).includes(ENV_SLIPPAGE_MODEL)
  ? ENV_SLIPPAGE_MODEL
  : DEFAULT_SLIPPAGE_MODEL;

interface BacktestCosts {
  totalSlippageCost: number;
  totalTransactionCost: number;
  totalTrades: number;
  avgSlippagePerTrade: number;
}

type UniverseConfig = {
  benchmark?: string;
  symbols?: string[];
};

function resolveUniversePath(): { universeName: string; universePath: string } {
  const universeName = (process.env.UNIVERSE || 'sp500').trim();
  const configPath = process.env.UNIVERSE_CONFIG?.trim();

  if (configPath) {
    return {
      universeName,
      universePath: path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath),
    };
  }

  return {
    universeName,
    universePath: path.join(process.cwd(), 'config', 'universes', `${universeName}.json`),
  };
}

function loadUniverseConfig(): { universeName: string; symbols: string[]; benchmark: string } {
  const { universeName, universePath } = resolveUniversePath();
  if (!fs.existsSync(universePath)) {
    throw new Error(`Universe file not found: ${universePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(universePath, 'utf-8')) as UniverseConfig;
  const symbols = (parsed.symbols ?? []).map((s) => String(s).toUpperCase());
  const benchmark = String(parsed.benchmark ?? 'SPY').toUpperCase();

  if (!symbols.includes(benchmark)) {
    symbols.push(benchmark);
  }

  return { universeName, symbols, benchmark };
}

function countPricesBefore(symbol: string, startDate: string): number {
  const csvPath = path.join(HISTORICAL_DIR, `${symbol}.csv`);
  if (!fs.existsSync(csvPath)) return 0;
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const [date] = lines[i].split(',');
    if (!date) continue;
    if (date < startDate) count++;
  }
  return count;
}

function filterByCoverage(symbols: string[], startDate: string, requiredDays = 252): string[] {
  const valid: string[] = [];
  const dropped: string[] = [];

  for (const sym of symbols) {
    const days = countPricesBefore(sym, startDate);
    if (days >= requiredDays) valid.push(sym);
    else dropped.push(sym);
  }

  if (dropped.length > 0) {
    console.log(
      `Coverage filter: ${valid.length}/${symbols.length} symbols have >=${requiredDays} days before ${startDate}.`
    );
    console.log(`Dropping ${dropped.length} symbols (first 5): ${dropped.slice(0, 5).join(', ')}`);
  }

  return valid;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function shouldRebalance(
  currentDate: Date,
  lastRebalanceDate: Date,
  frequency: RebalanceFrequency
): boolean {
  const monthsDiff =
    (currentDate.getFullYear() - lastRebalanceDate.getFullYear()) * 12 +
    (currentDate.getMonth() - lastRebalanceDate.getMonth());

  switch (frequency) {
    case 'monthly':
      return monthsDiff >= 1;
    case 'quarterly':
      return monthsDiff >= 3;
    case 'annually':
      return monthsDiff >= 12;
    case 'semiannual':
      return monthsDiff >= 6;
    default:
      return false;
  }
}

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

interface BacktestResult {
  dailyRecords: DailyRecord[];
  costs: BacktestCosts;
  rebalanceEvents: RebalanceEvent[];
}

/**
 * Execute a buy trade with slippage and transaction costs
 */
function executeBuy(price: number, shares: number, model: SlippageModel): { cost: number; avgPrice: number } {
  const slippagePrice = price * (1 + model.buySlippage);
  const grossCost = slippagePrice * shares;
  const transactionCost = grossCost * TRANSACTION_COST_PCT;
  return {
    cost: grossCost + transactionCost,
    avgPrice: slippagePrice
  };
}

/**
 * Execute a sell trade with slippage and transaction costs
 */
function executeSell(price: number, shares: number, model: SlippageModel): { proceeds: number; avgPrice: number } {
  const slippagePrice = price * (1 - model.sellSlippage);
  const grossProceeds = slippagePrice * shares;
  const transactionCost = grossProceeds * TRANSACTION_COST_PCT;
  return {
    proceeds: grossProceeds - transactionCost,
    avgPrice: slippagePrice
  };
}

/**
 * Load historical price data for all symbols
 */
function loadHistoricalData(symbols: string[]): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();
  const targetSymbols = new Set(symbols.map((s) => s.toUpperCase()));

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`Historical data directory not found: ${HISTORICAL_DIR}`);
    console.error('Run: python scripts/backtesting/fetch-historical.py first');
    process.exit(1);
  }

  const files = fs
    .readdirSync(HISTORICAL_DIR)
    .filter((f) => f.endsWith('.csv'))
    .filter((f) => targetSymbols.has(f.replace('.csv', '').toUpperCase()));

  const missing = symbols.filter(
    (symbol) => !fs.existsSync(path.join(HISTORICAL_DIR, `${symbol}.csv`))
  );

  console.log(`Loading ${files.length} symbol files for this universe...`);
  if (missing.length > 0) {
    console.warn(
      `Missing ${missing.length} historical files (backtest will treat these as unavailable/delisted): ${missing
        .slice(0, 20)
        .join(', ')}${missing.length > 20 ? ', ...' : ''}`
    );
  }

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
  const MIN_DAYS_13W = 60; // slightly under 13 weeks to allow early 2020 picks
  const MIN_DAYS_26W = 130;

  if (dateIdx < MIN_DAYS_13W) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Find prices approximately 13 weeks and 26 weeks ago
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];

  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w) return null;

  const return13w = (currentPrice - price13w) / price13w;
  const return26w =
    price26w && dateIdx >= MIN_DAYS_26W ? (currentPrice - price26w) / price26w : null;

  if (return26w === null) {
    return return13w; // fallback to shorter window when long history is unavailable
  }

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
 * Calculate Shield (Low Volatility) score.
 * - 60% weight to low volatility (lower vol = higher score)
 * - 40% weight to momentum (same calc as hybrid)
 */
function calculateShieldScoreForDate(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null; // need ~6 months

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Momentum piece (reuse hybrid 13/26w)
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  const return13w = price13w ? (currentPrice - price13w) / price13w : null;
  const return26w = price26w ? (currentPrice - price26w) / price26w : null;

  // Require positive 26-week trend to avoid falling knives
  if (return26w !== null && return26w < 0) return null;

  const momentumScore = calculateHybridScore({
    symbol: symbolData.symbol,
    currentPrice,
    high52Week: currentPrice,
    low52Week: currentPrice,
    return13Week: return13w,
    return26Week: return26w,
    return52Week: null,
  }).components.momentum;

  // Volatility over last 90 trading days
  const lookbackStart = Math.max(0, dateIdx - 90);
  const prices: number[] = [];
  for (let i = lookbackStart + 1; i <= dateIdx; i++) {
    const p = symbolData.prices.get(allDates[i])?.close;
    if (p) prices.push(p);
  }
  if (prices.length < 30) return null;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const annualizedVolPct = dailyStd * Math.sqrt(252) * 100;

  // Hard filter: drop if above max allowed volatility (environment override)
  if (annualizedVolPct > MAX_ANNUALIZED_VOL) return null;

  // Map volatility to score: 10% => 100, 20% => 70, 25% => 50, 30% => 20, 40% => 0
  const volScore = (() => {
    if (annualizedVolPct <= 10) return 100;
    if (annualizedVolPct <= 20) return 70 + (20 - annualizedVolPct) * 2;
    if (annualizedVolPct <= 25) return 50 + (25 - annualizedVolPct) * 4;
    if (annualizedVolPct <= 30) return 20 + (30 - annualizedVolPct) * 6;
    if (annualizedVolPct <= 40) return Math.max(0, (40 - annualizedVolPct) * 2);
    return 0;
  })();

  return volScore * 0.7 + momentumScore * 0.3;
}

/**
 * Select top N stocks based on score at given date
 */
type RankedStock = { symbol: string; score: number };

type FundamentalsFetcher = (symbol: string) => Promise<FundamentalsData | null>;

async function rankStocks(
  dataMap: Map<string, SymbolData>,
  asOfDate: string,
  allDates: string[],
  benchmarkSymbol: string,
  fundamentalsFetcher: FundamentalsFetcher | null
): Promise<RankedStock[]> {
  const scores: Array<{ symbol: string; score: number }> = [];

  for (const [symbol, data] of dataMap) {
    if (symbol === benchmarkSymbol) continue; // Exclude benchmark

    let score: number | null = null;
    if (SCORING_MODE === 'shield') {
      score = calculateShieldScoreForDate(data, asOfDate, allDates);
    } else if (SCORING_MODE === 'hybrid') {
      score = calculateHybridScoreForDate(data, asOfDate, allDates);
    } else {
      score = calculateMomentumScore(data, asOfDate, allDates);
    }

    if (score !== null) {
      // Market cap filter for shield mode (requires fundamentals)
      if (SCORING_MODE === 'shield' && fundamentalsFetcher && MIN_MARKET_CAP > 0) {
        try {
          const f = await fundamentalsFetcher(symbol);
          if (f?.marketCap !== null && f?.marketCap !== undefined && f.marketCap < MIN_MARKET_CAP) {
            continue; // drop microcaps
          }
        } catch {
          // on fetch failure, keep symbol to avoid over-pruning
        }
      }
      scores.push({ symbol, score });
    }
  }

  // Sort by score descending, then alphabetically for determinism
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  // Fundamentals-based market-cap filter (only for shield), limited to top N to avoid timeouts
  if (SCORING_MODE === 'shield' && fundamentalsFetcher && MIN_MARKET_CAP > 0) {
    const limited = scores.slice(0, Math.min(MC_CANDIDATE_LIMIT, 30)); // hard cap at 30 for speed
    const kept: RankedStock[] = [];
    for (const item of limited) {
      try {
        const f = await withTimeout(fundamentalsFetcher(item.symbol), FUND_FETCH_TIMEOUT_MS);
        if (f?.marketCap !== null && f?.marketCap !== undefined && f.marketCap < MIN_MARKET_CAP) {
          continue; // drop microcaps
        }
      } catch {
        // On timeout or failure: keep (fail-open) to avoid over-pruning
      }
      kept.push(item);
    }
    // merge kept (filtered top slice) with rest (unfiltered tail)
    return kept.concat(scores.slice(MC_CANDIDATE_LIMIT));
  }

  return scores;
}

/**
 * Find nearest trading day on or after given date
 */
// Run the backtest simulation
async function runBacktest(
  dataMap: Map<string, SymbolData>,
  benchmarkSymbol: string,
  rebalanceFrequency: RebalanceFrequency = REBALANCE_FREQUENCY,
  fundamentalsFetcher: FundamentalsFetcher | null = null
): Promise<BacktestResult> {
  console.log('\nRunning backtest simulation...');
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Initial capital: $${INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`Strategy: ${rebalanceFrequency} rebalance, Top ${TOP_N} stocks`);
  console.log(`Scoring mode: ${SCORING_MODE.toUpperCase()}`);
  console.log(`Benchmark: ${benchmarkSymbol}`);

  // Get all trading dates from benchmark
  const benchmarkData = dataMap.get(benchmarkSymbol);
  if (!benchmarkData) {
    console.error(`${benchmarkSymbol} data not found. Cannot run backtest.`);
    process.exit(1);
  }

  const allDates = benchmarkData.sortedDates.filter((d) => d >= START_DATE && d <= END_DATE);
  console.log(`Trading days in period: ${allDates.length}`);

  // Initialize portfolio
  let portfolio: Portfolio = { positions: [], cash: INITIAL_CAPITAL };
  const dailyRecords: DailyRecord[] = [];

  // Initialize costs tracking
  let totalSlippageCost = 0;
  let totalTransactionCost = 0;
  let totalTrades = 0;

  // Get selected slippage model
  const slippageModel = SLIPPAGE_MODELS[SLIPPAGE_MODEL_KEY];

  // Rebalance tracking
  let lastRebalanceDate: Date | null = null;
  const rebalanceEvents: RebalanceEvent[] = [];

  // Initial benchmark value
  const benchmarkStartPrice = benchmarkData.prices.get(allDates[0])?.close || 1;

  for (const date of allDates) {
    const dateObj = new Date(date);

    // Portfolio value before any rebalance on this day
    let portfolioValueBefore = portfolio.cash;
    for (const pos of portfolio.positions) {
      const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
      if (price) {
        portfolioValueBefore += pos.shares * price;
      }
    }

    const needsRebalance =
      lastRebalanceDate === null || shouldRebalance(dateObj, lastRebalanceDate, rebalanceFrequency);

    if (needsRebalance) {
      const soldSymbols: string[] = [];
      const boughtSymbols: string[] = [];
      let soldNotional = 0;
      let buyNotional = 0;

      // Sell all positions with slippage and transaction costs
      for (const pos of portfolio.positions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          const sellResult = executeSell(price, pos.shares, slippageModel);
          portfolio.cash += sellResult.proceeds;

          const grossProceeds = price * pos.shares;
          soldNotional += grossProceeds;
          totalSlippageCost += (grossProceeds - sellResult.proceeds) - (grossProceeds * TRANSACTION_COST_PCT);
          totalTransactionCost += grossProceeds * TRANSACTION_COST_PCT;
          totalTrades++;
        }
        soldSymbols.push(pos.symbol);
        // If stock delisted (no price), position value = 0
      }
      portfolio.positions = [];

      // Rank all stocks
      const ranking = await rankStocks(dataMap, date, allDates, benchmarkSymbol, fundamentalsFetcher);
      const holdZone = TOP_N + HOLD_BUFFER;

      // Determine keep vs sell using hold buffer
      const kept: Position[] = [];
      const toSellPositions: Position[] = [];
      const keptSymbols: string[] = [];

      for (const pos of portfolio.positions) {
        const rankIdx = ranking.findIndex((r) => r.symbol === pos.symbol);
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        const tradable = price !== undefined && price > 0;

        if (!tradable || rankIdx === -1 || rankIdx >= holdZone) {
          toSellPositions.push(pos);
        } else {
          kept.push(pos);
          keptSymbols.push(pos.symbol);
        }
      }

      // Sell positions outside hold zone
      for (const pos of toSellPositions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          const sellResult = executeSell(price, pos.shares, slippageModel);
          portfolio.cash += sellResult.proceeds;

          const grossProceeds = price * pos.shares;
          soldNotional += grossProceeds;
          totalSlippageCost += (grossProceeds - sellResult.proceeds) - (grossProceeds * TRANSACTION_COST_PCT);
          totalTransactionCost += grossProceeds * TRANSACTION_COST_PCT;
          totalTrades++;
        }
        soldSymbols.push(pos.symbol);
      }
      portfolio.positions = kept;

      // Target buys up to TOP_N
      const currentSymbols = new Set(portfolio.positions.map((p) => p.symbol));
      const toBuySymbols: string[] = [];
      for (const { symbol } of ranking) {
        if (toBuySymbols.length + portfolio.positions.length >= TOP_N) break;
        if (!currentSymbols.has(symbol)) {
          toBuySymbols.push(symbol);
        }
      }

      console.log(`\n${date}: Rebalancing to ${TOP_N} stocks (${rebalanceFrequency})`);
      console.log(`  Keeping: ${portfolio.positions.map((p) => p.symbol).join(', ') || 'none'}`);
      console.log(`  Buying: ${toBuySymbols.slice(0, 5).join(', ')}${toBuySymbols.length > 5 ? '...' : ''}`);

      // Buy equal weight positions with slippage and transaction costs
      if (toBuySymbols.length > 0) {
        const cashPerPosition = portfolio.cash / toBuySymbols.length;
        for (const symbol of toBuySymbols) {
          const price = dataMap.get(symbol)?.prices.get(date)?.close;
          if (price && price > 0) {
            const estimatedShares = Math.floor(
              cashPerPosition / (price * (1 + slippageModel.buySlippage) * (1 + TRANSACTION_COST_PCT))
            );

            if (estimatedShares > 0) {
              const buyResult = executeBuy(price, estimatedShares, slippageModel);

              if (buyResult.cost <= cashPerPosition) {
                portfolio.positions.push({ symbol, shares: estimatedShares, entryPrice: buyResult.avgPrice });
                portfolio.cash -= buyResult.cost;

                const grossCost = price * estimatedShares;
                buyNotional += grossCost;
                totalSlippageCost += (buyResult.cost - grossCost) - (grossCost * TRANSACTION_COST_PCT);
                totalTransactionCost += grossCost * TRANSACTION_COST_PCT;
                totalTrades++;
                boughtSymbols.push(symbol);
              }
            }
          }
        }
      }

      const turnoverBase = Math.max(soldNotional, buyNotional);
      const turnoverPct = portfolioValueBefore > 0 ? (turnoverBase / portfolioValueBefore) * 100 : 0;
      rebalanceEvents.push({
        date,
        action: 'rebalance',
        sold: soldSymbols,
        bought: boughtSymbols,
        kept: keptSymbols,
        turnover: Math.round(turnoverPct * 100) / 100,
      });

      lastRebalanceDate = dateObj;
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

    // Calculate benchmark value
    const benchmarkPrice = benchmarkData.prices.get(date)?.close || benchmarkStartPrice;
    const benchmarkValue = (benchmarkPrice / benchmarkStartPrice) * INITIAL_CAPITAL;

    // Calculate daily return
    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;
    const dailyReturn = (portfolioValue - prevValue) / prevValue;

    // Calculate drawdown
    const peakValue = dailyRecords.reduce((max, r) => Math.max(max, r.portfolio_value), INITIAL_CAPITAL);
    const drawdown = (portfolioValue - peakValue) / peakValue;

    dailyRecords.push({
      date,
      portfolio_value: Math.round(portfolioValue * 100) / 100,
      sp500_value: Math.round(benchmarkValue * 100) / 100,
      daily_return_pct: Math.round(dailyReturn * 10000) / 100,
      drawdown_pct: Math.round(drawdown * 10000) / 100,
    });
  }

  // Calculate final cost metrics
  const avgSlippagePerTrade = totalTrades > 0 ? totalSlippageCost / totalTrades : 0;
  const costs: BacktestCosts = {
    totalSlippageCost,
    totalTransactionCost,
    totalTrades,
    avgSlippagePerTrade
  };

  return { dailyRecords, costs, rebalanceEvents };
}

/**
 * Write results to CSV and JSON
 */
function writeResults(dailyRecords: DailyRecord[], summary: BacktestSummary, suffix?: string): void {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const csvContent = (() => {
    const csvHeader = 'date,portfolio_value,sp500_value,daily_return_pct,drawdown_pct\n';
    const csvRows = dailyRecords
      .map((r) => `${r.date},${r.portfolio_value},${r.sp500_value},${r.daily_return_pct},${r.drawdown_pct}`)
      .join('\n');
    return csvHeader + csvRows;
  })();

  // Write CSV
  const csvPath = path.join(OUTPUT_DIR, 'backtest-results.csv');
  fs.writeFileSync(csvPath, csvContent);
  console.log(`\nCSV written: ${csvPath}`);

  const csvModePath = path.join(OUTPUT_DIR, `backtest-results-${SCORING_MODE}.csv`);
  fs.writeFileSync(csvModePath, csvContent);
  console.log(`CSV written: ${csvModePath}`);

  if (suffix) {
    const csvPresetPath = path.join(OUTPUT_DIR, `backtest-results-${suffix}.csv`);
    fs.writeFileSync(csvPresetPath, csvContent);
    console.log(`CSV written: ${csvPresetPath}`);
  }

  // Write JSON summary
  const jsonPath = path.join(OUTPUT_DIR, 'backtest-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`JSON written: ${jsonPath}`);

  const jsonModePath = path.join(OUTPUT_DIR, `backtest-summary-${SCORING_MODE}.json`);
  fs.writeFileSync(jsonModePath, JSON.stringify(summary, null, 2));
  console.log(`JSON written: ${jsonModePath}`);

  if (suffix) {
    const jsonPresetPath = path.join(OUTPUT_DIR, `backtest-summary-${suffix}.json`);
    fs.writeFileSync(jsonPresetPath, JSON.stringify(summary, null, 2));
    console.log(`JSON written: ${jsonPresetPath}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Backtesting Runner - Retail Investor MVP');
  console.log('='.repeat(60));

  const universe = loadUniverseConfig();
  console.log(`Universe: ${universe.universeName}`);

  const applyCoverage =
    process.env.APPLY_COVERAGE_FILTER === 'true' ||
    process.argv.includes('--apply-coverage-filter');
  if (applyCoverage) {
    universe.symbols = filterByCoverage(universe.symbols, START_DATE, 252);
  }

  // Fundamentals cache (lazy)
  const yf = new YFinanceProvider();
  const fundamentalsCache = new Map<string, Promise<FundamentalsData | null>>();
  const getFundamentalsCached: FundamentalsFetcher = async (symbol: string) => {
    if (!fundamentalsCache.has(symbol)) {
      fundamentalsCache.set(
        symbol,
        yf
          .getFundamentals(symbol)
          .catch(() => null)
      );
    }
    return fundamentalsCache.get(symbol)!;
  };

  // Load data
  const dataMap = loadHistoricalData(universe.symbols);
  console.log(`Loaded data for ${dataMap.size} symbols`);

  // Run backtest
  const { dailyRecords, costs, rebalanceEvents } = await runBacktest(
    dataMap,
    universe.benchmark,
    REBALANCE_FREQUENCY,
    getFundamentalsCached
  );

  const strategyName = (() => {
    if (PRESET) return `${PRESET} preset - ${REBALANCE_FREQUENCY} Top ${TOP_N}`;
    if (SCORING_MODE === 'shield') return 'Shield (Low Volatility) - Quarterly Top 10';
    if (SCORING_MODE === 'momentum') return 'Quarterly Rebalance Top 10 Momentum';
    return 'Quarterly Rebalance Top 10 Hybrid';
  })();

  const summary = calculateMetrics(dailyRecords, START_DATE, END_DATE, strategyName);

  // Add cost information to the summary
  summary.costs = costs;
  summary.rebalance_events = rebalanceEvents;
  summary.rebalance_frequency = REBALANCE_FREQUENCY;
  summary.top_n = TOP_N;
  if (rebalanceEvents.length > 0) {
    const avgTurnover =
      rebalanceEvents.reduce((a, b) => a + (b.turnover ?? 0), 0) / rebalanceEvents.length;
    (summary as any).turnover_pct = Math.round(avgTurnover * 10) / 10;
  }

  // Avg fundamentals/technical metrics across symbols ever held
  if (process.env.SKIP_AVG_METRICS === 'true') {
    summary.avgMetrics = { dataPoints: 0 };
  } else {
    const symbolsHeld = new Set<string>();
    rebalanceEvents.forEach((e) => {
      e.bought?.forEach((s) => symbolsHeld.add(s));
      e.kept?.forEach((s) => symbolsHeld.add(s));
    });
    const fundamentalsMap = new Map<string, FundamentalsData>();
    const technicalMap = new Map<string, TechnicalMetrics>();
    for (const sym of symbolsHeld) {
      try {
        const [f, t] = await Promise.all([getFundamentalsCached(sym), yf.getTechnicalMetrics(sym)]);
        if (f) fundamentalsMap.set(sym, f);
        if (t) technicalMap.set(sym, t);
      } catch {
        // ignore individual failures
      }
    }
    summary.avgMetrics = calculateAvgMetrics(Array.from(symbolsHeld), fundamentalsMap, technicalMap);
  }

  // Write results
  const suffix = SCORING_MODE === 'shield' ? 'shield' : PRESET || undefined;
  writeResults(dailyRecords, summary, suffix);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`\nStrategy: ${summary.strategy}`);
  console.log(`Period: ${summary.period}`);
  console.log(`Slippage Model: ${SLIPPAGE_MODEL_KEY}`);
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

  // Print cost breakdown if available
  if (summary.costs) {
    console.log('\nCost Breakdown:');
    console.log(`  Total Slippage Cost: $${summary.costs.totalSlippageCost.toFixed(2)}`);
    console.log(`  Total Transaction Cost: $${summary.costs.totalTransactionCost.toFixed(2)}`);
    console.log(`  Total Trades: ${summary.costs.totalTrades}`);
    console.log(`  Avg Slippage Per Trade: $${summary.costs.avgSlippagePerTrade.toFixed(2)}`);
  }

  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
