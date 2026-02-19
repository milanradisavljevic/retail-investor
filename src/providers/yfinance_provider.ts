import { spawn } from 'child_process';
import * as path from 'path';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import {
  BasicFinancials,
  Candles,
  CompanyProfile,
  MarketDataProvider,
  ProviderError,
  Quote,
  TechnicalMetrics,
} from './types';
import { resolvePythonExecutable } from '@/utils/python';

interface CandlePoint {
  t: number;
  close: number;
  high: number | null;
  low: number | null;
  volume: number | null;
}

interface AnalystData {
  target_mean: number | null;
  target_low: number | null;
  target_high: number | null;
  num_analysts: number | null;
  recommendation: string | null;
  next_earnings_date: string | null;
}

export class YFinanceProvider implements MarketDataProvider {
  private readonly pythonPath = resolvePythonExecutable();
  private readonly scriptPath = path.join(
    process.cwd(),
    'src',
    'data_py',
    'yfinance_cli.py'
  );
  private requestCount = 0;

  private basicFinancialsCache = new Map<string, Promise<BasicFinancials>>();
  private quoteCache = new Map<string, Promise<Quote>>();
  private candlesCache = new Map<string, Promise<Candles>>();
  private analystDataCache = new Map<string, Promise<AnalystData>>();

  async getFundamentals(symbol: string): Promise<FundamentalsData | null> {
    const [basicFinancials, analystData] = await Promise.all([
      this.getBasicFinancials(symbol),
      this.getAnalystData(symbol).catch(() => null),
    ]);
    return this.mapFundamentals(basicFinancials, analystData);
  }

