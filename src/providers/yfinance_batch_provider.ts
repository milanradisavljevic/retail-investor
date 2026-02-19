import { spawn } from 'child_process';
import * as path from 'path';
import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';
import type {
  BasicFinancials,
  Candles,
  CompanyProfile,
  MarketDataProvider,
  ProviderError,
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
    candles?: any[];
    analyst_data?: any;
    profile?: CompanyProfile;
    error?: string;
  };
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

  private mapFundamentals(
    basicFinancials?: BasicFinancials,
    analystData?: any
  ): FundamentalsData | null {
    if (!basicFinancials) return null;

    return {
      // Valuation
      marketCap: basicFinancials.marketCap ?? null,
      enterpriseValue: basicFinancials.enterpriseValue ?? null,
      peRatio: basicFinancials.trailingPE ?? null,
      forwardPE: basicFinancials.forwardPE ?? null,
      pbRatio: basicFinancials.priceToBook ?? null,
      psRatio: basicFinancials.priceToSales ?? null,
      pegRatio: null,
      // Profitability / Quality
      profitMargin: basicFinancials.profitMargin ?? null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      roe: basicFinancials.returnOnEquity ?? null,
      roa: basicFinancials.returnOnAssets ?? null,
      roic: null,
      // Leverage / Liquidity
      debtToEquity: basicFinancials.debtToEquity ?? null,
      currentRatio: basicFinancials.currentRatio ?? null,
      quickRatio: basicFinancials.quickRatio ?? null,
      // Growth
      revenueGrowth: basicFinancials.revenueGrowth ?? null,
      earningsGrowth: basicFinancials.earningsGrowth ?? null,
      // Income
      dividendYield: null,
      payoutRatio: null,
      freeCashFlow: null,
      // Analyst
      analystTargetMean: analystData?.target_mean ?? null,
      analystTargetLow: null,
      analystTargetHigh: null,
      analystTargetPrice: analystData?.target_mean ?? null,
      analystCount: analystData?.num_analysts ?? null,
      numberOfAnalysts: analystData?.num_analysts ?? null,
      nextEarningsDate: analystData?.next_earnings_date ?? null,
      // Risk
      beta: null,
      evToEbitda: null,
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
    candles?: any[],
    basicFinancials?: BasicFinancials
  ): TechnicalMetrics | null {
    if (!quote || !candles) return null;

    return {
      symbol,
      currentPrice: quote.c ?? null,
      high: quote.h ?? null,
      low: quote.l ?? null,
      open: quote.o ?? null,
      previousClose: quote.pc ?? null,
      change: quote.c && quote.pc ? quote.c - quote.pc : null,
      percentChange: quote.c && quote.pc ? ((quote.c - quote.pc) / quote.pc) * 100 : null,
      candles: candles || [],
      marketCap: basicFinancials?.marketCap ?? null,
      volatility3Month: null,
      beta: null,
    };
  }
}
