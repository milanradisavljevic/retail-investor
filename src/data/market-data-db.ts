import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { FundamentalsData } from './repositories/fundamentals_repo';
import type { TechnicalMetrics } from '@/providers/types';

export type PriceRow = {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  adjusted_close: number | null;
};

type FundamentalsRow = {
  symbol: string;
  date: string;
  pe: number | null;
  pb: number | null;
  ps: number | null;
  peg: number | null;
  ev_ebitda: number | null;
  roe: number | null;
  roic: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  debt_equity: number | null;
  current_ratio: number | null;
  market_cap: number | null;
  data_completeness: number | null;
};

type TechnicalRow = {
  symbol: string;
  date: string;
  beta: number | null;
  volatility: number | null;
  sharpe_ratio: number | null;
  return_13w: number | null;
  return_26w: number | null;
  return_52w: number | null;
  ma_50: number | null;
  ma_200: number | null;
};

export class MarketDataDB {
  private db: Database.Database;

  constructor(
    dbPath: string = path.join(process.cwd(), 'data', 'market-data.db'),
    options: { readonly?: boolean; required?: boolean } = {}
  ) {
    if (!fs.existsSync(dbPath)) {
      if (options.required) {
        throw new Error(`SQLite database not found at ${dbPath}`);
      }
    }
    this.db = new Database(dbPath, { readonly: options.readonly ?? true });
  }

  close(): void {
    this.db.close();
  }

  getUniverse(minCompleteness = 0): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT symbol
      FROM fundamentals
      WHERE data_completeness IS NULL OR data_completeness >= ?
      ORDER BY symbol
    `);
    const rows = stmt.all(minCompleteness) as { symbol: string }[];
    return rows.map((r) => r.symbol);
  }

  getFundamentals(symbol: string): (FundamentalsData & { symbol: string; dataCompleteness?: number; data_completeness?: number }) | null {
    const stmt = this.db.prepare(`
      SELECT *
      FROM fundamentals
      WHERE symbol = ?
      ORDER BY date DESC
      LIMIT 1
    `);
    const row = stmt.get(symbol) as FundamentalsRow | undefined;
    if (!row) return null;

    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const dataCompleteness = toNumber(row.data_completeness) ?? undefined;

    return {
      symbol,
      peRatio: toNumber(row.pe),
      pbRatio: toNumber(row.pb),
      psRatio: toNumber(row.ps),
      pegRatio: toNumber(row.peg),
      roe: toNumber(row.roe),
      roa: null,
      roic: toNumber(row.roic),
      grossMargin: toNumber(row.gross_margin),
      operatingMargin: toNumber(row.operating_margin),
      debtToEquity: toNumber(row.debt_equity),
      currentRatio: toNumber(row.current_ratio),
      marketCap: toNumber(row.market_cap),
      enterpriseValue: null,
      evToEbitda: toNumber(row.ev_ebitda),
      dividendYield: null,
      payoutRatio: null,
      freeCashFlow: null,
      netMargin: null,
      revenueGrowth: null,
      earningsGrowth: null,
      analystTargetMean: null,
      analystTargetLow: null,
      analystTargetHigh: null,
      analystCount: null,
      nextEarningsDate: null,
      beta: null,
      dataCompleteness,
      // Legacy snake_case accessor for quick debugging scripts
      data_completeness: dataCompleteness as any,
    };
  }

  getTechnicalMetrics(symbol: string): TechnicalMetrics | null {
    const stmt = this.db.prepare(`
      SELECT *
      FROM technical_indicators
      WHERE symbol = ?
      ORDER BY date DESC
      LIMIT 1
    `);
    const row = stmt.get(symbol) as TechnicalRow | undefined;
    if (!row) return null;

    const latestPrice = this.getLatestClose(symbol);

    return {
      symbol,
      currentPrice: latestPrice,
      previousClose: null,
      volatility3Month: row.volatility,
      beta: row.beta,
      priceReturn13Week: row.return_13w,
      priceReturn26Week: row.return_26w,
      priceReturn52Week: row.return_52w,
      priceReturn5Day: null,
      priceReturnMTD: null,
      priceReturnYTD: null,
      avgVolume10Day: null,
      avgVolume3Month: null,
      high52Week: null,
      low52Week: null,
      change: null,
      percentChange: null,
      open: null,
      high: null,
      low: null,
      dayChange: null,
      dayChangePercent: null,
    } as TechnicalMetrics;
  }

  getPrices(
    symbol: string,
    options: { startDate?: string; endDate?: string } | number = {}
  ): PriceRow[] {
    if (typeof options === 'number') {
      // Backwards compat: treat numeric argument as "last N rows"
      const limit = options;
      const stmt = this.db.prepare(`
        SELECT symbol, date, open, high, low, close, volume, adjusted_close
        FROM prices
        WHERE symbol = ?
        ORDER BY date DESC
        LIMIT ?
      `);
      return (stmt.all(symbol, limit) as PriceRow[]).reverse();
    }

    const clauses = ['symbol = ?'];
    const params: (string | number)[] = [symbol];
    if (options.startDate) {
      clauses.push('date >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      clauses.push('date <= ?');
      params.push(options.endDate);
    }

    const stmt = this.db.prepare(`
      SELECT symbol, date, open, high, low, close, volume, adjusted_close
      FROM prices
      WHERE ${clauses.join(' AND ')}
      ORDER BY date ASC
    `);
    return stmt.all(...params) as PriceRow[];
  }

  countPricesBefore(symbol: string, cutoffDate: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM prices
      WHERE symbol = ? AND date < ?
    `);
    const row = stmt.get(symbol, cutoffDate) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private getLatestClose(symbol: string): number | null {
    const stmt = this.db.prepare(`
      SELECT close FROM prices
      WHERE symbol = ?
      ORDER BY date DESC
      LIMIT 1
    `);
    const row = stmt.get(symbol) as { close: number | null } | undefined;
    if (!row) return null;
    const num = Number(row.close);
    return Number.isFinite(num) ? num : null;
  }

  getAvgMetrics(symbol: string): { roe: number | null, roic: number | null, pe: number | null, pb: number | null } | null {
    const stmt = this.db.prepare(`
      SELECT roe, roic, pe, pb
      FROM fundamentals_avg
      WHERE symbol = ?
    `);
    const row = stmt.get(symbol) as { roe: number | null, roic: number | null, pe: number | null, pb: number | null } | undefined;
    if (!row) return null;

    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    return {
      roe: toNumber(row.roe),
      roic: toNumber(row.roic),
      pe: toNumber(row.pe),
      pb: toNumber(row.pb)
    };
  }
}