  async getTechnicalMetrics(symbol: string): Promise<TechnicalMetrics | null> {
    const [quote, candles, basicFinancials] = await Promise.all([
      this.getQuote(symbol),
      this.getCandles(symbol, 365),
      this.getBasicFinancials(symbol),
    ]);

    return this.buildTechnicalMetrics(symbol, quote, candles, basicFinancials);
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  close(): void {
    // No persistent resources to clean up
  }

  getCompanyProfile(symbol: string) {
    return this.callPython<CompanyProfile>(symbol, 'get_company_profile').catch(
      (error) => {
        // Do not cache failures
        throw error;
      }
    );
  }

  private getBasicFinancials(symbol: string): Promise<BasicFinancials> {
    if (!this.basicFinancialsCache.has(symbol)) {
      const promise = this.callPython<BasicFinancials>(
        symbol,
        'get_basic_financials'
      ).catch((error) => {
        this.basicFinancialsCache.delete(symbol);
        throw error;
      });
      this.basicFinancialsCache.set(symbol, promise);
    }
    return this.basicFinancialsCache.get(symbol)!;
  }

  private getQuote(symbol: string): Promise<Quote> {
    if (!this.quoteCache.has(symbol)) {
      const promise = this.callPython<Quote>(symbol, 'get_quote').catch(
        (error) => {
          this.quoteCache.delete(symbol);
          throw error;
        }
      );
      this.quoteCache.set(symbol, promise);
    }
    return this.quoteCache.get(symbol)!;
  }

  getCandles(symbol: string, daysBack: number): Promise<Candles> {
    const cacheKey = `${symbol}:${daysBack}`;
    if (!this.candlesCache.has(cacheKey)) {
      const promise = this.callPython<Candles>(symbol, 'get_candles', {
        daysBack,
      }).catch((error) => {
        this.candlesCache.delete(cacheKey);
        throw error;
      });
      this.candlesCache.set(cacheKey, promise);
    }
    return this.candlesCache.get(cacheKey)!;
  }

  private getAnalystData(symbol: string): Promise<AnalystData> {
    if (!this.analystDataCache.has(symbol)) {
      const promise = this.callPython<AnalystData>(symbol, 'get_analyst_data').catch(
        (error) => {
          this.analystDataCache.delete(symbol);
          throw error;
        }
      );
      this.analystDataCache.set(symbol, promise);
    }
    return this.analystDataCache.get(symbol)!;
  }

  private callPython<T>(
    symbol: string,
    method: string,
    options?: { daysBack?: number }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const args = [
        this.scriptPath,
        '--symbol',
        symbol,
        '--method',
        method,
      ];

      if (options?.daysBack !== undefined) {
        args.push('--days_back', options.daysBack.toString());
      }

      this.requestCount += 1;

      const python = spawn(this.pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        python.kill();
        reject(
          new ProviderError(
            'Python process timeout (30s)',
            'yfinance',
            symbol,
            method
          )
        );
      }, 30_000);

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('error', (err) => {
        clearTimeout(timeout);
        reject(
          new ProviderError(
            `Failed to spawn Python process: ${err.message}`,
            'yfinance',
            symbol,
            method,
            err
          )
        );
      });

      python.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(
            new ProviderError(
              `Python process exited with code ${code}: ${stderr || stdout}`,
              'yfinance',
              symbol,
              method
            )
          );
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result as T);
        } catch (error) {
          reject(
            new ProviderError(
              `Failed to parse JSON from Python: ${error}`,
              'yfinance',
              symbol,
              method,
              error as Error
            )
          );
        }
      });
    });
  }

  private mapFundamentals(
    basicFinancials: BasicFinancials | null,
    analystData: AnalystData | null
  ): FundamentalsData | null {
    if (!basicFinancials || !basicFinancials.metric) {
      return null;
    }

    const metrics = basicFinancials.metric;
    const annualSeries = basicFinancials.series?.annual ?? {};

    const latestRevenue = this.getLatestSeriesValue(annualSeries.revenue);
    const latestFcf = this.getLatestSeriesValue(annualSeries.freeCashFlow);
    const latestNetIncome = this.getLatestSeriesValue(annualSeries.netIncome);

    // Prefer a directly derived ratio from debt/equity to avoid unit ambiguity
    const derivedDebtToEquity = this.safeRatio(metrics.totalDebt, metrics.totalEquity);

    // yfinance often returns D/E as percentage (152.411 = 152.4%), but some feeds already return ratios.
    // Normalize aggressively to avoid double-scaling that inflated quality scores to 100.
    const rawDebtToEquity =
      metrics.debtToEquity ??
      (derivedDebtToEquity !== null ? derivedDebtToEquity * 100 : null);
    const debtToEquity = this.normalizeDebtToEquity(rawDebtToEquity, derivedDebtToEquity);

    // yfinance returns ratios as decimals (0.18 for 18%), scoring expects percent (18)
    // Compute ROE: prefer API value, fallback to netIncome/totalEquity
    const rawRoe =
      metrics.roeTTM ??
      (latestNetIncome !== null && metrics.totalEquity
        ? latestNetIncome / metrics.totalEquity
        : null);
    const computedRoe = this.decimalToPercent(rawRoe);

    const priceToSales =
      metrics.priceToSalesTTM ??
      metrics.priceToSalesAnnual ??
      (metrics.marketCapitalization && latestRevenue
        ? metrics.marketCapitalization / latestRevenue
        : null);

    const data: FundamentalsData = {
      peRatio: metrics.peTTM ?? metrics.peForward ?? null,
      pbRatio: metrics.pb ?? metrics.pbQuarterly ?? null,
      psRatio: priceToSales ?? null,
      pegRatio: metrics.pegRatio ?? null,
      roe: computedRoe,
      roa: this.decimalToPercent(metrics.roaTTM),
      debtToEquity: debtToEquity ?? null,
      currentRatio: metrics.currentRatio ?? null,
      grossMargin: this.decimalToPercent(metrics.grossMarginTTM),
      operatingMargin: this.decimalToPercent(metrics.operatingMarginTTM),
      netMargin: this.decimalToPercent(metrics.profitMarginTTM),
      dividendYield: this.decimalToPercent(metrics.dividendYieldTTM),
      payoutRatio: this.decimalToPercent(metrics.payoutRatio),
      freeCashFlow:
        metrics.freeCashflow ??
        latestFcf,
      marketCap: metrics.marketCapitalization ?? null,
      enterpriseValue: metrics.enterpriseValue ?? null,
      revenueGrowth: this.decimalToPercent(metrics.revenueGrowthTTM),
      earningsGrowth: this.decimalToPercent(metrics.earningsGrowthTTM),
      analystTargetMean: this.toNumberOrNull(analystData?.target_mean),
      analystTargetLow: this.toNumberOrNull(analystData?.target_low),
      analystTargetHigh: this.toNumberOrNull(analystData?.target_high),
      analystCount: this.toNumberOrNull(analystData?.num_analysts),
      nextEarningsDate: analystData?.next_earnings_date ?? null,
      beta: metrics.beta ?? null,
      roic: this.decimalToPercent((metrics as Record<string, number | null>).roicTTM ?? null),
      evToEbitda: (metrics as Record<string, number | null>).evToEbitda ?? null,
      raw: this.buildRawMetrics(metrics, analystData),
    };

    return data;
  }

  /**
   * Convert decimal ratio to percent.
   * yfinance ALWAYS returns ratios (e.g., 0.18 for 18%, 1.71 for 171%).
   * We always multiply by 100 to get percent values for scoring.
   */
  private decimalToPercent(value: number | null | undefined): number | null {
    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }
    // yfinance consistently returns ratios, even for values > 100%
    // e.g., returnOnEquity: 1.7142 means 171.42%
    return value * 100;
  }

  /**
   * Normalize debt-to-equity to a ratio (0.5-2.0 is healthy range).
   * Accepts either a percentage (152.4) or ratio (1.52) and uses derived totals when available.
   */
  private normalizeDebtToEquity(
    value: number | null | undefined,
    derivedRatio?: number | null
  ): number | null {
    const derived =
      derivedRatio !== null && derivedRatio !== undefined && !isNaN(derivedRatio)
        ? derivedRatio
        : null;

    // Derived ratio from totals is the most reliable
    if (derived !== null) {
      return derived;
    }

    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }

    const percentCandidate = value / 100;
    const ratioCandidate = value;

    // Pick the candidate that looks most like a realistic ratio (close to 1 is typical)
    const candidates = [ratioCandidate, percentCandidate].filter(
      (v): v is number => v !== null && v !== undefined && isFinite(v)
    );

    if (candidates.length === 0) return null;

    // Prefer values in a plausible band, then choose the one closest to 1.0 leverage
    const plausible = candidates.filter((v) => Math.abs(v) <= 50);
    const usable = plausible.length > 0 ? plausible : candidates;
    usable.sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1));

    return usable[0];
  }

  private buildTechnicalMetrics(
    symbol: string,
    quote: Quote | null,
    candles: Candles | null,
    basicFinancials: BasicFinancials | null
  ): TechnicalMetrics | null {
    if (!quote || typeof quote.c !== 'number') {
      return null;
    }

    const candlePoints = this.normalizeCandles(candles);

    const currentPrice = quote.c;
    const previousClose = quote.pc ?? quote.o ?? null;
    const dayChange =
      previousClose !== null ? currentPrice - previousClose : null;
    const dayChangePercent =
      previousClose && previousClose !== 0 && dayChange !== null
        ? (dayChange / previousClose) * 100
        : null;

    const high52Week = candlePoints
      ? this.safeMax(candlePoints.map((c) => c.high ?? c.close))
      : null;
    const low52Week = candlePoints
      ? this.safeMin(candlePoints.map((c) => c.low ?? c.close))
      : null;

    const closes = candlePoints?.map((c) => c.close) ?? [];
    const volumes = candlePoints?.map((c) => c.volume ?? null) ?? [];
    const timestamps = candlePoints?.map((c) => c.t) ?? [];

    const priceReturn5Day = this.calcReturn(closes, 5);
    const priceReturn13Week = this.calcReturn(closes, 65);
    const priceReturn26Week = this.calcReturn(closes, 130);
    const priceReturn52Week = this.calcReturn(closes, 252);

    const priceReturnMTD = this.calcReturnSince(
      closes,
      timestamps,
      this.startOfCurrentMonth()
    );
    const priceReturnYTD = this.calcReturnSince(
      closes,
      timestamps,
      this.startOfCurrentYear()
    );

    const volatility3Month = this.calcVolatility(closes, 63);
    const avgVolume10Day = this.calcAverage(volumes, 10);
    const avgVolume3Month = this.calcAverage(volumes, 63);

    const beta = basicFinancials?.metric?.beta ?? null;

    return {
      currentPrice,
      previousClose: previousClose ?? currentPrice,
      dayChange: dayChange ?? 0,
      dayChangePercent: dayChangePercent ?? 0,
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
    };
  }

  private normalizeCandles(candles: Candles | null): CandlePoint[] | null {
    if (!candles || candles.s !== 'ok') {
      return null;
    }

    const points: CandlePoint[] = [];
    const len = Math.min(
      candles.c.length,
      candles.h.length,
      candles.l.length,
      candles.t.length,
      candles.v.length
    );

    for (let i = 0; i < len; i++) {
      const close = candles.c[i];
      const time = candles.t[i];
      if (close === null || close === undefined || time === null || time === undefined) {
        continue;
      }
      points.push({
        t: Number(time),
        close: Number(close),
        high:
          candles.h[i] === null || candles.h[i] === undefined
            ? null
            : Number(candles.h[i]),
        low:
          candles.l[i] === null || candles.l[i] === undefined
            ? null
            : Number(candles.l[i]),
        volume:
          candles.v[i] === null || candles.v[i] === undefined
            ? null
            : Number(candles.v[i]),
      });
    }

    points.sort((a, b) => a.t - b.t);
    return points;
  }

  private calcReturn(prices: number[], periods: number): number | null {
    if (prices.length <= periods) return null;
    const start = prices[prices.length - 1 - periods];
    const end = prices[prices.length - 1];

    if (!start || !end) return null;
    if (start === 0) return null;

    return ((end - start) / start) * 100;
  }

  private calcReturnSince(
    prices: number[],
    timestamps: number[],
    since: number
  ): number | null {
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

    const mean =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize daily volatility (assuming 252 trading days)
    return stdDev * Math.sqrt(252) * 100;
  }

  private calcAverage(values: Array<number | null>, window: number): number | null {
    if (values.length === 0) return null;
    const slice = values.slice(-window).filter((v): v is number => v !== null);
    if (slice.length === 0) return null;
    const sum = slice.reduce((acc, val) => acc + val, 0);
    return sum / slice.length;
  }

  private getLatestSeriesValue(
    series: Array<{ period: string; v: number }> | undefined
  ): number | null {
    if (!series || series.length === 0) return null;
    const sorted = [...series].sort(
      (a, b) => new Date(b.period).getTime() - new Date(a.period).getTime()
    );
    const value = sorted[0]?.v;
    return typeof value === 'number' ? value : null;
  }

  private safeRatio(numerator?: number | null, denominator?: number | null): number | null {
    if (
      numerator === null ||
      numerator === undefined ||
      denominator === null ||
      denominator === undefined ||
      denominator === 0
    ) {
      return null;
    }
    return numerator / denominator;
  }

  private toNumberOrNull(value: number | null | undefined): number | null {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return null;
    }
    return Number(value);
  }

  private buildRawMetrics(
    metrics: Record<string, number | null>,
    analystData: AnalystData | null
  ): Record<string, unknown> {
    const raw: Record<string, unknown> = { ...metrics };
    if (analystData) {
      raw.analyst = analystData;
    }
    return raw;
  }

  private safeMax(values: Array<number | null>): number | null {
    const filtered = values.filter((v): v is number => v !== null && !isNaN(v));
    return filtered.length ? Math.max(...filtered) : null;
  }

  private safeMin(values: Array<number | null>): number | null {
    const filtered = values.filter((v): v is number => v !== null && !isNaN(v));
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
}
