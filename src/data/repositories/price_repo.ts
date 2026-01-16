/**
 * Price repository for EOD price data
 */

import { getDatabase } from '../db';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('price_repo');

export interface PriceRecord {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjustedClose: number | null;
  volume: number | null;
  fetchedAt: number;
}

export function savePrices(prices: PriceRecord[]): number {
  if (prices.length === 0) return 0;

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO prices_eod (symbol, date, open, high, low, close, adjusted_close, volume, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, date) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      adjusted_close = excluded.adjusted_close,
      volume = excluded.volume,
      fetched_at = excluded.fetched_at
  `);

  const insertMany = db.transaction((records: PriceRecord[]) => {
    for (const p of records) {
      stmt.run(
        p.symbol,
        p.date,
        p.open,
        p.high,
        p.low,
        p.close,
        p.adjustedClose,
        p.volume,
        p.fetchedAt
      );
    }
  });

  insertMany(prices);
  logger.debug({ count: prices.length, symbol: prices[0]?.symbol }, 'Saved prices');

  return prices.length;
}

export function getPrices(
  symbol: string,
  fromDate?: string,
  toDate?: string
): PriceRecord[] {
  const db = getDatabase();

  let sql = `
    SELECT
      symbol,
      date,
      open,
      high,
      low,
      close,
      adjusted_close as adjustedClose,
      volume,
      fetched_at as fetchedAt
    FROM prices_eod
    WHERE symbol = ?
  `;

  const params: (string | number)[] = [symbol];

  if (fromDate) {
    sql += ' AND date >= ?';
    params.push(fromDate);
  }

  if (toDate) {
    sql += ' AND date <= ?';
    params.push(toDate);
  }

  sql += ' ORDER BY date ASC';

  const stmt = db.prepare(sql);
  return stmt.all(...params) as PriceRecord[];
}

export function getLatestPrice(symbol: string): PriceRecord | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      symbol,
      date,
      open,
      high,
      low,
      close,
      adjusted_close as adjustedClose,
      volume,
      fetched_at as fetchedAt
    FROM prices_eod
    WHERE symbol = ?
    ORDER BY date DESC
    LIMIT 1
  `);

  const row = stmt.get(symbol) as PriceRecord | undefined;
  return row ?? null;
}

export function getPriceRange(symbol: string, days: number): PriceRecord[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      symbol,
      date,
      open,
      high,
      low,
      close,
      adjusted_close as adjustedClose,
      volume,
      fetched_at as fetchedAt
    FROM prices_eod
    WHERE symbol = ?
    ORDER BY date DESC
    LIMIT ?
  `);

  const rows = stmt.all(symbol, days) as PriceRecord[];
  // Return in ascending order
  return rows.reverse();
}

export function getSymbolsWithPriceData(): string[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT DISTINCT symbol FROM prices_eod ORDER BY symbol');
  const rows = stmt.all() as { symbol: string }[];
  return rows.map((r) => r.symbol);
}

export function deletePrices(symbol: string): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM prices_eod WHERE symbol = ?');
  const result = stmt.run(symbol);
  return result.changes;
}

export function getOldestFetchDate(symbol: string): number | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT MIN(fetched_at) as oldest
    FROM prices_eod
    WHERE symbol = ?
  `);

  const row = stmt.get(symbol) as { oldest: number | null } | undefined;
  return row?.oldest ?? null;
}
