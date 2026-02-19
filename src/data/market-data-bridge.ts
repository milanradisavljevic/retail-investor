import Database from 'better-sqlite3';
import path from 'path';
import type { FundamentalsData } from './repositories/fundamentals_repo';
import type { TechnicalMetrics, CompanyProfile } from '@/providers/types';

export interface AvgMetrics {
  symbol: string;
  roe: number | null;
  roic: number | null;
  pe: number | null;
  pb: number | null;
  fetched_at?: number | null;
}

function daysAgo(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export class MarketDataBridge {
  private db: Database.Database;
  private warnedScopes = new Set<string>();

  constructor(dbPath = path.join(process.cwd(), 'data', 'market-data.db')) {
    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma('journal_mode = WAL');
  }

  close() {
    this.db.close();
  }

  private warnOnce(scope: string, err: unknown) {
    if (this.warnedScopes.has(scope)) return;
    this.warnedScopes.add(scope);
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[MarketDataBridge] ${scope} unavailable: ${message}`);
  }

  getFundamentals(symbol: string, maxAgeDays = 7): FundamentalsData | null {
    try {
      const row = this.db
        .prepare(
          `
          SELECT pe, pb, ps, peg, ev_ebitda, roe, roic,
                 gross_margin, operating_margin, debt_equity,
                 current_ratio, market_cap, data_completeness,
                 eps, book_value_per_share, revenue_per_share, current_price, date
          FROM fundamentals
          WHERE symbol = ?
          ORDER BY date DESC
          LIMIT 1
          `
        )
        .get(symbol.toUpperCase()) as any;
      if (!row) return null;

      const age = daysAgo(row.date ?? null);
      if (age !== null && age > maxAgeDays) return null;

      const fundamentals: FundamentalsData = {
        peRatio: toNumber(row.pe),
        pbRatio: toNumber(row.pb),
        psRatio: toNumber(row.ps),
        pegRatio: toNumber(row.peg),
        forwardPE: null,
        roe: toNumber(row.roe),
        roa: null,
        debtToEquity: toNumber(row.debt_equity),
        currentRatio: toNumber(row.current_ratio),
        quickRatio: null,
        profitMargin: null,
        grossMargin: toNumber(row.gross_margin),
        operatingMargin: toNumber(row.operating_margin),
        netMargin: null,
        dividendYield: null,
        payoutRatio: null,
        freeCashFlow: null,
        marketCap: toNumber(row.market_cap),
        enterpriseValue: null,
        revenueGrowth: null,
        earningsGrowth: null,
        analystTargetMean: null,
        analystTargetLow: null,
        analystTargetHigh: null,
        analystCount: null,
        analystTargetPrice: null,
        numberOfAnalysts: null,
        nextEarningsDate: null,
        beta: toNumber(row.beta),
        roic: toNumber(row.roic),
        evToEbitda: toNumber(row.ev_ebitda),
        eps: toNumber(row.eps),
        bookValuePerShare: toNumber(row.book_value_per_share),
        revenuePerShare: toNumber(row.revenue_per_share),
        currentPrice: toNumber(row.current_price),
        raw: undefined,
      };
      return fundamentals;
    } catch (err) {
      this.warnOnce('fundamentals query', err);
      return null;
    }
  }

  getTechnicals(symbol: string): TechnicalMetrics | null {
    try {
      const row = this.db
        .prepare(
          `
          SELECT t.*, (
            SELECT current_price
            FROM fundamentals f
            WHERE f.symbol = t.symbol
            ORDER BY f.date DESC
            LIMIT 1
          ) AS current_price
          FROM technical_indicators t
          WHERE t.symbol = ?
          ORDER BY t.date DESC
          LIMIT 1
          `
        )
        .get(symbol.toUpperCase()) as any;
      if (!row) return null;

      return {
        symbol: symbol.toUpperCase(),
        currentPrice: toNumber(row.current_price),
        previousClose: null,
        priceReturn13Week: toNumber(row.return_13w),
        priceReturn26Week: toNumber(row.return_26w),
        priceReturn52Week: toNumber(row.return_52w),
        volatility3Month: toNumber(row.volatility),
        beta: toNumber(row.beta),
        priceReturn5Day: null,
        priceReturnMTD: null,
        priceReturnYTD: null,
        high52Week: null,
        low52Week: null,
        dayChange: null,
        dayChangePercent: null,
        change: null,
        percentChange: null,
        avgVolume10Day: null,
        avgVolume3Month: null,
        candles: undefined,
        marketCap: null,
        open: null,
        high: null,
        low: null,
      };
    } catch (err) {
      this.warnOnce('technicals query', err);
      return null;
    }
  }

  getProfile(symbol: string): CompanyProfile | null {
    try {
      const row = this.db
        .prepare(`SELECT name, sector, industry, country, exchange, currency, symbol, market_cap, share_outstanding FROM metadata WHERE symbol = ? LIMIT 1`)
        .get(symbol.toUpperCase()) as any;
      if (!row) return null;

      return {
        name: row.name ?? row.symbol ?? symbol,
        ticker: symbol.toUpperCase(),
        shareOutstanding: row.share_outstanding ?? 0,
        marketCapitalization: toNumber(row.market_cap) ?? 0,
        country: row.country ?? undefined,
        currency: row.currency ?? undefined,
        exchange: row.exchange ?? undefined,
        industry: row.industry ?? undefined,
        sector: row.sector ?? undefined,
      };
    } catch (err) {
      this.warnOnce('profile query', err);
      return null;
    }
  }

  getAvgMetrics(symbol: string): AvgMetrics | null {
    try {
      const row = this.db
        .prepare(
          `SELECT symbol, roe, roic, pe, pb, fetched_at FROM fundamentals_avg WHERE symbol = ? ORDER BY fetched_at DESC LIMIT 1`
        )
        .get(symbol.toUpperCase()) as any;
      if (!row) return null;
      return {
        symbol: row.symbol,
        roe: toNumber(row.roe),
        roic: toNumber(row.roic),
        pe: toNumber(row.pe),
        pb: toNumber(row.pb),
        fetched_at: row.fetched_at ?? null,
      };
    } catch (err) {
      this.warnOnce('avgMetrics query', err);
      return null;
    }
  }
}
