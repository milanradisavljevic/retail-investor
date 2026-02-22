import { spawn } from 'child_process';
import * as path from 'path';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type {
  BasicFinancials,
  CompanyProfile,
  MarketDataProvider,
  Quote,
  TechnicalMetrics,
} from './types';
import { createChildLogger } from '@/utils/logger';
import { resolvePythonExecutable } from '@/utils/python';

const logger = createChildLogger('yfinance_batch');

interface BatchInput {
  symbols: string[];
  methods: string[];
}

interface BatchResult {
  [symbol: string]: {
    basic_financials?: BasicFinancials;
    quote?: Quote;
    candles?: unknown[];
    analyst_data?: Record<string, unknown>;
    profile?: CompanyProfile;
    error?: string;
  };
}

interface BatchCandlePoint {
  t: number;
  close: number;
  high: number | null;
  low: number | null;
  volume: number | null;
}

export class YFinanceBatchProvider implements MarketDataProvider {
  private readonly pythonPath = resolvePythonExecutable();
  private readonly batchScriptPath = path.join(
    process.cwd(),
    'src',
    'data_py',
    'yfinance_batch.py'
  );
  private requestCount = 0;

  /**
   * Fetch data for multiple symbols in one Python process call.
   * Significantly reduces overhead compared to per-symbol spawning.
   */
  async fetchBatch(
    symbols: string[],
    methods: string[] = ['basic_financials', 'quote', 'candles']
  ): Promise<BatchResult> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [this.batchScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const input: BatchInput = { symbols, methods };
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        python.kill();
        reject(new Error(`Batch fetch timeout (60s) for ${symbols.length} symbols`));
      }, 60_000);

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn Python batch process: ${err.message}`));
      });

      python.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          logger.error({ code, stderr }, 'Python batch process failed');
          reject(new Error(`Python batch process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const results: BatchResult = JSON.parse(stdout);
          this.requestCount += 1;
          logger.debug({ symbolCount: symbols.length }, 'Batch fetch successful');
          resolve(results);
        } catch (err) {
          logger.error({ err, stdout: stdout.substring(0, 200) }, 'Failed to parse batch results');
          reject(new Error(`Failed to parse batch results: ${err}`));
        }
      });

      // Write input to stdin
      python.stdin.write(JSON.stringify(input));
      python.stdin.end();
    });
  }

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    // Fallback to single-symbol fetch (not used in batch mode)
    const batch = await this.fetchBatch([symbol], ['basic_financials', 'analyst_data']);
    const data = batch[symbol];

    if (data?.error) {
      throw new Error(data.error);
    }

    return this.mapFundamentals(data?.basic_financials, data?.analyst_data);
  }

  async getTechnicalMetrics(symbol: string): Promise<TechnicalMetrics | null> {
    const batch = await this.fetchBatch([symbol], ['quote', 'candles', 'basic_financials']);
    const data = batch[symbol];

    if (data?.error) {
      throw new Error(data.error);
    }

    return this.buildTechnicalMetrics(symbol, data?.quote, data?.candles, data?.basic_financials);
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  close(): void {
    // No persistent resources
  }

  getCompanyProfile(symbol: string): Promise<CompanyProfile | null> {
    return this.fetchBatch([symbol], ['profile']).then((batch) => {
      const data = batch[symbol];
      if (data?.error) {
        throw new Error(data.error);
      }
      return data?.profile || null;
    });
  }

  mapBatchFundamentals(
    basicFinancials?: BasicFinancials,
    analystData?: Record<string, unknown>
  ): FundamentalsData | null {
    return this.mapFundamentals(basicFinancials, analystData);
  }

  mapBatchTechnicalMetrics(
    symbol: string,
    quote?: Quote,
    candles?: unknown[],
    basicFinancials?: BasicFinancials
  ): TechnicalMetrics | null {
    return this.buildTechnicalMetrics(symbol, quote, candles, basicFinancials);
  }

  private mapFundamentals(
    basicFinancials?: BasicFinancials,
    analystData?: Record<string, unknown>
  ): FundamentalsData | null {
    if (!basicFinancials) return null;

    const metrics = basicFinancials as Record<string, number | null | undefined>;

    const rawDebtToEquity = this.toNumberOrNull(basicFinancials.debtToEquity);
    const debtToEquity = this.normalizeDebtToEquity(rawDebtToEquity);

    const rawRoe = this.toNumberOrNull(basicFinancials.returnOnEquity);
    const rawRoa = this.toNumberOrNull(basicFinancials.returnOnAssets);
    const rawProfitMargin = this.toNumberOrNull(basicFinancials.profitMargin);
    const rawGrossMargin = this.toNumberOrNull(
      metrics.grossMargin ?? metrics.grossMargins ?? metrics.grossMarginTTM
    );
    const rawOperatingMargin = this.toNumberOrNull(
      metrics.operatingMargin ?? metrics.operatingMargins ?? metrics.operatingMarginTTM
    );
    const rawNetMargin = this.toNumberOrNull(
      metrics.netMargin ?? metrics.netMargins ?? rawProfitMargin
    );
    const rawRevenueGrowth = this.toNumberOrNull(
      basicFinancials.revenueGrowth ?? metrics.revenueGrowthTTM
    );
    const rawEarningsGrowth = this.toNumberOrNull(
      basicFinancials.earningsGrowth ?? metrics.earningsGrowthTTM
    );
    const rawDividendYield = this.toNumberOrNull(
      metrics.dividendYield ?? metrics.trailingAnnualDividendYield ?? metrics.dividendYieldTTM
    );
    const rawPayoutRatio = this.toNumberOrNull(metrics.payoutRatio);
    const rawRoiC = this.toNumberOrNull(metrics.roic ?? metrics.roicTTM ?? metrics.returnOnCapital);
    const evToEbitda = this.toNumberOrNull(metrics.evToEbitda ?? metrics.enterpriseToEbitda);
    const freeCashFlow = this.toNumberOrNull(metrics.freeCashFlow ?? metrics.freeCashflow);
    const beta = this.toNumberOrNull(metrics.beta);

    return {
      // Valuation
      marketCap: this.toNumberOrNull(basicFinancials.marketCap),
      enterpriseValue: this.toNumberOrNull(basicFinancials.enterpriseValue),
      peRatio: this.toNumberOrNull(basicFinancials.trailingPE),
      forwardPE: this.toNumberOrNull(basicFinancials.forwardPE),
      pbRatio: this.toNumberOrNull(basicFinancials.priceToBook),
      psRatio: this.toNumberOrNull(basicFinancials.priceToSales),
      pegRatio: null,
      // Profitability / Quality
      profitMargin: this.decimalToPercent(rawProfitMargin),
      grossMargin: this.decimalToPercent(rawGrossMargin),
      operatingMargin: this.decimalToPercent(rawOperatingMargin),
      netMargin: this.decimalToPercent(rawNetMargin),
      roe: this.decimalToPercent(rawRoe),
      roa: this.decimalToPercent(rawRoa),
      roic: this.decimalToPercent(rawRoiC),
      // Leverage / Liquidity
      debtToEquity,
      currentRatio: this.toNumberOrNull(basicFinancials.currentRatio),
      quickRatio: this.toNumberOrNull(basicFinancials.quickRatio),
      // Growth
      revenueGrowth: this.decimalToPercent(rawRevenueGrowth),
      earningsGrowth: this.decimalToPercent(rawEarningsGrowth),
      // Income
      dividendYield: this.decimalToPercent(rawDividendYield),
      payoutRatio: this.decimalToPercent(rawPayoutRatio),
      freeCashFlow,
      // Analyst
      analystTargetMean: this.toNumberOrNull(analystData?.target_mean),
      analystTargetLow: this.toNumberOrNull(analystData?.target_low),
      analystTargetHigh: this.toNumberOrNull(analystData?.target_high),
      analystTargetPrice: this.toNumberOrNull(analystData?.target_mean),
      analystCount: this.toNumberOrNull(analystData?.num_analysts),
      numberOfAnalysts: this.toNumberOrNull(analystData?.num_analysts),
      nextEarningsDate: this.toStringOrNull(analystData?.next_earnings_date),
      // Risk
      beta,
      evToEbitda,
      // Raw
      raw: {
        basicFinancials,
        analystData,
      },
    };
  }

  private buildTechnicalMetrics(
    symbol: string,
    quote?: Quote,
    candles?: unknown[],
    basicFinancials?: BasicFinancials
  ): TechnicalMetrics | null {
    if (!quote || typeof quote.c !== 'number') return null;

    const candlePoints = this.normalizeCandles(candles);
    const currentPrice = quote.c;
    const previousClose = quote.pc ?? quote.o ?? null;
    const dayChange = previousClose !== null ? currentPrice - previousClose : null;
    const dayChangePercent =
      previousClose && previousClose !== 0 && dayChange !== null
        ? (dayChange / previousClose) * 100
        : null;

    const high52Week =
      this.safeMax(candlePoints?.map((c) => c.high ?? c.close) ?? []) ?? this.toNumberOrNull(quote.h);
    const low52Week =
      this.safeMin(candlePoints?.map((c) => c.low ?? c.close) ?? []) ?? this.toNumberOrNull(quote.l);

    const closes = candlePoints?.map((c) => c.close) ?? [];
    const volumes = candlePoints?.map((c) => c.volume ?? null) ?? [];
    const timestamps = candlePoints?.map((c) => c.t) ?? [];

    const priceReturn5Day = this.calcReturn(closes, 5);
    const priceReturn13Week = this.calcReturn(closes, 65);
    const priceReturn26Week = this.calcReturn(closes, 130);
    const priceReturn52Week = this.calcReturn(closes, 252);
    const priceReturnMTD = this.calcReturnSince(closes, timestamps, this.startOfCurrentMonth());
    const priceReturnYTD = this.calcReturnSince(closes, timestamps, this.startOfCurrentYear());
    const volatility3Month = this.calcVolatility(closes, 63);
    const avgVolume10Day = this.calcAverage(volumes, 10);
    const avgVolume3Month = this.calcAverage(volumes, 63);
    const metrics = basicFinancials as Record<string, number | null | undefined> | undefined;
    const beta = this.toNumberOrNull(metrics?.beta);

    return {
      symbol,
      currentPrice,
      previousClose: previousClose ?? currentPrice,
      dayChange,
      dayChangePercent,
      change: dayChange,
      percentChange: dayChangePercent,
      high: this.toNumberOrNull(quote.h),
      low: this.toNumberOrNull(quote.l),
      open: this.toNumberOrNull(quote.o),
      high52Week,
      low52Week,
      priceReturn5Day,
      priceReturn13Week,
      priceReturn26Week,
      priceReturn52Week,
      priceReturnMTD,
      priceReturnYTD,
      volatility3Month,
      beta,
      avgVolume10Day,
      avgVolume3Month,
      candles: candlePoints ?? [],
      marketCap: this.toNumberOrNull(basicFinancials?.marketCap),
    };
  }

  private normalizeCandles(candles?: unknown[]): BatchCandlePoint[] | null {
    if (!Array.isArray(candles) || candles.length === 0) {
      return null;
    }

    const points: BatchCandlePoint[] = [];
    for (const candle of candles) {
      if (!candle || typeof candle !== 'object') continue;
      const candleRecord = candle as Record<string, unknown>;
      const t = this.toNumberOrNull(candleRecord.t);
      const close = this.toNumberOrNull(candleRecord.close);
      if (t === null || close === null) continue;
      points.push({
        t,
        close,
        high: this.toNumberOrNull(candleRecord.high),
        low: this.toNumberOrNull(candleRecord.low),
        volume: this.toNumberOrNull(candleRecord.volume),
      });
    }

    points.sort((a, b) => a.t - b.t);
    return points.length > 0 ? points : null;
  }

  private calcReturn(prices: number[], periods: number): number | null {
    if (prices.length <= periods) return null;
    const start = prices[prices.length - 1 - periods];
    const end = prices[prices.length - 1];
    if (!start || !end || start === 0) return null;
    return ((end - start) / start) * 100;
  }

  private calcReturnSince(prices: number[], timestamps: number[], since: number): number | null {
    if (prices.length === 0 || timestamps.length === 0) return null;
    const startIndex = timestamps.findIndex((t) => t >= since);
    if (startIndex < 0) return null;
    const startPrice = prices[startIndex];
    const endPrice = prices[prices.length - 1];
    if (!startPrice || !endPrice || startPrice === 0) return null;
    return ((endPrice - startPrice) / startPrice) * 100;
  }

  private calcVolatility(prices: number[], window: number): number | null {
    if (prices.length <= window) return null;

    const recentPrices = prices.slice(-window - 1);
    const returns: number[] = [];
    for (let i = 1; i < recentPrices.length; i++) {
      const prev = recentPrices[i - 1];
      const curr = recentPrices[i];
      if (!prev || prev === 0 || !curr) continue;
      returns.push((curr - prev) / prev);
    }

    if (returns.length === 0) return null;

    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    return stdDev * Math.sqrt(252) * 100;
  }

  private calcAverage(values: Array<number | null>, window: number): number | null {
    if (values.length === 0) return null;
    const slice = values.slice(-window).filter((value): value is number => value !== null);
    if (slice.length === 0) return null;
    const sum = slice.reduce((acc, value) => acc + value, 0);
    return sum / slice.length;
  }

  private safeMax(values: Array<number | null>): number | null {
    const filtered = values.filter((value): value is number => value !== null && !isNaN(value));
    return filtered.length ? Math.max(...filtered) : null;
  }

  private safeMin(values: Array<number | null>): number | null {
    const filtered = values.filter((value): value is number => value !== null && !isNaN(value));
    return filtered.length ? Math.min(...filtered) : null;
  }

  private startOfCurrentMonth(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  }

  private startOfCurrentYear(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), 0, 1) / 1000;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    return String(value);
  }

  /**
   * Convert decimal ratio to percent.
   * yfinance returns ratios as decimals (0.18 for 18%).
   */
  private decimalToPercent(value: number | null | undefined): number | null {
    if (value === null || value === undefined || isNaN(value)) return null;
    return value * 100;
  }

  /**
   * Normalize debt-to-equity to a ratio (not percent).
   * Accepts either ratio (1.5) or percent (150).
   */
  private normalizeDebtToEquity(value: number | null | undefined): number | null {
    if (value === null || value === undefined || isNaN(value)) return null;

    const percentCandidate = value / 100;
    const ratioCandidate = value;
    const candidates = [ratioCandidate, percentCandidate].filter((v) => Number.isFinite(v));
    if (candidates.length === 0) return null;

    const plausible = candidates.filter((v) => Math.abs(v) <= 50);
    const usable = plausible.length > 0 ? plausible : candidates;
    usable.sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1));
    return usable[0];
  }
}
